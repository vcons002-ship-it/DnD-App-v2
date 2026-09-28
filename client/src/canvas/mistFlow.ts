import {DataTexture, LinearFilter, RedFormat, RGBAFormat} from 'three';
type FlowSettings={mapWidth:number;mapHeight:number;mistInteraction?:boolean;scenery:boolean;props?:readonly {x:number;y:number;size:number}[]};
type ContactToken={id:string;x:number;y:number;diameter:number;visible:boolean;
  body?:{x:number;y:number;radiusX:number;radiusY:number;height?:number;facing:number}};

/** Small map-space field: RG displaces existing mist, B clears a path, A compresses it.
 * This is a bounded visual approximation, not a fluid solver or game visibility. */
export function createMistFlow() {
  // Soft displacement needs several texels across a base. This field remains
  // only 280 KiB, uploaded at 15 Hz independently of the 3D scene.
  const width=320,height=224,base=new Uint8Array(width*height*4),data=new Uint8Array(base.length);
  const pushX=new Float32Array(width*height),pushY=new Float32Array(width*height),pushWeight=new Float32Array(width*height);
  const texture=new DataTexture(data,width,height,RGBAFormat);
  texture.minFilter=texture.magFilter=LinearFilter;texture.generateMipmaps=false;
  const heights=new Uint8Array(width*height);
  const heightTexture=new DataTexture(heights,width,height,RedFormat);
  heightTexture.minFilter=heightTexture.magFilter=LinearFilter;heightTexture.generateMipmaps=false;
  let mapWidth=1216,mapHeight=832,enabled=true,obstacleKey='',time=0,lastUpload=-1;
  let obstacles=0;
  const previous=new Map<string,{x:number;y:number;bodyX:number;bodyY:number}>();
  const lifetime=6;
  const wakes:{id:string;x:number;y:number;length:number;radius:number;front:number;height:number;born:number;dx:number;dy:number}[]=[];
  // Rasterize only a small world-space rectangle around each retained segment.
  function visit(wx:number,wy:number,r:number,paint:(i:number,x:number,y:number)=>void){
    const x0=Math.max(0,Math.floor((wx-r)/mapWidth*width)),x1=Math.min(width-1,Math.ceil((wx+r)/mapWidth*width));
    const y0=Math.max(0,Math.floor((wy-r)/mapHeight*height)),y1=Math.min(height-1,Math.ceil((wy+r)/mapHeight*height));
    for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++)paint((y*width+x)*4,(x+.5)/width*mapWidth,(y+.5)/height*mapHeight);
  }
  const clamp=(v:number)=>Math.max(0,Math.min(255,Math.round(v)));
  const smooth=(a:number,b:number,x:number)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
  function rebuild(settings:FlowSettings){
    mapWidth=settings.mapWidth;mapHeight=settings.mapHeight;
    enabled=settings.mistInteraction!==false;
    const props=settings.scenery&&enabled?settings.props??[]:[];
    const key=JSON.stringify([mapWidth,mapHeight,props]);
    if(key===obstacleKey)return;
    obstacleKey=key;obstacles=props.length;
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const wx=(x+.5)/width*mapWidth,wy=(y+.5)/height*mapHeight;
      let dx=0,dy=0,clear=1,rim=0;
      for(const prop of props){
        const px=wx-prop.x,py=wy-prop.y,radius=prop.size*.58,d=Math.hypot(px,py);
        clear*=smooth(radius*.8,radius*1.18,d);
        const influence=Math.exp(-Math.pow((d-radius)/(radius*.85),2));
        // Radial deflection splits an advecting ribbon at the obstacle's edge.
        dx+=px/Math.max(1,d)*influence*radius*.8;
        dy+=py/Math.max(1,d)*influence*radius*.8;
        rim=Math.max(rim,influence*.35);
      }
      const i=(y*width+x)*4;
      base[i]=clamp(128+dx*2);base[i+1]=clamp(128+dy*2);
      base[i+2]=clamp(clear*255);base[i+3]=clamp(rim*255);
    }
    lastUpload=-1;
  }
  return {
    texture,heightTexture,
    get heightScale(){return Math.max(mapWidth,mapHeight);},
    update:rebuild,
    reset(){previous.clear();wakes.length=0;lastUpload=-1;},
    setTokens(tokens:readonly ContactToken[]){
      const visible=new Set(tokens.filter(t=>t.visible).map(t=>t.id));
      for(let i=wakes.length-1;i>=0;i--)if(!visible.has(wakes[i].id))wakes.splice(i,1);
      for(const id of previous.keys())if(!visible.has(id))previous.delete(id);
      for(const token of tokens){
        if(!token.visible)continue;
        const body=token.body??{x:token.x,y:token.y,radiusX:token.diameter*.22,radiusY:token.diameter*.16,facing:0};
        const from=previous.get(token.id),distance=from?Math.hypot(token.x-from.x,token.y-from.y):0;
        if(from&&distance<Math.max(1.5,Math.min(body.radiusX,body.radiusY)*.2))continue;
        if(from&&enabled&&distance<token.diameter*3){
          const dx=(token.x-from.x)/distance,dy=(token.y-from.y)/distance,c=Math.cos(body.facing),s=Math.sin(body.facing);
          const radius=Math.hypot((-dy*c-dx*s)*body.radiusX,(-dy*s+dx*c)*body.radiusY);
          const front=Math.hypot((dx*c-dy*s)*body.radiusX,(dx*s+dy*c)*body.radiusY);
          const count=Math.min(12,Math.ceil(distance/Math.max(3,radius*.5))),length=distance/count;
          for(let j=1;j<=count;j++){
            const x=from.bodyX+(body.x-from.bodyX)*(j-.5)/count,y=from.bodyY+(body.y-from.bodyY)*(j-.5)/count;
            // Coalesce adjacent straight samples. Otherwise three walking figures
            // exhaust the history in half a second, before the wake can roll back.
            let last:typeof wakes[number]|undefined;
            for(let k=wakes.length-1;k>=0;k--)if(wakes[k].id===token.id){last=wakes[k];break;}
            if(last&&time-last.born<.3&&last.length+length<radius*2.5&&last.dx*dx+last.dy*dy>.995
              &&Math.hypot(x-dx*length*.5-(last.x+last.dx*last.length*.5),y-dy*length*.5-(last.y+last.dy*last.length*.5))<1){
              const total=last.length+length;
              last.x=(last.x*last.length+x*length)/total;last.y=(last.y*last.length+y*length)/total;
              last.length=total;
            }else wakes.push({id:token.id,x,y,length,radius,front,height:body.height??token.diameter*1.6,born:time,dx,dy});
          }
          if(wakes.length>96)wakes.splice(0,wakes.length-96);
        }
        previous.set(token.id,{x:token.x,y:token.y,bodyX:body.x,bodyY:body.y});
      }
    },
    tick(seconds:number){
      // Zero explicitly freezes reduced-motion previews. A stale render clock
      // must never erase world-space history during camera interaction.
      if(seconds===0){wakes.length=0;lastUpload=-1;}
      else if(seconds<time)return;
      time=seconds;
      if(!enabled)wakes.length=0;
      for(let i=wakes.length-1;i>=0;i--)if(seconds-wakes[i].born>lifetime)wakes.splice(i,1);
      if(lastUpload>=0&&seconds-lastUpload<1/15)return;
      lastUpload=seconds;data.set(base);heights.fill(0);pushX.fill(0);pushY.fill(0);pushWeight.fill(0);
      for(const wake of wakes){
        const age=Math.max(0,seconds-wake.born),fade=1-smooth(2.8,lifetime,age);
        const nx=-wake.dy,ny=wake.dx;
        const encodedHeight=Math.max(1,clamp(wake.height/Math.max(mapWidth,mapHeight)*255));
        // These coordinates stay on the travelled path. Only ambient wind
        // carries them a little; the figure's new position never drags them.
        const wx=wake.x+age*3,wy=wake.y+age;
        // Nothing starts ahead of the swept body. This boundary stays in map
        // space even as older mist drifts, and the leading edge tapers to a nose.
        const contact=(x:number,y:number)=>{
          const px=x-wake.x,py=y-wake.y,along=px*wake.dx+py*wake.dy-wake.length*.5;
          if(along>=wake.front)return 0;
          if(along<=0)return 1;
          const across=Math.abs(-px*wake.dy+py*wake.dx);
          const edge=wake.radius*Math.sqrt(Math.max(0,1-(along/wake.front)**2));
          return (1-smooth(wake.front*.65,wake.front,along))*(1-smooth(edge*.7,edge,across));
        };
        // A bank travels outward first, carrying nearby noisy density with it.
        // It then recedes as air rolls back into the trail. Opacity reduction is
        // deliberately small; displacement and compression do the visible work.
        const returning=smooth(.25,5.5,age);
        // Contact pushes immediately; only the recovery evolves with trail age.
        const spread=wake.radius*.95*(1-returning*.55);
        const halfWidth=spread*.7;
        const extent=wake.length*.5+Math.max(wake.front,wake.radius*1.9);
        visit(wx,wy,extent,(i,x,y)=>{
          const touched=contact(x,y);if(touched<=0)return;
          const px=x-wx,py=y-wy;
          const along=px*wake.dx+py*wake.dy,across=px*nx+py*ny;
          const end=Math.max(0,Math.abs(along)-wake.length*.5);
          const d=Math.hypot(across,end)/halfWidth;
          const clearing=(1-smooth(.38,1,d))*fade*touched;
          data[i+2]=Math.min(data[i+2],clamp(255*(1-clearing*.28)));
          const bank=Math.exp(-Math.pow((Math.abs(across)-spread)/(wake.radius*.45),2)
            -Math.pow(end/Math.max(wake.front,wake.radius*.8),2))*fade*touched;
          const shift=Math.sign(across)*Math.min(Math.abs(across)*1.6,spread*1.65)*bank;
          const p=i/4,weight=Math.abs(shift);
          // Overlapping path samples must not multiply the same outward push.
          if(weight>pushWeight[p]){
            // A continuous, opposed shear along the displaced edges bends the
            // existing mist back into the path. No circular vortex stamps.
            const recovery=smooth(.12,1.3,age)*(1-smooth(3.5,lifetime,age));
            const phase=(x*wake.dx+y*wake.dy)/(wake.radius*2.4)+age*.65;
            const shear=Math.sin(phase)*wake.radius*.65*recovery*bank*Math.sign(across);
            pushWeight[p]=weight;pushX[p]=-nx*shift+wake.dx*shear;pushY[p]=-ny*shift+wake.dy*shear;
          }
          data[i+3]=Math.max(data[i+3],clamp(bank*.75*255));
          if(clearing>.001||bank>.001)heights[i/4]=Math.max(heights[i/4],encodedHeight);
        });

      }
      for(let p=0;p<pushWeight.length;p++)if(pushWeight[p]>0){
        const i=p*4;data[i]=clamp(data[i]+pushX[p]*2);data[i+1]=clamp(data[i+1]+pushY[p]*2);
      }
      texture.needsUpdate=true;heightTexture.needsUpdate=true;
    },
    get state(){return {wakes:wakes.length,obstacles,enabled,time,oldestWakeAge:wakes.length?time-wakes[0].born:0};},
    dispose(){texture.dispose();heightTexture.dispose();previous.clear();wakes.length=0;},
  };
}
