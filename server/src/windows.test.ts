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
it('fits a horizontal painted window across a gap using wall faces, not perpendicular endcaps',()=>{
 const walls:MapWall[]=[{id:'left',kind:'rectangle',ax:0,ay:100,bx:100,by:130},{id:'right',kind:'rectangle',ax:140,ay:100,bx:300,by:130}];
 const fit=fitWindow({id:'gap',ax:102,ay:120,bx:138,by:132},walls,48);
 expect(fit.issue).toBeUndefined();const win=fit.wall!;
 expect(win.bx-win.ax).toBeCloseTo(36);expect(win.by-win.ay).toBeLessThan(48);
 expect(win.ay).toBeLessThanOrEqual(100);expect(win.by).toBeGreaterThanOrEqual(130);
 expect(hasLineOfSight({x:120,y:50},{x:120,y:180},[...walls,win])).toBe(true);
 expect(stopAtWalls({x:120,y:50},{x:120,y:180},1,[...walls,win]).y).toBeLessThan(100);
});
it('groups panes separated by a substantial frame without combining nearby distinct windows',async()=>{
 const src=await sharp({create:{width:300,height:200,channels:3,background:'#222'}}).png().toBuffer();
 const pane=await sharp({create:{width:15,height:6,channels:3,background:'#0000ff'}}).png().toBuffer();
 const mask=await sharp(src).composite([100,127].flatMap(top=>[100,118,170,188].map(left=>({input:pane,left,top})))).png().toBuffer();
 const windows=await windowsFromMask(mask,src,300,200,48);
 expect(windows.map(w=>[w.ax,w.ay,w.bx,w.by])).toEqual([[100,100,133,133],[170,100,203,133]]);
});
it('fits a curved wall locally without cutting its opposite side',()=>{
 const circle:MapWall={id:'round-room',kind:'circle',ax:50,ay:50,bx:150,by:150,thickness:10};
 const fit=fitWindow({id:'round-window',kind:'rectangle',ax:145,ay:90,bx:158,by:110},[circle],64);
 expect(fit.issue).toBeUndefined();const walls=[circle,fit.wall!];
 expect(fit.wall!.bx-fit.wall!.ax).toBeLessThan(20);
 expect(hasLineOfSight({x:100,y:100},{x:180,y:100},walls)).toBe(true);
 expect(hasLineOfSight({x:100,y:100},{x:20,y:100},walls)).toBe(false);
 expect(stopAtWalls({x:100,y:100},{x:180,y:100},1,walls).x).toBeLessThan(155);
});
it('follows an angled wall face and retains its movement barrier',()=>{
 const angled:MapWall={id:'angled',kind:'rectangle',ax:0,ay:90,bx:200,by:110,rotation:30};
 const fit=fitWindow({id:'angled-window',kind:'rectangle',ax:86,ay:90,bx:114,by:110},[angled],64);
 expect(fit.issue).toBeUndefined();const win=fit.wall!,edge={x:win.points![1].x-win.points![0].x,y:win.points![1].y-win.points![0].y};
 expect(Math.abs(edge.y/edge.x)).toBeCloseTo(Math.tan(Math.PI/6));
 const a={x:75,y:143.3},b={x:125,y:56.7};
 expect(hasLineOfSight(a,b,[angled,win])).toBe(true);expect(stopAtWalls(a,b,1,[angled,win])).not.toEqual(b);
});
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
 expect(WINDOW_MASK_PROMPT).toBe('Paint every visible window and viewing slit in this battle map solid blue (#0000FF). Mark only windows actually shown. Keep the map unchanged otherwise.');
});
