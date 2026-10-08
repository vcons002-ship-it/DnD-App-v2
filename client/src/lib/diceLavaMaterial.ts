/** Shared molten surface for the falling release and the persistent pool. */
export const lavaNoise=`
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
 return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){return noise(p)*.57+noise(p*2.03)*.28+noise(p*4.07)*.15;}
`;
export const lavaSurface=`
vec3 moltenSurface(vec2 p,float clock,float seed,float cooling,out float flow){
 vec2 drift=vec2(clock*.055,-clock*.035);
 vec2 warp=vec2(fbm(p*3.+drift+seed),fbm(p*3.-drift+seed+13.))-.5;
 vec2 q=p*5.+warp*1.15+drift;
 vec2 cell=floor(q),f=fract(q);float nearest=8.,second=8.;
 for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){
  vec2 g=vec2(float(x),float(y)),o=vec2(hash(cell+g+seed),hash(cell+g+seed+41.));
  vec2 d=g+o-f;float r=dot(d,d);
  if(r<nearest){second=nearest;nearest=r;}else second=min(second,r);
 }
 float seam=1.-smoothstep(.025,.19,second-nearest);
 flow=fbm(p*6.+warp*2.+drift*1.7+seed);
 float plate=smoothstep(.47,.64,flow)*(1.-seam);
 float hot=clamp(.30+flow*.70+seam*.30,0.,1.);
 vec3 lava=mix(vec3(.85,.015,.0008),vec3(3.8,.78,.035),hot);
 lava*=.93+.07*sin(clock*1.8+flow*8.);
 vec3 crust=vec3(.008,.004,.003)+vec3(.035,.012,.004)*flow;
 return mix(lava,crust,plate*cooling);
}
`;
