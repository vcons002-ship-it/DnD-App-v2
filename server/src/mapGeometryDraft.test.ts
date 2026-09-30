import {detectLocalWalls,localWallOptions} from './localWallDraft.js';
import {describe,it,expect,vi,afterEach} from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {config} from './config.js';
import {createSession,createMap,getMap} from './sessions.js';
import {editMapWalls} from './mapWalls.js';
import {geometrySource,suggestMapGeometry,applyGeometryDraft} from './mapGeometryDraft.js';
import {parseGeometrySuggestions,draftWallRect,type MapGeometryDraft} from '../../shared/mapGeometryDraft.js';
import {generateJson} from './ai/gateway.js';
vi.mock('./ai/gateway.js',()=>({generateJson:vi.fn()}));
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
  it('aligns normalized coordinates to image pixels and rejects unsafe geometry',()=>{
    expect(draftWallRect(parseGeometrySuggestions({items:[item]})[0],{width:1000,height:600} as any)).toEqual({ax:450,ay:60,bx:470,by:480});
    for(const bad of [{ax:-.1},{bx:2},{bx:.1},{heightFt:NaN},{confidence:2},{kind:'script'}])expect(()=>parseGeometrySuggestions({items:[{...item,...bad}]})).toThrow();
    expect(()=>parseGeometrySuggestions({items:Array(121).fill(item)})).toThrow();
  });
  it('sends actual image data and grid metadata; analysis never changes saved walls',async()=>{
    const f=await fixture();vi.mocked(generateJson).mockResolvedValue(JSON.stringify({items:[item]}));
    const draft=await suggestMapGeometry(f.map.id);
    expect(draft.items).toHaveLength(1);expect(getMap(f.map.id)!.walls).toEqual([]);
    const [prompt,opts]=vi.mocked(generateJson).mock.calls[0];
    expect(prompt).toContain('gridOffsetX');expect(opts?.images?.[0].mimeType).toBe('image/png');
    expect(Buffer.from(opts!.images![0].data,'base64').length).toBeGreaterThan(100);
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
  expect(generateJson).not.toHaveBeenCalled();
 });
 it('handles light walls and refuses invalid local settings',async()=>{
  const image=await sharp(Buffer.from('<svg width="400" height="300"><rect width="400" height="300" fill="black"/><rect x="50" y="40" width="280" height="15" fill="white"/></svg>')).png().toBuffer();
  expect((await detectLocalWalls(image,400,40,localWallOptions({polarity:'light',threshold:160}))).length).toBeGreaterThan(0);
  expect(()=>localWallOptions({threshold:NaN})).toThrow();
 });
});
