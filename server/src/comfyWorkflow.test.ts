import { describe, it, expect } from 'vitest';
import { applyWorkflowTemplate } from './ai/comfy.js';

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
