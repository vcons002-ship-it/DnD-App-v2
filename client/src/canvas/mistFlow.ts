import {DataTexture, LinearFilter, RGBAFormat} from 'three';
type FlowSettings={mapWidth:number;mapHeight:number;mistInteraction?:boolean;scenery:boolean;props?:readonly {x:number;y:number;size:number}[]};
type ContactToken={id:string;x:number;y:number;diameter:number;visible:boolean};

/** Small map-space field: RG displaces existing mist, B clears a path, A compresses it.
 * This is a bounded visual approximation, not a fluid solver or game visibility. */
export function createMistFlow() {
  // Soft displacement needs several texels across a base. This field remains
  // only 280 KiB, uploaded at 15 Hz independently of the 3D scene.
  const width=320,height=224,base=new Uint8Array(width*height*4),data=new Uint8Array(base.length);
  const texture=new DataTexture(data,width,height,RGBAFormat);
  texture.minFilter=texture.magFilter=LinearFilter;texture.generateMipmaps=false;
  let mapWidth=1216,mapHeight=832,enabled=true,obstacleKey='',time=0,lastUpload=-1;
  let obstacles=0;
  const previous=new Map<string,{x:number;y:number;travel:number;ordinal:number}>();
  const lifetime=6;
  const wakes:{id:string;x:number;y:number;length:number;radius:number;born:number;dx:number;dy:number;curl:boolean;ordinal:number}[]=[];
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
    texture,
    update:rebuild,
    setTokens(tokens:readonly ContactToken[]){
      const visible=new Set(tokens.filter(t=>t.visible).map(t=>t.id));
      for(let i=wakes.length-1;i>=0;i--)if(!visible.has(wakes[i].id))wakes.splice(i,1);
      for(const id of previous.keys())if(!visible.has(id))previous.delete(id);
      for(const token of tokens){
        if(!token.visible)continue;
        const from=previous.get(token.id),distance=from?Math.hypot(token.x-from.x,token.y-from.y):0;
        if(from&&distance<5)continue;
        let travel=from?.travel??0,ordinal=from?.ordinal??0;
        if(from&&enabled&&distance<token.diameter*3){
          const count=Math.min(8,Math.ceil(distance/9)),length=distance/count;
          for(let j=1;j<=count;j++){
            travel+=length;
            // Broad disturbances overlap along the path, independent of FPS.
            const curl=travel>=token.diameter*.65;
            if(curl){travel%=token.diameter*.65;ordinal++;}
            wakes.push({id:token.id,x:from.x+(token.x-from.x)*(j-.5)/count,y:from.y+(token.y-from.y)*(j-.5)/count,
              length,radius:token.diameter*.5,born:time,dx:(token.x-from.x)/distance,dy:(token.y-from.y)/distance,curl,ordinal});
          }
          if(wakes.length>48)wakes.splice(0,wakes.length-48);
        }else travel=0;
        previous.set(token.id,{x:token.x,y:token.y,travel,ordinal});
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
      lastUpload=seconds;data.set(base);
      for(const wake of wakes){
        const age=Math.max(0,seconds-wake.born),fade=1-smooth(2.8,lifetime,age);
        const nx=-wake.dy,ny=wake.dx;
        // These coordinates stay on the travelled path. Only ambient wind
        // carries them a little; the figure's new position never drags them.
        const wx=wake.x+age*3,wy=wake.y+age;
        const halfWidth=wake.radius*(1.02-.46*smooth(.7,5.8,age));
        const extent=wake.length*.5+halfWidth*1.3;
        visit(wx,wy,extent,(i,x,y)=>{
          const px=x-wx,py=y-wy;
          const along=px*wake.dx+py*wake.dy,across=px*nx+py*ny;
          const end=Math.max(0,Math.abs(along)-wake.length*.5);
          const d=Math.hypot(across,end)/halfWidth;
          const clearing=(1-smooth(.38,1,d))*fade;
          data[i+2]=Math.min(data[i+2],clamp(255*(1-clearing*.98)));
        });
        if(!wake.curl)continue;
        // Move existing patches outward, then gently fold them back in. There
        // is no spiral ribbon: the mist's own density supplies all visible form.
        const roll=smooth(.3,2.2,age),strength=smooth(.05,.35,age)*fade;
        for(const side of [-1,1]){
          const variation=Math.sin(wake.ordinal*2.399+side*1.7);
          const r=wake.radius*(.98+variation*.16);
          const cx=wx-wake.dx*r*.25+nx*side*wake.radius*(.83+variation*.12);
          const cy=wy-wake.dy*r*.25+ny*side*wake.radius*(.83+variation*.12);
          visit(cx,cy,r*1.8,(i,x,y)=>{
            const dx=x-cx,dy=y-cy,d=Math.hypot(dx,dy)/r;
            if(d>=1.8)return;
            const along=(x-wx)*wake.dx+(y-wy)*wake.dy;
            const behind=1-smooth(0,wake.radius*.75,along);
            const influence=(1-smooth(.15,1.8,d))*strength*behind;
            const angle=side*roll*.65*influence;
            const c=Math.cos(angle),s=Math.sin(angle);
            // This is an inverse sampling offset: sampling inward first makes
            // the existing mist spread outward. That push relaxes after passage.
            const push=side*wake.radius*.42*(1-roll)*influence;
            data[i]=clamp(data[i]+(dx*c-dy*s-dx-nx*push)*2);
            data[i+1]=clamp(data[i+1]+(dx*s+dy*c-dy-ny*push)*2);
            data[i+3]=Math.max(data[i+3],clamp(influence*.34*255));
          });
        }
      }
      texture.needsUpdate=true;
    },
    get state(){return {wakes:wakes.length,obstacles,enabled,time,oldestWakeAge:wakes.length?time-wakes[0].born:0};},
    dispose(){texture.dispose();previous.clear();wakes.length=0;},
  };
}
