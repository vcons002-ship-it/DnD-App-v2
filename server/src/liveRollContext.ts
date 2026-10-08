// Only populated during a synchronous, rollback-safe command pass.
import type {RollReveal,HiddenRollResult} from '../../shared/types.js';
let calculationPresenter:((key:string,reveal:RollReveal)=>boolean)|undefined;
export function withLiveCalculationPresenter<T>(present:(key:string,reveal:RollReveal)=>boolean,run:()=>T):T {
 const previous=calculationPresenter;calculationPresenter=present;
 try{return run();}finally{calculationPresenter=previous;}
}
/** Suspend only the presentation; the surrounding command still commits once. */
export function presentLiveCalculation(key:string,reveal:RollReveal){
 if(!active||!calculationPresenter)return false;
 return calculationPresenter(key,reveal);
}
export type RollFacing={sessionId:string;attackerTokenId:string;targetTokenId:string};
let facing:RollFacing[]=[];
export const stagedRollFacing=()=>facing.slice();
export function noteRollFacing(value:RollFacing){if(active)facing.push(value);}
let active=false;
let manualResults=false;
export const isManualRollResult=()=>active&&manualResults;
let effects:(()=>void)[]|null=null;
let resultReveal=false;
let reviewResults:HiddenRollResult[]=[];
export const stagedRollResults=()=>reviewResults.slice();
export function noteRollResult(result:HiddenRollResult){if(active)reviewResults.push(result);}
/** A final snapshot may render the last throw; earlier throws cannot use it. */
export function noteLiveRollReveal(reveal:RollReveal|undefined){
 if(active&&reveal&&!reveal.presentedLive)resultReveal=true;
}
export function resetLiveRollReveal(){if(active)resultReveal=false;}
export const hasLiveRollReveal=()=>resultReveal;
export const isLiveCommand=()=>active;
export function stageRollEffects<T>(run:()=>T,manual=false){
 active=true;manualResults=manual;effects=[];facing=[];resultReveal=false;reviewResults=[];
 try {const value=run();return {value,effects};}
 finally {active=false;manualResults=false;effects=null;facing=[];resultReveal=false;reviewResults=[];}
}
export function afterRollCommit(effect:()=>void){if(effects)effects.push(effect);else effect();}
