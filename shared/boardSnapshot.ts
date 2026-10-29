import type {StateSnapshot} from './types.js';
/** Feed entries have independently subscribed UI; they do not invalidate board pixels. */
export function sameBoardSnapshot(a:StateSnapshot,b:StateSnapshot){
 return a===b||[...new Set([...Object.keys(a),...Object.keys(b)])].every(key=>key==='chat'||key==='rollLog'||a[key as keyof StateSnapshot]===b[key as keyof StateSnapshot]);
}
