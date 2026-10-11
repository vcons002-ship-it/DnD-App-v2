import {groundYScale,perspectiveSlope,type BattlefieldView} from './miniatureProjection.js';

/** A circle under the battlefield's planar perspective is an ellipse. Solve
 * its conic directly instead of projecting 96 vertices for every light band.
 * Circles crossing the camera plane retain the existing clipped-path fallback. */
export function visionLightEllipse(view:BattlefieldView,tilt:number,rotation:number,width:number,height:number,
  x:number,y:number,radius:number) {
  return createVisionLightProjector(view,tilt,rotation,width,height)(x,y,radius);
}

/** All 48 bands of every light use the same camera coefficients. Prepare them
 * once per vision frame rather than repeating trigonometry for each band. */
export function createVisionLightProjector(view:BattlefieldView,tilt:number,rotation:number,width:number,height:number){
  const sy=groundYScale(tilt),k=perspectiveSlope(width,height,tilt),angle=rotation*Math.PI/180;
  const c=Math.cos(angle),s=Math.sin(angle),scale=view.scale;
  return (x:number,y:number,radius:number)=>{
  const dx=view.x+x*scale-width/2,dy=view.y+y*scale*sy-height/2;
  if(1-k*(s*sy*dx+c*dy)-Math.abs(k)*radius*scale*sy<.01)return;
  const u=(width/2-view.x)/scale-x,v=(height/2-view.y)/(scale*sy)-y;
  const a=c/scale,b=s/(scale*sy)+k*u,d=-s/scale,e=c/(scale*sy)+k*v;
  const A=a*a+d*d,B=a*b+d*e,C=b*b+e*e-radius*radius*k*k;
  const D=a*u+d*v,E=b*u+e*v-radius*radius*k,F=u*u+v*v-radius*radius;
  const det=A*C-B*B;
  if(!(det>0&&A>0&&C>0))return;
  const cx=(B*E-C*D)/det,cy=(B*D-A*E)/det;
  const inside=-(F+D*cx+E*cy),delta=Math.hypot(A-C,2*B);
  const hi=(A+C+delta)/2,lo=det/hi;
  const rx=Math.sqrt(inside/hi),ry=Math.sqrt(inside/lo);
  if(!Number.isFinite(rx+ry+cx+cy)||rx<=0||ry<=0)return;
  return {cx:cx+width/2,cy:cy+height/2,rx,ry,rotation:Math.atan2(2*B,A-C)*90/Math.PI};
  };
}
