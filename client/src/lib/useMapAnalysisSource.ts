import {useEffect,useState} from 'react';
import type {MapState} from '../../../shared/types';
import type {MapGeometryDraft} from '../../../shared/mapGeometryDraft';
import {useStore} from '../state/socket';
import {apiFetch} from './api';

/** Region selection and review show the same assembled raster the AI receives. */
export function useMapAnalysisSource(map:MapState) {
 const tiles=useStore(s=>JSON.stringify(s.snapshot?.map?.id===map.id?s.snapshot.mapImages:[]));
 const [state,setState]=useState<{imagePath?:string;source?:MapGeometryDraft['source'];loading:boolean;error?:string}>({loading:true});
 useEffect(()=>{
  let cancelled=false;setState({loading:true});
  void apiFetch(`/api/maps/${map.id}/analysis-source`).then(async response=>{
   const data=await response.json();if(!response.ok)throw Error(data.error??'Could not prepare map tiles.');
   if(!cancelled)setState({...data,loading:false});
  }).catch(error=>{if(!cancelled)setState({loading:false,error:error instanceof Error?error.message:'Could not prepare map tiles.'});});
  return()=>{cancelled=true;};
 },[map.id,map.imagePath,tiles]);
 return {...state,imagePath:state.imagePath??map.imagePath};
}
