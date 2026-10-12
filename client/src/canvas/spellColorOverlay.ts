import {Color} from 'three';
import type {TorchLight} from './miniatureTorchLighting';
import {createVisionLightProjector} from './visionLightEllipse';
import type {BattlefieldView} from './miniatureProjection';

/** Cosmetic color only. The existing vision cover clips this canvas; flashes
 * never enter sight calculations, darkvision grading, exploration or shadows.
 * One soft spot per emitter replaces the animated 48-band SVG light masks. */
export function createSpellColorOverlay(parent:HTMLElement) {
  const canvas=document.createElement('canvas');
  canvas.dataset.testid='spell-color-overlay';
  canvas.style.cssText='position:absolute;inset:0;width:100%;height:100%;z-index:5;pointer-events:none;mask-image:var(--spell-vision-visible,none)';
  parent.appendChild(canvas);
  const ctx=canvas.getContext('2d')!;
  const color=new Color();
  let wasActive=false;
  return {
    draw(lights:readonly TorchLight[],view:BattlefieldView,tilt:number,rotation:number,width:number,height:number){
      // Modest resolution is sufficient for these intentionally soft glows.
      const scale=Math.min(1,960/Math.max(width,height)),w=Math.max(1,Math.round(width*scale)),h=Math.max(1,Math.round(height*scale));
      if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
      if(!lights.length&&!wasActive)return;
      ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,w,h);
      const project=createVisionLightProjector(view,tilt,rotation,width,height);
      let count=0;
      for(const light of lights){
        if(light.strength<=.002)continue;
        const ellipse=project(light.x,light.y,light.radius);
        if(!ellipse)continue;
        color.setRGB(light.color.x,light.color.y,light.color.z).convertLinearToSRGB();
        const rgb=[color.r,color.g,color.b].map(v=>Math.round(Math.min(1,v)*255)).join(',');
        const alpha=Math.min(.28,light.strength*.22);
        ctx.setTransform(scale,0,0,scale,0,0);ctx.translate(ellipse.cx,ellipse.cy);ctx.rotate(ellipse.rotation*Math.PI/180);ctx.scale(ellipse.rx,ellipse.ry);
        const glow=ctx.createRadialGradient(0,0,0,0,0,1);
        glow.addColorStop(0,`rgba(${rgb},${alpha})`);glow.addColorStop(.35,`rgba(${rgb},${alpha*.6})`);glow.addColorStop(1,`rgba(${rgb},0)`);
        ctx.fillStyle=glow;ctx.fillRect(-1,-1,2,2);count++;
      }
      wasActive=count>0;canvas.dataset.emitters=String(count);
    },
    dispose(){canvas.remove();},
  };
}
