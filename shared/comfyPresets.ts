// Local image workflow choices. The old shipped Flux 2 strings remain here only
// to recognize and upgrade unedited saved presets to native FLUX 3. User-edited
// JSON is preserved as an explicit expert override.

export type ComfyPresetId = 'builtin' | 'flux2-klein-4b' | 'flux2-klein-9b' | 'custom';

// Option B — fastest: distilled 4-step / cfg-1 model + Qwen-3-4B encoder.
export const FLUX2_KLEIN_4B = `{
  "3": { "class_type": "KSampler", "inputs": {
      "seed": %seed%, "steps": 4, "cfg": 1,
      "sampler_name": "euler", "scheduler": "simple", "denoise": 1,
      "model": ["4", 0], "positive": ["6", 0], "negative": ["7", 0], "latent_image": ["5", 0] } },
  "4": { "class_type": "UNETLoader", "inputs": { "unet_name": "flux-2-klein-4b-fp8.safetensors", "weight_dtype": "default" } },
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
  "4": { "class_type": "UNETLoader", "inputs": { "unet_name": "flux-2-klein-9b-fp8.safetensors", "weight_dtype": "default" } },
  "12": { "class_type": "CLIPLoader", "inputs": { "clip_name": "qwen_3_8b_fp8mixed.safetensors", "type": "flux2" } },
  "13": { "class_type": "VAELoader", "inputs": { "vae_name": "full_encoder_small_decoder.safetensors" } },
  "6": { "class_type": "CLIPTextEncode", "inputs": { "text": "%prompt%", "clip": ["12", 0] } },
  "7": { "class_type": "CLIPTextEncode", "inputs": { "text": "", "clip": ["12", 0] } },
  "5": { "class_type": "EmptyFlux2LatentImage", "inputs": { "width": %width%, "height": %height%, "batch_size": 1 } },
  "8": { "class_type": "VAEDecode", "inputs": { "samples": ["3", 0], "vae": ["13", 0] } },
  "9": { "class_type": "SaveImage", "inputs": { "filename_prefix": "flux2klein9b", "images": ["8", 0] } }
}`;

export const COMFY_PRESETS: { id: ComfyPresetId; label: string; workflow: string }[] = [
  { id: 'builtin', label: 'FLUX 3 — default local image model (16 steps)', workflow: '' },
  { id: 'custom', label: 'Custom — paste your own API-format JSON', workflow: '' },
];

/** Which preset a stored workflow corresponds to (for the dropdown's initial value). */
export function detectPreset(workflow: string): ComfyPresetId {
  const w = workflow.trim();
  if (!w) return 'builtin';
  if (!normalizeComfyWorkflow(w)) return 'builtin';
  return 'custom';
}

/** The model files each Flux preset needs in ComfyUI/models/ (shown as a hint). */
export const PRESET_FILES: Partial<Record<ComfyPresetId, string[]>> = {
  builtin: [
    'diffusion_models/flux3_image_klein_sd_int8_convrot.safetensors',
    'text_encoders/qwen3vl_4b_int8_convrot.safetensors',
    'text_encoders/qwen3.5_9b_flux3_prompt_upsampler_int8_convrot.safetensors',
    'vae/flux2-vae.safetensors',
  ],
  'flux2-klein-4b': [
    'diffusion_models/flux-2-klein-4b.safetensors (distilled)',
    'text_encoders/qwen_3_4b.safetensors',
    'vae/flux2-vae.safetensors',
  ],
  'flux2-klein-9b': [
    'diffusion_models/flux-2-klein-9b-fp8.safetensors',
    'text_encoders/qwen_3_8b_fp8mixed.safetensors',
    'vae/full_encoder_small_decoder.safetensors',
  ],
};

/** Upgrade only the exact shipped presets; preserve edited expert workflows. */
export function normalizeComfyWorkflow(workflow: string): string {
  const w = workflow.trim();
  return w === FLUX2_KLEIN_4B.trim() || w === FLUX2_KLEIN_9B.trim() ? '' : workflow;
}
