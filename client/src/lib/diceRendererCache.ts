/** A bounded pool of GPU scenes. Borrowed scenes cannot be reused or destroyed
 * while an asynchronous preparation still owns them. */
export function createDiceRendererCache<T extends {dispose():void}>(maxEntries=8,maxCost=32){
 type Entry={key:string;cost:number;value:T;busy:boolean;retired:boolean};
 const entries:Entry[]=[];
 const remove=(entry:Entry)=>{const i=entries.indexOf(entry);if(i>=0)entries.splice(i,1);entry.value.dispose();};
 const trim=()=>{
  while(entries.length>maxEntries||entries.reduce((n,e)=>n+e.cost,0)>maxCost){
   const oldest=entries.find(e=>!e.busy);if(!oldest)break;remove(oldest);
  }
 };
 return {
  acquire(key:string,cost:number,create:()=>T){
   let entry=entries.find(e=>e.key===key&&!e.busy&&!e.retired);
   const reused=!!entry;
   if(entry)entries.splice(entries.indexOf(entry),1);
   else entry={key,cost,value:create(),busy:false,retired:cost>maxCost};
   entry.busy=true;if(!entry.retired){entries.push(entry);trim();}
   let released=false;
   return {value:entry.value,reused,release(){
    if(released)return;released=true;entry!.busy=false;
    if(entry!.retired)remove(entry!);else trim();
   }};
  },
  clear(){for(const entry of [...entries]){entry.retired=true;if(!entry.busy)remove(entry);}},
 };
}
