import {Circle,Group,Line,Text} from 'react-konva';
import {areaOrigin,areaPolygon,type SpellArea,type SpellAreaPlacement} from '../../../shared/spellAreas';
export function SpellAreaShapes({spec,placement,caster,pxPerFoot,targets,onRemove,scale=1,spellName,raised=false}:{raised?:boolean;spellName?:string;spec:SpellArea;placement:SpellAreaPlacement;caster:{x:number;y:number};pxPerFoot:number;targets:{x:number;y:number;widthFt:number}[];onRemove?:()=>void;scale?:number}){
 const circular=['sphere','cylinder','emanation'].includes(spec.kind),spikes=spellName==='Spike Growth';
 return <Group listening={!!onRemove} onClick={onRemove} onTap={onRemove}>
   {placement.points.map((_,i)=>{const o=areaOrigin(spec,placement,caster,pxPerFoot,i),style={fill:spikes?'#476139':'#ffe188',opacity:spikes?(raised?.055:.16):.24,stroke:spikes?'#99c079':'#ffd76a',strokeWidth:2/scale};
     return <Group key={i}>{circular?<Circle x={o.x} y={o.y} radius={spec.sizeFt*pxPerFoot} {...style}/>:<Line closed points={areaPolygon(spec,o,placement.angle,pxPerFoot)} {...style}/>}
       {spikes&&!raised&&Array.from({length:90},(_,j)=>{const angle=j*2.399963,r=Math.sqrt((j+.5)/90)*spec.sizeFt*pxPerFoot*.97,x=o.x+Math.cos(angle)*r,y=o.y+Math.sin(angle)*r,s=Math.min(6,pxPerFoot*.5);return <Line key={j} points={[x-s,y+s,x,y-s,x+s*.45,y+s*.4,x+s,y-s*.5]} stroke="#a0be79" opacity={.5} strokeWidth={1.1/scale}/>;})}
       <Text x={o.x+6/scale} y={o.y-(circular?spec.sizeFt:spec.kind==='cube'?spec.sizeFt/2:0)*pxPerFoot-20/scale} text={`${spec.sizeFt} ft ${circular?'radius':spec.kind}${spec.count?` · ${i+1}`:''}`} fill="#ffe8a3" stroke="#15110b" strokeWidth={.5/scale} fontSize={14/scale}/>
     </Group>;
   })}
   {targets.map((t,i)=><Circle key={i} x={t.x} y={t.y} radius={t.widthFt*pxPerFoot/2} stroke="#fff5bf" strokeWidth={2/scale}/>)}
 </Group>;
}
