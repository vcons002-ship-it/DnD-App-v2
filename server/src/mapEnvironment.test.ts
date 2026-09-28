import {afterEach,describe,expect,it,vi} from 'vitest';
import {DEFAULT_MAP_ENVIRONMENT,sanitizeMapEnvironment} from '../../shared/mapEnvironment.js';
import {createMap,createSession,getMap,listMaps,getSessionByCode,setActiveMap,updateMapEnvironment,importMaps} from './sessions.js';
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
  return (p:unknown)=>handlers.get('map:setEnvironment')!(p);
}
describe('saved map environment',()=>{
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
  it('enforces DM and campaign ownership through the actual socket handler',()=>{
    const a=createSession('A'),b=createSession('B'),map=createMap(a.id,{name:'A'}),foreign=createMap(b.id,{name:'B'});
    client(a.id,map.id,'player')({mapId:map.id,settings:{enabled:true}});
    client(a.id,map.id,'dm')({mapId:foreign.id,settings:{enabled:true}});
    expect(getMap(map.id)!.environment!.enabled).toBe(false);
    expect(getMap(foreign.id)!.environment!.enabled).toBe(false);
    client(a.id,map.id,'dm')({mapId:map.id,settings:{enabled:true,mistHeightFt:3}});
    expect(getMap(map.id)!.environment!.mistHeightFt).toBe(3);
  });
  it('shares active-map settings, keeps staged maps separate, and round-trips saves',()=>{
    const session=createSession('Environment saves'),active=createMap(session.id,{name:'Active'}),staged=createMap(session.id,{name:'Prep'});
    setActiveMap(session.id,active.id);
    updateMapEnvironment(session.id,active.id,{enabled:true,mistHeightFt:4,shadowDirectionDegrees:120});
    updateMapEnvironment(session.id,staged.id,{mist:false,shadowDirectionDegrees:270});
    expect(buildSnapshot(session.id,'player',staged.id,'viewer')!.map!.environment).toEqual(getMap(active.id)!.environment);
    expect(buildSnapshot(session.id,'dm',staged.id)!.map!.environment).toEqual(getMap(staged.id)!.environment);
    const restored=importSession(exportSession(session.code)!);
    const maps=listMaps(getSessionByCode(restored.code)!.id);
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
