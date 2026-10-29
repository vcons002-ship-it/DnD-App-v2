/** Touch/compact maps need a deliberate request before a panel covers the board. */
export function explicitTokenInspection(){
 return window.innerWidth<1000||window.matchMedia('(pointer: coarse)').matches;
}
