import {test,expect} from '@playwright/test';
import type {LiveDiceFrame} from '../shared/liveDiceTypes';
import type {RollReveal} from '../shared/types';
import {DM_SECRET} from './playwright.config';
import {expectUnclipped} from './helpers/rollVisibility';

// Presentation-boundary fixtures exercise the actual app components and CSS.
// Combat/physics and privacy are separately covered by real server rolls.
test('all roll layouts retain results inside clipped ancestors at desktop, tablet and phone sizes',async({page,request})=>{
  test.setTimeout(120000);
  await page.emulateMedia({reducedMotion:'reduce'});
  let send:(frame:LiveDiceFrame)=>void=()=>{throw Error('WebSocket not connected');};
  await page.routeWebSocket(/socket\.io/,ws=>{
    const upstream=ws.connectToServer();upstream.onMessage(message=>ws.send(message));
    send=frame=>ws.send('42'+JSON.stringify(['dice:frame',frame]));
  });
  const {code}=await(await request.post('/api/sessions',{headers:{'x-dm-passphrase':DM_SECRET},data:{name:'Roll layout audit'}})).json();
  await page.goto(`/join?code=${code}`);
  await page.getByRole('button',{name:'Join',exact:true}).click();
  await page.locator('.claim-row').filter({hasText:'Druk'}).click();
  await expect(page.getByTestId('player-hud')).toBeVisible();
  const mods=[{label:'Strength',value:4},{label:'Proficiency',value:3},{label:'Magical weapon enhancement',value:1},{label:'Bless',value:3},{label:'Cover penalty',value:-2}];
  const reveal=(kind:RollReveal['kind'],title:string):RollReveal=>({kind,title,physical:true,attacker:'Druk',target:'Goblin G2',outcome:kind==='attack'?'hit':kind==='check'?'pass':'none',
    ...(kind==='attack'||kind==='check'?{d20:14,toHit:mods,attackTotal:23}:{damageDice:[{label:'Weapon dice',value:11,faces:[5,6],sides:6}],damageMods:mods,damage:20,damageType:'piercing'})});
  const cases:{name:string;count:number;calculation?:RollReveal;saveDice?:LiveDiceFrame['saveDice']}[]=[
    {name:'attack',count:1,calculation:reveal('attack','Greatsword attack')},
    {name:'automatic-attack-damage',count:2,calculation:{...reveal('attack','Greatsword damage'),damageDice:[{label:'Weapon dice',value:11,faces:[5,6],sides:6}],damageMods:mods,damage:20,damageType:'slashing'}},
    {name:'skill',count:1,calculation:reveal('check','Athletics skill check')},
    {name:'spell-save',count:1,calculation:{...reveal('check','Wisdom Saving Throw'),effectOutcome:'Hold Person successful!'}},
    {name:'damage',count:2,calculation:reveal('damage','Longbow piercing damage')},
    {name:'healing',count:2,calculation:reveal('dice','Cure Wounds healing')},
    {name:'forty-dice',count:40,calculation:reveal('dice','40d6 dice roll')},
    {name:'grouped-saves',count:3,saveDice:[0,1,2].map(i=>({label:`Goblin G${i+1}`,modifier:3,dc:14,group:String(i),outcome:i%2?'fail':'pass',passEffect:'Half damage',failEffect:'Knocked prone'}))},
    {name:'private-saves',count:3,saveDice:[0,1,2].map(i=>({label:`Goblin G${i+1}`,group:String(i),hideModifiers:true,outcome:i%2?'fail':'pass'}))},
    {name:'advantage-save',count:2,saveDice:[0,1].map(()=>({label:'Druk',modifier:4,dc:14,group:'druk',mode:'adv',outcome:'pass',failEffect:'Knocked prone',passEffect:'Not pushed'}))},
    {name:'initiative',count:3,saveDice:[0,1,2].map(i=>({label:`Goblin G${i+1}`,rollKind:'initiative',modifier:3,group:String(i)}))},
  ];
  for(const size of [{width:1366,height:900},{width:1024,height:768},{width:412,height:915},{width:915,height:412}]){
    await page.setViewportSize(size);
    for(const c of cases){
      const id=`${size.width}-${c.name}`,sides=Array(c.count).fill(c.saveDice||['attack','skill','spell-save'].includes(c.name)?20:6);
      send({id,seq:0,label:c.calculation?.title??c.name,roller:'Druk',className:'Fighter',target:'Goblin G2',sides,radius:1.1,trayScale:1,
        sets:sides.map(()=>0),critical:sides.map(()=>false),percentile:sides.map(()=>null),rerolls:sides.map(()=>0),
        values:sides.map((s,i)=>s===20?14-i:5),poses:sides.flatMap((_,i)=>[(i%5-2)*2,Math.floor(i/5)-2,1.1,0,0,0,1]),elapsed:2,done:true,
        calculation:c.calculation,saveDice:c.saveDice});
      await expect(page.locator('[data-dice-presentation]')).toHaveAttribute('data-roll-id',id);
      if(c.saveDice){
        await expect(page.locator('.tray-save-outcome').first()).toHaveAttribute('data-bonus-phase','complete');
        const verdicts=page.locator('.tray-save-verdict');
        for(let i=0;i<c.count;i++){
          // Large batches are one horizontal strip, not clipped wrapped rows.
          await verdicts.nth(i).evaluate(el=>el.scrollIntoView({block:'nearest',inline:'nearest'}));
          await expectUnclipped(verdicts.nth(i));
          const detail=page.locator('.tray-save-outcome b').nth(i);
          await detail.evaluate(el=>el.scrollIntoView({block:'nearest',inline:'nearest'}));
          await expectUnclipped(detail);
        }
      }else{
        await expect(page.locator('.rr-equation')).toHaveCount(1);
        const total=page.locator('.rr-equation-total').first();
        await expectUnclipped(total);
        // Newest bonuses automatically stay in view, without user scrolling.
        await expectUnclipped(page.locator('.rr-adjustment').last());
        for(const modifier of await page.locator('.rr-adjustment').all()){
          await modifier.evaluate(el=>el.scrollIntoView({block:'nearest',inline:'nearest'}));
          await expectUnclipped(modifier);
        }
        if(c.calculation?.outcome!=='none')await expectUnclipped(page.getByLabel('Roll result',{exact:true}));
        if(c.calculation?.effectOutcome)await expectUnclipped(page.getByLabel('Spell outcome'));
      }
      // Every pool box is reachable horizontally without hiding the verdicts
      // or moving the outer fixed window; the last die must not be lost below.
      const last=page.locator('.tray-die-result').last();
      await last.evaluate(el=>el.scrollIntoView({block:'nearest',inline:'nearest'}));
      await expectUnclipped(last);
      await expectUnclipped(page.getByRole('button',{name:'Skip roll animation'}));
      if(['grouped-saves','damage','spell-save'].includes(c.name))await page.screenshot({path:test.info().outputPath(`${id}.png`)});
    }
  }
  // Also exercise the animated handoff between attack and damage equations.
  await page.setViewportSize({width:412,height:915});
  await page.emulateMedia({reducedMotion:'no-preference'});
  const calculation=cases.find(c=>c.name==='automatic-attack-damage')!.calculation!;
  send({id:'animated-combined',seq:0,label:'Automatic attack damage',roller:'Druk',className:'Fighter',sides:[6,6],radius:1.1,trayScale:1,
    sets:[0,0],critical:[false,false],percentile:[null,null],rerolls:[0,0],values:[5,6],poses:[-2,0,1.1,0,0,0,1,2,0,1.1,0,0,0,1],elapsed:2,done:true,calculation});
  const attack=page.getByLabel('Roll calculation',{exact:true});
  await expect(attack.locator('.rr-adjustment')).toHaveCount(mods.length);
  await expectUnclipped(attack.locator('.rr-adjustment').last());
  await expect(page.locator('.rr-equation')).toHaveCount(1);
  const damage=page.getByLabel('Damage or dice calculation');
  await expect(damage.locator('.rr-adjustment')).toHaveCount(mods.length);
  await expect(attack).toHaveCount(0);
  await expect(page.locator('.rr-equation')).toHaveCount(1);
  await expectUnclipped(damage.locator('.rr-adjustment').last());
  await expectUnclipped(damage.locator('.rr-equation-total'));
});
