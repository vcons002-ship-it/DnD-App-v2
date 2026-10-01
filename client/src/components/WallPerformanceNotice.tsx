import {useMemo} from 'react';
import {wallPerformanceWarning,type MapWall} from '../../../shared/mapWalls';

/** Inform the DM without interrupting authoring or changing the selected walls. */
export function WallPerformanceNotice({walls}:{walls:readonly MapWall[]}){
 const warning=useMemo(()=>wallPerformanceWarning(walls),[walls]);
 return warning?<p role="status" data-testid="wall-performance-warning" style={{margin:'6px 0',color:'#ffd39a',fontSize:12}}>{warning}</p>:null;
}
