import {it,expect} from 'vitest';
import {createSession,createMap,paintFog,getMap,setFogRevealed} from './sessions.js';
import {db} from './db.js';

it('persists only effective fog edits and keeps map/token layers independent',()=>{
 const session=createSession('Fog batch regression'),map=createMap(session.id,{name:'Large room'});
 setFogRevealed(map.id,'map',[]);setFogRevealed(map.id,'tokens',[]);
 const writes=()=>Number((db.prepare('SELECT total_changes() AS n').get() as {n:number}).n);
 const before=writes();expect(paintFog(map.id,'map',['1,2','1,2','-1,0'],true)).toBe(true);expect(writes()-before).toBe(1);
 expect(getMap(map.id)!.mapFogRevealed).toEqual(['1,2','-1,0']);
 const unchanged=writes();expect(paintFog(map.id,'map',['1,2'],true)).toBe(false);expect(paintFog(map.id,'map',['999,999'],false)).toBe(false);expect(writes()).toBe(unchanged);
 expect(paintFog(map.id,'tokens',['1,2'],true)).toBe(true);expect(paintFog(map.id,'map',['1,2'],false)).toBe(true);
 expect(getMap(map.id)!.mapFogRevealed).toEqual(['-1,0']);expect(getMap(map.id)!.tokenFogRevealed).toEqual(['1,2']);
});
