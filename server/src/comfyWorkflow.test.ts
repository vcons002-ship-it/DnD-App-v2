import { describe, it, expect } from 'vitest';
import {
  applyWorkflowTemplate,
  bestModelMatch,
  frameMapPrompt,
  injectMapLora,
  DEFAULT_MAP_STYLE,
} from './ai/comfy.js';

// A map LoRA is spliced into the graph at generate time (no DM JSON editing),
// and skips cleanly when the graph has no clear model node.
describe('injectMapLora', () => {
  // A Flux-style graph: UNETLoader (node 4) → KSampler (node 3) model input.
  const fluxGraph = () => ({
    '3': { class_type: 'KSampler', inputs: { model: ['4', 0], seed: 1 } },
    '4': { class_type: 'UNETLoader', inputs: { unet_name: 'flux-2-klein-4b-fp8.safetensors' } },
    '6': { class_type: 'CLIPTextEncode', inputs: { text: 'x', clip: ['12', 0] } },
  });

  it('inserts a LoraLoaderModelOnly and rewires the sampler through it', () => {
    const g = fluxGraph() as Record<string, any>;
    expect(injectMapLora(g, 'mapcraft.safetensors', 0.9)).toBe(true);
    // The sampler now reads the model from the new LoRA node…
    const loraId = g['3'].inputs.model[0];
    expect(loraId).not.toBe('4');
    // …and the LoRA node takes the original producer as its own input.
    expect(g[loraId].class_type).toBe('LoraLoaderModelOnly');
    expect(g[loraId].inputs.model).toEqual(['4', 0]);
    expect(g[loraId].inputs.lora_name).toBe('mapcraft.safetensors');
    expect(g[loraId].inputs.strength_model).toBe(0.9);
  });

  it('honours a custom loader node class + strength (e.g. a DoRA loader)', () => {
    const g = fluxGraph() as Record<string, any>;
    injectMapLora(g, 'flux-dora.safetensors', 0.75, 'DoraLoaderModelOnly');
    const loraId = g['3'].inputs.model[0];
    expect(g[loraId].class_type).toBe('DoraLoaderModelOnly');
    expect(g[loraId].inputs.strength_model).toBe(0.75);
  });

  it('does NOT rewire a clip link (only the model output, slot 0)', () => {
    const g = fluxGraph() as Record<string, any>;
    injectMapLora(g, 'mapcraft.safetensors');
    expect(g['6'].inputs.clip).toEqual(['12', 0]); // untouched
  });

  it('skips (returns false) when there is no model-producer node', () => {
    const g = { '3': { class_type: 'KSampler', inputs: { model: ['99', 0] } } } as Record<string, any>;
    expect(injectMapLora(g, 'mapcraft.safetensors')).toBe(false);
    expect(g['__map_lora']).toBeUndefined();
  });
});

// Map prompts get wrapped in top-down framing so base models don't render a scene.
describe('frameMapPrompt', () => {
  it('substitutes the description into the built-in {prompt} frame when no style is set', () => {
    const out = frameMapPrompt('a ruined forest temple');
    expect(out).toContain('a ruined forest temple');
    expect(out).toContain('top-down');
    expect(out).not.toContain('{prompt}'); // placeholder consumed
    expect(out).toBe(DEFAULT_MAP_STYLE.replace('{prompt}', 'a ruined forest temple'));
  });

  it('honours a custom style with a {prompt} placeholder (e.g. a LoRA trigger word)', () => {
    const out = frameMapPrompt('a tavern', 'mapcraft, top-down map of {prompt}, gridless');
    expect(out).toBe('mapcraft, top-down map of a tavern, gridless');
  });

  it('appends a custom style that has no placeholder', () => {
    expect(frameMapPrompt('a cave', 'overhead battle map')).toBe('a cave, overhead battle map');
  });

  it('falls back to the default when the style is blank/whitespace', () => {
    expect(frameMapPrompt('a cave', '   ')).toBe(DEFAULT_MAP_STYLE.replace('{prompt}', 'a cave'));
  });
});

