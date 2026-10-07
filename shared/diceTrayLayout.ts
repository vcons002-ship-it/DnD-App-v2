/** One 17.6 mm d6 reference at every pool size; only the tray footprint grows. */
export const REFERENCE_D6_EDGE=.0176;
export const FIXED_DICE_RADIUS=1.1;
export function diceTrayLayoutForPool(count:number){
  const n=Math.max(1,count);
  const cols=Math.max(1,Math.ceil(Math.sqrt(n*1.5))),rows=Math.max(1,Math.ceil(n/cols));
  const packed=Math.min(1.5,1.8/Math.pow(n,.25),5.6/cols,3.2/rows)*Math.min(1,Math.sqrt(12/n));
  // About 22% more tray width per die through ten dice; blend back to the
  // existing large-pool layout by twenty physical dice.
  const blend=Math.min(1,Math.max(0,(n-10)/10));
  const projectedRadius=packed*(.82+.18*blend*blend*(3-2*blend));
  // Tray growth is independent of die size, so larger dice stay visibly larger.
  const scale=Math.max(1,1/projectedRadius);
  return {radius:FIXED_DICE_RADIUS,scale,halfWidth:7.2*scale,halfHeight:4.7*scale,innerHalfWidth:7*scale,innerHalfHeight:4.5*scale};
}

/** Slightly larger tapered/triangular dice; shared by contacts and rendering. */
export const diePhysicalScale=(sides:number)=>sides===10||sides===20?1.12:1;
