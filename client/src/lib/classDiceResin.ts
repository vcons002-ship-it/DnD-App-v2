/** Class-specific fields integrated inside the existing physical transmission
 * pass. Die-local sampling gives real parallax beneath the refracting shell. */
export const classResinDeclarations=/*glsl*/`
uniform float resinClass;
uniform vec3 resinClassEnergy;
uniform vec3 resinClassDark;
uniform vec3 resinClassLight;
uniform float resinClassDensity;
uniform float resinClassRoom;
uniform float resinClassPhase;
uniform float resinPower;
uniform float resinMaximum;
uniform float resinReducedMotion;
float classResinFbm(vec3 p){return resinNoise(p)*.63+resinNoise(p*2.03)*.26+resinNoise(p*4.07)*.11;}
void classResinField(vec3 point,out float density,out vec3 pigment,out vec3 light){
 float t=resinReducedMotion>.5?13.:resinTime*.38;
 t+=resinClassPhase;
 vec3 q=point/max(.2,resinClassRoom);
 vec3 curl=vec3(sin(q.y*2.+t*.65),cos(q.z*2.3-t*.47),sin(q.x*2.1+t*.53))*.32;
 vec3 domain=q*2.15+curl+vec3(t*.13,-t*.17,-t*.11);
 float cloud=classResinFbm(domain),envelope=exp(-dot(q,q)*.95);
 float strength=clamp(resinPower,0.,1.),charge=.17+pow(strength,1.65)*.83;
 density=smoothstep(.38,.70,cloud)*envelope*resinClassDensity;
 pigment=mix(resinClassDark,resinClassLight,.08+cloud*.14);
 vec3 core=q-vec3(sin(t*.8)*.28,cos(t*.63)*.22,sin(t*.49)*.25);
 float coreGlow=exp(-dot(core,core)*7.);
 light=resinClassEnergy*coreGlow*(.75+charge*2.4);
 if(resinClass==1.){
  // Ember clusters rise through burgundy resin; no painted surface fissures.
  vec3 heat=q*3.7+curl*.6-vec3(0.,0.,t*.75);
  float ember=pow(resinNoise(heat),14.)*10.;
  float plume=smoothstep(.46,.72,classResinFbm(heat*.65))*envelope;
  light=(mix(resinClassEnergy,vec3(1.,.65,.12),clamp(ember,0.,1.))*ember*5.+resinClassEnergy*plume*1.3)*charge;
  density*=.6;
 }else if(resinClass==2.){
  // Broad, translucent, interwoven ribbons occupy different depths.
  float ribbon=exp(-pow((length(q.xy)-.44-sin(q.z*3.+t)*.12)*11.,2.));
  float second=exp(-pow((length(q.yz)-.37-cos(q.x*3.-t*.8)*.10)*12.,2.));
  vec3 iridescence=mix(resinClassEnergy,vec3(.12,.75,1.),.5+.5*sin(q.z*3.+t*.6));
  light=iridescence*(ribbon+second*.65)*envelope*(.4+charge*3.4);
  density*=.52;
 }else if(resinClass==3.||resinClass==6.){
  // A luminous core gathers inward on a maximum, without bleaching the shell.
  vec3 center=mix(core,q,resinMaximum);
  float radius=resinClass==3.?5.:8.;
  float sun=exp(-dot(center,center)*radius);
  float filaments=pow(classResinFbm(domain*1.8),6.)*envelope;
  light=resinClassEnergy*(sun*(.5+charge*2.8)+filaments*charge*2.);
  density*=.42;
 }else if(resinClass==4.){
  float pollen=pow(resinNoise(q*9.+vec3(t*.25,-t*.4,t*.19)),20.)*25.;
  light=resinClassEnergy*(coreGlow*.75+pollen*envelope*charge*3.5);
  density*=.9;
 }else if(resinClass==5.){
  vec3 r=q;r.xz=mat2(cos(t*.5),-sin(t*.5),sin(t*.5),cos(t*.5))*r.xz;
  float qi=exp(-pow((length(r.xy)-.48)*10.,2.)-pow(r.z*7.,2.));
  light=resinClassEnergy*(qi*(1.+charge*5.)+coreGlow*.4);
  density*=.4;
 }else if(resinClass==7.||resinClass==8.){
  // Dark moving lobes veil a softer light from behind, like ink in liquid.
  float ink=smoothstep(.36,.65,cloud)*envelope;
  density=ink*(resinClass==7.?1.6:1.25);
  float boundary=exp(-pow((cloud-.50)*14.,2.))*envelope;
  light=resinClassEnergy*(coreGlow*(.55+charge*2.)+boundary*charge*(resinClass==8.?1.7:.65));
 }else if(resinClass==9.){
  // Three-dimensional sparse star clusters, not markings on the faces.
  vec3 a=q-vec3(.48*sin(t*.8),.36*cos(t*.8),.30*sin(t*.63));
  vec3 b=q-vec3(.39*cos(t*.67+2.),.42*sin(t*.67+2.),.35*cos(t*.71));
  vec3 c=q-vec3(.32*sin(t*.58+4.),.38*cos(t*.73),.44*sin(t*.58+4.));
  float stars=exp(-dot(a,a)*85.)+exp(-dot(b,b)*95.)+exp(-dot(c,c)*90.);
  float dust=pow(resinNoise(q*7.+vec3(t*.15,t*.21,-t*.08)),24.)*12.;
  light=resinClassEnergy*((stars*9.+dust)*envelope*(.5+charge*2.)+coreGlow*.4);
  density*=.62;
 }else if(resinClass==10.){
  float dust=pow(resinNoise(q*8.-vec3(t*.2,-t*.14,t*.35)),16.)*8.;
  float coil=exp(-pow((length(q.xy)-.38-sin(q.z*4.+t)*.1)*12.,2.))*envelope;
  light=(resinClassEnergy*coil*3.+vec3(1.,.34,.035)*dust*envelope*3.)*charge;
  density*=.55;
 }
 light*=envelope*(1.+resinMaximum*.65);
}
`;

/** Uses the same bounded twelve samples as the approved ink resin. */
export const classResinIntegration=/*glsl*/`
 if(resinClass>.5){
  float density;vec3 pigment,emission;
  classResinField(point,density,pigment,emission);
  float opacity=1.-exp(-density*cloudStep*interior*3.2);
  inkLight+=inkTransmission*(pigment*opacity+emission*.32*(1.-opacity)*cloudStep*interior);
  inkTransmission*=1.-opacity;
 }else `;
