import {FIREBALL_FLIGHT_MS,METEOR_FLIGHT_MS} from '../../../shared/spellImpact.js';
import type {HpFxEvent} from '../../../shared/types.js';

/** Cosmetic air displacement. Never affects visibility, targeting or damage. */
export type SpellMistImpulse={id:string|number;shape:'radial'|'cone'|'line'|'cube';x:number;y:number;dx:number;dy:number;size:number;width:number;born:number;duration:number;energy:number;height:number};
export const MAX_SPELL_MIST_IMPULSES=8;
export const spellMistEnabled=(quality:string|undefined,mist:boolean,interaction:boolean,reduced:boolean)=>(quality==='high'||quality==='balanced')&&mist&&interaction&&!reduced;

export function spellMistImpulse(input:{id:string|number;x:number;y:number;diameter:number;event:HpFxEvent},kind:string,ppf:number,born:number):SpellMistImpulse|null{
 const area=input.event.areaPosition,source=input.event.sourcePosition;
 const directed=kind==='lightning-line'||kind==='flame-cone'||kind==='frost-cone'||kind==='thunder-cube';
 const radial=['fireball','meteor-area','shatter-area','flame-column','ice-storm','ice-splash','bolts','arrows','mist'].includes(kind);
 if(!directed&&!radial)return null;
 let x=area?.x??input.x,y=area?.y??input.y,dx=1,dy=0,size=(area?.radiusFt??(input.event.areaWidthFt?input.event.areaWidthFt/2:Math.max(2,input.diameter/ppf/2)))*ppf,width=size;
 const shape:SpellMistImpulse['shape']=kind==='lightning-line'?'line':kind.endsWith('-cone')?'cone':kind==='thunder-cube'?'cube':'radial';
 if(directed){
  if(!area?.end)return null;
  const length=Math.hypot(area.end.x-area.x,area.end.y-area.y);if(length<.001)return null;
  dx=(area.end.x-area.x)/length;dy=(area.end.y-area.y)/length;size=length;
  width=shape==='line'?Math.max(ppf,size*.012,area.radiusFt*ppf):size/2;
  // The field for a Self cube is stored at its drawing center. Push air from
  // the caster's near face, matching the actual spell rather than that center.
  if(shape==='cube'){x=source?.x??x-dx*size/2;y=source?.y??y-dy*size/2;}
 }
 const delay=kind==='fireball'?FIREBALL_FLIGHT_MS:kind==='meteor-area'?METEOR_FLIGHT_MS:0;
 const energy=shape==='line'?.55:kind==='ice-storm'?.8:kind==='mist'?.7:1.5;
 return {id:input.id,shape,x,y,dx,dy,size:Math.max(ppf,size),width:Math.max(ppf,width),born:born+delay/1000,duration:shape==='line'?3:5.5,energy,height:Math.max(size*1.2,ppf*12)};
}

type Field={width:number;height:number;mapWidth:number;mapHeight:number;data:Uint8Array;heights:Uint8Array;pushX:Float32Array;pushY:Float32Array;pushWeight:Float32Array};
const smooth=(a:number,b:number,x:number)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
const byte=(v:number)=>Math.max(0,Math.min(255,Math.round(v)));

/** Reuse the existing 15 Hz flow texture. No extra shader samples or draw pass.
 * Move the existing cloudy density, pile it at the advancing edge, then curl
 * it back. The field remains in map space when the camera moves. */
