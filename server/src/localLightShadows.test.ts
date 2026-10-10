import {describe,it,expect} from 'vitest';
import {selectShadowLights,castsLocalShadow,compactShadowHeightScale,environmentalShadowSlope,LOCAL_SHADOW_SOURCES} from '../../shared/localLightShadows.js';
const light=(id:string,x:number,y=100)=>({id,x,y,height:50,radius:200,strength:1});
describe('local shadow light selection',()=>{
 it('fits the entire projected silhouette without a distance cutoff, including low lanterns',()=>{
  for(const lightHeight of [20,60,160]){
   const distance=100,height=120,radius=40,diameter=50;
   const scale=compactShadowHeightScale(lightHeight,distance,height,radius,diameter);
   const top=height*scale;
   expect(top).toBeLessThan(lightHeight);
   expect((distance+radius)*top/(lightHeight-top)).toBeCloseTo(diameter*2.8,5);
  }
  expect(compactShadowHeightScale(1000,10,50,10,50)).toBe(1);
 });
 it('directs the environmental silhouette away from each light without changing its length',()=>{
  const caster={x:100,y:100};
  expect(environmentalShadowSlope({x:0,y:100},caster,1.3)).toEqual({x:1.3,y:0});
  expect(environmentalShadowSlope({x:200,y:100},caster,1.3)).toEqual({x:-1.3,y:0});
  expect(environmentalShadowSlope({x:100,y:0},caster,1.3)).toEqual({x:0,y:1.3});
  const diagonal=environmentalShadowSlope({x:0,y:0},caster,1.3);
  expect(Math.hypot(diagonal.x,diagonal.y)).toBeCloseTo(1.3);
  expect(environmentalShadowSlope(caster,caster,1.3)).toEqual({x:0,y:0});
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
 it('keeps the same shadow sources when similarly strong torches flicker',()=>{
  const lights=Array.from({length:6},(_,i)=>({...light(String(i),100),nominalRadius:200,nominalStrength:1}));
  const casters=[{x:120,y:100,visible:true}];
  const expected=selectShadowLights(lights,casters,[]).map(l=>l.id);
  for(let phase=0;phase<30;phase++){
   const flickering=lights.map((l,i)=>({...l,strength:1+Math.sin(phase+i)*.24,radius:200*(1+Math.sin(phase+i)*.0672)}));
   expect(selectShadowLights(flickering,casters,[]).map(l=>l.id)).toEqual(expected);
  }
 });
 it('budgets by contribution at creatures rather than source creation order',()=>{
  const lights=Array.from({length:9},(_,i)=>light(String(i),20+i*20));
  const chosen=selectShadowLights(lights,[{x:180,y:100,visible:true}],[]);
  expect(chosen).toHaveLength(LOCAL_SHADOW_SOURCES);
  expect(chosen.map(l=>l.id)).toEqual(['8','7','6','5']);
  expect(selectShadowLights(lights,[{x:20,y:100,visible:true}],[])[0].id).toBe('0');
 });
});
