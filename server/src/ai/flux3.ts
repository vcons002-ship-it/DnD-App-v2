/** Native distilled FLUX 3 recipe shared with the installed Illustrator workflow.
 * Keep both encoders: the upsampler writes a caption; Qwen3-VL conditions the image.
 */
export const FLUX3_FILES = {
  model: 'flux3_image_klein_sd_int8_convrot.safetensors',
  encoder: 'qwen3vl_4b_int8_convrot.safetensors',
  upsampler: 'qwen3.5_9b_flux3_prompt_upsampler_int8_convrot.safetensors',
  vae: 'flux2-vae.safetensors',
};

export function isFlux3Model(name: string): boolean {
  return /(?:^|[/\\])flux3_image_klein_sd[^/\\]*\.safetensors$/i.test(name);
}

export function buildFlux3Graph(opts: {
  model: string; prompt: string; width: number; height: number; seed: number; steps?: number;
}): Record<string, { class_type: string; inputs: Record<string, unknown> }> {
  return {
    '4': { class_type: 'UNETLoader', inputs: { unet_name: opts.model, weight_dtype: 'default' } },
    '12': { class_type: 'CLIPLoader', inputs: { clip_name: FLUX3_FILES.encoder, type: 'flux3' } },
    '13': { class_type: 'VAELoader', inputs: { vae_name: FLUX3_FILES.vae } },
    '20': { class_type: 'CLIPLoader', inputs: { clip_name: FLUX3_FILES.upsampler, type: 'flux3' } },
    '21': { class_type: 'TextGenerate', inputs: {
      clip: ['20', 0], prompt: opts.prompt, max_length: 3584, sampling_mode: 'off',
      thinking: false, use_default_template: true, mtp: 'off',
      system_prompt: 'Expand the request into one detailed scene caption for an image generator. Preserve every explicit subject, identity, count, wording, style and composition constraint, including exact panel layouts and view directions. Describe framing, actions, materials, background and lighting concretely. Do not add unrequested people. Output only the caption as continuous English prose.',
    } },
    '6': { class_type: 'CLIPTextEncode', inputs: { text: ['21', 0], clip: ['12', 0] } },
    '7': { class_type: 'ConditioningZeroOut', inputs: { conditioning: ['6', 0] } },
    '5': { class_type: 'EmptyFlux2LatentImage', inputs: {
      width: opts.width, height: opts.height, batch_size: 1,
    } },
    '3': { class_type: 'KSampler', inputs: {
      model: ['4', 0], positive: ['6', 0], negative: ['7', 0], latent_image: ['5', 0],
      seed: opts.seed, steps: Math.min(60, Math.max(8, opts.steps ?? 16)), cfg: 1,
      sampler_name: 'euler', scheduler: 'simple', denoise: 1,
    } },
    '8': { class_type: 'VAEDecode', inputs: { samples: ['3', 0], vae: ['13', 0] } },
    '9': { class_type: 'SaveImage', inputs: { filename_prefix: 'dndvtt-flux3', images: ['8', 0] } },
  };
}