export function rasterSpellMist(impulses:readonly SpellMistImpulse[],seconds:number,f:Field):number{
 let samples=0;
 for(const s of impulses){
  const age=seconds-s.born;if(age<0||age>=s.duration)continue;
  const fade=1-smooth(1.5,s.duration,age),refill=smooth(.65,s.duration,age),advance=smooth(0,s.shape==='line'?.28:.75,age);
  const radial=s.shape==='radial',front=s.size*(.06+.94*advance),bankWidth=Math.max(s.size*.13,f.mapWidth/f.width*1.5);
  const cx=s.x+(radial?0:s.dx*s.size/2),cy=s.y+(radial?0:s.dy*s.size/2);
  const extentX=radial?s.size*1.35:Math.abs(s.dx)*s.size*.55+Math.abs(s.dy)*s.width*1.4;
  const extentY=radial?s.size*1.35:Math.abs(s.dy)*s.size*.55+Math.abs(s.dx)*s.width*1.4;
  const x0=Math.max(0,Math.floor((cx-extentX)/f.mapWidth*f.width)),x1=Math.min(f.width-1,Math.ceil((cx+extentX)/f.mapWidth*f.width));
  const y0=Math.max(0,Math.floor((cy-extentY)/f.mapHeight*f.height)),y1=Math.min(f.height-1,Math.ceil((cy+extentY)/f.mapHeight*f.height));
  const encodedHeight=Math.max(1,byte(s.height/Math.max(f.mapWidth,f.mapHeight)*255));
  // Spell pressure varies over feet, rather than the narrow body contact.
  // Sample it on 2x2 flow texels; the existing linear sampler softens the banks.
  // This leaves the full-resolution body wakes and ambient mist untouched.
  for(let gy=y0;gy<=y1;gy+=2)for(let gx=x0;gx<=x1;gx+=2){
   const x=(gx+1)/f.width*f.mapWidth,y=(gy+1)/f.height*f.mapHeight,px=x-s.x,py=y-s.y;
   const along=px*s.dx+py*s.dy,across=-px*s.dy+py*s.dx,d=Math.hypot(px,py);
   const half=s.shape==='cone'?Math.max(1,along*.5):s.width;
   if(radial?d>s.size*1.35:along<0||along>s.size*1.1||Math.abs(across)>half*1.4)continue;
   const u=px/Math.max(1,s.width),v=py/Math.max(1,s.width),a=2.7*u+1.9*v+age*1.4,b=-2.1*u+3.3*v-age*.9;
   const wave=Math.sin(a)*Math.cos(b),curlX=1.9*Math.cos(a)*Math.cos(b)-3.3*Math.sin(a)*Math.sin(b),curlY=-2.7*Math.cos(a)*Math.cos(b)-2.1*Math.sin(a)*Math.sin(b);
   let core=0,bank=0,vx=0,vy=0;
   if(radial){
    const edge=front+wave*s.size*.055;
    core=(1-smooth(edge*.65,edge,d))*(1-refill);
    bank=Math.exp(-Math.pow((d-edge)/bankWidth,2))*fade;
    const push=bank*s.size*.32*s.energy*(1-smooth(.55,2.8,age));
    vx=-px/Math.max(1,d)*push;vy=-py/Math.max(1,d)*push;
   }else{
    const lateral=1-smooth(half*.65,half*1.3,Math.abs(across)+wave*half*.08);
    const swept=(1-smooth(front-bankWidth*.4,front+bankWidth,along))*lateral;
    core=swept*(1-refill)*(s.shape==='line'?.65:1);
    bank=Math.exp(-Math.pow((along-front)/bankWidth,2))*lateral*fade;
    const side=Math.exp(-Math.pow((Math.abs(across)-half)/Math.max(1,half*.35),2))*swept*fade*.65;
    const push=bank*s.size*.20*s.energy*(1-smooth(.6,2.5,age)),split=side*half*.9*s.energy;
    vx=-s.dx*push+s.dy*Math.sign(across)*split;vy=-s.dy*push-s.dx*Math.sign(across)*split;bank=Math.max(bank,side);
   }
   const recovery=smooth(.15,1.2,age)*fade*(core+bank*.5),curl=Math.min(s.size*.045,s.width*.3)*s.energy*recovery;
   vx+=curlX*curl;vy+=curlY*curl;
   const weight=Math.hypot(vx,vy),clear=byte(255*(1-core*.92)),rim=byte(bank*.8*255),touched=core>.001||bank>.001||weight>.001;samples++;
   for(let oy=0;oy<2&&gy+oy<f.height;oy++)for(let ox=0;ox<2&&gx+ox<f.width;ox++){
    const p=(gy+oy)*f.width+gx+ox,i=p*4;
    f.data[i+2]=Math.min(f.data[i+2],clear);f.data[i+3]=Math.max(f.data[i+3],rim);
    if(weight>f.pushWeight[p]){f.pushWeight[p]=weight;f.pushX[p]=vx;f.pushY[p]=vy;}
    if(touched)f.heights[p]=Math.max(f.heights[p],encodedHeight);
   }
  }
 }
 return samples;
}
