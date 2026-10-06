import {isInvisible} from '../../shared/advancedSpells.js';
import {seesInvisible} from '../../shared/invisibleSight.js';
import {tokenDistanceFt} from '../../shared/distance.js';
import {heldCasts,eligibleCounterspellers} from './counterspell.js';
import {doorApproachPoints} from '../../shared/mapWalls.js';
import {chatForViewer} from './privateChat.js';
import {activeMarks} from './marks.js';
import {rememberTerrain} from './exploration.js';
import {createPlayerVision,visionContains,fogVisionContains,usesMapVision,usesTokenVision} from '../../shared/playerVision.js';
import { listRipostes } from './reactions.js';
import { encounterTags, creatureBaseName } from './encounterTags.js';
import { resolveMonsterModelType } from '../../shared/monsterAppearance.js';
import {
  getActiveMapId,
  getSessionById,
  listCharacters,
  listMaps,
  listMeasurements,
  listAnnotations,
  listMapImages,
  listMonsters,
  listMonsterTemplates,
  listRollLog,
  listChat,
  listTokens,
  rollsInitiative,
} from './sessions.js';
import type {
  Annotation,
  Character,
  ChatMessage,
  CombatRole,
  MapImage,
  MapState,
  Measurement,
  Monster,
  MonsterPublic,
  Role,
  RollEntry,
  RollReveal,
  StateSnapshot,
  Token,
} from '../../shared/types.js';
import { deriveCombatRole } from '../../shared/combatRole.js';
import { coveredByFog, tokenVisibleAt } from '../../shared/fog.js';
import { peekUndo } from './undo.js';

/** A map shaped for the snapshot's map LIST (a picker): keep the metadata + the
 *  fog ENABLED flags, but drop the (potentially thousands of) revealed-cell
 *  strings — the canvas reads those only from the dedicated `map` field. */
const stripListFog = (m: MapState): MapState => ({
  ...m,
  mapFogRevealed: [],
  tokenFogRevealed: [],
});

/**
 * Shape a roll-log entry for PLAYERS: always redact the target AC (`vs AC ?`), and
 * for creature/DM rolls strip numeric modifiers and calculated attack/save
 * totals. Keep the raw faces and outcome, without exposing an anonymous bonus
 * that lets a player recover the creature's statistics.
 */
function redactCreatureMods(e: RollEntry,privateStats=false): RollEntry {
  if(/^(Pick lock|Disarm trap)$/i.test(e.label??'')){
    const hideDc=(text:string)=>text.replace(/\s*vs DC\s+-?\d+/gi,'');
    e={...e,expr:hideDc(e.expr),detail:hideDc(e.detail)};
  }
  let detail = e.detail.replace(/vs AC -?\d+/g, 'vs AC ?');
  if (!e.hideMods&&!privateStats) return { ...e, detail };
  detail = detail
    // Bracketed stat/proficiency/magic/mastery terms (content has a letter, so
    // dice faces like `[4,6]` are kept).
    .replace(/\s*[+-]\d+\[[^\]]*[A-Za-z][^\]]*\]/g, '')
    // A save roll's "(+5 prof)" / "(-1)" parenthetical modifier.
    .replace(/\s*\([+-]?\d+(?:\s*prof)?\)/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  let reveal = e.reveal;
  if (reveal) {
    const privateText=(text:string)=>text.replace(/(?:vs\s+)?(?:DC|AC)\s*-?\d+/gi,'').replace(/([dD]\d+|\])\s*[+-]\s*\d+/g,'$1').trim();
    const anonymousDice = (step: NonNullable<RollReveal['damageDice']>[number]) => {
      const expression = (step.diceExpression ?? step.label).match(/\d*d\d+/gi)?.join('+');
      return {...step, value:step.faces?.reduce((n,face)=>n+face,0)??step.value,
        critical:step.critical ?? /\bCRIT\b/i.test(step.label), diceExpression:expression,
        label: expression ?? (step.label === 'CRIT' ? 'CRIT' : 'dice')};
    };
    reveal = {
      ...reveal,
      title:reveal.title?privateText(reveal.title):undefined,
      effectOutcome:reveal.effectOutcome?privateText(reveal.effectOutcome):undefined,
      comparison:reveal.comparison?{...reveal.comparison,sets:reveal.comparison.sets.map(set=>({...set,total:set.dice.reduce((n,die)=>n+(die.negative?-die.value:die.value),0)})) as NonNullable<RollReveal['comparison']>['sets']}:undefined,
      hideModifiers:true,attackTotal:undefined,
      ...(reveal.kind==='dice'?{damage:undefined}:{}),
      ...(reveal.damageDice ? {damageDice:reveal.damageDice.map(anonymousDice)} : {}),
      toHit:[],
      ...(reveal.damageMods
        ? { damageMods: [] }
        : {}),
      ...(reveal.damageBreakdown ? {
        damageBreakdown: {
          // Retain visible die faces but never disclose the creature feature,
          // rider or item name carried only by this richer log-only payload.
          dice: reveal.damageBreakdown.dice.map(anonymousDice),
          mods: [],
          ...(reveal.damageBreakdown.mixedTypes ? { mixedTypes: true } : {}),
        },
      } : {}),
    };
  }
  const hideTotal=!reveal||reveal.kind!=='damage';
  // No anonymous bonus: raw dice plus a final attack/save total would disclose
  // exactly the stat addition. Free-form calculations/descriptions also stay DM-only.
  const outcome=reveal?.outcome&&reveal.outcome!=='none'?reveal.outcome.toUpperCase():'';
  const title=(reveal?.title??e.label).replace(/(?:vs\s+)?(?:DC|AC)\s*-?\d+/gi,'').trim();
  return {...e,hideMods:true,hideTotal,total:hideTotal?0:e.total,description:undefined,
    expr:title,detail:`${title}${reveal?.target?` → ${reveal.target}`:''}${outcome?` — ${outcome}`:''}${reveal?.kind==='damage'&&reveal.damage!==undefined?` — ${reveal.damage} ${reveal.damageType??''} damage`:''}.`,reveal};
}

