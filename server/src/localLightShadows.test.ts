import {describe,it,expect} from 'vitest';
import {selectShadowLights,LOCAL_SHADOW_SOURCES} from '../../shared/localLightShadows.js';
const light=(id:string,x:number,y=100)=>({id,x,y,height:50,radius:200,strength:1});
describe('local shadow light selection',()=>{
 it('ignores hidden casters, out-of-range lights, and lights across solid walls',()=>{
  const lights=[light('near',100),light('blocked',300),light('far',2000)];
  const walls=[{id:'partition',ax:200,ay:0,bx:200,by:300}];
  expect(selectShadowLights(lights,[{x:120,y:100,visible:true}],walls).map(l=>l.id)).toEqual(['near']);
  expect(selectShadowLights(lights,[{x:120,y:100,visible:false}],walls)).toEqual([]);
 });
 it('budgets by contribution at creatures rather than source creation order',()=>{
  const lights=Array.from({length:9},(_,i)=>light(String(i),20+i*20));
  const chosen=selectShadowLights(lights,[{x:180,y:100,visible:true}],[]);
  expect(chosen).toHaveLength(LOCAL_SHADOW_SOURCES);
  expect(chosen.map(l=>l.id)).toEqual(['8','7','6','5']);
  expect(selectShadowLights(lights,[{x:20,y:100,visible:true}],[])[0].id).toBe('0');
 });
});
