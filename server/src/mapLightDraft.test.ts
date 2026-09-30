import {it,expect,vi,afterEach} from 'vitest';
import fs from 'node:fs/promises';import path from 'node:path';import sharp from 'sharp';
import {config} from './config.js';import {createSession,createMap,getMap,updateMapEnvironment} from './sessions.js';import {editMapWalls} from './mapWalls.js';
import {generateApiImage} from './ai/imageGateway.js';import {suggestMapLights,applyLightDraft} from './mapLightDraft.js';
vi.mock('./ai/imageGateway.js',()=>({generateApiImage:vi.fn()}));
const oldKey=config.geminiApiKey;afterEach(()=>{config.geminiApiKey=oldKey;vi.resetAllMocks();});
async function fixture(){config.geminiApiKey='test';const session=createSession('Light draft'),name=`lights-${session.id}`;await fs.mkdir(config.uploadsDir,{recursive:true});await sharp({create:{width:400,height:300,channels:3,background:'#222'}}).png().toFile(path.join(config.uploadsDir,name+'.png'));await sharp(Buffer.from('<svg width="400" height="300"><rect width="400" height="300" fill="#222"/><circle cx="100" cy="75" r="5" fill="#ff00ff"/><circle cx="300" cy="225" r="5" fill="#ff00ff"/></svg>')).png().toFile(path.join(config.uploadsDir,name+'-mask.png'));vi.mocked(generateApiImage).mockResolvedValue({path:`/uploads/${name}-mask.png`});const map=createMap(session.id,{name:'Lights',imagePath:`/uploads/${name}.png`});return {session,map};}
it('uses a separate light-only image request; applying selected lights preserves walls and settings',async()=>{
 const f=await fixture();const draft=await suggestMapLights(f.map.id);expect(draft.lights).toHaveLength(2);expect(getMap(f.map.id)!.environment!.lights).toHaveLength(0);
 expect(vi.mocked(generateApiImage).mock.calls[0][0]).toContain('magenta');expect(vi.mocked(generateApiImage).mock.calls[0][2]?.[0].data.length).toBeGreaterThan(100);
 editMapWalls(f.session.id,f.map.id,{add:{id:'manual-wall',ax:20,ay:20,bx:20,by:200}});updateMapEnvironment(f.session.id,f.map.id,{mist:false,lightLevel:.2});
 draft.lights[0].visibleTorch=true;draft.lights[0].radiusFt=60;
 expect(await applyLightDraft(f.map.id,draft,[draft.lights[0].id])).toBe(1);const saved=getMap(f.map.id)!;
 expect(saved.walls![0].id).toBe('manual-wall');expect(saved.environment!.mist).toBe(false);expect(saved.environment!.lightLevel).toBe(.2);expect(saved.environment!.lights[0].visibleTorch).not.toBe(true);expect(saved.environment!.lights[0].radiusFt).toBe(20);
 await expect(applyLightDraft(f.map.id,draft,[draft.lights[0].id])).rejects.toThrow('changed');
});
it('skips already placed sources and does not change anything on generation failure',async()=>{
 const f=await fixture();updateMapEnvironment(f.session.id,f.map.id,{lights:[{id:'old',x:100,y:75,radiusFt:10,heightFt:5,color:'cool',intensity:.6,flicker:false}]});const draft=await suggestMapLights(f.map.id);expect(draft.lights).toHaveLength(1);await applyLightDraft(f.map.id,draft,[draft.lights[0].id]);expect(getMap(f.map.id)!.environment!.lights[0].id).toBe('old');
 vi.mocked(generateApiImage).mockResolvedValue({error:'API unavailable'});await expect(suggestMapLights(f.map.id)).rejects.toThrow('API unavailable');expect(getMap(f.map.id)!.environment!.lights).toHaveLength(2);
});
