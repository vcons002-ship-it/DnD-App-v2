/** Presentation metadata only; coordinates remain authoritative in SQLite. */
const teleports=new Map<string,number>();
export function markTeleport(id:string){teleports.set(id,Math.max(Date.now(),(teleports.get(id)??0)+1));}
export function teleportTime(id:string):number|undefined{
  const at=teleports.get(id);
  if(at!==undefined&&Date.now()-at>30000){teleports.delete(id);return;}
  return at;
}
export function clearTeleport(id:string){teleports.delete(id);}
