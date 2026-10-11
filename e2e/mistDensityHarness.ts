import * as T from 'three';
import {mistDensitySource} from '../client/src/canvas/battlefieldMist';
import {createMistDensityCache,mistCacheSampler} from '../client/src/canvas/mistDensityCache';
const renderer=new T.WebGLRenderer({antialias:false});renderer.setSize(720,430);document.body.append(renderer.domElement);
const data=new Uint8Array(64**3);let seed=572919;for(let i=0;i<data.length;i++){seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;data[i]=seed>>>24;}
const noise=new T.Data3DTexture(data,64,64,64);noise.format=T.RedFormat;noise.minFilter=noise.magFilter=T.LinearFilter;noise.wrapS=noise.wrapT=noise.wrapR=T.RepeatWrapping;noise.needsUpdate=true;
const common={mistMapSize:{value:new T.Vector2(1200,850)},mistOrigin:{value:new T.Vector2()},mistWorldScale:{value:1},mistWind:{value:new T.Vector2(9.3969,3.4202)},mistTime:{value:22.033},mistNoise:{value:noise}};
const cache=createMistDensityCache(mistDensitySource,common),level={value:.1},scene=new T.Scene(),camera=new T.OrthographicCamera(-1,1,1,-1,0,1),geometry=new T.PlaneGeometry(2,2);
const vertexShader='varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}';
const original=new T.ShaderMaterial({uniforms:{...common,level},vertexShader,fragmentShader:mistDensitySource+'varying vec2 vUv;uniform float level;void main(){float d=mistAmbient(vUv*mistMapSize+mistOrigin,level)/2.3;gl_FragColor=vec4(d,d,d,1.0);}',toneMapped:false});
const cached=new T.ShaderMaterial({uniforms:{...common,...cache.uniforms,level},vertexShader,fragmentShader:mistDensitySource+mistCacheSampler+'varying vec2 vUv;uniform float level;void main(){float d=mistAmbientAt(vUv*mistMapSize+mistOrigin,level)/2.3;gl_FragColor=vec4(d,d,d,1.0);}',toneMapped:false});
const mesh=new T.Mesh(geometry,original);scene.add(mesh);const target=new T.WebGLRenderTarget(720,430,{depthBuffer:false,stencilBuffer:false}),a=new Uint8Array(720*430*4),b=a.slice(),results=[];
for(const wind of [.4,2])for(const height of [.03,.1,.25,.5,.8]){
 common.mistWind.value.set(Math.cos(.349)*wind*25,Math.sin(.349)*wind*25);level.value=height;cache.prepare(renderer,true);
 renderer.setRenderTarget(target);mesh.material=original;renderer.render(scene,camera);renderer.readRenderTargetPixels(target,0,0,720,430,a);
 mesh.material=cached;renderer.render(scene,camera);renderer.readRenderTargetPixels(target,0,0,720,430,b);
 const differences=[];let sum=0,squares=0,signal=0;for(let i=0;i<a.length;i+=4){const d=Math.abs(a[i]-b[i]);differences.push(d);sum+=d;squares+=d*d;signal+=a[i];}
 differences.sort((x,y)=>x-y);const count=differences.length;
 results.push({wind,height,meanAbsolutePercent:sum/count/255*100,rmsePercent:Math.sqrt(squares/count)/255*100,p99Percent:differences[Math.floor(count*.99)]/255*100,maxPercent:differences.at(-1)!/255*100,meanSignal:signal/count/255});
}
renderer.setRenderTarget(null);mesh.material=cached;level.value=.1;renderer.render(scene,camera);
(window as any).fieldQA={cache:cache.state,results};
