import type {StateSnapshot,TokenKind} from './types.js';
export type LiveTargetRef={id?:string;kind?:TokenKind;refId?:string};
/** Resolve only through the recipient's fog-filtered snapshot. */
export function liveRollTarget(view:Pick<StateSnapshot,'tokens'|'characters'|'monsters'>,refs:LiveTargetRef[]):string|undefined {
 if(!refs.length)return undefined;
 return [...new Set(refs.map(ref=>{
  const token=view.tokens.find(t=>ref.id?t.id===ref.id:t.kind===ref.kind&&t.refId===ref.refId);
  if(!token)return 'Hidden target';
  const entity=(token.kind==='pc'?view.characters:view.monsters).find(e=>e.id===token.refId);
  if(!entity)return 'Hidden target';
  return entity.name+(token.kind==='monster'&&token.revealTag&&token.revealTag!=='U'?` ${token.revealTag}`:'');
 }))].join(', ');
}