// Moved to shared/ so `sessions.ts` (which visibility.ts imports) can use the
// same rule for initiative without a circular import. Re-exported here because
// connections.ts and the tests already import it from this module.
export { coveredByFog };

/**
 * Whether players may see an object's loot contents. A closed/locked container
 * keeps its contents secret until the DM opens it; loose items/piles show their
 * contents until taken. (The DM always sees loot via the full monster object.)
 */
export function lootVisibleToPlayers(m: Monster): boolean {
  const labels = m.conditions.map((c) => c.label.toLowerCase());
  if (!m.objectKind) {
    // A creature's loot is takeable only once it's DEAD and the DM has revealed
    // it (enables a perception-roll gate before the body can be searched).
    const dead = m.curHp <= 0 || labels.includes('dead');
    return dead && labels.includes('loot revealed');
  }
  if (m.objectKind === 'item' || m.objectKind === 'other')
    return !labels.includes('taken');
  return labels.includes('open') || labels.includes('looted');
}

/**
 * Shape a monster for a player according to its disposition:
 * - friendly: full stat block
 * - neutral / enemy: name + conditions + icon only (data identical — only the
 *   battlefield dot colour differs, so players can't read a neutral's HP/stats)
 */
/** Hide numeric encounter suffixes, including inherited duplicate suffixes. */
function playerMonsterName(m: Monster): string {
  return m.objectKind ? m.name : creatureBaseName(m.name);
}

function toPlayerMonster(m: Monster): Monster | MonsterPublic {
  // Friendly = full stat block, but loot stays behind the same reveal gate as
  // every other tier (a friendly NPC's pockets aren't public until the DM says).
  if (m.disposition === 'friendly')
    return { ...m, ...(m.objectKind?{objectDc:undefined}:{}), name: playerMonsterName(m), ...(m.loot && !lootVisibleToPlayers(m) ? { loot: undefined } : {}) };
  return {
    id: m.id,
    name: playerMonsterName(m),
    modelType: resolveMonsterModelType(m),
    visualTags: m.visualTags,
    modelColor: m.modelColor,
    conditions: m.conditions.map(c=>c.combatEffect?.auraRecipients?{...c,combatEffect:{...c.combatEffect,auraRecipients:undefined}}:c),
    disposition: m.disposition,
    icon: m.icon,
    // Defeated enemies show a skull to players even though their HP stays
    // hidden — a server-computed flag (0 HP or a "dead" condition).
    dead: m.curHp <= 0 || m.conditions.some((c) => c.label.toLowerCase() === 'dead'),
    // Object kind is not secret — players should see a chest is a chest.
    ...(m.objectKind ? { objectKind: m.objectKind } : {}),
    // Loot is only revealed once the container is opened/unlocked.
    ...(m.loot && lootVisibleToPlayers(m) ? { loot: m.loot } : {}),
    // Shared party notes are visible on every tier (the players wrote them).
    playerNotes: m.playerNotes,
  };
}

