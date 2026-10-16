import {damageRollBreakdown} from '../../shared/rollBreakdown.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HpFxEvent, SheetAbility, StateSnapshot } from '../../shared/types.js';
import { resolveAbilityRoll, resolveAttack, resolveAttackDamage, resolveForcedSave } from './combat.js';
import { broadcastSnapshots, dropConn, setConn, type IOServer } from './connections.js';
import {
  addRollLog, applyDamage, createCharacter, createMap, createMonsterTemplate, createSession,
  createToken, drainHpFx, getMonster, instantiateMonster, listRollLog,
  updateCharacter, moveToken, setActiveMap, setFogLayer, setFogRevealed, setHideDmRolls, setManualDamage, setTokenHidden,queueSpellImpact,beginPlacedSpellImpact,
  claimCharacter, updateMapEnvironment,
} from './sessions.js';
import { editMapWalls } from './mapWalls.js';

const sockets: string[] = [];
afterEach(() => { vi.restoreAllMocks(); sockets.splice(0).forEach(dropConn); });

function fixture(manual = true) {
  const session = createSession('Damage FX correlation');
  const map = createMap(session.id, { name: 'FX test map' });
  setActiveMap(session.id, map.id);
  setFogLayer(map.id, 'map', false);
  setFogLayer(map.id, 'tokens', false);
  setManualDamage(session.id, manual);
  const attacker = createCharacter(session.id, {
    name: 'Striker', className: 'Sorcerer', level: 6, maxHp: 50,
    stats: { STR: 16, CHA: 18 },
    weapons: [{ name: 'Sword', kind: 'melee', damage: '2d6', attackBonus: 50 }],
  });
  const attackToken = createToken({ mapId: map.id, kind: 'pc', refId: attacker.id, x: 0, y: 0 });
  const template = createMonsterTemplate(session.id, { name: 'Target', maxHp: 200, armorClass: 1 });
  const target = instantiateMonster(template.id)!;
  const targetToken = createToken({ mapId: map.id, kind: 'monster', refId: target.id, x: 50, y: 50 });
  drainHpFx(session.id);
  vi.spyOn(Math, 'random').mockReturnValue(.5); // Real formulas, deterministic non-critical hit.
  return { session, map, attacker, attackToken, target, targetToken };
}

function attack(f: ReturnType<typeof fixture>, roller = 'Striker') {
  expect(resolveAttack(f.session.id, roller, f.attackToken.id, f.targetToken.id, 0)).toBe(true);
  return listRollLog(f.session.id).at(-1)!;
}

function views(f: ReturnType<typeof fixture>) {
  const messages: { socketId: string; event: string; payload: unknown }[] = [];
  for (const role of ['player', 'dm'] as const) {
    const id = `${f.session.id}-${role}`;
    sockets.push(id);
    setConn(id, { sessionId: f.session.id, role, viewMapId: null, playerId: null });
  }
  const io = { to: (socketId: string) => ({ emit: (event: string, payload: unknown) => {
    messages.push({ socketId, event, payload });
  } }) } as unknown as IOServer;
  broadcastSnapshots(io, f.session.id);
  const forRole = (role: 'dm' | 'player') => {
    const list = messages.filter((message) => message.socketId === `${f.session.id}-${role}`);
    return {
      snapshot: list.find((message) => message.event === 'state:snapshot')!.payload as StateSnapshot,
      events: (list.find((message) => message.event === 'fx:hp')?.payload as { events: HpFxEvent[] } | undefined)?.events ?? [],
      order: list.map((message) => message.event),
    };
  };
  return { dm: forRole('dm'), player: forRole('player') };
}

