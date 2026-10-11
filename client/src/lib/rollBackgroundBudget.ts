/** Presentation only: never changes model selection, visibility or physics. */
export function rollBackgroundBudget(basePixelRatio:number,reduced:boolean){
  return {pixelRatio:reduced?Math.min(1,basePixelRatio*.65):basePixelRatio,fps:reduced?12:60};
}
export function reduceRollBackground(state:{showRollAnim:boolean;liveDice:unknown;hiddenRollReview:unknown;
  rollFx:{impactReady?:boolean}|null;hpFx:readonly unknown[]}){
  return state.showRollAnim&&!state.hpFx.length&&!!(state.liveDice||state.hiddenRollReview||state.rollFx&&!state.rollFx.impactReady);
}
