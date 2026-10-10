import {simplifyShadowIndices} from './shadowMeshSimplifier';
// The client tsconfig uses DOM types; this entry is executed only in a Worker.
const workerScope=self as unknown as {onmessage:(event:MessageEvent<{id:number;indices:Uint32Array;positions:Float32Array;deforming:boolean}>)=>void;postMessage:(message:unknown,transfer:Transferable[])=>void};
workerScope.onmessage=async(event)=>{
  const {id,indices,positions,deforming}=event.data;
  try{const result=await simplifyShadowIndices(indices,positions,deforming);workerScope.postMessage({id,indices:result},[result.buffer as ArrayBuffer]);}
  catch{workerScope.postMessage({id,indices},[indices.buffer as ArrayBuffer]);}
};
