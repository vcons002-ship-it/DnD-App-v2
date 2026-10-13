type Options = {title:string;message:string;acceptLabel?:string;danger?:boolean;initialValue?:string};
export type AppPrompt = Options & {id:number;kind:'confirm'|'notice'|'text';resolve:(value:boolean|string|null)=>void};
const pending:AppPrompt[]=[];
const listeners=new Set<()=>void>();
let nextId=0;
const publish=()=>listeners.forEach(listener=>listener());
export const subscribePrompts=(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};};
export const currentPrompt=()=>pending[0]??null;
function request(kind:AppPrompt['kind'],options:Options):Promise<boolean|string|null>{
  // Repeated clicks while the same action is pending must not execute it twice.
  if(pending.some(p=>p.kind===kind&&p.title===options.title&&p.message===options.message))return Promise.resolve(null);
  return new Promise(resolve=>{pending.push({...options,id:++nextId,kind,resolve});publish();});
}
export const confirmAction=async(options:Options)=>await request('confirm',options)===true;
export const showNotice=async(options:Options)=>{await request('notice',options);};
export const requestText=async(options:Options)=>{
  const value=await request('text',options);return typeof value==='string'?value:null;
};
export function finishPrompt(id:number,value:boolean|string|null){
  const index=pending.findIndex(p=>p.id===id);if(index<0)return;
  const [prompt]=pending.splice(index,1);prompt.resolve(value);publish();
}
export function dismissPrompts(){const prompts=pending.splice(0);prompts.forEach(p=>p.resolve(null));publish();}
