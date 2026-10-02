import {Circle,Group,Line,Text} from 'react-konva';
import {areaOrigin,areaPolygon,type SpellArea,type SpellAreaPlacement} from '../../../shared/spellAreas';
export function SpellAreaShapes({spec,placement,caster,pxPerFoot,targets,onRemove,scale=1}:{spec:SpellArea;placement:SpellAreaPlacement;caster:{x:number;y:number};pxPerFoot:number;targets:{x:number;y:number;widthFt:number}[];onRemove?:()=>void;scale?:number}){
 const circular=['sphere','cylinder','emanation'].includes(spec.kind);
 return <Group listening={!!onRemove} onClick={onRemove} onTap={onRemove}>
   {placement.points.map((_,i)=>{const o=areaOrigin(spec,placement,caster,pxPerFoot,i),style={fill:'#ffe188',opacity:.24,stroke:'#ffd76a',strokeWidth:2/scale};
     return <Group key={i}>{circular?<Circle x={o.x} y={o.y} radius={spec.sizeFt*pxPerFoot} {...style}/>:<Line closed points={areaPolygon(spec,o,placement.angle,pxPerFoot)} {...style}/>}
       <Text x={o.x+6/scale} y={o.y-(circular?spec.sizeFt:spec.kind==='cube'?spec.sizeFt/2:0)*pxPerFoot-20/scale} text={`${spec.sizeFt} ft ${circular?'radius':spec.kind}${spec.count?` · ${i+1}`:''}`} fill="#ffe8a3" stroke="#15110b" strokeWidth={.5/scale} fontSize={14/scale}/>
     </Group>;
   })}
   {targets.map((t,i)=><Circle key={i} x={t.x} y={t.y} radius={t.widthFt*pxPerFoot/2} stroke="#fff5bf" strokeWidth={2/scale}/>)}
 </Group>;
}
