/** Physical dice keep their real size; this ratio gives small pools a roomier tray. */
export function diceRadiusForPool(count:number){
  const n=Math.max(1,count);
  const cols=Math.max(1,Math.ceil(Math.sqrt(n*1.5))),rows=Math.max(1,Math.ceil(n/cols));
  const packed=Math.min(1.5,1.8/Math.pow(n,.25),5.6/cols,3.2/rows)*Math.min(1,Math.sqrt(12/n));
  // About 22% more tray width per die through ten dice; blend back to the
  // existing large-pool layout by twenty physical dice.
  const blend=Math.min(1,Math.max(0,(n-10)/10));
  return packed*(.82+.18*blend*blend*(3-2*blend));
}
