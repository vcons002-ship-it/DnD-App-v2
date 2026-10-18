import { afterEach, describe, expect, it, vi } from 'vitest';
import { config } from './config.js';
import { generateImage, listComfyModels } from './ai/comfy.js';
import { FLUX3_FILES } from './ai/flux3.js';
import { FLUX2_KLEIN_4B, FLUX2_KLEIN_9B, normalizeComfyWorkflow } from '../../shared/comfyPresets.js';

const original = { url: config.comfyUrl, model: config.comfyModel, workflow: config.comfyWorkflow };
afterEach(() => {
  config.comfyUrl = original.url; config.comfyModel = original.model; config.comfyWorkflow = original.workflow;
  vi.unstubAllGlobals();
});

/** Exercise the provider boundary: a posted graph must use the new model, not
 * merely a graph-builder unit test that the application could forget to call. */
function localService(missing = '') {
  let posted: Record<string, any> | undefined;
  const options: Record<string, Record<string, unknown>> = {
    UNETLoader: { unet_name: [[FLUX3_FILES.model, 'old-sdxl.safetensors']] },
    CLIPLoader: { clip_name: [[FLUX3_FILES.encoder, FLUX3_FILES.upsampler]] },
    VAELoader: { vae_name: [[FLUX3_FILES.vae]] },
  };
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith('/prompt')) {
      posted = JSON.parse(String(init?.body)).prompt;
      return Response.json({ error: { message: 'TEST: stop before GPU execution' } }, { status: 400 });
    }
    const node = url.split('/').pop()!;
    return Response.json(node === missing ? {} : { [node]: { input: { required: options[node] ?? {} } } });
  });
  vi.stubGlobal('fetch', fetcher);
  config.comfyUrl = 'http://local.test'; config.comfyWorkflow = ''; config.comfyModel = 'old-sdxl.safetensors';
  return { fetcher, graph: () => posted };
}

describe('native FLUX 3 local image provider', () => {
  it('posts native FLUX 3 with both encoders even when an old SD checkpoint was saved', async () => {
    const service = localService();
    expect(await listComfyModels()).toEqual([FLUX3_FILES.model]);
    await generateImage('Battle-ready knight, exactly four orthographic views.', { width: 2048, height: 2048, turnaround: true });
    const g = service.graph()!;
    expect(g['4'].inputs.unet_name).toBe(FLUX3_FILES.model);
    expect(g['12'].inputs).toEqual({ clip_name: FLUX3_FILES.encoder, type: 'flux3' });
    expect(g['20'].inputs).toEqual({ clip_name: FLUX3_FILES.upsampler, type: 'flux3' });
    expect(g['21'].inputs.prompt).toContain('exactly four orthographic views');
    expect(g['6'].inputs.text).toEqual(['21', 0]);
    expect(g['5'].inputs.width).toBe(2048);
    expect(g['3'].inputs).toMatchObject({ steps: 16, cfg: 1, sampler_name: 'euler', scheduler: 'simple' });
    expect(Object.values(g).some((n: any) => n.class_type === 'CheckpointLoaderSimple')).toBe(false);
  });

  it('reports missing native nodes without queuing an old-model fallback', async () => {
    const service = localService('TextGenerate');
    expect(await generateImage('a goblin')).toEqual({ error: expect.stringContaining('TextGenerate') });
    expect(service.graph()).toBeUndefined();
  });

  it('keeps a deliberate custom workflow override available', async () => {
    const service = localService();
    config.comfyWorkflow = '{"9":{"class_type":"SaveImage","inputs":{"filename_prefix":"%prompt%"}}}';
    await generateImage('custom');
    expect(service.graph()).toEqual({ '9': { class_type: 'SaveImage', inputs: { filename_prefix: 'custom' } } });
  });

  it('upgrades exact shipped Flux 2 presets, preserving edited workflows', async () => {
    for (const preset of [FLUX2_KLEIN_4B, FLUX2_KLEIN_9B]) {
      const service = localService();
      config.comfyWorkflow = preset;
      await generateImage('battle map');
      expect(service.graph()!['4'].inputs.unet_name).toBe(FLUX3_FILES.model);
    }
    const edited = FLUX2_KLEIN_4B.replace('"steps": 4', '"steps": 8');
    expect(normalizeComfyWorkflow(edited)).toBe(edited);
  });
});