/** The per-map slice of a snapshot, cached so DM staging views and the active
 *  map are each loaded once per change-cycle regardless of client count. */
type MapData = {
  tokens: Token[];
  measurements: Measurement[];
  annotations: Annotation[];
  mapImages: MapImage[];
};

/**
 * Build snapshots for ONE change-cycle of a session. All session-wide data
 * (creatures, roll log, chat, …) is loaded ONCE and creature lookups go through
 * in-memory maps — previously every connected client re-ran every query and
 * each token cost its own SELECT (an N+1 that scaled as clients × tokens).
 * The returned shaper is pure CPU per viewer; monster visibility is computed per viewer, while the public roll
 * log is computed lazily once and shared by player connections.
 * Returns null when the session doesn't exist.
 */
export function createSnapshotBuilder(
  sessionId: string,
):
  | ((
      role: Role,
      dmViewMapId?: string | null,
      socketId?: string,
      playerId?: string | null,
    ) => StateSnapshot)
  | null {
  const session = getSessionById(sessionId);
  if (!session) return null;

  const activeMapId = getActiveMapId(sessionId);
  const maps = listMaps(sessionId);
  const characters = listCharacters(sessionId);
  const monsters = listMonsters(sessionId);
  const targetMarks=new Map<string,Set<string>>();
  for(const caster of [...characters,...monsters])for(const ab of caster.sheetAbilities){
    if(!ab.mark||!activeMarks(caster,ab.mark).includes(ab))continue;
    const key=`${ab.mark.kind}:${ab.mark.refId}`;
    const labels=targetMarks.get(key)??new Set<string>();labels.add(ab.name);targetMarks.set(key,labels);
  }
  const rawRollLog=listRollLog(sessionId);
  const rollLog = rawRollLog.map(e=>e.pending?{...e,pending:{...e.pending,awaitingShield:!!e.pending.shield,shield:undefined,live:undefined}}:e);
  const chat = listChat(sessionId);
  const charById = new Map(characters.map((c) => [c.id, c]));
  const monById = new Map(monsters.map((m) => [m.id, m]));
  const mapById = new Map(maps.map((m) => [m.id, m]));
  // Logs/reveal captions use the same names as tokens, never DM encounter counts.
  const names = new Map(monsters.map(m => [m.name, playerMonsterName(m)]));
  const escaped = [...names.keys()].sort((a,b) => b.length-a.length).map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const namePattern = escaped.length ? new RegExp(`(?<![\\p{L}\\p{N}_])(?:${escaped.join('|')})(?![\\p{L}\\p{N}_])`, 'gu') : null;
  const playerLogNames = <T,>(value: T): T => {
    if (!namePattern) return value;
    if (typeof value === 'string') return value.replace(namePattern, name => names.get(name)!) as T;
    if (Array.isArray(value)) return value.map(playerLogNames) as T;
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k,v]) => [k,playerLogNames(v)])) as T;
    return value;
  };


  // Lazy, shared across the connections that need them.
  let templates: Monster[] | null = null; // DM-only

  let playerRollLog: RollEntry[] | null = null;
  const mapData = new Map<string, MapData>();

  /**
   * Effective combat role for a token: hidden → null, override → it, else the
   * creature's most recent attack role (so the badge follows the weapon last
   * used), falling back to deriving from its stat block.
   */
  const tokenCombatRole = (t: Token): CombatRole | null => {
    if (t.hideCombatRole) return null;
    if (t.combatRoleOverride) return t.combatRoleOverride;
    if (t.kind === 'pc') {
      const c = charById.get(t.refId);
      if (!c) return null;
      return (
        c.lastAttackRole ??
        deriveCombatRole({ weapons: c.weapons, className: c.className })
      );
    }
    const m = monById.get(t.refId);
    if (!m || m.objectKind) return null; // objects (chests/doors/…) get no badge
    return m.lastAttackRole ?? deriveCombatRole(m);
  };

  const loadMapData = (mapId: string): MapData => {
    let d = mapData.get(mapId);
    if (!d) {
      const rawTokens = listTokens(mapId);
      const tagMap = encounterTags(mapById.get(mapId)!, rawTokens, monById, mapId === activeMapId);
      if (mapId === activeMapId) for (const token of rawTokens) {
        const monster=token.kind==='monster'?monById.get(token.refId):undefined;
        const tag=tagMap.get(token.id);
        if(monster && tag && tag!=='U') names.set(monster.name, `${playerMonsterName(monster)} ${tag}`);
      }
      d = {
        // Each token's effective combat role is shown to DM AND players (the
        // badge works even for Enemy creatures whose stats players never get).
        tokens: rawTokens.map((t) => ({
          ...(tagMap.has(t.id) ? { revealTag: tagMap.get(t.id) } : {}),
          ...t,
          ...(targetMarks.has(`${t.kind}:${t.refId}`)?{markLabels:[...targetMarks.get(`${t.kind}:${t.refId}`)!]}:{}),
          combatRole: tokenCombatRole(t),
          // Who "Roll all" would pull in, decided server-side (it depends on fog).
          inCombatEffective: rollsInitiative(t, mapById.get(mapId) ?? null),
        })),
        measurements: listMeasurements(mapId),
        annotations: listAnnotations(mapId),
        mapImages: listMapImages(mapId),
      };
      mapData.set(mapId, d);
    }
    return d;
  };

  // DM-only prep does not explore terrain. When players view the active map,
  // accumulate shared party history once per broadcast; live sight stays personal.
  let exploredTerrain:import('../../shared/exploration.js').ExploredTerrain|undefined;
  if (activeMapId && mapById.has(activeMapId)) loadMapData(activeMapId);

  // Players see the attack resolution (HIT/MISS) but not the target's AC.
  // Players keep PC HP-accounting notes; creature bookkeeping stays DM-only.
  const hpNoteVisible = (n: NonNullable<RollEntry['hpNote']>): boolean =>
    n.kind === 'pc';

  return (role, dmViewMapId, socketId, playerId) => {
    // Players are locked to the active map; the DM may view any map for prep.
    // Fall back to the active map if the requested one is gone (e.g. the DM
    // was viewing a map that just got deleted).
    const wantId = role === 'dm' ? dmViewMapId ?? activeMapId : activeMapId;
    let map: MapState | null =
      (wantId ? mapById.get(wantId) : null) ??
      (role === 'dm' && activeMapId ? mapById.get(activeMapId) : null) ??
      null;
    const data: MapData = map
      ? loadMapData(map.id)
      : { tokens: [], measurements: [], annotations: [], mapImages: [] };

    const owned=new Set(characters.filter(c=>c.claimedBy===socketId||(!!playerId&&!c.claimedBy&&c.ownerId===playerId)).map(c=>c.id));
    const lightMapFog=map?.mapFogEnabled?new Set(map.mapFogRevealed):null;
    const lightTokenFog=map?.tokenFogEnabled?new Set(map.tokenFogRevealed):null;
    const playerVision=role==='dm'?undefined:createPlayerVision(map,data.tokens,owned,t=>tokenVisibleAt({role,hidden:t.isHidden,
      owned:t.kind==='pc'&&owned.has(t.refId),foe:t.kind==='monster'&&monById.get(t.refId)?.disposition!=='friendly',
      mapFog:lightMapFog,tokenFog:lightTokenFog,grid:map?.gridSizePx??50,x:t.x,y:t.y}));
    if(role==='player'&&map)exploredTerrain??=rememberTerrain(map,data.tokens,data.mapImages,t=>tokenVisibleAt({role,hidden:t.isHidden,
      owned:t.kind==='pc',foe:t.kind==='monster'&&monById.get(t.refId)?.disposition!=='friendly',
      mapFog:lightMapFog,tokenFog:lightTokenFog,grid:map?.gridSizePx??50,x:t.x,y:t.y}));
    let tokens = data.tokens;
    let shapedMonsters: (Monster | MonsterPublic)[] = monsters;
    let shapedCharacters: Character[] = characters;
    let shapedRollLog = rollLog;
    const shapedChat = chatForViewer(chat,role,playerId);

    if (role !== 'dm') {
      const grid = map?.gridSizePx ?? 50;
      const mapFog = map?.mapFogEnabled ? new Set(map.mapFogRevealed) : null;
      const tokenFog = map?.tokenFogEnabled ? new Set(map.tokenFogRevealed) : null;
      const party = new Set(data.tokens.filter(t => t.kind === 'pc' && !t.isHidden).map(t => t.refId));
      const partyVision = createPlayerVision(map, data.tokens, party, t => tokenVisibleAt({role, hidden:t.isHidden,
        owned:t.kind==='pc', foe:t.kind==='monster'&&monById.get(t.refId)?.disposition!=='friendly',
        mapFog, tokenFog, grid, x:t.x, y:t.y}));
      // A concealed torch must not leak its position or light nearby visible figures.
      // Clone the viewer's map; never mutate the shared map used by DM snapshots.
      if(map?.environment && mapFog)map={...map,environment:{...map.environment,
        lights:map.environment.lights.filter(light=>mapFog.has(`${Math.floor(light.x/grid)},${Math.floor(light.y/grid)}`))}};
      tokens = tokens.flatMap(t => {
        if(t.isHidden)return [];
        if(isInvisible(t.kind==='pc'?charById.get(t.refId):monById.get(t.refId))&&t.kind==='monster'&&monById.get(t.refId)?.disposition!=='friendly'){
          const sees=data.tokens.some(o=>o.kind==='pc'&&owned.has(o.refId)&&seesInvisible(charById.get(o.refId)!,tokenDistanceFt(o,t,map)));
          if(!sees)return [];
        }
        const door=map?.walls?.find(w=>w.door&&w.tokenId===t.id);
        if(door)return doorApproachPoints(door).some(p=>tokenVisibleAt({role,hidden:false,owned:false,foe:true,mapFog,tokenFog,grid,x:p.x,y:p.y})&&fogVisionContains(playerVision,p.x,p.y,usesTokenVision(map)))?[t]:[];
        const personallyVisible = tokenVisibleAt({ role, hidden: false,
        owned: t.kind === 'pc' && owned.has(t.refId),
        foe: t.kind === 'monster' && monById.get(t.refId)?.disposition !== 'friendly',
        mapFog, tokenFog, grid, x: t.x, y: t.y }) && fogVisionContains(playerVision,t.x,t.y,usesTokenVision(map));
        if(personallyVisible)return [t];
        // Party positions are always known. Explicit DM hiding still wins.
        // Objects remain personal; remembered terrain never retains enemies.
        if(t.kind==='pc')return [{...t,sharedSightOnly:true}];
        if(monById.get(t.refId)?.objectKind || !party.size)return [];
        const partyVisible = tokenVisibleAt({role,hidden:false,owned:false,
          foe:monById.get(t.refId)?.disposition!=='friendly',mapFog,tokenFog,grid,x:t.x,y:t.y}) && fogVisionContains(partyVision,t.x,t.y,usesTokenVision(map));
        return partyVisible?[{...t,sharedSightOnly:true}]:[];
      });
      // Sources were fog/hidden-gated in createPlayerVision. A placed source
      // around a corner can illuminate a visible doorway; do not remove it
      // simply because its fixture is outside this viewer's line of sight.
      // Carried lights also require sight of their source so an unseen creature's
      // ID/position never leaks through a lighting payload.
      // Visibility is personal: never share a shaped monster cache between viewers.
      if(map?.environment&&playerVision)map={...map,environment:{...map.environment,
        lights:map.environment.lights.map(l=>fogVisionContains(playerVision,l.x,l.y,usesMapVision(map))?l:{...l,visibleTorch:false})}};
      const visibleMonIds = new Set(
        tokens.filter((t) => t.kind === 'monster').map((t) => t.refId),
      );
      shapedMonsters = monsters
        .filter((m) => visibleMonIds.has(m.id))
        .map(toPlayerMonster);
      // Strip other players' infrastructure ids (live socket + durable browser
      // id): a leaked ownerId is a character-hijack key — rejoin with it and the
      // server hands you that PC. Keep the VIEWER'S OWN character intact, since
      // its own reclaim + "this is mine" checks rely on ownerId/claimedBy.
      shapedCharacters = characters.map((c): Character => {
        const mine =
          c.claimedBy === socketId || (!!playerId && c.ownerId === playerId);
        if (mine) return c;
        // Non-null sentinel preserves the client's "taken by someone" state
        // without exposing the real socket id.
        return { ...c, ownerId: null, claimedBy: c.claimedBy ? '__held__' : null };
      });
      // Rules-assistant Q&A is a DM tool — never leak it to players.
      shapedRollLog = playerRollLog ??= rollLog
        // DM rolls captured while "hide my rolls" was on never reach players.
        .filter((e) => !e.dmOnly)
        .map((e) => ({
          ...redactCreatureMods(e,e.roller==='DM'||monsters.some(m=>m.name===e.roller)||e.reveal?.kind==='check'&&e.reveal.visibilityTarget?.kind==='monster'),
          // The "Apply damage" payload is a DM-only adjudication tool, and the
          // parked weapon damage is the attacker's own button.
          apply: undefined,
          pending: undefined,
          smite: undefined,
          hpNote: e.hpNote?.kind==='pc' && hpNoteVisible(e.hpNote) ? e.hpNote : undefined,
        }));
      // …except the OWNER keeps their own entry's payload (both are stamped with
      // an `owner` character id): the player who cast Magic Missile assigns its
      // darts, the player who cast an AOE save spell gets the "Apply damage"
      // click-to-target button, and the player who landed a hit gets the
      // "Roll damage" button — same as the DM. Per-socket overlay on the shared
      // cache, only when this viewer has such a roll in play.
      const ownedByMe = (owner?: string) =>
        !!owner && charById.get(owner)?.claimedBy === socketId;
      const mine = rollLog.filter(
        (e) =>
          ownedByMe(e.apply?.owner) || ownedByMe(e.pending?.owner) || ownedByMe(e.smite?.owner),
      );
      if (mine.length) {
        const keep = new Map(
          mine.map((e) => [
            e.id,
            {
              ...(ownedByMe(e.apply?.owner) ? { apply: e.apply } : {}),
              ...(ownedByMe(e.smite?.owner) ? { smite: e.smite } : {}),
              ...(ownedByMe(e.pending?.owner) ? { pending: e.hideMods && e.pending
                // Pending data remains the existing owner's action payload;
                // new named log-only detail is not needed before resolution.
                ? { ...e.pending, damageBreakdown: undefined } : e.pending } : {}),
            },
          ] as const),
        );
        shapedRollLog = shapedRollLog.map((e) =>
          keep.has(e.id) ? { ...e, ...keep.get(e.id) } : e,
        );
      }
    }

    if (role==='player' && shapedRollLog.some(e=>e.reveal?.visibilityTarget)) shapedRollLog=shapedRollLog.filter(e=>!e.reveal?.visibilityTarget || tokens.some(t=>
      !t.sharedSightOnly && t.kind===e.reveal!.visibilityTarget!.kind && t.refId===e.reveal!.visibilityTarget!.refId));
    if (role==='dm') {
      const labels=new Map(data.tokens.filter(t=>t.kind==='monster'&&t.revealTag).map(t=>{
        const name=monById.get(t.refId)?.name??'';
        return [name,`${name} ${t.revealTag}`];
      }));
      const caption=(name:string|undefined)=>name ? labels.get(name)??name : name;
      shapedRollLog=shapedRollLog.map(e=>({...e,
        ...(e.reveal ? {reveal:{...e.reveal,target:caption(e.reveal.target),attacker:caption(e.reveal.attacker)!}} : {}),
        ...(e.pending ? {pending:{...e.pending,target:{...e.pending.target,name:caption(e.pending.target.name)!}}} : {}),
      }));
    }
    tokens=tokens.map(t=>{const e=t.kind==='pc'?charById.get(t.refId):monById.get(t.refId);return {...t,invisible:isInvisible(e),leavesNoTracks:e?.conditions.some(c=>c.combatEffect?.stealthBonus===10)};});
    const spikeMeasurements=[...characters,...monsters].flatMap(e=>e.conditions.flatMap(c=>{
      const zone=c.combatEffect?.spikeArea;if(!zone||!c.isConcentration||zone.mapId!==map?.id)return [];
      const px=map.gridSizePx/map.feetPerSquare;
      return [{id:c.id,mapId:zone.mapId,kind:'circle' as const,origin:{x:zone.x,y:zone.y},target:{x:zone.x+zone.radiusFt*px,y:zone.y},createdBy:'Spike Growth',spellArea:{spec:{kind:'sphere' as const,sizeFt:20,rangeFt:150,ongoing:true},angle:0},spellName:'Spike Growth'}];
    }));
    return {
      role,
      ...(playerVision?{playerVision}:{}),
      ...(role==='player'?{exploredTerrain:exploredTerrain??[]}:{}),
      initiativePending: session.initiativePending,
      counterspellCasts:heldCasts(sessionId).flatMap(c=>{
        const caster=data.tokens.find(t=>t.id===c.casterTokenId),mine=!!caster&&caster.kind==='pc'&&owned.has(caster.refId);
        const reactors=eligibleCounterspellers(c).filter(t=>c.reactors.includes(t.id)&&(role==='dm'||t.kind==='pc'&&owned.has(t.refId)));
        if(role!=='dm'&&!mine&&!reactors.length)return [];
        const e=caster&&(caster.kind==='pc'?charById.get(caster.refId):monById.get(caster.refId));
        return [{id:c.id,spell:c.spell,casterName:role==='dm'||caster?.kind!=='monster'?e?.name??'Caster':e&&'disposition'in e?`${playerMonsterName(e)}${caster.revealTag&&caster.revealTag!=='U'?` ${caster.revealTag}`:''}`:'Caster',expiresAt:c.expiresAt,mine,reactors:reactors.map(t=>({tokenId:t.id,kind:t.kind,refId:t.refId,name:(t.kind==='pc'?charById.get(t.refId):monById.get(t.refId))!.name}))}];
      }),
      shieldReactions:rawRollLog.filter(e=>e.pending?.shield&&!e.pending.done&&(role==='dm'||e.pending.target.kind==='pc'&&charById.get(e.pending.target.refId)?.claimedBy===socketId)).map(e=>({rollId:e.id,kind:e.pending!.target.kind,refId:e.pending!.target.refId,name:e.pending!.target.name,magicMissile:e.pending!.shield!.attackTotal===undefined})),
      ripostes: listRipostes(sessionId).filter(o =>
        (role === 'dm' || charById.get(o.owner)?.claimedBy === socketId) &&
        tokens.some(t => t.id === o.defenderTokenId) && tokens.some(t => t.id === o.attackerTokenId && !t.sharedSightOnly)),
      sessionCode: session.code,
      sessionName: session.name,
      map,
      activeMapId,
      activeTurnTokenId: session.activeTurnTokenId,
      round: session.combatRound,
      hideDmRolls: session.hideDmRolls,
      manualDamage: session.manualDamage,
      commandCustomWords: !!session.commandCustomWords,
      // DM-only: what the next undo would reverse (drives the DM's Undo button).
      undoLabel: role === 'dm' ? peekUndo(sessionId) : null,
      // The map LIST is only a picker (name/active) — the client reads fog cells
      // exclusively from the `map` field above, so drop the big fog arrays from
      // the list entries (the DM's every-map fog was ~145 KB per snapshot, and
      // the player's `[map]` duplicated the active map's fog a second time).
      maps:
        role === 'dm'
          ? maps.map(stripListFog)
          : map
            ? [stripListFog(map)]
            : [],
      tokens,
      characters: shapedCharacters,
      monsters: shapedMonsters,
      // Spawn templates are a DM-only tool.
      monsterTemplates:
        role === 'dm' ? (templates ??= listMonsterTemplates(sessionId)) : [],
      rollLog: role === 'dm' ? shapedRollLog : playerLogNames(shapedRollLog),
      chat: shapedChat,
      measurements: [...data.measurements,...spikeMeasurements],
      annotations: data.annotations,
      mapImages: data.mapImages,
    };
  };
}

/**
 * Build a single role-shaped snapshot. This is the security boundary: players
 * never receive hidden tokens or full monster stats, and they only ever see the
 * session's active map regardless of what they request. (For fan-out to many
 * clients use `createSnapshotBuilder` so the queries run once per change.)
 */
export function buildSnapshot(
  sessionId: string,
  role: Role,
  /** DM's currently-selected (possibly staging) map; ignored for players. */
  dmViewMapId?: string | null,
  /** Requesting socket — a player always sees their own claimed PC token. */
  socketId?: string,
  /** Requesting player's durable browser id — keeps THEIR own character's
   *  owner/claim ids intact while other players' are stripped. */
  playerId?: string | null,
): StateSnapshot | null {
  return (
    createSnapshotBuilder(sessionId)?.(role, dmViewMapId, socketId, playerId) ?? null
  );
}
