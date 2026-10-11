import {test,expect} from '@playwright/test';
import {build} from 'esbuild';
import sharp from 'sharp';

test('conic light bands preserve projected light reach and attenuation without polygon tessellation',async({page})=>{
 const bundle=await build({write:false,bundle:true,format:'iife',platform:'browser',stdin:{resolveDir:process.cwd(),contents:`
 import {visionLightEllipse} from './client/src/canvas/visionLightEllipse';
 import {mapToScreen,projectGround} from './client/src/canvas/miniatureProjection';
 import {lightCoverage} from './shared/playerVision';
 document.body.style.margin='0';
 const width=400,height=300,view={x:0,y:0,scale:1};
 let html='';
 for(const [row,[tilt,rotation]] of [[0,0],[45,0],[45,37],[45,205]].entries()){
  let old='',current='';const l={x:210,y:160,height:9,radius:100,strength:.8};let previous=0;
  for(let i=48;i>=1;i--){
   const r=l.radius*1.5*i/48,coverage=lightCoverage(r-l.radius/64,l),alpha=Math.max(0,(coverage-previous)/Math.max(.00001,1-previous));previous=coverage;
   if(alpha<=.0001)continue;
   const points=Array.from({length:96},(_,j)=>{const a=j*Math.PI/48,p=mapToScreen(l.x+r*Math.cos(a),l.y+r*Math.sin(a),view,tilt);return projectGround(p.x,p.y,width,height,tilt,rotation);});
   old+='<path fill="black" fill-opacity="'+alpha.toFixed(4)+'" d="M'+points.map(p=>p.x.toFixed(2)+','+p.y.toFixed(2)).join('L')+'Z"/>';
   const e=visionLightEllipse(view,tilt,rotation,width,height,l.x,l.y,r);
   current+='<ellipse fill="black" fill-opacity="'+alpha.toFixed(4)+'" cx="'+e.cx.toFixed(2)+'" cy="'+e.cy.toFixed(2)+'" rx="'+e.rx.toFixed(2)+'" ry="'+e.ry.toFixed(2)+'" transform="rotate('+e.rotation.toFixed(4)+' '+e.cx.toFixed(2)+' '+e.cy.toFixed(2)+')"/>';
  }
  for(const [column,bands] of [old,current].entries())html+='<svg width="400" height="300" style="position:absolute;left:'+column*400+'px;top:'+row*300+'px;background:white">'+bands+'</svg>';
 }
 document.body.innerHTML=html;
 `}});
 await page.setViewportSize({width:800,height:1200});await page.goto('about:blank');await page.addScriptTag({content:bundle.outputFiles[0].text});
 const shot=await page.screenshot();
 for(let row=0;row<4;row++){
  const old=await sharp(shot).extract({left:0,top:row*300,width:400,height:300}).removeAlpha().raw().toBuffer();
  const current=await sharp(shot).extract({left:400,top:row*300,width:400,height:300}).removeAlpha().raw().toBuffer();
  const difference=[...old].map((v,i)=>Math.abs(v-current[i]));
  expect(difference.reduce((a,b)=>a+b,0)/difference.length,'mean pixel difference').toBeLessThan(.3);
  expect(difference.filter(v=>v>5).length/difference.length,'edge-only differences').toBeLessThan(.01);
 }
});
