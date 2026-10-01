import {detectLocalWalls,localWallOptions} from './localWallDraft.js';
import {describe,it,expect,vi,afterEach} from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {config} from './config.js';
import {createSession,createMap,getMap,updateMapGrid} from './sessions.js';
import {editMapWalls} from './mapWalls.js';
import {geometrySource,suggestMapGeometry,applyGeometryDraft} from './mapGeometryDraft.js';
import {parseGeometrySuggestions,draftWallRect,type MapGeometryDraft} from '../../shared/mapGeometryDraft.js';
import {generateApiImage} from './ai/imageGateway.js';
import * as wallMaskTools from './wallMask.js';
import {wallMaskStressFixture} from './testFixtures/wallMaskStress.js';
import {hasLineOfSight,stopAtWalls} from '../../shared/mapWalls.js';
vi.mock('./ai/imageGateway.js',()=>({generateApiImage:vi.fn()}));
afterEach(()=>vi.clearAllMocks());
const item={kind:'wall',label:'Partition',ax:.45,ay:.1,bx:.47,by:.8,heightFt:10,confidence:.9};
async function fixture(){
  const session=createSession('Draft'),name=`draft-${session.id}.png`;
  await fs.mkdir(config.uploadsDir,{recursive:true});
  await sharp({create:{width:1000,height:600,channels:3,background:'#777'}}).png().toFile(path.join(config.uploadsDir,name));
  const map=createMap(session.id,{name:'Map',imagePath:`/uploads/${name}`});
  const {source}=await geometrySource(map.id);
  const draft:MapGeometryDraft={version:1,id:'draft-test',source,items:parseGeometrySuggestions({items:[item,{...item,kind:'obstacle',heightFt:3}]})};
  return {session,map,draft};
}
describe('map geometry draft',()=>{
  it('keeps difficult gaps open through the normal draft and apply workflow',async()=>{
    const f=wallMaskStressFixture(),session=createSession('Narrow gap draft'),oldKey=config.geminiApiKey;
    const originalName=`stress-original-${session.id}.png`,maskName=`stress-mask-${session.id}.png`;
    await fs.mkdir(config.uploadsDir,{recursive:true});
    await sharp(f.original).png().toFile(path.join(config.uploadsDir,originalName));await sharp(f.mask).png().toFile(path.join(config.uploadsDir,maskName));
    const map=createMap(session.id,{name:'Narrow gaps',imagePath:`/uploads/${originalName}`});
    updateMapGrid(map.id,f.grid,5,f.width/f.grid*5);
    config.geminiApiKey='test-key';
    try{
      vi.mocked(generateApiImage).mockResolvedValue({path:`/uploads/${maskName}`});
      const draft=await suggestMapGeometry(map.id);await applyGeometryDraft(map.id,draft,draft.items.map(i=>i.id));
      const saved=getMap(map.id)!;expect(saved.imagePath).toBe(map.imagePath);
      for(const {name,a,b,radius} of f.routes){expect(hasLineOfSight(a,b,saved.walls),name).toBe(true);expect(stopAtWalls(a,b,radius,saved.walls),name).toEqual(b);}
      expect(generateApiImage).toHaveBeenCalledTimes(2);
    }finally{config.geminiApiKey=oldKey;}
  },15000);
  it('aligns normalized coordinates to image pixels and rejects unsafe geometry',()=>{
    expect(draftWallRect(parseGeometrySuggestions({items:[item]})[0],{width:1000,height:600} as any)).toEqual({ax:450,ay:60,bx:470,by:480});
    for(const bad of [{ax:-.1},{bx:2},{bx:.1},{heightFt:NaN},{confidence:2},{kind:'script'}])expect(()=>parseGeometrySuggestions({items:[{...item,...bad}]})).toThrow();
    expect(()=>parseGeometrySuggestions({items:Array(121).fill(item)})).toThrow();
  });
  it('preserves a circular room hole through AI mask review, normalized JSON and saved walls',async()=>{
    const f=await fixture(),oldKey=config.geminiApiKey;config.geminiApiKey='test-key';
    try{
      const name=`round-mask-${f.map.id}.png`;
      await sharp(Buffer.from('<svg width="1000" height="600"><rect width="1000" height="600" fill="#222"/><circle cx="500" cy="300" r="170" fill="none" stroke="#ffff00" stroke-width="22"/></svg>')).png().toFile(path.join(config.uploadsDir,name));
      vi.mocked(generateApiImage).mockResolvedValue({path:`/uploads/${name}`});
      const draft=await suggestMapGeometry(f.map.id);
      expect(draft.items).toHaveLength(1);expect(draft.items[0].shape).toBe('polygon');expect(draft.items[0].holes).toHaveLength(1);
      await applyGeometryDraft(f.map.id,JSON.parse(JSON.stringify(draft)),draft.items.map(i=>i.id));
      const walls=getMap(f.map.id)!.walls!;
      expect(stopAtWalls({x:440,y:300},{x:560,y:300},10,walls)).toEqual({x:560,y:300});
      expect(hasLineOfSight({x:500,y:300},{x:800,y:300},walls)).toBe(false);
    }finally{config.geminiApiKey=oldKey;}
  });
  it('uses the accepted image-edit prompt and converts yellow pixels without changing the map',async()=>{
    const f=await fixture(),oldKey=config.geminiApiKey;config.geminiApiKey='test-key';
    try {
      const name=`mask-${f.map.id}.png`;
      await sharp(Buffer.from('<svg width="1000" height="600"><rect width="1000" height="600" fill="#222"/><rect x="450" y="60" width="20" height="420" fill="#ffff00"/></svg>')).png().toFile(path.join(config.uploadsDir,name));
      vi.mocked(generateApiImage).mockResolvedValueOnce({path:f.map.imagePath!}).mockResolvedValueOnce({path:f.map.imagePath!}).mockResolvedValue({path:`/uploads/${name}`});
      const draft=await suggestMapGeometry(f.map.id);
      expect(draft.items.length).toBeGreaterThan(0);expect(draft.maskCoverage).toBeGreaterThan(.94);
      expect(draft.maskImagePath).toBe(`/uploads/${name}`);expect(getMap(f.map.id)!.walls).toEqual([]);expect(getMap(f.map.id)!.imagePath).toBe(f.map.imagePath);
      const [prompt,,references]=vi.mocked(generateApiImage).mock.calls[0];
      expect(generateApiImage).toHaveBeenCalledTimes(4);expect(vi.mocked(generateApiImage).mock.calls[2][0]).toContain('solid opaque yellow bands');
      expect(prompt).toContain('TOP CAPS');expect(prompt).toContain('Leave doors and open passages unpainted');
      expect(prompt).not.toContain('cave');expect(prompt).not.toContain('pillar');
      expect(references?.[0].mimeType).toBe('image/png');expect(Buffer.from(references![0].data,'base64').length).toBeGreaterThan(100);
      await applyGeometryDraft(f.map.id,draft,draft.items.map(i=>i.id));expect(getMap(f.map.id)!.walls!.length).toBe(draft.items.length);
    } finally {config.geminiApiKey=oldKey;}
  });
  it('fails without applying walls if the image API fails',async()=>{
    const f=await fixture(),oldKey=config.geminiApiKey;config.geminiApiKey='test-key';
    try {vi.mocked(generateApiImage).mockResolvedValue({error:'Image request failed'});await expect(suggestMapGeometry(f.map.id)).rejects.toThrow('Image request failed');expect(getMap(f.map.id)!.walls).toEqual([]);}
    finally {config.geminiApiKey=oldKey;}
  });
  it('feeds the structural mask to a separate natural pass and retains both raw images',async()=>{
    const f=await fixture(),oldKey=config.geminiApiKey;config.geminiApiKey='test-key';
    try{
      const firstName=`structural-${f.map.id}.png`,secondName=`natural-${f.map.id}.png`;
      const structural=await sharp(Buffer.from('<svg width="1000" height="600"><rect width="1000" height="600" fill="#222"/><rect x="100" y="60" width="20" height="420" fill="#ffff00"/></svg>')).png().toBuffer();
      await fs.writeFile(path.join(config.uploadsDir,firstName),structural);
      await sharp(Buffer.from('<svg width="1000" height="600"><rect width="1000" height="600" fill="#222"/><circle cx="700" cy="300" r="120" fill="none" stroke="#00ff00" stroke-width="20"/></svg>')).png().toFile(path.join(config.uploadsDir,secondName));
      vi.mocked(generateApiImage).mockResolvedValueOnce({path:`/uploads/${firstName}`}).mockResolvedValueOnce({path:`/uploads/${secondName}`});
      const draft=await suggestMapGeometry(f.map.id),reference=await sharp(structural).resize({width:2048,height:2048,fit:'inside',withoutEnlargement:true}).png().toBuffer();
      expect(vi.mocked(generateApiImage).mock.calls[1][0]).toContain('SECOND pass');expect(vi.mocked(generateApiImage).mock.calls[1][2]).toEqual([{mimeType:'image/png',data:reference.toString('base64')}]);
      expect(draft.wallMaskImagePath).toBe(`/uploads/${firstName}`);expect(draft.naturalMaskImagePath).toBe(`/uploads/${secondName}`);expect(draft.maskImagePath).toContain('wall-union-');expect(draft.items).toHaveLength(2);
      expect(getMap(f.map.id)!.walls).toEqual([]);await applyGeometryDraft(f.map.id,draft,draft.items.map(i=>i.id));
      expect(hasLineOfSight({x:70,y:200},{x:160,y:200},getMap(f.map.id)!.walls)).toBe(false);expect(hasLineOfSight({x:700,y:300},{x:900,y:300},getMap(f.map.id)!.walls)).toBe(false);
      // Some real unions fail contour validation even when the two masks fit
      // separately. Force that failure, then use the real converter for both.
      const conversion=vi.spyOn(wallMaskTools,'wallsFromYellowMask').mockRejectedValueOnce(new Error('Mask fails contour validation'));
      try{
        vi.mocked(generateApiImage).mockResolvedValueOnce({path:`/uploads/${firstName}`}).mockResolvedValueOnce({path:`/uploads/${secondName}`});
        const fallback=await suggestMapGeometry(f.map.id);
        expect(fallback.items).toHaveLength(2);expect(fallback.maskImagePath).toContain('wall-union-');expect(fallback.maskWarnings).toEqual([]);
      }finally{conversion.mockRestore();}
    }finally{config.geminiApiKey=oldKey;}
  });
  it('supports cave-only art with no yellow masonry in the first response',async()=>{
    const f=await fixture(),oldKey=config.geminiApiKey;config.geminiApiKey='test-key';
    try{
      const name=`cave-only-${f.map.id}.png`;await sharp(Buffer.from('<svg width="1000" height="600"><rect width="1000" height="600" fill="#777"/><circle cx="500" cy="300" r="170" fill="none" stroke="#00ff00" stroke-width="20"/></svg>')).png().toFile(path.join(config.uploadsDir,name));
      vi.mocked(generateApiImage).mockResolvedValueOnce({path:f.map.imagePath!}).mockResolvedValueOnce({path:`/uploads/${name}`});
      const draft=await suggestMapGeometry(f.map.id);expect(draft.items).toHaveLength(1);expect(generateApiImage).toHaveBeenCalledTimes(2);
    }finally{config.geminiApiKey=oldKey;}
  });
  it('retains structural walls with a visible warning when the natural pass fails, and allows opting out',async()=>{
    const f=await fixture(),oldKey=config.geminiApiKey;config.geminiApiKey='test-key';
    try{
      const name=`fallback-${f.map.id}.png`;await sharp(Buffer.from('<svg width="1000" height="600"><rect width="1000" height="600" fill="#222"/><rect x="450" y="60" width="20" height="420" fill="#ffff00"/></svg>')).png().toFile(path.join(config.uploadsDir,name));
      vi.mocked(generateApiImage).mockResolvedValueOnce({path:`/uploads/${name}`}).mockResolvedValueOnce({error:'API connection failed'});
      const draft=await suggestMapGeometry(f.map.id);expect(draft.items).toHaveLength(1);expect(draft.maskWarnings?.[0]).toContain('API connection failed');expect(draft.maskImagePath).toBe(draft.wallMaskImagePath);expect(getMap(f.map.id)!.walls).toEqual([]);
      vi.clearAllMocks();vi.mocked(generateApiImage).mockResolvedValue({path:`/uploads/${name}`});const wallsOnly=await suggestMapGeometry(f.map.id,'ai',{naturalBoundaries:false});expect(generateApiImage).toHaveBeenCalledTimes(1);expect(wallsOnly.naturalMaskImagePath).toBeUndefined();
    }finally{config.geminiApiKey=oldKey;}
  });
  it('applies only reviewed walls, preserves prior walls and rejects stale or repeated application',async()=>{
    const f=await fixture();editMapWalls(f.session.id,f.map.id,{add:{id:'manual',ax:10,ay:10,bx:10,by:100}});
    f.draft.source=(await geometrySource(f.map.id)).source;
    expect(await applyGeometryDraft(f.map.id,f.draft,['item-0'])).toBe(1);
    const walls=getMap(f.map.id)!.walls!;expect(walls).toHaveLength(2);expect(walls[0].id).toBe('manual');expect(walls[1].ax).toBe(450);
    await expect(applyGeometryDraft(f.map.id,f.draft,['item-0'])).rejects.toThrow('changed');
    expect(getMap(f.map.id)!.walls).toHaveLength(2);
  });
  it('does not turn obstacle height estimates into full-height barriers',async()=>{
    const f=await fixture();await expect(applyGeometryDraft(f.map.id,f.draft,['item-1'])).rejects.toThrow('Select wall');
    expect(getMap(f.map.id)!.walls).toEqual([]);
  });
  it('rejects changed image/grid metadata and wrong-map drafts',async()=>{
    const f=await fixture();f.draft.source.gridSizePx+=1;
    await expect(applyGeometryDraft(f.map.id,f.draft,['item-0'])).rejects.toThrow('changed');
    expect(getMap(f.map.id)!.walls).toEqual([]);
  });
});


