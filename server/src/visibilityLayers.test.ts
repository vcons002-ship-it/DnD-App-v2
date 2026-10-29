import {describe,it,expect} from 'vitest';
import {needsVisibilityLayer,fogVisionContains,type PlayerVision} from '../../shared/playerVision.js';
import type {MapWall} from '../../shared/mapWalls.js';
import {tokenVisibleAt} from '../../shared/fog.js';

const wall:MapWall={id:'wall',ax:10,ay:-100,bx:10,by:100};
const bright=(changes:Partial<PlayerVision>={}):PlayerVision=>({
 rangeFt:60,radius:60,heavy:false,daylight:true,
 origins:[{id:'pc',x:0,y:0}],lights:[],walls:[],...changes,
});

describe('dynamic visibility layer fast path',()=>{
 it('skips daylight with no sight blockers even when map sight is enabled',()=>{
  expect(needsVisibilityLayer({mapVisionEnabled:true},bright())).toBe(false);
  expect(needsVisibilityLayer(null,undefined)).toBe(false);
 });
 it('ignores open doors and transparent markers without constructing wall polygons',()=>{
  for(const opening of [{...wall,door:true,open:true},{...wall,window:true},{...wall,arch:true}]){
   expect(needsVisibilityLayer({mapVisionEnabled:true},bright({walls:[opening]}))).toBe(false);
  }
 });
 it('conservatively retains a solid wall even when opening markers overlap it',()=>{
  expect(needsVisibilityLayer({mapVisionEnabled:true},
   bright({walls:[wall,{...wall,id:'window',window:true}]}))).toBe(true);
 });
 it('retains walls and closed doors, including fallback map geometry',()=>{
  expect(needsVisibilityLayer({mapVisionEnabled:true},bright({walls:[wall]}))).toBe(true);
  expect(needsVisibilityLayer({mapVisionEnabled:true},bright({walls:[{...wall,door:true,open:false}]}))).toBe(true);
  expect(needsVisibilityLayer({mapVisionEnabled:true,walls:[wall]},bright({walls:undefined}))).toBe(true);
 });
 it('fails closed without sight origins and retains dark or uncertain lighting',()=>{
  expect(needsVisibilityLayer({mapVisionEnabled:true},bright({origins:[]}))).toBe(true);
  expect(needsVisibilityLayer({mapVisionEnabled:true},bright({heavy:true}))).toBe(true);
  expect(needsVisibilityLayer({mapVisionEnabled:true},bright({daylight:false}))).toBe(true);
  expect(needsVisibilityLayer({mapVisionEnabled:true},bright({daylight:undefined}))).toBe(true);
 });
 it('skipping terrain sight never disables independent token wall filtering',()=>{
  const vision=bright({walls:[wall]});
  expect(needsVisibilityLayer({mapVisionEnabled:false},vision)).toBe(false);
  expect(fogVisionContains(vision,20,0,true)).toBe(false);
 });
 it('painted fog still conceals tokens when dynamic layers are unnecessary',()=>{
  const map={mapVisionEnabled:true,mapFogEnabled:true,tokenFogEnabled:true};
  expect(needsVisibilityLayer(map,bright())).toBe(false);
  expect(tokenVisibleAt({role:'player',hidden:false,owned:false,foe:true,
   mapFog:new Set(['0,0']),tokenFog:new Set(['0,0']),grid:10,x:20,y:0})).toBe(false);
 });
});
