type Listener=()=>void;
/** One decoder per video URL, shared by Konva and the darkvision shader.
 * Video frames invalidate paint only; they never rebuild sight or exploration. */
type Media={video:HTMLVideoElement;ready:boolean;failed:boolean;frames:number;users:number;listeners:Set<Listener>;frameListeners:Set<Listener>;stop:()=>void};
const media=new Map<string,Media>();
export function acquireAnimatedMap(url:string){
 let entry=media.get(url);
 if(!entry){
  const video=document.createElement('video');video.muted=true;video.loop=true;video.playsInline=true;video.preload='auto';video.crossOrigin='anonymous';
  video.dataset.testid='animated-map-video';
  video.style.cssText='position:fixed;left:-4px;top:-4px;width:1px;height:1px;pointer-events:none';video.setAttribute('aria-hidden','true');
  entry={video,ready:false,failed:false,frames:0,users:0,listeners:new Set(),frameListeners:new Set(),stop:()=>{}};
  const e=entry;let alive=true,frame=0,raf=0,last=-Infinity,lastTime=-1;
  const state=()=>{for(const f of e.listeners)f();};
  const paint=(now:number)=>{if(now-last<30)return;last=now;e.frames++;for(const f of e.frameListeners)f();};
  const next=(now:number)=>{if(!alive)return;paint(now);frame=video.requestVideoFrameCallback(next);};
  const fallback=(now:number)=>{if(!alive)return;if(video.currentTime!==lastTime){lastTime=video.currentTime;paint(now);}raf=requestAnimationFrame(fallback);};
  const play=()=>{if(!document.hidden&&!e.failed)void video.play().catch(()=>{/* Still poster until a user gesture allows playback. */});else video.pause();};
  video.addEventListener('loadeddata',()=>{if(!alive)return;e.ready=true;state();play();});
  video.addEventListener('error',()=>{e.failed=true;video.pause();state();});
  document.addEventListener('visibilitychange',play);window.addEventListener('pointerdown',play);
  document.body.append(video);video.src=url;
  if(typeof video.requestVideoFrameCallback==='function')frame=video.requestVideoFrameCallback(next);else raf=requestAnimationFrame(fallback);
  e.stop=()=>{alive=false;if(frame)video.cancelVideoFrameCallback(frame);cancelAnimationFrame(raf);document.removeEventListener('visibilitychange',play);window.removeEventListener('pointerdown',play);video.pause();video.removeAttribute('src');video.load();video.remove();};
  media.set(url,e);play();
 }
 entry.users++;const e=entry;let released=false;
 return {entry:e,release(){if(released)return;released=true;if(--e.users===0){e.stop();media.delete(url);}}};
}
