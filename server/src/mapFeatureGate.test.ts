import {it,expect,vi,beforeEach} from 'vitest';
import sharp from 'sharp';
import {listOllamaModels,ollamaChat} from './ai/ollama.js';
import {gateMapFeature,gateWindowRegions,resetMapGateModelCache} from './mapFeatureGate.js';
vi.mock('./ai/ollama.js',()=>({listOllamaModels:vi.fn(),ollamaChat:vi.fn()}));
beforeEach(()=>{vi.clearAllMocks();resetMapGateModelCache();vi.mocked(listOllamaModels).mockResolvedValue(['qwen3.8:27b-q4_K_M']);});
const image=()=>sharp({create:{width:400,height:300,channels:3,background:'#333333'}}).png().toBuffer();
it('uses the whole map once per non-window feature and skips only a clear no',async()=>{
 vi.mocked(ollamaChat).mockResolvedValue('No.');
 const result=await gateMapFeature(await image(),'doors');expect(result.allowed).toBe(false);
 const call=vi.mocked(ollamaChat).mock.calls[0];expect(call[1]).toContain('overhead/isometric battle map?');
 expect(await sharp(Buffer.from(call[2]!.images![0],'base64')).metadata()).toMatchObject({width:400,height:300});
 expect(ollamaChat).toHaveBeenCalledTimes(1);
});
it('falls through to the image API when local inference fails or is ambiguous',async()=>{
 for(const answer of [null,'Maybe','No, but I am not sure','Yes']){vi.mocked(ollamaChat).mockResolvedValue(answer);expect((await gateMapFeature(await image(),'walls')).allowed).toBe(true);}
 resetMapGateModelCache();vi.mocked(listOllamaModels).mockResolvedValue([]);expect((await gateMapFeature(await image(),'lights')).decision).toBe('fallback');
});
it('checks four context-padded quadrants and masks only positive window quadrants',async()=>{
 vi.mocked(ollamaChat).mockResolvedValueOnce('yes').mockResolvedValueOnce('no').mockResolvedValueOnce('no').mockResolvedValueOnce('yes');
 const result=await gateWindowRegions(await image(),400,300);expect(result.regions).toEqual([{ax:0,ay:0,bx:.5,by:.5},{ax:.5,ay:.5,bx:1,by:1}]);
 expect(ollamaChat).toHaveBeenCalledTimes(4);
 expect(await sharp(Buffer.from(vi.mocked(ollamaChat).mock.calls[0][2]!.images![0],'base64')).metadata()).toMatchObject({width:216,height:162});
});
it('intersects positive quadrants with DM-selected regions instead of expanding API scope',async()=>{
 vi.mocked(ollamaChat).mockResolvedValue('yes');
 const result=await gateWindowRegions(await image(),400,300,[{ax:.4,ay:.1,bx:.6,by:.3}]);
 expect(result.regions).toEqual([{ax:.4,ay:.1,bx:.5,by:.3},{ax:.5,ay:.1,bx:.6,by:.3}]);expect(ollamaChat).toHaveBeenCalledTimes(2);
});