describe('exact attack damage-to-reveal correlation', () => {
  it('manual damage applies immediately on its second click and references the damage roll, not the attack', () => {
    const f = fixture();
    const hit = attack(f);
    expect(hit.pending).toBeDefined();
    expect(getMonster(f.target.id)!.curHp).toBe(200);
    expect(drainHpFx(f.session.id)).toEqual([]);

    expect(resolveAttackDamage(f.session.id, 'Striker', hit.id)).toBe(true);
    const damage = listRollLog(f.session.id).at(-1)!;
    expect(damage.reveal?.kind).toBe('damage');
    expect(getMonster(f.target.id)!.curHp).toBe(200 - hit.pending!.amount);
    expect(drainHpFx(f.session.id)).toEqual([{
      kind: 'monster', refId: f.target.id, delta: -hit.pending!.amount, rollId: damage.id,
      weaponAttack:{kind:"blunt",critical:false},sourcePosition:{mapId:f.map.id,x:0,y:0},
    }]);
    expect(damage.id).not.toBe(hit.id);
    expect(resolveAttackDamage(f.session.id, 'Striker', hit.id)).toBe(false);
    expect(drainHpFx(f.session.id)).toEqual([]);
  });

  it('automatic attacks link each effect precisely without capturing unrelated direct damage or healing', () => {
    const f = fixture(false);
    applyDamage('monster', f.target.id, 3);
    const first = attack(f);
    applyDamage('monster', f.target.id, -2);
    const second = attack(f);
    const events = drainHpFx(f.session.id);
    expect(events.map((event) => event.rollId)).toEqual([undefined, first.id, undefined, second.id]);
    expect(events.map((event) => event.delta)).toEqual([-3, -first.reveal!.damage!, 2, -second.reveal!.damage!]);
    expect(getMonster(f.target.id)!.curHp).toBe(199 - first.reveal!.damage! - second.reveal!.damage!);
  });

  for (const manual of [false, true]) {
    it(`spell attacks keep exact damage correlation with manual mode ${manual}`, () => {
      const f = fixture(manual);
      const ability: SheetAbility = { id: 'bolt', name: 'Test bolt', type: 'spell', level: 0,
        description: '', roll: { kind: 'attack', dice: '2d6', damageType: 'fire' } };
      expect(resolveAbilityRoll(f.session.id, 'Striker', f.attacker, ability, 0, undefined, f.targetToken.id)).toBe(true);
      const hit = listRollLog(f.session.id).at(-1)!;
      if (manual) {
        expect(drainHpFx(f.session.id)).toEqual([]);
        expect(resolveAttackDamage(f.session.id, 'Striker', hit.id)).toBe(true);
      }
      const result = listRollLog(f.session.id).at(-1)!;
      expect(drainHpFx(f.session.id)).toEqual([{
        kind: 'monster', refId: f.target.id, delta: -result.reveal!.damage!, damageType: 'fire', rollId: result.id,
      }]);
    });
  }

  it('each Magic Missile dart references its own newly rolled damage, not the original cast', () => {
    const f = fixture();
    const cast = addRollLog(f.session.id, { roller: 'Striker', label: 'Magic Missile', expr: 'Magic Missile', total: 0,
      detail: 'Assign darts', apply: { amount: 0, dc: 0, darts: 3, dice: '1d4+1', damageType: 'force' } });
    resolveForcedSave(f.session.id, cast.id, f.targetToken.id);
    const first = listRollLog(f.session.id).at(-1)!;
    resolveForcedSave(f.session.id, cast.id, f.targetToken.id);
    const second = listRollLog(f.session.id).at(-1)!;
    const effects=drainHpFx(f.session.id);
    expect(effects.map(event=>event.impact)).toEqual([{id:cast.id,order:0},{id:cast.id,order:1}]);
    expect(effects.map((event) => ({ delta: event.delta, rollId: event.rollId }))).toEqual([
      { delta: -4, rollId: first.id }, { delta: -4, rollId: second.id },
    ]);
    expect(first.reveal?.damageDice).toEqual([{label:'1d4',value:3,faces:[3]}]);
    expect(first.reveal?.damageMods).toEqual([{label:'Magic Missile bonus',value:1}]);
    expect(damageRollBreakdown(first)).toContain('1 Magic Missile bonus');
    expect(first.reveal?.damage).toBe(4); // CHA 18 does not add +4.
    expect(first.id).not.toBe(cast.id);
    expect(second.id).not.toBe(first.id);
    expect(getMonster(f.target.id)!.curHp).toBe(192);
  });

  for (const dc of [5, 30]) {
    it(`saving-throw damage is linked to the target's actual save reveal at DC ${dc}`, () => {
      const f = fixture();
      const cast = addRollLog(f.session.id, { roller: 'Striker', label: 'Area spell', expr: 'Area spell', total: 12,
        detail: 'Choose targets', apply: { amount: 12, dc, save: 'DEX', damageType: 'fire' } });
      resolveForcedSave(f.session.id, cast.id, f.targetToken.id);
      const result = listRollLog(f.session.id).at(-1)!;
      expect(result.reveal?.kind).toBe('check');
      expect(drainHpFx(f.session.id)[0]).toMatchObject({ delta: dc === 5 ? -6 : -12, rollId: result.id,impact:{id:cast.id} });
    });
  }

  it('an auto-hit application without its own reveal references its cast, while unanimated sources remain untagged', () => {
    const f = fixture();
    for (const animated of [true, false]) {
      const cast = addRollLog(f.session.id, { roller: 'Striker', label: 'Direct spell', expr: 'Direct spell', total: 8,
        detail: 'Choose target', apply: { amount: 8, dc: 0 },
        ...(animated ? { reveal: { kind: 'damage' as const, attacker: 'Striker', outcome: 'none' as const, damage: 8,
          damageDice: [{ label: '2d6', value: 8, faces: [4, 4] }] } } : {}),
      });
      resolveForcedSave(f.session.id, cast.id, f.targetToken.id);
      const result = listRollLog(f.session.id).at(-1)!;
      expect(result.reveal).toBeUndefined();
      expect(drainHpFx(f.session.id)[0].rollId).toBe(animated ? cast.id : undefined);
    }
    expect(getMonster(f.target.id)!.curHp).toBe(184);
  });

  it('visible enemy damage keeps correlation even when its HP accounting note is redacted', () => {
    const f = fixture(false);
    const result = attack(f);
    const { player, dm } = views(f);
    expect(player.snapshot.rollLog.find((roll) => roll.id === result.id)?.hpNote).toBeUndefined();
    expect(player.events[0]?.rollId).toBe(result.id);
    expect(dm.events[0]?.rollId).toBe(result.id);
    expect(player.order).toEqual(['state:snapshot', 'fx:hp']);
  });

  it('hidden DM outcomes have no reveal and never leave damage waiting for private dice', () => {
    const f = fixture(false);
    setHideDmRolls(f.session.id, true);
    const result = attack(f, 'DM');
    applyDamage('monster',f.target.id,2,'force',false,result.id,{impact:{id:result.id,order:0}});
    const { player, dm } = views(f);
    expect(player.snapshot.rollLog.find((roll) => roll.id === result.id)).toMatchObject({outcomeOnly:true,hideTotal:true});
    expect(player.snapshot.rollLog.find((roll) => roll.id === result.id)?.reveal).toBeUndefined();
    expect(player.events).toHaveLength(2);
    expect(player.events.every(e=>!e.rollId&&!e.impact)).toBe(true);
    expect(dm.events[0].rollId).toBe(result.id);
    expect(dm.events[1].impact).toEqual({id:result.id,order:0});
  });

  it('hidden target tokens still emit no player damage feedback', () => {
    const f = fixture(false);
    setTokenHidden(f.targetToken.id, true);
    attack(f);
    const { player, dm } = views(f);
    expect(player.events).toEqual([]);
    expect(dm.events).toHaveLength(1);
  });
  it('non-damaging spell light respects the same hidden-token privacy boundary',()=>{
    const f=fixture(false);setTokenHidden(f.targetToken.id,true);
    queueSpellImpact(f.session.id,'monster',f.target.id,"Hunter's Mark");
    const {player,dm}=views(f);
    expect(player.events).toEqual([]);
    expect(dm.events).toEqual([{kind:'monster',refId:f.target.id,delta:0,spell:"Hunter's Mark"}]);
  });
  it('a visible area impact cannot expose the projectile origin of a hidden caster',()=>{
    const f=fixture(false);setTokenHidden(f.targetToken.id,true);
    const finish=beginPlacedSpellImpact(f.session.id,'monster',f.target.id,'Fireball');
    finish('cast',{mapId:f.map.id,x:0,y:0,radiusFt:20},{mapId:f.map.id,x:50,y:50});
    const {player,dm}=views(f);
    expect(player.events).toHaveLength(1);expect(player.events[0].areaPosition).toBeDefined();
    expect(player.events[0].sourcePosition).toBeUndefined();
    expect(dm.events[0].sourcePosition).toMatchObject({x:50,y:50});
  });
  it('a hidden caster’s line art still reaches players where it crosses their view',()=>{
    const f=fixture(false);setTokenHidden(f.targetToken.id,true);
    // Lightning Bolt's art starts on the caster's own square (areaPosition = caster).
    beginPlacedSpellImpact(f.session.id,'monster',f.target.id,'Lightning Bolt')
      ('cast',{mapId:f.map.id,x:50,y:50,radiusFt:2.5,end:{x:650,y:50}},{mapId:f.map.id,x:50,y:50});
    const {player,dm}=views(f);
    expect(player.events).toHaveLength(1);expect(player.events[0].areaPosition?.end).toBeDefined();
    expect(player.events[0].sourcePosition).toBeUndefined(); // the hidden origin is still not pinpointed
    expect(dm.events[0].sourcePosition).toMatchObject({x:50,y:50});
  });
  it('a flashing spell in magical darkness reaches players with line of sight; cold spells and walls still hide it',()=>{
    const f=fixture(false);
    updateMapEnvironment(f.session.id,f.map.id,{enabled:true,lighting:'dungeon',heavyDarkness:true,lights:[]});
    claimCharacter(f.attacker.id,`${f.session.id}-player`); // the PC at (0,0): 60 ft darkvision = 600 px
    const cast=(spell:string)=>beginPlacedSpellImpact(f.session.id,'monster',f.target.id,spell)
      ('cast',{mapId:f.map.id,x:1500,y:0,radiusFt:20},{mapId:f.map.id,x:1500,y:0});
    cast('Fireball');
    expect(views(f).player.events.map(e=>e.spell)).toEqual(['Fireball']);
    cast('Ice Storm');
    expect(views(f).player.events).toEqual([]);
    expect(editMapWalls(f.session.id,f.map.id,{add:{id:'wall',ax:1000,ay:-3000,bx:1000,by:3000}})).toBeNull();
    cast('Fireball');
    expect(views(f).player.events).toEqual([]);
  });
  it('area art reaches players when any part of it is revealed, and not when all of it is fogged',()=>{
    const f=fixture(false);setFogLayer(f.map.id,'map',true);
    const fireball=()=>beginPlacedSpellImpact(f.session.id,'monster',f.target.id,'Fireball')
      ('cast',{mapId:f.map.id,x:500,y:500,radiusFt:20},{mapId:f.map.id,x:500,y:500});
    // Grid 50 px at 5 ft: a 20-ft radius spans 200 px. Only a cell at its rim is revealed.
    setFogRevealed(f.map.id,'map',['13,10']);
    fireball();
    expect(views(f).player.events).toHaveLength(1);
    setFogRevealed(f.map.id,'map',['0,0']);
    fireball();
    expect(views(f).player.events).toEqual([]);
  });
});


