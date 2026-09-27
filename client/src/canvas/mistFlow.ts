import {DataTexture, LinearFilter, RGBAFormat} from 'three';
import type {EnvironmentContactToken, EnvironmentPreviewSettings} from './battlefieldEnvironment';

/** Small map-space field: RG bends wisps, B parts them, A adds a soft curled rim.
 * This is a bounded visual approximation, not a fluid solver or game visibility. */
export function createMistFlow() {
  const width=160,height=112,base=new Uint8Array(width*height*4),data=new Uint8Array(base.length);
  const texture=new DataTexture(data,width,height,RGBAFormat);
  texture.minFilter=texture.magFilter=LinearFilter;texture.generateMipmaps=false;
  let mapWidth=1216,mapHeight=832,enabled=true,obstacleKey='',time=0,lastUpload=-1;
  let obstacles=0;
  const previous=new Map<string,{x:number;y:number}>();
  const wakes:{id:string;x:number;y:number;radius:number;born:number;dx:number;dy:number}[]=[];
  const clamp=(v:number)=>Math.max(0,Math.min(255,Math.round(v)));
  const smooth=(a:number,b:number,x:number)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
  function rebuild(settings:EnvironmentPreviewSettings){
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
    setTokens(tokens:readonly EnvironmentContactToken[]){
      const visible=new Set(tokens.filter(t=>t.visible).map(t=>t.id));
      for(let i=wakes.length-1;i>=0;i--)if(!visible.has(wakes[i].id))wakes.splice(i,1);
      for(const id of previous.keys())if(!visible.has(id))previous.delete(id);
      for(const token of tokens){
        if(!token.visible)continue;
        const from=previous.get(token.id),distance=from?Math.hypot(token.x-from.x,token.y-from.y):0;
        if(from&&distance<5)continue;
        if(from&&enabled&&distance<token.diameter*3){
          const count=Math.min(8,Math.ceil(distance/7));
          for(let j=1;j<=count;j++)wakes.push({id:token.id,x:from.x+(token.x-from.x)*j/count,y:from.y+(token.y-from.y)*j/count,
            radius:token.diameter*.64,born:time,dx:(token.x-from.x)/distance,dy:(token.y-from.y)/distance});
          if(wakes.length>48)wakes.splice(0,wakes.length-48);
        }
        previous.set(token.id,{x:token.x,y:token.y});
      }
    },
    tick(seconds:number){
      if(seconds<time||seconds===0){wakes.length=0;lastUpload=-1;}
      time=seconds;
      if(!enabled)wakes.length=0;
      for(let i=wakes.length-1;i>=0;i--)if(seconds-wakes[i].born>3.6)wakes.splice(i,1);
      if(lastUpload>=0&&seconds-lastUpload<1/15)return;
      lastUpload=seconds;data.set(base);
      for(const wake of wakes){
        const age=Math.max(0,seconds-wake.born),fade=Math.pow(1-age/3.6,1.4);
        const r=wake.radius*(1+age*.2),wx=wake.x+age*5,wy=wake.y+age*1.5;
        const x0=Math.max(0,Math.floor((wx-r)/mapWidth*width)),x1=Math.min(width-1,Math.ceil((wx+r)/mapWidth*width));
        const y0=Math.max(0,Math.floor((wy-r)/mapHeight*height)),y1=Math.min(height-1,Math.ceil((wy+r)/mapHeight*height));
        for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
          const dx=(x+.5)/width*mapWidth-wx,dy=(y+.5)/height*mapHeight-wy,d=Math.hypot(dx,dy)/r;
          if(d>=1)continue;
          const i=(y*width+x)*4,core=(1-smooth(.12,.82,d))*fade;
          const curl=Math.exp(-Math.pow((d-.65)/.22,2))*fade;
          data[i+2]=Math.min(data[i+2],clamp(255*(1-core*.87)));
          data[i+3]=Math.max(data[i+3],clamp(curl*.6*255));
          // Soft sideways displacement makes the trailing rim turn as it fades.
          data[i]=clamp(base[i]-wake.dy*curl*15);
          data[i+1]=clamp(base[i+1]+wake.dx*curl*15);
        }
      }
      texture.needsUpdate=true;
    },
    get state(){return {wakes:wakes.length,obstacles,enabled};},
    dispose(){texture.dispose();previous.clear();wakes.length=0;},
  };
}
