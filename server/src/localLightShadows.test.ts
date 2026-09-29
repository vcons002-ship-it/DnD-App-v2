import {describe,it,expect} from 'vitest';
import {selectShadowLights,castsLocalShadow,compactShadowHeightScale,LOCAL_SHADOW_SOURCES} from '../../shared/localLightShadows.js';
const light=(id:string,x:number,y=100)=>({id,x,y,height:50,radius:200,strength:1});
describe('local shadow light selection',()=>{
 it('fits the entire projected silhouette without a distance cutoff, including low lanterns',()=>{
  for(const lightHeight of [20,60,160]){
   const distance=100,height=120,radius=40,diameter=50;
   const scale=compactShadowHeightScale(lightHeight,distance,height,radius,diameter);
   const top=height*scale;
   expect(top).toBeLessThan(lightHeight);
   expect((distance+radius)*top/(lightHeight-top)).toBeCloseTo(diameter*1.4,5);
  }
  expect(compactShadowHeightScale(1000,10,50,10,50)).toBe(1);
 });
 it('passes a carried lantern through its owner, without exempting other creatures or placed lights',()=>{
  const owner={id:'varis',x:100,y:100,visible:true},other={...owner,id:'druk',x:140};
  const lantern={...light('varis',95),carried:true};
  expect(castsLocalShadow(lantern,owner)).toBe(false);
  expect(castsLocalShadow(lantern,other)).toBe(true);
  expect(castsLocalShadow({...lantern,carried:false},owner)).toBe(true);
  expect(selectShadowLights([lantern],[owner],[])).toEqual([]);
  expect(selectShadowLights([lantern],[owner,other],[])).toEqual([lantern]);
 });
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
