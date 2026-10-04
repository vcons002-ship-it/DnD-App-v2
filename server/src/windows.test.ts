import {it,expect} from 'vitest';import sharp from 'sharp';
import {fitWindow} from '../../shared/windowGeometry.js';
import {sanitizeWalls,hasLineOfSight,stopAtWalls,wallVisibilityPolygon,type MapWall} from '../../shared/mapWalls.js';
import {windowsFromMask,WINDOW_MASK_PROMPT} from './windowMask.js';
import {createSession,createMap,getMap} from './sessions.js';
import {editMapWalls} from './mapWalls.js';
it('retains small windows and combines divided panes without joining separate windows',async()=>{
 const src=await sharp({create:{width:1536,height:1024,channels:3,background:'#222'}}).png().toBuffer();
 const pane=await sharp({create:{width:5,height:10,channels:3,background:'#0000ff'}}).png().toBuffer();
 const mask=await sharp(src).composite([100,107,160,167].map(left=>({input:pane,left,top:100}))).png().toBuffer();
 const windows=await windowsFromMask(mask,src,1536,1024,48);
 expect(windows.map(w=>[w.ax,w.ay,w.bx,w.by])).toEqual([[100,100,112,110],[160,100,172,110]]);
});
const solid:MapWall={id:'solid',kind:'rectangle',ax:100,ay:0,bx:130,by:300};
const marker:MapWall={id:'ai-window-1',kind:'rectangle',ax:120,ay:120,bx:140,by:160};
it('windows pass sight and light rays through the full wall but always block movement; removal restores sight blocking',()=>{
 const fit=fitWindow(marker,[solid],64);expect(fit.issue).toBeUndefined();const win=fit.wall!;
 const walls=sanitizeWalls([solid,win]),a={x:50,y:140},b={x:200,y:140};
 expect(walls[1].window).toBe(true);expect(hasLineOfSight(a,b,walls)).toBe(true);
 expect(hasLineOfSight({x:50,y:180},{x:200,y:180},walls)).toBe(false);
 expect(wallVisibilityPolygon(a,walls,300).some(p=>p.x>200&&Math.abs(p.y-140)<1)).toBe(true);
 expect(stopAtWalls(a,b,10,walls).x).toBeLessThanOrEqual(89.99);
 expect(hasLineOfSight(a,b,[win])).toBe(true);expect(stopAtWalls(a,b,10,[win]).x).toBeLessThan(100);
 expect(hasLineOfSight(a,b,walls.filter(w=>!w.window))).toBe(false);
});
it('saves independent windows, keeps their type during edits and removes only the requested window',()=>{
 const s=createSession('Windows'),m=createMap(s.id,{name:'Room'}),win=fitWindow(marker,[solid],64).wall!;
 editMapWalls(s.id,m.id,{add:solid});editMapWalls(s.id,m.id,{add:win});
 editMapWalls(s.id,m.id,{update:{...win,window:false}});
 expect(getMap(m.id)!.walls!.find(w=>w.id===win.id)!.window).toBe(true);
 editMapWalls(s.id,m.id,{removeId:win.id});expect(getMap(m.id)!.walls).toEqual([solid]);
});
it('extracts blue windows without treating blue art in the original as a new marker',async()=>{
 const src=await sharp({create:{width:400,height:300,channels:3,background:'#222'}}).composite([{input:await sharp({create:{width:15,height:25,channels:3,background:'#0000ff'}}).png().toBuffer(),left:200,top:100}]).png().toBuffer();
 const mask=await sharp(src).composite([{input:await sharp({create:{width:20,height:40,channels:3,background:'#0000ff'}}).png().toBuffer(),left:100,top:100}]).png().toBuffer();
 const windows=await windowsFromMask(mask,src,400,300,64);expect(windows).toHaveLength(1);expect(windows[0].ax).toBeLessThan(130);
 expect(await windowsFromMask(src,src,400,300,64)).toEqual([]);
 expect(WINDOW_MASK_PROMPT).toBe('Paint every visible window and viewing slit in this battle map solid blue (#0000FF), including windows shown on wall faces. Mark only windows actually shown. Keep the map unchanged otherwise.');
});
