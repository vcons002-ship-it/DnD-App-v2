/** Metal inlays above class resin, plus the opaque gold critical variant.
 * Noncritical bodies use the physical refractive volume in classDiceResin. */
export const classDiceShader=/* glsl */`
uniform float classArt;
uniform vec3 classDark;
uniform vec3 classLight;
uniform vec3 classInlay;
uniform vec3 classEnergy;
uniform float classRoughness;
uniform float classMetal;
float classPattern(vec3 p){
 float flow=fbm(p*2.2),detail=fbm(p*6.1+vec3(flow*1.7));
 if(classArt==1.)return smoothstep(.25,.78,detail)*.7+noise(p*29.)*.15;
 if(classArt==2.)return .5+.35*sin(p.x*6.+p.z*5.+flow*9.);
 if(classArt==3.)return smoothstep(.19,.8,fbm(p*1.9+vec3(detail*.6)));
 if(classArt==4.)return .5+.5*sin((length(p.xy+vec2(flow*.13))*.85+p.z*.25+flow*.7)*34.);
 if(classArt==5.)return smoothstep(.22,.8,flow+detail*.16);
 if(classArt==6.)return .14+detail*.16;
 if(classArt==7.)return smoothstep(.38,.72,flow)*.42;
 if(classArt==8.)return .5+.5*sin(p.z*7.+flow*9.);
 if(classArt==9.)return smoothstep(.35,.73,detail);
 return .35+noise(vec3(p.x*160.,p.y*5.,p.z*7.))*.33;
}
vec3 classDiceSurface(vec3 p,vec3 n,vec3 incoming,float cut){
 float pattern=classPattern(p),nv=max(.001,dot(n,-incoming));
 float fine=fbm(p*24.);
 float height=pattern*.009+fine*.002;
 if(classArt==1.)height+=noise(p*35.)*.009;
 if(classArt==10.)height+=noise(vec3(p.x*140.,p.y*7.,p.z*11.))*.004;
 vec3 sx=dFdx(p),sy=dFdy(p),r1=cross(sy,n),r2=cross(n,sx);
 float det=dot(sx,r1);
 vec3 grad=(dFdx(height)*r1+dFdy(height)*r2)/(abs(det)>.000001?det:.000001);
 vec3 normal=normalize(n-grad*.38);
 vec3 reflected=studioLight(rotation*reflect(incoming,normal));
 vec3 pigment=mix(classDark,classLight,clamp(pattern,0.,1.));
 float fresnel=.035+.965*pow(1.-nv,5.);
 vec3 light=normalize(trayLighting?vec3(-1.25,.45,.70):vec3(-.65,.65,1.));
 float diffuse=.3+.7*max(0.,dot(rotation*normal,light));
 vec3 color=pigment*diffuse;
 vec3 metallic=reflected*(pigment*.7+vec3(.12));
 color=mix(color,metallic,classMetal);
 float polish=(.12+fresnel*.8)*(1.-classRoughness*.55)*traySurfaceReflection(n);
 color+=reflected*polish;
 vec3 halfVector=normalize(light-rotation*incoming);
 float glint=pow(max(0.,dot(rotation*normal,halfVector)),mix(180.,40.,classRoughness));
 color+=vec3(1.,.96,.87)*glint*.5*traySurfaceReflection(n);
 if(classArt==2.||classArt==8.){
  // Mineral flash moves with the view, beneath a restrained clear polish.
  float flash=pow(.5+.5*sin(dot(normal,-incoming)*7.+pattern*9.),5.);
  vec3 opal=mix(vec3(.05,.33,.34),vec3(.30,.045,.38),.5+.5*sin(pattern*8.));
  color+=opal*flash*(classArt==8.?.32:.42);
 }
 if(classArt==3.)color+=classLight*pow(max(0.,dot(n,-incoming)),2.)*.12;
 if(classArt==9.){
  float fleck=pow(noise(p*98.),24.);
  float vein=1.-smoothstep(.008,.04,abs(fbm(p*4.)-.49));
  color+=classInlay*fleck*.45+vec3(.17,.23,.38)*vein*.25;
 }
 float strength=clamp(rollPower,0.,1.);
 float waking=pow(strength,1.9);
 float seam=1.-smoothstep(.008,.050,abs(fbm(p*5.+vec3(pattern*.7))-.5));
 float pulse=.73+.27*sin(time*(.6+strength*1.7)+pattern*7.);
 if(classArt==2.)seam=pow(.5+.5*sin(pattern*5.-time*.8),6.)*.3;
 if(classArt==3.)seam=pow(max(0.,1.-length(p.xy)*.65),3.)*.4;
 if(classArt==4.)seam=pow(.5+.5*sin(pattern*10.-time*.5),12.)*.35;
 if(classArt==5.)seam=pow(.5+.5*sin(length(p)*11.-time*1.5+pattern*3.),8.)*.45;
 if(classArt==8.)seam=pow(fbm(p*3.+vec3(0.,0.,time*.12)),3.)*.5;
 if(classArt==9.)seam=pow(noise(p*72.),22.)*1.8;
 if(classArt==10.)seam*=.45;
 if(classArt==6.)seam=pow(max(0.,1.-abs(pattern-.2)*12.),3.)*.25+seam*.08;
 if(classArt==7.)seam*=.22;
 color+=classEnergy*seam*waking*pulse*(.10+rollMaximum*.65);
 // A maximum gathers light without bleaching out the original dark material.
 color+=classEnergy*pow(1.-nv,3.)*rollMaximum*.10;
 if(!engraved){
  // Continuous bevels keep their actual geometry and a subtle metal binding.
  if(classArt==6.||classArt==10.)color=polishedGoldSurface(n,incoming)*mix(classInlay,vec3(1.),.25)*.65;
  else color*=.8;
 }
 if(critical>.5){
  color=polishedGoldSurface(n,incoming)*1.1+classEnergy*seam*waking*.22;
 }
 if(engraved){
  float rim=max(max(texture2D(etching,tex+vec2(.007,0)).r,texture2D(etching,tex-vec2(.007,0)).r),max(texture2D(etching,tex+vec2(0,.007)).r,texture2D(etching,tex-vec2(0,.007)).r));
  vec3 inlay=polishedGoldSurface(n,incoming)*classInlay+classInlay*.18;
  if(classArt==3.)inlay*=.35;
  if(critical>.5)inlay=vec3(.025,.014,.006);
  inlay*=mix(1.,.35,smoothstep(.25,.85,rim));
  color=mix(color,inlay,1.-cut);
 }
 return color;
}
`;
