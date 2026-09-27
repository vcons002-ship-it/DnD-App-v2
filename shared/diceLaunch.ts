import {Vec3} from 'cannon-es';

/** Initial hand/cup tumble in radians per second. Contacts take over at release. */
export function handTumble(velocity:Vec3,random:()=>number):Vec3 {
  const heading=new Vec3(velocity.x,velocity.y,0);heading.normalize();
  const overhand=new Vec3(-heading.y,heading.x,0);
  const tumble=22+random()*8;
  const twist=(random()<.5?-1:1)*(7+random()*6);
  const spin=overhand.scale(tumble).vadd(heading.scale(twist));
  spin.z=(random()-.5)*16;
  return spin;
}
