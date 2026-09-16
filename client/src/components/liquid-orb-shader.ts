/**
 * A single analytic fragment pass, not fluid physics or map-texture refraction.
 * Three small value-noise layers, five bubbles, three motes and three short
 * ballistic drops are bounded. The caller owns frame cap/reduced-motion policy.
 */
export const LIQUID_ORB_FRAGMENT = `precision mediump float;
varying vec2 uv;
uniform float time;
uniform float fill;
uniform float priorFill;
uniform vec3 tint;
uniform float impact;
uniform float impactAge;

// Keep intermediate hash values small enough for WebGL 1 mediump hardware.
float hash21(vec2 p){
  vec2 q=fract(p*vec2(.1031,.11369));
  q+=dot(q,q.yx+1.7);
  return fract(q.x*q.y*(q.x+q.y)*.13);
}
float valueNoise(vec2 p){
  vec2 cell=floor(p),f=fract(p);
  vec2 u=f*f*(3.-2.*f);
  return mix(mix(hash21(cell),hash21(cell+vec2(1.,0.)),u.x),
             mix(hash21(cell+vec2(0.,1.)),hash21(cell+vec2(1.,1.)),u.x),u.y);
}

void main(){
  vec2 p=uv;
  float r2=dot(p,p);
  if(r2>1.){gl_FragColor=vec4(0.);return;}
  float radius=sqrt(r2);
  float z=sqrt(max(0.,1.-r2));
  vec3 normal=vec3(p,z);
  float t=mod(time,480.);
  float amount=clamp(fill,0.,1.);
  float hasLiquid=step(.00001,amount);
  float age=max(0.,impactAge);
  float damage=max(-impact,0.);
  float healing=max(impact,0.);
  float rollEnvelope=(1.-exp(-age*18.))*exp(-age*.95)
    *(1.-smoothstep(.90,1.65,age));
  float healEnvelope=(1.-exp(-age*10.))*exp(-age*.80)
    *(1.-smoothstep(1.05,1.75,age));
  float damageEnergy=damage*rollEnvelope;
  float healEnergy=healing*healEnvelope;

  float h0=amount*2.-1.;
  float surfaceRoom=smoothstep(.005,.04,amount)*(1.-smoothstep(.96,.995,amount));
  float idle=.0048*sin(p.x*4.3+t*.74)+.0023*sin(p.x*10.1-t*.92);
  // A travelling crest rolls across the free surface while the glass stays
  // rigid. At a 145px globe, damage of 12/47 HP gives an approximately 7-12px
  // crest for the first .8s. Amplitude is proportional: there is no 1HP floor.
  float damagePhase=p.x*3.8+age*7.2;
  float healPhase=p.x*3.5-age*5.7;
  float damageRoll=.34*damageEnergy*(.78*sin(damagePhase)
    +.22*sin(p.x*7.6+age*7.2+.65));
  float healingRoll=.31*healEnergy*(.76*sin(healPhase)
    +.24*sin(p.x*7.-age*5.7-.6));
  float h=h0+(idle+damageRoll+healingRoll)*surfaceRoom;
  float slope=(.34*damageEnergy*(2.964*cos(damagePhase)
    +1.672*cos(p.x*7.6+age*7.2+.65))
    +.31*healEnergy*(2.66*cos(healPhase)
    +1.68*cos(p.x*7.-age*5.7-.6)))*surfaceRoom;

  // A shallow perspective surface with separately lit front and back lips.
  // At full HP the fluid reaches the glass: no artificial headspace or cap.
  float span=sqrt(max(0.,1.-h0*h0));
  float nx=p.x/max(.015,span);
  float chord=sqrt(max(0.,1.-nx*nx));
  float halfDepth=.060*span*chord*surfaceRoom;
  float front=h-halfDepth;
  float back=h+halfDepth;
  float across=(1.-smoothstep(.985,1.015,abs(nx)))*surfaceRoom*hasLiquid;
  float liquid=(1.-smoothstep(front-.004,front+.004,p.y))*hasLiquid;
  float surface=smoothstep(front-.004,front+.004,p.y)
    *(1.-smoothstep(back-.004,back+.004,p.y))*across;
  float frontLip=exp(-abs(p.y-front)*150.)*across;
  float backLip=exp(-abs(p.y-back)*210.)*across;
  float depth=clamp((h-p.y)*.7,0.,1.);

  // Three irregular, gently advected fields replace regularly spaced sine
  // stripes. The far layer is soft; the front layer carries sparse filaments.
  vec2 pivot=vec2(0.,h0-.28);
  vec2 fromPivot=p-pivot;
  float turn=(healEnergy-damageEnergy)*1.35;
  float turnCos=cos(turn),turnSin=sin(turn);
  vec2 rolled=vec2(turnCos*fromPivot.x-turnSin*fromPivot.y,
    turnSin*fromPivot.x+turnCos*fromPivot.y)+pivot;
  vec2 flow=mix(p,rolled,.78*exp(-abs(p.y-(h0-.25))*.8));
  flow.x+=.12*sin(p.y*3.1-t*.19);
  flow.y+=.08*sin(p.x*3.8+t*.16);
  float drain=damageEnergy*.24;
  float rise=healEnergy*.23;
  flow.y+=drain-rise;
  flow.x+=(damageEnergy+healEnergy)*.14*sin((p.y-h0)*5.-age*4.);
  float farField=valueNoise(flow*3.05+vec2(-t*.035,t*.048));
  float nearField=valueNoise(flow.yx*4.7+vec2(t*.043,-t*.032)+farField*.63);
  float detail=valueNoise(flow*6.3+vec2(-t*.026,-t*.063)+nearField*.37);
  float filament=1.-smoothstep(.014,.059,abs(farField*.68+nearField*.32-.51));
  filament*=smoothstep(.32,.77,detail)*(.25+.75*z);
  float diffuse=max(dot(normal,normalize(vec3(-.46,.62,1.))),0.);
  vec3 fluid=tint*(.23+.52*z+.07*diffuse)*(.42+.88*farField+.38*nearField);
  fluid=mix(fluid,tint*.13,depth*(.16+.18*(1.-nearField)));
  fluid+=(tint*.63+vec3(.10,.052,.026))*filament;
  float underCrest=exp(-max(0.,front-p.y)*12.)*step(p.y,front);
  fluid*=1.-underCrest*(damageEnergy+healEnergy)*.31;
  fluid*=1.-damageEnergy*.08;

  // A healing front travels upward through existing currents. It lights ruby
  // filaments instead of turning the whole vessel green.
  float healFront=exp(-pow((p.y-(-.9+age*1.18))*3.5,2.));
  float healingLight=healEnergy*(.25+filament*1.25)*healFront;
  fluid+=(tint*.48+vec3(.12,.15,.045))*healingLight;

  float bubbles=0.;
  float ripples=0.;
  for(int i=0;i<5;i++){
    float k=float(i);
    float bubbleAge=mod(t+k*2.43,13.2+k*1.47);
    float distanceLayer=fract(k*.381+.17);
    float speed=.255+k*.014;
    float by=-.97+bubbleAge*speed;
    float bx=sin(k*4.17+1.1)*.55+sin(bubbleAge*1.07+k)*.017;
    float bubbleRadius=(.012+k*.0018)*(.7+distanceLayer*.37);
    vec2 b=vec2(bx,by);
    float d=length(p-b);
    float ring=exp(-abs(d-bubbleRadius)*360.);
    float glint=exp(-length(p-b-vec2(-bubbleRadius*.32,bubbleRadius*.35))*290.);
    float active=smoothstep(0.,.32,bubbleAge)*(1.-smoothstep(7.7,8.4,bubbleAge));
    float submerged=1.-smoothstep(h-bubbleRadius*1.7,h-bubbleRadius*.3,by);
    bubbles+=(ring*.19+glint*.51)*active*submerged*(.38+distanceLayer*.62);

    // A tiny elliptical ring briefly marks a bubble meeting the liquid plane.
    float popAge=bubbleAge-(h0+.97)/speed;
    float pop=step(0.,popAge)*(1.-smoothstep(.04,.52,popAge))*active;
    float rippleRadius=.013+max(0.,popAge)*.083;
    float rippleDistance=length(vec2(p.x-bx,(p.y-h)*5.7));
    ripples+=exp(-abs(rippleDistance-rippleRadius)*245.)*pop*across;
  }
  fluid+=(tint*.32+vec3(.30,.37,.39))*bubbles;

  float motes=0.;
  for(int i=0;i<3;i++){
    float k=float(i);
    float phase=mod(t*(.067+k*.009)+k*.63+rise*.55,1.86);
    float my=-.94+phase;
    float mx=sin(k*3.81+phase*1.18)*(.26+k*.08)+sin(phase*3.4+k)*.024;
    float moteRadius=.007+k*.0015;
    float dotLight=exp(-pow(length(p-vec2(mx,my))/moteRadius,2.));
    float alive=smoothstep(-.94,-.78,my)*(1.-smoothstep(h-.045,h-.015,my));
    motes+=dotLight*alive*(.13+.1*sin(t*.37+k*1.6))*(1.+healEnergy*1.6);
  }
  fluid+=(tint*.44+vec3(.22,.13,.055))*motes;

  // Three small liquid drops leave the travelling damage crest and fall back
  // under gravity. They are clipped by the globe at the start of main(), vanish
  // into the surface, and never appear in an empty or completely full vessel.
  float drops=0.;
  float dropShine=0.;
  for(int i=0;i<3;i++){
    float k=float(i);
    float flight=age-(.045+k*.075);
    float flightTime=max(0.,flight);
    float vx=-damage*(.42+k*.18);
    float vy=damage*(1.85+k*.29);
    vec2 drop=vec2(.32-k*.14+vx*flightTime,
      h0+damage*.24+vy*flightTime-2.1*flightTime*flightTime);
    float dropRadius=max(.0005,damage*.036*(.85+k*.075));
    vec2 delta=p-drop;
    vec2 localDrop=delta/dropRadius;
    float shape=1.-smoothstep(.66,1.,length(localDrop));
    float visible=step(0.,flight)*(1.-smoothstep(.65,.91,flight))
      *smoothstep(front+.004,front+.025,p.y)*surfaceRoom*hasLiquid*step(.00001,damage);
    vec2 glintOffset=localDrop-vec2(-.27,.30);
    float highlight=exp(-dot(glintOffset,glintOffset)/.15);
    drops+=shape*visible;
    dropShine+=highlight*shape*visible;
  }

  // Empty glass is neutral. Every red/cyan body/surface/particle contribution
  // is gated by liquid, including the residual film after a large loss.
  float rim=pow(1.-z,3.);
  vec3 glass=vec3(.085,.105,.128)+vec3(.065,.079,.092)*z;
  vec3 col=mix(glass,fluid,liquid);
  vec3 wetNormal=normalize(vec3(-slope*.82,.56,.83));
  float wetSpecular=pow(max(dot(wetNormal,normalize(vec3(-.42,.56,.83))),0.),24.);
  vec3 surfaceColor=tint*(.38+.33*nearField)+vec3(.22,.17,.14)*wetSpecular;
  col=mix(col,surfaceColor,surface*.48);
  col+=(tint*.43+vec3(.14,.11,.085))*frontLip*(.37+.42*wetSpecular);
  col+=vec3(.15,.18,.19)*backLip*.22;
  col+=vec3(.15,.12,.09)*wetSpecular*surface*(damageEnergy+healEnergy)*.48;
  col+=(tint*.24+vec3(.17,.17,.14))*ripples*.35;
  col+=tint*frontLip*damageEnergy*.22;
  col=mix(col,tint*.86,clamp(drops,0.,1.));
  col+=vec3(.80,.67,.53)*dropShine;

  // Spherical chord length supplies richer center absorption and thinner,
  // clearer edges. This is real composited alpha, not refraction of the map.
  float bodyAlpha=.45+.43*(1.-exp(-z*2.6))+.025*depth;
  float alpha=mix(.09+.16*rim,bodyAlpha,liquid);
  alpha=mix(alpha,max(alpha,.65),surface*.56);
  alpha=max(alpha,frontLip*.65);
  alpha=max(alpha,clamp(drops,0.,1.)*.86);

  float previousHeight=clamp(priorFill,0.,1.)*2.-1.;
  float exposed=smoothstep(h+.012,h+.035,p.y)
    *(1.-smoothstep(previousHeight-.016,previousHeight+.016,p.y));
  float insideWall=smoothstep(.76,.88,radius)*(1.-smoothstep(.965,.997,radius));
  float wetTrail=exposed*insideWall*smoothstep(.30,.66,damage)
    *exp(-age*1.45)*smoothstep(.01,.09,age)*(.40+.60*detail)*hasLiquid;
  col=mix(col,tint*.63+vec3(.065,.045,.034),wetTrail*.74);
  alpha+=wetTrail*.27;

  // The container does not wobble: these fixed highlights stay independent
  // of HP movement and make liquid motion legible inside a solid glass globe.
  float shine=pow(max(dot(normal,normalize(vec3(-.37,.55,.82))),0.),72.);
  float lower=pow(max(dot(normal,normalize(vec3(.52,-.72,.27))),0.),78.);
  float arc=exp(-pow((length(p-vec2(-.12,.05))-.90)*48.,2.));
  col+=vec3(.28,.35,.41)*rim;
  col+=vec3(1.,.94,.87)*shine*.88+vec3(.55,.70,.78)*lower*.53;
  col+=vec3(.24,.29,.33)*arc*.32;
  alpha=clamp(alpha+shine*.61+lower*.23+rim*.15,0.,.975);
  gl_FragColor=vec4(col,alpha*(1.-smoothstep(.985,1.,radius)));
}`;