// Loader filenames must match ComfyUI's installed list exactly, so the app
// auto-matches safe variants (an added -fp8 suffix) but NEVER a loose guess that
// would pair the wrong model + text encoder.
describe('bestModelMatch', () => {
  const installed = [
    'flux-2-klein-4b-fp8.safetensors',
    'flux-2-klein-9b-fp8.safetensors',
    'qwen_image_fp8_e4m3fn.safetensors',
  ];

  it('returns the exact name when installed', () => {
    expect(bestModelMatch('flux-2-klein-4b-fp8.safetensors', installed)).toBe(
      'flux-2-klein-4b-fp8.safetensors',
    );
  });

  it('matches a name whose install adds an -fp8 suffix', () => {
    expect(bestModelMatch('flux-2-klein-4b.safetensors', installed)).toBe(
      'flux-2-klein-4b-fp8.safetensors',
    );
  });

  it('does NOT cross-match a different size (4b must never become 9b)', () => {
    // 'qwen_3_4b' shares no stem with the installed 9b/qwen_image files.
    expect(bestModelMatch('qwen_3_4b.safetensors', installed)).toBeNull();
    // '…-4b' must not resolve to the '…-9b' install.
    expect(bestModelMatch('flux-2-klein-99b.safetensors', ['flux-2-klein-9b-fp8.safetensors'])).toBeNull();
  });

  it('returns null when nothing is close', () => {
    expect(bestModelMatch('totally-different.safetensors', installed)).toBeNull();
  });
});

// The custom-workflow template lets a DM run any ComfyUI graph (Flux, SD3, etc.)
// by substituting placeholders. The substitution must keep the JSON valid even
// when the prompt contains characters that would otherwise break it.
describe('applyWorkflowTemplate', () => {
  const vars = { prompt: 'a goblin', negative: 'blurry', width: 768, height: 512, seed: 42 };

  it('substitutes string + numeric placeholders into a valid graph', () => {
    // Numeric placeholders are written UNQUOTED so they land as real numbers;
    // string placeholders sit inside quotes.
    const tmpl = `{
      "6": { "class_type": "CLIPTextEncode", "inputs": { "text": "%prompt%" } },
      "7": { "class_type": "CLIPTextEncode", "inputs": { "text": "%negative%" } },
      "5": { "class_type": "EmptyLatentImage", "inputs": { "width": %width%, "height": %height% } },
      "3": { "class_type": "KSampler", "inputs": { "seed": %seed% } }
    }`;
    const g = applyWorkflowTemplate(tmpl, vars) as any;
    expect(g['6'].inputs.text).toBe('a goblin');
    expect(g['7'].inputs.text).toBe('blurry');
    // Numeric placeholders drop in bare → real numbers, not strings.
    expect(g['5'].inputs.width).toBe(768);
    expect(g['5'].inputs.height).toBe(512);
    expect(g['3'].inputs.seed).toBe(42);
  });

  it('JSON-escapes a prompt containing quotes/backslashes so the JSON stays valid', () => {
    const tmpl = '{ "6": { "inputs": { "text": "%prompt%" } } }';
    const g = applyWorkflowTemplate(tmpl, {
      ...vars,
      prompt: 'a "fancy" sword \\ shield, 50% off',
    }) as any;
    expect(g['6'].inputs.text).toBe('a "fancy" sword \\ shield, 50% off');
  });

  it('returns null on a template that is not valid JSON after substitution', () => {
    expect(applyWorkflowTemplate('{ not json', vars)).toBeNull();
  });

  it('round-trips a real Flux.2 Klein graph (unquoted numerics, empty negative)', () => {
    const flux = `{
      "3": { "class_type": "KSampler", "inputs": {
          "seed": %seed%, "steps": 4, "cfg": 1,
          "sampler_name": "euler", "scheduler": "simple", "denoise": 1,
          "model": ["4", 0], "positive": ["6", 0], "negative": ["7", 0], "latent_image": ["5", 0] } },
      "4": { "class_type": "UNETLoader", "inputs": { "unet_name": "flux-2-klein-4b.safetensors", "weight_dtype": "default" } },
      "6": { "class_type": "CLIPTextEncode", "inputs": { "text": "%prompt%", "clip": ["12", 0] } },
      "7": { "class_type": "CLIPTextEncode", "inputs": { "text": "", "clip": ["12", 0] } },
      "5": { "class_type": "EmptyFlux2LatentImage", "inputs": { "width": %width%, "height": %height%, "batch_size": 1 } }
    }`;
    const g = applyWorkflowTemplate(flux, { ...vars, prompt: 'goblin warlord' }) as any;
    expect(g['3'].inputs.seed).toBe(42);
    expect(g['3'].inputs.steps).toBe(4); // untouched literal
    expect(g['4'].inputs.unet_name).toBe('flux-2-klein-4b.safetensors');
    expect(g['5'].inputs.width).toBe(768);
    expect(g['6'].inputs.text).toBe('goblin warlord');
    expect(g['7'].inputs.text).toBe(''); // empty negative preserved
  });
});