describe('local contrast wall draft',()=>{
 it('finds a simple thick partition but preserves a doorway and open floor without calling AI',async()=>{
  const image=await sharp(Buffer.from('<svg width="400" height="300"><rect width="400" height="300" fill="white"/><path d="M190 20H210V120H190ZM190 180H210V280H190Z" fill="black"/></svg>')).png().toBuffer();
  const result=await detectLocalWalls(image,400,40,localWallOptions({threshold:90}));
  expect(result.length).toBeGreaterThan(0);
  const inside=(x:number,y:number)=>result.some(r=>x/400>=r.ax&&x/400<=r.bx&&y/300>=r.ay&&y/300<=r.by);
  expect(inside(200,70)).toBe(true);expect(inside(200,230)).toBe(true);
  expect(inside(200,150)).toBe(false);expect(inside(100,150)).toBe(false);
  expect(generateApiImage).not.toHaveBeenCalled();
 });
 it('handles light walls and refuses invalid local settings',async()=>{
  const image=await sharp(Buffer.from('<svg width="400" height="300"><rect width="400" height="300" fill="black"/><rect x="50" y="40" width="280" height="15" fill="white"/></svg>')).png().toBuffer();
  expect((await detectLocalWalls(image,400,40,localWallOptions({polarity:'light',threshold:160}))).length).toBeGreaterThan(0);
  expect(()=>localWallOptions({threshold:NaN})).toThrow();
 });
});
