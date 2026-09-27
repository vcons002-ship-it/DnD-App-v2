// Only populated during a synchronous, rollback-safe command pass.
export type RollFacing={sessionId:string;attackerTokenId:string;targetTokenId:string};
let facing:RollFacing[]=[];
export const stagedRollFacing=()=>facing.slice();
export function noteRollFacing(value:RollFacing){if(active)facing.push(value);}
let active=false;
let effects:(()=>void)[]|null=null;
export const isLiveCommand=()=>active;
export function stageRollEffects<T>(run:()=>T){
 active=true;effects=[];facing=[];
 try {const value=run();return {value,effects};}
 finally {active=false;effects=null;facing=[];}
}
export function afterRollCommit(effect:()=>void){if(effects)effects.push(effect);else effect();}
