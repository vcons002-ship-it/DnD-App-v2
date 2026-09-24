/** Circular token-base placement, independent of camera and per-player view. */
export type BaseCircle = { x: number; y: number; radius: number };
export const MAX_BASE_OVERLAP = .4;

/** Fraction of the smaller circle covered by the intersection. */
export function baseOverlap(a: number, b: number, distance: number): number {
  if (a <= 0 || b <= 0 || distance >= a + b) return 0;
  if (distance <= Math.abs(a - b)) return 1;
  const d2 = distance * distance;
  const clamp = (x: number) => Math.max(-1, Math.min(1, x));
  const area = a*a*Math.acos(clamp((d2+a*a-b*b)/(2*distance*a)))
    + b*b*Math.acos(clamp((d2+b*b-a*a)/(2*distance*b)))
    - .5*Math.sqrt(Math.max(0, (-distance+a+b)*(distance+a-b)*(distance-a+b)*(distance+a+b)));
  return area / (Math.PI * Math.min(a,b)**2);
}

export function baseSeparation(a: number, b: number): number {
  let lo = Math.abs(a-b), hi = a+b;
  for (let i=0; i<45; i++) {
    const mid = (lo+hi)/2;
    if (baseOverlap(a,b,mid) > MAX_BASE_OVERLAP) lo=mid; else hi=mid;
  }
  return hi;
}

/** Nearest point outside the union of forbidden center-distance circles.
 * The nearest valid point is either a radial projection or a circle intersection.
 * Unlike repeated push-outs this cannot oscillate between tightly packed tokens.
 */
export function placeBase(moving: BaseCircle, others: BaseCircle[], previous = moving): {x:number;y:number} {
  const zones = others.filter(o=>o.radius>0).map(o=>({ ...o, radius:baseSeparation(moving.radius,o.radius)+1e-5 }));
  const valid = (p: {x:number;y:number}) => zones.every(z=>Math.hypot(p.x-z.x,p.y-z.y)>=z.radius-1e-7);
  if (moving.radius<=0 || valid(moving)) return {x:moving.x,y:moving.y};
  let best: {x:number;y:number}|undefined, bestDistance=Infinity;
  const consider = (p: {x:number;y:number}) => {
    const distance=(p.x-moving.x)**2+(p.y-moving.y)**2;
    if(distance<bestDistance && valid(p)) {best=p;bestDistance=distance;}
  };
  for (let i=0;i<zones.length;i++) {
    const a=zones[i];
    let dx=moving.x-a.x,dy=moving.y-a.y;
    if(Math.hypot(dx,dy)<1e-9) {dx=previous.x-a.x;dy=previous.y-a.y;}
    const length=Math.hypot(dx,dy);
    consider({x:a.x+a.radius*(length?dx/length:1),y:a.y+a.radius*(length?dy/length:0)});
    for(let j=0;j<i;j++) {
      const b=zones[j],dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy);
      if(d<1e-9 || d>a.radius+b.radius || d<Math.abs(a.radius-b.radius)) continue;
      const along=(a.radius*a.radius-b.radius*b.radius+d*d)/(2*d);
      const height=Math.sqrt(Math.max(0,a.radius*a.radius-along*along));
      const x=a.x+along*dx/d,y=a.y+along*dy/d;
      consider({x:x-height*dy/d,y:y+height*dx/d});
      consider({x:x+height*dy/d,y:y-height*dx/d});
    }
  }
  // A finite union always has an exterior. Numerical fallback stays outside all zones.
  return best ?? {x:Math.max(...zones.map(z=>z.x+z.radius))+1,y:moving.y};
}