describe('damage floaters on overkill',()=>{
  it('shows the full 13 damage on a creature with 6 HP and keeps HP at zero',()=>{
    const session=createSession('Overkill floater');
    const target=instantiateMonster(createMonsterTemplate(session.id,{name:'Goblin',maxHp:6}).id)!;
    applyDamage('monster',target.id,13,'piercing',false,'combined-roll');
    expect(getMonster(target.id)!.curHp).toBe(0);
    expect(drainHpFx(session.id)).toEqual([{kind:'monster',refId:target.id,delta:-13,damageType:'piercing',effect:'death',rollId:'combined-roll'}]);
  });
  it('healing still displays only actual HP restored',()=>{
    const session=createSession('Overheal floater');
    const target=createCharacter(session.id,{name:'Ranger',maxHp:20});
    applyDamage('pc',target.id,5); drainHpFx(session.id);
    applyDamage('pc',target.id,-13);
    expect(drainHpFx(session.id)).toEqual([{kind:'pc',refId:target.id,delta:5}]);
  });
});


describe('physical weapon feedback',()=>{
 for(const manual of [false,true])for(const [name,kind,damageType,visual] of [
  ['Scimitar','melee','slashing','slash'],['Mace','melee','bludgeoning','blunt'],
  ['Rapier','melee','piercing','thrust'],['Shortbow','ranged','piercing','arrow'],
  ['Crossbow','ranged','piercing','bolt'],['Sling','ranged','bludgeoning','stone'],
  ['Thrown object','ranged','piercing','thrown'],['Thrown Handaxe','ranged','slashing','axe'],
  ['Thrown Dagger','ranged','piercing','knife'],['Javelin','ranged','piercing','spear'],
  ['Trident','ranged','piercing','trident'],['Light Hammer','ranged','bludgeoning','hammer'],
  ['Dart','ranged','piercing','dart'],['Pistol','ranged','piercing','bullet'],
  ['Whip','melee','slashing','whip'],['Claws','melee','slashing','claw'],['Bite','melee','piercing','bite'],
 ] as const)it(`monster ${name} resolves ${visual} after damage in manual=${manual}`,()=>{
  const f=fixture(manual),monster=instantiateMonster(createMonsterTemplate(f.session.id,{name:'Enemy striker',maxHp:50,weapons:[{name,kind,damageType,damage:'1d6',attackBonus:50}]}).id)!;
  const token=createToken({mapId:f.map.id,kind:'monster',refId:monster.id,x:-50,y:0});
  expect(resolveAttack(f.session.id,'DM',token.id,f.targetToken.id,0)).toBe(true);
  const hit=listRollLog(f.session.id).at(-1)!;
  if(manual){expect(drainHpFx(f.session.id)).toEqual([]);expect(resolveAttackDamage(f.session.id,'DM',hit.id)).toBe(true);}
  const result=listRollLog(f.session.id).at(-1)!,fx=drainHpFx(f.session.id);
  expect(fx).toHaveLength(1);expect(fx[0]).toMatchObject({rollId:result.id,weaponAttack:{kind:visual,critical:false},sourcePosition:{mapId:f.map.id,x:token.x,y:token.y}});
 });
 it('hidden monster rolls keep visible hit effects without leaking roll or weapon details',()=>{
  const f=fixture(false),monster=instantiateMonster(createMonsterTemplate(f.session.id,{name:'Enemy striker',maxHp:50,weapons:[{name:'Private scimitar',kind:'melee',damageType:'slashing',damage:'1d6',attackBonus:50}]}).id)!;
  const token=createToken({mapId:f.map.id,kind:'monster',refId:monster.id,x:-50,y:0});setHideDmRolls(f.session.id,true);
  expect(resolveAttack(f.session.id,'DM',token.id,f.targetToken.id,0)).toBe(true);
  const {player,dm}=views(f);expect(player.events[0]).toMatchObject({weaponAttack:{kind:'slash'}});expect(player.events[0].rollId).toBeUndefined();expect(dm.events[0].rollId).toBeDefined();expect(JSON.stringify(player.events)).not.toContain('Private scimitar');
 });
 for(const manual of [false,true])for(const [name,damageType,visual] of [
  ['Handaxe','slashing','axe'],['Dagger','piercing','knife'],['Javelin','piercing','spear'],
  ['Trident','piercing','trident'],['Light Hammer','bludgeoning','hammer'],
 ] as const)it(`${name} keeps melee feedback nearby and uses ${visual} at throwing distance in manual=${manual}`,()=>{
  const f=fixture(manual);updateCharacter(f.attacker.id,{weapons:[{name,kind:'melee',damageType,range:'thrown 20/60 ft',tags:['thrown'],damage:'1d6',attackBonus:50}]});
  let hit=attack(f);if(manual)resolveAttackDamage(f.session.id,'Striker',hit.id);
  expect(drainHpFx(f.session.id)[0].weaponAttack?.kind).toBe(damageType==='slashing'?'slash':damageType==='piercing'?'thrust':'blunt');
  moveToken(f.targetToken.id,200,0);hit=attack(f);if(manual)resolveAttackDamage(f.session.id,'Striker',hit.id);
  expect(drainHpFx(f.session.id)[0].weaponAttack?.kind).toBe(visual);
 });
 for(const manual of [false,true])for(const [name,kind,damageType,visual] of [
  ['Greatsword','melee','slashing','slash'],['Warhammer','melee','bludgeoning','blunt'],
  ['Rapier','melee','piercing','thrust'],['Longbow','ranged','piercing','arrow'],
  ['Crossbow','ranged','piercing','bolt'],['Sling','ranged','bludgeoning','stone'],
  ['Thrown dagger','ranged','piercing','knife'],['Thrown Handaxe','ranged','slashing','axe'],
  ['Javelin','ranged','piercing','spear'],['Trident','ranged','piercing','trident'],
  ['Light Hammer','ranged','bludgeoning','hammer'],['Dart','ranged','piercing','dart'],
  ['Pistol','ranged','piercing','bullet'],['Whip','melee','slashing','whip'],
  ['Claws','melee','slashing','claw'],['Bite','melee','piercing','bite'],
 ] as const)it(`${name} uses ${visual} feedback after damage resolves in manual=${manual}`,()=>{
  const f=fixture(manual);updateCharacter(f.attacker.id,{weapons:[{name,kind,damageType,damage:'1d6',attackBonus:50}]});
  const hit=attack(f);if(manual){expect(drainHpFx(f.session.id)).toEqual([]);expect(resolveAttackDamage(f.session.id,'Striker',hit.id)).toBe(true);}
  const fx=drainHpFx(f.session.id);expect(fx).toHaveLength(1);
  expect(fx[0]).toMatchObject({weaponAttack:{kind:visual,critical:false},sourcePosition:{mapId:f.map.id,x:0,y:0}});
  expect(JSON.stringify(fx[0])).not.toContain(name); // No private weapon details in the cosmetic event.
 });
 it('withholds the origin of a hidden attacker and all feedback on a hidden victim',()=>{
  const f=fixture(false);setTokenHidden(f.attackToken.id,true);attack(f);
  const {dm,player}=views(f);expect(dm.events[0].sourcePosition).toBeDefined();expect(player.events[0].weaponAttack).toBeDefined();expect(player.events[0].sourcePosition).toBeUndefined();
 });
 it('does not leak an origin through pending damage offers or animate unrelated manual HP changes',()=>{
  const f=fixture(true);const hit=attack(f);expect(hit.pending!.weaponFx?.sourcePosition).toBeDefined();
  const {dm}=views(f);expect(dm.snapshot.rollLog.find(r=>r.id===hit.id)!.pending!.weaponFx).toBeUndefined();
  applyDamage('monster',f.target.id,3);expect(drainHpFx(f.session.id)[0].weaponAttack).toBeUndefined();
 });
});
