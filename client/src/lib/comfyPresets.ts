// Ready-made ComfyUI API-format workflows the app can offer as one-click presets,
// so the DM picks a model instead of pasting JSON. Each carries the app's
// %prompt%/%seed%/%width%/%height% placeholders (substituted server-side at
// generate time). The filenames below match the official Flux.2 Klein repacks —
// if ComfyUI lists them under different names, edit the JSON after selecting.

export type ComfyPresetId = 'builtin' | 'flux2-klein-4b' | 'flux2-klein-9b' | 'custom';

// Option B — fastest: distilled 4-step / cfg-1 model + Qwen-3-4B encoder.
export const FLUX2_KLEIN_4B = `{
  "3": { "class_type": "KSampler", "inputs": {
      "seed": %seed%, "steps": 4, "cfg": 1,
      "sampler_name": "euler", "scheduler": "simple", "denoise": 1,
      "model": ["4", 0], "positive": ["6", 0], "negative": ["7", 0], "latent_image": ["5", 0] } },
  "4": { "class_type": "UNETLoader", "inputs": { "unet_name": "flux-2-klein-4b.safetensors", "weight_dtype": "default" } },
  "12": { "class_type": "CLIPLoader", "inputs": { "clip_name": "qwen_3_4b.safetensors", "type": "flux2" } },
  "13": { "class_type": "VAELoader", "inputs": { "vae_name": "flux2-vae.safetensors" } },
  "6": { "class_type": "CLIPTextEncode", "inputs": { "text": "%prompt%", "clip": ["12", 0] } },
  "7": { "class_type": "CLIPTextEncode", "inputs": { "text": "", "clip": ["12", 0] } },
  "5": { "class_type": "EmptyFlux2LatentImage", "inputs": { "width": %width%, "height": %height%, "batch_size": 1 } },
  "8": { "class_type": "VAEDecode", "inputs": { "samples": ["3", 0], "vae": ["13", 0] } },
  "9": { "class_type": "SaveImage", "inputs": { "filename_prefix": "flux2klein4b", "images": ["8", 0] } }
}`;

// Option A — quality-fast: Klein 9B base (real cfg 5, 20 steps) + Qwen-3-8B encoder.
export const FLUX2_KLEIN_9B = `{
  "3": { "class_type": "KSampler", "inputs": {
      "seed": %seed%, "steps": 20, "cfg": 5,
      "sampler_name": "euler", "scheduler": "simple", "denoise": 1,
      "model": ["4", 0], "positive": ["6", 0], "negative": ["7", 0], "latent_image": ["5", 0] } },
  "4": { "class_type": "UNETLoader", "inputs": { "unet_name": "flux-2-klein-base-9b-fp8.safetensors", "weight_dtype": "default" } },
  "12": { "class_type": "CLIPLoader", "inputs": { "clip_name": "qwen_3_8b_fp8mixed.safetensors", "type": "flux2" } },
  "13": { "class_type": "VAELoader", "inputs": { "vae_name": "full_encoder_small_decoder.safetensors" } },
  "6": { "class_type": "CLIPTextEncode", "inputs": { "text": "%prompt%", "clip": ["12", 0] } },
  "7": { "class_type": "CLIPTextEncode", "inputs": { "text": "", "clip": ["12", 0] } },
  "5": { "class_type": "EmptyFlux2LatentImage", "inputs": { "width": %width%, "height": %height%, "batch_size": 1 } },
  "8": { "class_type": "VAEDecode", "inputs": { "samples": ["3", 0], "vae": ["13", 0] } },
  "9": { "class_type": "SaveImage", "inputs": { "filename_prefix": "flux2klein9b", "images": ["8", 0] } }
}`;

export const COMFY_PRESETS: { id: ComfyPresetId; label: string; workflow: string }[] = [
  { id: 'builtin', label: 'Built-in SD1.5 / SDXL graph (no Flux)', workflow: '' },
  { id: 'flux2-klein-4b', label: 'Flux.2 Klein 4B — distilled, fastest (4 steps)', workflow: FLUX2_KLEIN_4B },
  { id: 'flux2-klein-9b', label: 'Flux.2 Klein 9B — quality-fast (20 steps)', workflow: FLUX2_KLEIN_9B },
  { id: 'custom', label: 'Custom — paste your own API-format JSON', workflow: '' },
];

/** Which preset a stored workflow corresponds to (for the dropdown's initial value). */
export function detectPreset(workflow: string): ComfyPresetId {
  const w = workflow.trim();
  if (!w) return 'builtin';
  if (w === FLUX2_KLEIN_4B.trim()) return 'flux2-klein-4b';
  if (w === FLUX2_KLEIN_9B.trim()) return 'flux2-klein-9b';
  return 'custom';
}

/** The model files each Flux preset needs in ComfyUI/models/ (shown as a hint). */
export const PRESET_FILES: Partial<Record<ComfyPresetId, string[]>> = {
  'flux2-klein-4b': [
    'diffusion_models/flux-2-klein-4b.safetensors (distilled)',
    'text_encoders/qwen_3_4b.safetensors',
    'vae/flux2-vae.safetensors',
  ],
  'flux2-klein-9b': [
    'diffusion_models/flux-2-klein-base-9b-fp8.safetensors',
    'text_encoders/qwen_3_8b_fp8mixed.safetensors',
    'vae/full_encoder_small_decoder.safetensors',
  ],
};
