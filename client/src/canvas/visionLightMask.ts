import {LIGHT_SPILL_MULTIPLIER} from '../../../shared/lightFalloff';
import {lightCoverage,type VisionLight} from '../../../shared/playerVision';
import type {createVisionLightProjector} from './visionLightEllipse';

const SVG='http://www.w3.org/2000/svg';
const element=<K extends keyof SVGElementTagNameMap>(tag:K)=>document.createElementNS(SVG,tag);
type Entry={clip:SVGClipPathElement;clipPath:SVGPathElement;geometry:string;profile:string;shapes:string[];alphas:string[];markup:string;occlusion:string};
type Projection={key:string;wallsKey:string;occluded:boolean;ellipse:ReturnType<typeof createVisionLightProjector>;
 circle:(light:VisionLight,radius:number)=>string;clip:(light:VisionLight)=>string};

/** Cache projected 48-band geometry and retain wall clips. Batch changed
 * attenuation markup into one DOM write, avoiding hundreds of attribute writes.
 * Ordinary and cosmetic masks are independent, so flashes never rebuild lamps. */
export function createVisionLightMask(group:SVGGElement,defs:SVGGElement,id:string){
 const entries=new Map<string,Entry>();let serial=0,created=0,geometryUpdates=0,lastMarkup='';
 return {sync(lights:readonly VisionLight[],projection:Projection){
  const live=new Set<string>(),markup:string[]=[];
  for(const light of lights){
   // A zero peak produces no attenuation anywhere. Avoid projection and wall
   // clipping for that source until it contributes, without discarding its cache.
   live.add(light.id);if(lightCoverage(0,light)===0)continue;
   let entry=entries.get(light.id);
   if(!entry){
    const clip=element('clipPath'),clipPath=element('path');
    clip.id=id+'-'+serial++;clip.setAttribute('clipPathUnits','userSpaceOnUse');clip.append(clipPath);defs.append(clip);
    entry={clip,clipPath,geometry:'',profile:'',shapes:[],alphas:[],markup:'',occlusion:''};entries.set(light.id,entry);created++;
   }
   let changed=false;
   const profile=[light.radius,light.height,light.strength,!!light.transient].join(':');
   if(entry.profile!==profile){
    let previous=0;entry.alphas=[];
    for(let i=48;i>=1;i--){
     const coverage=lightCoverage(light.radius*LIGHT_SPILL_MULTIPLIER*i/48-light.radius/64,light);
     const alpha=Math.max(0,(coverage-previous)/Math.max(.00001,1-previous));previous=coverage;
     entry.alphas.push(alpha>.0001?alpha.toFixed(4):'');
    }
    entry.profile=profile;changed=true;
   }
   const geometry=[projection.key,light.x,light.y,light.radius].join(':');
   if(entry.geometry!==geometry){entry.shapes=[];entry.geometry=geometry;geometryUpdates++;changed=true;}
   // Project only bands that actually paint. Bright centers and dark tails
   // frequently omit bands; leave their geometry lazy for later flicker frames.
   for(let index=0;index<48;index++)if(entry.alphas[index]&&!entry.shapes[index]){
    const radius=light.radius*LIGHT_SPILL_MULTIPLIER*(48-index)/48,ellipse=projection.ellipse(light.x,light.y,radius);
    entry.shapes[index]=ellipse?
     `<ellipse cx="${ellipse.cx.toFixed(2)}" cy="${ellipse.cy.toFixed(2)}" rx="${ellipse.rx.toFixed(2)}" ry="${ellipse.ry.toFixed(2)}" transform="rotate(${ellipse.rotation.toFixed(4)} ${ellipse.cx.toFixed(2)} ${ellipse.cy.toFixed(2)})"`:
     `<path d="${projection.circle(light,radius)}"`;
   }
   const occlusion=[projection.key,projection.wallsKey,projection.occluded,light.x,light.y].join(':');
   if(entry.occlusion!==occlusion){
    if(projection.occluded){const path=projection.clip(light);if(entry.clipPath.getAttribute('d')!==path)entry.clipPath.setAttribute('d',path);}
    entry.occlusion=occlusion;changed=true;
   }
   if(changed)entry.markup=`<g${projection.occluded?` clip-path="url(#${entry.clip.id})"`:''}>`+
    entry.alphas.map((alpha,i)=>alpha?`${entry!.shapes[i]} fill="black" fill-opacity="${entry!.alphas[i]}"/>`:'').join('')+'</g>';
   markup.push(entry.markup);
  }
  for(const [key,entry] of entries)if(!live.has(key)){entry.clip.remove();entries.delete(key);}
  const next=markup.join('');if(next!==lastMarkup){group.innerHTML=next;lastMarkup=next;}
 },get stats(){return {created,geometryUpdates,lights:entries.size};},dispose(){for(const entry of entries.values())entry.clip.remove();entries.clear();group.innerHTML='';lastMarkup='';}};
}
