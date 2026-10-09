import {afterEach,describe,expect,it,vi} from 'vitest';
import {DEFAULT_MAP_ENVIRONMENT,mapShadowsEnabled,sanitizeMapEnvironment,mapLightColorHex} from '../../shared/mapEnvironment.js';
import {MAP_ENVIRONMENT_PRESETS,environmentPresetPatch,matchingEnvironmentPreset} from '../../shared/mapEnvironmentPresets.js';
import {stormLightningAt} from '../../shared/stormLighting.js';
import {createMap,createSession,getMap,listMaps,getSessionByCode,setActiveMap,updateMapEnvironment,importMaps,createCharacter,createToken,claimCharacter,getToken,listTokens,moveToken} from './sessions.js';
import {exportSession,importSession} from './backup.js';
import {db} from './db.js';
import {buildSnapshot} from './visibility.js';
import {registerSocketHandlers} from './socketHandlers.js';
import {dropConn,setConn,type IOServer} from './connections.js';
import {environmentFogPixels} from '../../client/src/canvas/environmentVisibility.js';

const connections:string[]=[];
afterEach(()=>connections.splice(0).forEach(dropConn));
function client(sessionId:string,mapId:string,role:'dm'|'player'){
  let connect!:(socket:unknown)=>void;
  const io={on:(_:string,fn:typeof connect)=>{connect=fn;},to:()=>({emit:vi.fn()})};
  registerSocketHandlers(io as unknown as IOServer,{livePhysics:false});
  const handlers=new Map<string,(p:unknown)=>void>(),id=`environment-${Math.random()}`;
  connect({id,on:(event:string,fn:(p:unknown)=>void)=>handlers.set(event,fn),emit:vi.fn()});
  setConn(id,{sessionId,viewMapId:mapId,role,playerId:null});connections.push(id);
  return Object.assign((p:unknown)=>handlers.get('map:setEnvironment')!(p),{id,send:(event:string,p:unknown)=>handlers.get(event)!(p)});
}
describe('saved map environment',()=>{
  it('persists the next-light color per map, across atmosphere changes and save import',()=>{
    const session=createSession('Light placement colors'),map=createMap(session.id,{name:'Blue room'}),other=createMap(session.id,{name:'Other room'});
    expect(getMap(map.id)!.environment!.newLightColor).toBe('warm');
    updateMapEnvironment(session.id,map.id,{newLightColor:'#2266FF'});
    updateMapEnvironment(session.id,map.id,{weather:'rain',newLightColor:'invalid'});
    updateMapEnvironment(session.id,map.id,environmentPresetPatch('deep-dungeon'));
    expect(getMap(map.id)!.environment!.newLightColor).toBe('#2266ff');
    expect(getMap(other.id)!.environment!.newLightColor).toBe('warm');
    const restored=importSession(exportSession(session.code)!);
    const imported=listMaps(getSessionByCode(restored.code)!.id);
    expect(imported.find(m=>m.name==='Blue room')!.environment!.newLightColor).toBe('#2266ff');
    expect(imported.find(m=>m.name==='Other room')!.environment!.newLightColor).toBe('warm');
  });
  it('keeps legacy light presets and normalizes custom RGB colors while rejecting invalid values',()=>{
    const light={id:'color',x:25,y:25,radiusFt:20,heightFt:9,intensity:1,flicker:true};
    for(const [color,hex]of [['warm','#ffb258'],['cool','#89bbff'],['green','#85eab5'],['#A92CFF','#a92cff'],['#000000','#000000'],['#ffffff','#ffffff']]){
      const saved=sanitizeMapEnvironment({lights:[{...light,color}]}).lights[0];
      expect(saved.color).toBe(color.toLowerCase());expect(mapLightColorHex(saved.color)).toBe(hex);
    }
    for(const color of ['#abc','#12345678','red','rgb(1,2,3)','__proto__','<script>',null,{}]){
      expect(sanitizeMapEnvironment({lights:[{...light,color}]}).lights[0].color).toBe('warm');
      expect(mapLightColorHex(color)).toBe('#ffb258');
    }
  });
  it('defaults darkness to light-source shadows, preserves overrides and restores daylight',()=>{
    const session=createSession('Shadow defaults'),map=createMap(session.id,{name:'Night'});
    const dm=client(session.id,map.id,'dm');
    const save=(settings:unknown)=>{dm({mapId:map.id,settings});return getMap(map.id)!.environment!;};
    for(const lighting of ['night','dungeon']){
      expect(save({lighting:'day',heavyDarkness:false})).toMatchObject({shadows:true,mapShadows:true});
      expect(save({lighting})).toMatchObject({shadows:true,mapShadows:false});
      expect(save({mapShadows:true})).toMatchObject({shadows:true,mapShadows:true});
      expect(save({mistOpacity:.2})).toMatchObject({mapShadows:true});
      expect(save({heavyDarkness:true})).toMatchObject({shadows:true,mapShadows:false});
      expect(save({mapShadows:true})).toMatchObject({mapShadows:true});
      const imported=importSession(exportSession(session.code)!);
      expect(listMaps(getSessionByCode(imported.code)!.id)[0].environment).toMatchObject({shadows:true,mapShadows:true,heavyDarkness:true});
      expect(save({heavyDarkness:false})).toMatchObject({mapShadows:false});
    }
    expect(save({lighting:'day',heavyDarkness:false})).toMatchObject({mapShadows:true});
    expect(save({lighting:'night',mapShadows:true})).toMatchObject({mapShadows:true});
    expect(save({mapShadows:'false',weather:'rain'})).toMatchObject({mapShadows:true});
  });
  it('normalizes old dark saves and supplies the same shadow fallback to previews',()=>{
    for(const lighting of ['night','dungeon'] as const){
      expect(sanitizeMapEnvironment({lighting,shadows:true})).toMatchObject({shadows:true,mapShadows:false});
      expect(mapShadowsEnabled({lighting})).toBe(false);
      expect(mapShadowsEnabled({lighting,mapShadows:true})).toBe(true);
    }
    expect(mapShadowsEnabled({lighting:'day'})).toBe(true);
    expect(mapShadowsEnabled({lighting:'day',heavyDarkness:true})).toBe(false);
    for(const preset of MAP_ENVIRONMENT_PRESETS){
      const dark=preset.settings.lighting==='night'||preset.settings.lighting==='dungeon'||preset.settings.heavyDarkness;
      expect(preset.settings.mapShadows).toBe(!dark);
      expect(preset.settings.shadows).toBe(true);
    }
  });
  it('defaults old and new maps off and safely bounds partial settings',()=>{
    const session=createSession('Environment defaults'),map=createMap(session.id,{name:'Arena'});
    expect(map.environment).toEqual(DEFAULT_MAP_ENVIRONMENT);
    updateMapEnvironment(session.id,map.id,{enabled:true,mistHeightFt:100,shadowOpacity:-1,shadowDirectionDegrees:-20,unknown:'ignored'});
    updateMapEnvironment(session.id,map.id,{mistHeightFt:NaN,mist:'true'});
    expect(getMap(map.id)!.environment).toEqual({...DEFAULT_MAP_ENVIRONMENT,enabled:true,mistHeightFt:10,shadowOpacity:0,shadowDirectionDegrees:340});
    db.prepare('UPDATE maps SET environment = ? WHERE id = ?').run('bad JSON',map.id);
    expect(getMap(map.id)!.environment).toEqual(DEFAULT_MAP_ENVIRONMENT);
    expect(sanitizeMapEnvironment(null)).toEqual(DEFAULT_MAP_ENVIRONMENT);
  });
  it('applies complete presets without changing placed lights, calibration, or other maps',()=>{
    const session=createSession('Preset save'),map=createMap(session.id,{name:'Storm'}),other=createMap(session.id,{name:'Prep'});
    const light={id:'saved',x:30,y:50,radiusFt:15,heightFt:.5,color:'warm',intensity:1,flicker:true,visibleTorch:true,fixture:'lantern'};
    updateMapEnvironment(session.id,map.id,{lights:[light],shadowDirectionDegrees:123,shadowLength:2,windDirectionDegrees:210});
    const dm=client(session.id,map.id,'dm');
    for(const preset of MAP_ENVIRONMENT_PRESETS){
      dm({mapId:map.id,settings:environmentPresetPatch(preset.id)});
      const saved=getMap(map.id)!.environment!;
      expect(matchingEnvironmentPreset(saved)).toBe(preset.id);
      expect(matchingEnvironmentPreset({...saved,mistHeightFt:saved.mistHeightFt*12.8/12.8})).toBe(preset.id);
      expect(saved).toMatchObject({lights:[light],shadowDirectionDegrees:123,shadowLength:2,windDirectionDegrees:210});
    }
    dm({mapId:map.id,settings:environmentPresetPatch('rainstorm')});
    expect(getMap(map.id)!.environment).toMatchObject({lightning:true,groundWetness:.8});
    const restored=importSession(exportSession(session.code)!);
    expect(listMaps(getSessionByCode(restored.code)!.id).find(m=>m.name==='Storm')!.environment).toEqual(getMap(map.id)!.environment);
    dm({mapId:map.id,settings:environmentPresetPatch('clear-day')});
    expect(getMap(map.id)!.environment).toMatchObject({lightning:false,groundWetness:0,weather:'none',heavyDarkness:false,particles:'none',mistColor:'natural',sceneTint:'#ffffff',sceneTintStrength:0});
    dm({mapId:map.id,settings:{lightLevel:.6}});
    expect(matchingEnvironmentPreset(getMap(map.id)!.environment!)).toBe('');
    expect(getMap(other.id)!.environment).toEqual(DEFAULT_MAP_ENVIRONMENT);
    expect(environmentPresetPatch('invalid')).toBeUndefined();
  });
  it('saves stronger wind and safe scene tint, and clears custom coloring with Clear day',()=>{
    const session=createSession('Wind and color'),map=createMap(session.id,{name:'Weather'});
    const dm=client(session.id,map.id,'dm');
    dm({mapId:map.id,settings:{enabled:true,windStrength:2.5,sceneTint:'#Ab45Ef',sceneTintStrength:.35}});
    const saved=getMap(map.id)!.environment!;
    expect(saved).toMatchObject({windStrength:2.5,sceneTint:'#ab45ef',sceneTintStrength:.35});
    expect(sanitizeMapEnvironment({windStrength:Infinity,sceneTint:'red;url(x)',sceneTintStrength:'1'},saved)).toEqual(saved);
    expect(sanitizeMapEnvironment({windStrength:99,sceneTintStrength:2},saved)).toMatchObject({windStrength:3,sceneTintStrength:1});
    dm({mapId:map.id,settings:environmentPresetPatch('clear-day')});
    expect(getMap(map.id)!.environment).toMatchObject({lighting:'day',lightLevel:1,sceneTint:'#ffffff',sceneTintStrength:0,mist:false,groundWetness:0});
  });
  it('keeps cloud lightning sparse, bounded, deterministic and off at frozen time',()=>{
    expect(stormLightningAt(0)).toBe(0);expect(stormLightningAt(NaN)).toBe(0);
    const samples=Array.from({length:12000},(_,i)=>stormLightningAt(1700000000+i*.01));
    expect(samples.every(v=>v>=0&&v<=1)).toBe(true);
    expect(samples.filter(v=>v>.01).length).toBeLessThan(samples.length*.08);
    expect(Math.max(...samples)).toBeGreaterThan(.9);
    expect(stormLightningAt(1700000007.2)).toBe(stormLightningAt(1700000007.2));
  });
  it('enforces DM and campaign ownership through the actual socket handler',()=>{
    const a=createSession('A'),b=createSession('B'),map=createMap(a.id,{name:'A'}),foreign=createMap(b.id,{name:'B'});
    client(a.id,map.id,'player')({mapId:map.id,settings:{enabled:true}});
    client(a.id,map.id,'dm')({mapId:foreign.id,settings:{enabled:true}});
    expect(getMap(map.id)!.environment!.enabled).toBe(false);
    expect(getMap(foreign.id)!.environment!.enabled).toBe(false);
    client(a.id,map.id,'dm')({mapId:map.id,settings:{enabled:true,mistHeightFt:3}});
    expect(getMap(map.id)!.environment!.mistHeightFt).toBe(3);
  });
  it('bounds weather and local lights while preserving invalid partial fields',()=>{
    const light={id:'torch',x:75,y:25,radiusFt:500,heightFt:-1,color:'warm',intensity:8,flicker:true};
    const result=sanitizeMapEnvironment({lighting:'night',weather:'rain',weatherIntensity:4,windDirectionDegrees:-40,windStrength:-1,heavyDarkness:true,lightning:true,groundWetness:5,particles:'leaves',particleIntensity:5,mistColor:'sand',lights:[light,light,{id:'broken',x:NaN,y:0}]});
    expect(result).toMatchObject({lighting:'night',weather:'rain',weatherIntensity:1,windDirectionDegrees:320,windStrength:0,heavyDarkness:true,lightning:true,groundWetness:1,particles:'leaves',particleIntensity:1,mistColor:'sand'});
    expect(result.lights).toEqual([{...light,radiusFt:60,heightFt:.5,intensity:2}]);
    expect(sanitizeMapEnvironment({weather:'storm',lighting:'unknown',lights:'bad',heavyDarkness:'false',lightning:'false',groundWetness:NaN,particles:'unknown',particleIntensity:NaN,mistColor:'invalid'},result)).toEqual(result);
    expect(sanitizeMapEnvironment({lights:Array.from({length:20},(_,i)=>({...light,id:String(i)}))}).lights).toHaveLength(20);
    expect(sanitizeMapEnvironment({lights:[{...light,visibleTorch:true,fixture:'lantern'}]}).lights[0]).toMatchObject({visibleTorch:true,fixture:'lantern'});
    expect(sanitizeMapEnvironment({lights:[{...light,fixture:'invalid'}]}).lights[0].fixture).toBeUndefined();
    expect(sanitizeMapEnvironment({lights:[{...light,visibleTorch:'true'}]}).lights[0].visibleTorch).toBeUndefined();
  });
  it('shares carried lanterns, enforces ownership, and retains them through movement and save import',()=>{
    const session=createSession('Carried lanterns'),map=createMap(session.id,{name:'Night'}),prep=createMap(session.id,{name:'Prep'});
    setActiveMap(session.id,map.id);
    const ch=createCharacter(session.id,{name:'Torch bearer'}),other=createCharacter(session.id,{name:'Another player'});
    const token=createToken({mapId:map.id,kind:'pc',refId:ch.id,x:25,y:25});
    const another=createToken({mapId:map.id,kind:'pc',refId:other.id,x:75,y:25});
    const staged=createToken({mapId:prep.id,kind:'pc',refId:ch.id,x:25,y:25});
    const player=client(session.id,map.id,'player'),dm=client(session.id,map.id,'dm');claimCharacter(ch.id,player.id);
    const toggle=(sender:typeof player,id:string,enabled:unknown)=>sender.send('token:setLantern',{tokenId:id,enabled});
    toggle(player,token.id,true);expect(getToken(token.id)!.carriedLantern).toBe(true);
    toggle(player,another.id,true);toggle(player,staged.id,true);
    expect(getToken(another.id)!.carriedLantern).toBe(false);expect(getToken(staged.id)!.carriedLantern).toBe(false);
    toggle(player,token.id,'false');expect(getToken(token.id)!.carriedLantern).toBe(true);
    const foreign=createSession('Foreign'),foreignMap=createMap(foreign.id,{name:'Elsewhere'});
    const foreignToken=createToken({mapId:foreignMap.id,kind:'pc',refId:createCharacter(foreign.id,{name:'Foreign'}).id,x:0,y:0});
    toggle(dm,foreignToken.id,true);expect(getToken(foreignToken.id)!.carriedLantern).toBe(false);
    toggle(dm,another.id,true);expect(getToken(another.id)!.carriedLantern).toBe(true);
    moveToken(token.id,125,150);expect(getToken(token.id)).toMatchObject({x:125,y:150,carriedLantern:true});
    expect(buildSnapshot(session.id,'player',map.id,player.id)!.tokens.find(t=>t.id===token.id)?.carriedLantern).toBe(true);
    db.prepare('UPDATE tokens SET is_hidden = 1 WHERE id = ?').run(token.id);
    toggle(player,token.id,false);expect(getToken(token.id)!.carriedLantern).toBe(true);
    expect(buildSnapshot(session.id,'player',map.id,player.id)!.tokens.some(t=>t.id===token.id)).toBe(false);
    const restored=importSession(exportSession(session.code)!);
    const restoredMap=listMaps(getSessionByCode(restored.code)!.id).find(m=>m.name==='Night')!;
    expect(listTokens(restoredMap.id).filter(t=>t.carriedLantern)).toHaveLength(2);
  });
  it('only shares revealed light sources with players, including the map list',()=>{
    const session=createSession('Hidden torches'),map=createMap(session.id,{name:'Dungeon'});
    const character=createCharacter(session.id,{name:'Viewer'});claimCharacter(character.id,'viewer');
    createToken({mapId:map.id,kind:'pc',refId:character.id,x:25,y:25});
    setActiveMap(session.id,map.id);
    const lights=[{id:'visible',x:25,y:25,radiusFt:15,heightFt:6,color:'warm',intensity:1,flicker:true},{id:'hidden',x:75,y:25,radiusFt:15,heightFt:6,color:'cool',intensity:1,flicker:false}];
    updateMapEnvironment(session.id,map.id,{enabled:true,lighting:'dungeon',weather:'rain',lights});
    db.prepare('UPDATE maps SET map_fog_enabled = 1, map_fog_revealed = ?, grid_size_px = 50 WHERE id = ?').run(JSON.stringify(['0,0']),map.id);
    const player=buildSnapshot(session.id,'player',map.id,'viewer')!;
    expect(player.map!.environment!.lights.map(l=>l.id)).toEqual(['visible']);
    expect(player.maps[0].environment!.lights.map(l=>l.id)).toEqual(['visible']);
    expect(buildSnapshot(session.id,'dm',map.id)!.map!.environment!.lights).toHaveLength(2);
    expect(getMap(map.id)!.environment!.lights).toHaveLength(2);
  });
  it('shares active-map settings, keeps staged maps separate, and round-trips saves',()=>{
    const session=createSession('Environment saves'),active=createMap(session.id,{name:'Active'}),staged=createMap(session.id,{name:'Prep'});
    setActiveMap(session.id,active.id);
    updateMapEnvironment(session.id,active.id,{enabled:true,mistHeightFt:4,shadowDirectionDegrees:120,lighting:'dusk',heavyDarkness:true,weather:'snow',particles:'embers',particleIntensity:.65,mistColor:'ash',windStrength:2.6,sceneTint:'#5632a4',sceneTintStrength:.4,lights:[{id:'lamp',fixture:'lantern',visibleTorch:true,x:50,y:60,radiusFt:15,heightFt:6,color:'#aa22dd',intensity:1,flicker:true}]});
    updateMapEnvironment(session.id,staged.id,{mist:false,shadowDirectionDegrees:270});
    expect(buildSnapshot(session.id,'player',staged.id,'viewer')!.map!.environment).toEqual(getMap(active.id)!.environment);
    expect(buildSnapshot(session.id,'dm',staged.id)!.map!.environment).toEqual(getMap(staged.id)!.environment);
    const restored=importSession(exportSession(session.code)!);
    const maps=listMaps(getSessionByCode(restored.code)!.id);
    expect(maps.find(m=>m.name==='Active')!.environment!.lights[0].color).toBe('#aa22dd');
    expect(maps.find(m=>m.name==='Active')!.environment).toEqual(getMap(active.id)!.environment);
    expect(maps.find(m=>m.name==='Prep')!.environment).toEqual(getMap(staged.id)!.environment);
    const target=createSession('Import map environment');
    expect(importMaps(target.id,session.code,[active.id])).toBe(1);
    expect(listMaps(target.id)[0].environment).toEqual(getMap(active.id)!.environment);
  });
});
describe('environment fog masks',()=>{
  it('uses exact cells, including negative tiles, and never fills their hidden neighbors',()=>{
    const mask=environmentFogPixels({mapX:-100,mapY:-50,mapWidth:250,mapHeight:150,fog:{grid:50,revealed:['-1,-1','1,0','100,100','NaN,0','0.5,0']}});
    expect(mask.bounds).toEqual([-100,-50,250,150]);
    expect([...mask.data].flatMap((v,i)=>v?[i]:[])).toEqual([1,8]);
    expect(mask.width).toBe(5);expect(mask.height).toBe(3);
  });
  it('fails closed for empty reveals and oversized masks',()=>{
    expect([...environmentFogPixels({mapWidth:100,mapHeight:100,fog:{grid:50,revealed:[]}}).data]).toEqual([0,0,0,0]);
    expect([...environmentFogPixels({mapWidth:1e9,mapHeight:1e9,fog:{grid:1,revealed:['0,0']}}).data]).toEqual([0]);
  });
});
