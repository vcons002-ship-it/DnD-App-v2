import type {SheetAbility} from './types.js';

export type SpellArea={kind:'sphere'|'cylinder'|'emanation'|'cube'|'cone'|'line';sizeFt:number;widthFt?:number;rangeFt:number;self?:boolean;excludeCaster?:boolean;count?:number;selective?:boolean;maxTargets?:number;ongoing?:boolean;initialEffect?:boolean};
export type SpellAreaPlacement={mapId:string;points:{x:number;y:number}[];angle:number;excluded?:string[];selected?:string[]};
type Point={x:number;y:number};
const area=(kind:SpellArea['kind'],sizeFt:number,rangeFt:number,extra:Partial<SpellArea>={}):SpellArea=>({kind,sizeFt,rangeFt,...extra});
/** Reviewed ground footprints. Height and recurring triggers remain spell rules,
 * not an assumption that every round inside a drawn area deals damage. */
const catalog:Record<string,SpellArea>={
 'alarm':area('cube',20,30,{ongoing:true}),'silent image':area('cube',15,60,{ongoing:true}),
 'antilife shell':area('emanation',10,0,{self:true,ongoing:true}),'antimagic field':area('emanation',10,0,{self:true,ongoing:true}),
 'conjure animals':area('cube',30,60,{ongoing:true}),'conjure minor elementals':area('emanation',15,0,{self:true,ongoing:true}),
 'conjure celestial':area('cylinder',10,90,{ongoing:true}),
 'wall of force':area('line',100,120,{widthFt:1/48,ongoing:true}),
 'wall of stone':area('line',100,120,{widthFt:0.5,ongoing:true}),
 'guardian of faith':area('sphere',10,30,{ongoing:true}),'symbol':area('sphere',60,5,{ongoing:true}),
 'glyph of warding':area('sphere',20,5,{ongoing:true}),'globe of invulnerability':area('sphere',10,0,{self:true,ongoing:true}),
 'guards and wards':area('cube',50,5,{ongoing:true}),'forcecage':area('cube',20,100,{ongoing:true}),
 'daylight':area('sphere',60,60,{ongoing:true}),'magic circle':area('cylinder',10,10,{ongoing:true}),
 'major image':area('cube',20,120,{ongoing:true}),'plant growth':area('sphere',100,150,{ongoing:true}),
 'conjure woodland beings':area('emanation',10,0,{self:true,excludeCaster:true,ongoing:true}),
 'hallucinatory terrain':area('cube',150,300,{ongoing:true}),'hallow':area('sphere',60,5,{ongoing:true}),
 'move earth':area('cube',40,120,{ongoing:true}),'programmed illusion':area('cube',30,120,{ongoing:true}),
 'mirage arcane':area('cube',5280,4000000,{ongoing:true}),'control weather':area('sphere',26400,0,{self:true,ongoing:true}),
 'acid splash':area('sphere',5,60), 'arms of hadar':area('emanation',10,0,{self:true,excludeCaster:true}),
 'burning hands':area('cone',15,0,{self:true}),'color spray':area('cone',15,0,{self:true}),
 'entangle':area('cube',20,90),'faerie fire':area('cube',20,60),'fog cloud':area('sphere',20,120,{ongoing:true}),
 'grease':area('cube',10,60),'sleep':area('sphere',5,60),'thunderwave':area('cube',15,0,{self:true,excludeCaster:true}),
 'calm emotions':area('sphere',20,60,{selective:true}),'cloud of daggers':area('cube',5,60,{ongoing:true}),
 'darkness':area('sphere',15,60,{ongoing:true}),'flaming sphere':area('sphere',5,60,{ongoing:true}),
 'gust of wind':area('line',60,0,{self:true,widthFt:10,ongoing:true}),'moonbeam':area('cylinder',5,120,{ongoing:true}),
 'shatter':area('sphere',10,60),'silence':area('sphere',20,120,{ongoing:true}),'spike growth':area('sphere',20,150,{ongoing:true}),
 'web':area('cube',20,60,{ongoing:true}),'call lightning':area('sphere',5,120),
 'fear':area('cone',30,0,{self:true}),'fireball':area('sphere',20,150),'hunger of hadar':area('sphere',20,150,{ongoing:true}),
 'pass without trace':area('emanation',30,0,{self:true,selective:true}),
 'hypnotic pattern':area('cube',30,120),'lightning bolt':area('line',100,0,{self:true,widthFt:5}),
 'sleet storm':area('cylinder',20,150,{ongoing:true}),'slow':area('cube',40,120,{selective:true,maxTargets:6}),
 'spirit guardians':area('emanation',15,0,{self:true,excludeCaster:true,selective:true,ongoing:true}),
 'stinking cloud':area('sphere',20,90,{ongoing:true}),'wind wall':area('line',50,120,{widthFt:1}),
 'confusion':area('sphere',10,90),'control water':area('cube',100,300,{ongoing:true}),
 'ice storm':area('cylinder',20,300),'wall of fire':area('line',60,120,{widthFt:1,ongoing:true,initialEffect:true}),
 'cloudkill':area('sphere',20,120,{ongoing:true}),'cone of cold':area('cone',60,0,{self:true}),
 'flame strike':area('cylinder',10,60),'insect plague':area('sphere',20,300,{ongoing:true,initialEffect:true}),
 'mass cure wounds':area('sphere',30,60,{selective:true,maxTargets:6}),
 'blade barrier':area('line',100,90,{widthFt:5,ongoing:true,initialEffect:true}),'circle of death':area('sphere',60,150),
 'forbiddance':area('cube',200,5,{ongoing:true}),'sunbeam':area('line',60,0,{self:true,widthFt:5}),
 'wall of ice':area('line',100,120,{widthFt:1,ongoing:true,initialEffect:true}),'wall of thorns':area('line',60,120,{widthFt:5,ongoing:true,initialEffect:true}),
 'delayed blast fireball':area('sphere',20,150,{ongoing:true}),'fire storm':area('cube',10,150,{count:10}),
 'prismatic spray':area('cone',60,0,{self:true}),'reverse gravity':area('cylinder',50,100,{ongoing:true}),
 'earthquake':area('sphere',100,500,{ongoing:true}),'holy aura':area('emanation',30,0,{self:true,selective:true,ongoing:true}),
 'incendiary cloud':area('sphere',20,150,{ongoing:true,initialEffect:true}),'sunburst':area('sphere',60,150),'meteor swarm':area('sphere',40,5280,{count:4}),
 'prismatic wall':area('line',90,60,{widthFt:1,ongoing:true}),'storm of vengeance':area('cylinder',300,4000000,{ongoing:true}),
 'weird':area('sphere',30,120,{selective:true}),
};
export function spellAreaFor(a:Partial<SheetAbility>,castLevel?:number):SpellArea|undefined{
 if(a.type&&a.type!=='spell'&&!a.roll?.area)return;
 if(a.roll?.area){const s=a.roll.area;
  if(!['sphere','cylinder','emanation','cube','cone','line'].includes(s.kind)||!Number.isFinite(s.sizeFt)||s.sizeFt<=0||!Number.isFinite(s.rangeFt)||s.rangeFt<0||
    s.widthFt!==undefined&&(!Number.isFinite(s.widthFt)||s.widthFt<=0)||s.count!==undefined&&(!Number.isInteger(s.count)||s.count<1||s.count>40))return;
  return {...s};
 }
 const key=(a.name??'').trim().toLowerCase(),preset=catalog[key];
 if(key==='pass without trace'&&(a.source==='custom'||a.executionProfile==='manual'))return;
 if(preset){const result={...preset};
  if(key==='fog cloud')result.sizeFt+=20*Math.max(0,(castLevel??a.level??1)-1);
  if(key==='confusion')result.sizeFt+=5*Math.max(0,(castLevel??a.level??4)-4);
  return result;
 }
 // Authored spells may specify their footprint in the same printed form.
 if(!a.tags?.includes('aoe'))return;
 const text=`${a.meta??''} ${a.description??''}`.toLowerCase().replace(/foot|feet/g,'ft');
 const match=text.match(/(\d+)[ -]*ft[ -]*(?:radius[ -]*)?(sphere|cylinder|cone|cube|square|line|emanation)/);
 if(!match)return;
 const kind=match[2]==='square'?'cube':match[2] as SpellArea['kind'],self=/\bself\b/i.test(a.meta??'');
 const range=(a.meta??'').match(/·\s*(\d+)\s*ft/i);
 return area(kind,+match[1],self?0:range?+range[1]:60,{self,widthFt:kind==='line'?5:undefined});
}
/** Cubes with Self range have the caster on their near face, not at the center. */
export function areaOrigin(spec:SpellArea,p:SpellAreaPlacement,caster:Point,pxPerFoot:number,index=0):Point{
 if(spec.self){if(spec.kind==='cube')return {x:caster.x+Math.cos(p.angle)*spec.sizeFt*pxPerFoot/2,y:caster.y+Math.sin(p.angle)*spec.sizeFt*pxPerFoot/2};return caster;}
 return p.points[index];
}
export function pointInSpellArea(spec:SpellArea,p:SpellAreaPlacement,caster:Point,point:Point,pxPerFoot:number):boolean{
 return p.points.some((_,i)=>{
  const origin=areaOrigin(spec,p,caster,pxPerFoot,i),dx=(point.x-origin.x)/pxPerFoot,dy=(point.y-origin.y)/pxPerFoot;
  const along=dx*Math.cos(p.angle)+dy*Math.sin(p.angle),across=-dx*Math.sin(p.angle)+dy*Math.cos(p.angle),eps=1e-6;
  if(spec.kind==='cube')return Math.abs(along)<=spec.sizeFt/2+eps&&Math.abs(across)<=spec.sizeFt/2+eps;
  if(spec.kind==='cone')return along>eps&&along<=spec.sizeFt+eps&&Math.abs(across)<=along/2+eps;
  if(spec.kind==='line')return along>eps&&along<=spec.sizeFt+eps&&Math.abs(across)<=(spec.widthFt??5)/2+eps;
  return dx*dx+dy*dy<=(spec.sizeFt+eps)**2;
 });
}
export function areaPolygon(spec:SpellArea,origin:Point,angle:number,pxPerFoot:number):number[]{
 const len=spec.sizeFt*pxPerFoot,half=(spec.widthFt??5)*pxPerFoot/2;
 const local=spec.kind==='cube'?[[-len/2,-len/2],[len/2,-len/2],[len/2,len/2],[-len/2,len/2]]:
  spec.kind==='cone'?[[0,0],[len,-len/2],[len,len/2]]:[[0,-half],[len,-half],[len,half],[0,half]];
 return local.flatMap(([x,y])=>[origin.x+x*Math.cos(angle)-y*Math.sin(angle),origin.y+x*Math.sin(angle)+y*Math.cos(angle)]);
}
