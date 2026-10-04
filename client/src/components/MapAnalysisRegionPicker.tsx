import {useState,type PointerEvent} from 'react';
import {parseMapAnalysisRegions,MAX_MAP_ANALYSIS_REGIONS,type MapAnalysisRegion} from '../../../shared/mapAnalysisRegions';
export function MapAnalysisRegionPicker({image,regions,onChange}:{image:string;regions:MapAnalysisRegion[];onChange:(regions:MapAnalysisRegion[])=>void}){
 const [stroke,setStroke]=useState<MapAnalysisRegion|null>(null),[error,setError]=useState('');
 const point=(e:PointerEvent<SVGSVGElement>)=>{const r=e.currentTarget.getBoundingClientRect();return{x:Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),y:Math.max(0,Math.min(1,(e.clientY-r.top)/r.height))};};
 const finish=(e:PointerEvent<SVGSVGElement>)=>{
  if(!stroke)return;const p=point(e),r={ax:Math.min(stroke.ax,p.x),ay:Math.min(stroke.ay,p.y),bx:Math.max(stroke.ax,p.x),by:Math.max(stroke.ay,p.y)};setStroke(null);
  if(r.bx-r.ax<.01||r.by-r.ay<.01){setError('Drag a larger rectangle around the area to analyze.');return;}
  try{parseMapAnalysisRegions([...regions,r]);onChange([...regions,r]);setError('');}catch(error){setError(error instanceof Error?error.message:'Invalid region.');}
 };
 return <div><p>Drag rectangles around the areas to analyze. Include complete features and their adjoining walls. Up to {MAX_MAP_ANALYSIS_REGIONS} separate regions.</p>
  <div style={{position:'relative',maxWidth:1100,margin:'auto'}}>
   <img src={image} alt="Map for region selection" style={{display:'block',width:'100%',height:'auto'}} draggable={false}/>
   <svg data-testid="map-analysis-region-picker" aria-label="Draw analysis regions" viewBox="0 0 1 1" preserveAspectRatio="none" style={{position:'absolute',inset:0,width:'100%',height:'100%',cursor:'crosshair',touchAction:'none'}}
    onPointerDown={e=>{if(e.button!==0)return;const p=point(e);e.currentTarget.setPointerCapture(e.pointerId);setStroke({ax:p.x,ay:p.y,bx:p.x,by:p.y});}}
    onPointerMove={e=>{if(stroke){const p=point(e);setStroke({...stroke,bx:p.x,by:p.y});}}} onPointerUp={finish} onPointerCancel={()=>setStroke(null)}>
    {regions.map((r,i)=><g key={i}><rect data-testid="map-analysis-region" x={r.ax} y={r.ay} width={r.bx-r.ax} height={r.by-r.ay} fill="#ffe068" fillOpacity={.2} stroke="#ffe068" strokeWidth={.003}/><text x={r.ax+.01} y={r.ay+.03} fill="white" stroke="black" strokeWidth={.0015} paintOrder="stroke" fontSize={.025}>Region {i+1}</text></g>)}
    {stroke&&<rect x={Math.min(stroke.ax,stroke.bx)} y={Math.min(stroke.ay,stroke.by)} width={Math.abs(stroke.bx-stroke.ax)} height={Math.abs(stroke.by-stroke.ay)} fill="#69dfff" fillOpacity={.2} stroke="#69dfff" strokeWidth={.003}/>}
   </svg>
  </div>
  {error&&<p role="alert" style={{color:'#ffd39a'}}>{error}</p>}
  <div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:12}}>{regions.map((_,i)=><button key={i} className="btn tiny" onClick={()=>onChange(regions.filter((_,n)=>n!==i))}>Remove region {i+1}</button>)}{regions.length>0&&<button className="btn tiny" onClick={()=>onChange([])}>Clear regions</button>}</div>
 </div>;
}
