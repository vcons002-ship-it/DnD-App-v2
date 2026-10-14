import {describe,it,expect} from 'vitest';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {mapVideoPoster,isMapVideo} from './mapMedia.js';
import {createSession,createMap,getMap,setActiveMap,addMapImage,listMapImages} from './sessions.js';
import {buildSnapshot} from './visibility.js';
import {exportSession,importSession} from './backup.js';

describe('animated map media',()=>{
 it('keeps posters and videos in saved maps, tiles, snapshots and portable imports',()=>{
  const session=createSession('Animated'),map=createMap(session.id,{name:'Temple',imagePath:'/uploads/temple.jpg',videoPath:'/uploads/temple.mp4'});
  setActiveMap(session.id,map.id);
  addMapImage(session.id,{mapId:map.id,imagePath:'/uploads/river.jpg',videoPath:'/uploads/river.webm',x:1920,y:0,w:600,h:400});
  expect(getMap(map.id)?.videoPath).toBe('/uploads/temple.mp4');
  expect(listMapImages(map.id)[0].videoPath).toBe('/uploads/river.webm');
  for(const role of ['dm','player'] as const){const snap=buildSnapshot(session.id,role)!;expect(snap.map?.videoPath).toBe('/uploads/temple.mp4');expect(snap.mapImages[0].videoPath).toBe('/uploads/river.webm');}
  const bundle=exportSession(session.code)!;
  expect(bundle.maps[0].video_path).toBe('/uploads/temple.mp4');
  expect(bundle.mapImages[0].video_path).toBe('/uploads/river.webm');
  // Old campaigns without a video are unchanged, and optional columns survive import.
  const result=importSession(bundle);
  expect(result).toBeTruthy();
  expect(createMap(session.id,{name:'Static',imagePath:'/uploads/plain.png'}).videoPath).toBeNull();
 });
 it('accepts only known video extensions and media types',()=>{
  expect(isMapVideo('map.MP4','video/mp4')).toBe(true);expect(isMapVideo('map.webm','video/webm')).toBe(true);
  expect(isMapVideo('map.svg','video/mp4')).toBe(false);expect(isMapVideo('map.mp4','text/html')).toBe(false);
 });
 it('extracts a real video poster and rejects invalid video bytes',async()=>{
  const dir=await fs.mkdtemp(path.join(tmpdir(),'map-video-unit-')),video=path.join(dir,'test.mp4'),poster=path.join(dir,'poster.jpg');
  const ffmpeg=createRequire(import.meta.url)('ffmpeg-static') as string;
  const made=spawnSync(ffmpeg,['-v','error','-f','lavfi','-i','color=c=green:s=160x90:r=10','-t','0.2','-c:v','libx264','-pix_fmt','yuv420p','-y',video],{windowsHide:true});
  expect(made.status).toBe(0);
  const dimensions=await mapVideoPoster(video,poster);expect(dimensions.width/dimensions.height).toBeCloseTo(16/9,1);
  expect((await fs.stat(poster)).size).toBeGreaterThan(100);
  const invalid=path.join(dir,'bad.mp4');await fs.writeFile(invalid,'not a video');
  await expect(mapVideoPoster(invalid,path.join(dir,'bad.jpg'))).rejects.toThrow('Could not read');
 },30000);
});
