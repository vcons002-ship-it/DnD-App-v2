/** Pointer bursts paint their latest state once per frame. Release can flush
 * synchronously so the next hit test sees the final camera position. */
export function createLatestFrame<T>(paint:(value:T)=>void,request:(run:()=>void)=>number,cancel:(id:number)=>void){
 let frame=0,pending:{value:T}|undefined;
 const flush=()=>{
  if(frame)cancel(frame);frame=0;
  const next=pending;pending=undefined;if(next)paint(next.value);
 };
 return {
  push(value:T){pending={value};if(!frame)frame=request(flush);},
  flush,
  cancel(){if(frame)cancel(frame);frame=0;pending=undefined;},
 };
}
