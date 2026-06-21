import fs from 'node:fs';
import { config } from './config.js';
import { clearResolvedModel } from './creatures/gemini.js';
import { refreshOllama } from './ai/ollama.js';
import { refreshComfy } from './ai/comfy.js';

/** The subset of config the DM can change at runtime from the Settings modal. */
export type RuntimeSettings = {
  geminiApiKey?: string;
  geminiModel?: string;
  ollamaUrl?: string;
  ollamaModel?: string;
  aiMode?: 'gemini' | 'local';
  comfyUrl?: string;
  comfyModel?: string;
};

/** Load persisted settings (if any) and apply them on top of env defaults. */
export function loadSettings(): void {
  try {
    const raw = fs.readFileSync(config.settingsPath, 'utf8');
    const s = JSON.parse(raw) as RuntimeSettings;
    if (typeof s.geminiApiKey === 'string') config.geminiApiKey = s.geminiApiKey;
    if (typeof s.geminiModel === 'string') config.geminiModel = s.geminiModel;
    if (typeof s.ollamaUrl === 'string' && s.ollamaUrl.trim())
      config.ollamaUrl = s.ollamaUrl.trim().replace(/\/$/, '');
    if (typeof s.ollamaModel === 'string' && s.ollamaModel.trim())
      config.ollamaModel = s.ollamaModel.trim();
    if (s.aiMode === 'gemini' || s.aiMode === 'local') config.aiMode = s.aiMode;
    if (typeof s.comfyUrl === 'string' && s.comfyUrl.trim())
      config.comfyUrl = s.comfyUrl.trim().replace(/\/$/, '');
    if (typeof s.comfyModel === 'string') config.comfyModel = s.comfyModel.trim();
  } catch {
    // No saved settings yet — env defaults stand.
  }
}

/** Apply + persist runtime settings; returns the public (key-masked) view. */
export function updateSettings(patch: RuntimeSettings): PublicSettings {
  if (typeof patch.geminiApiKey === 'string') {
    config.geminiApiKey = patch.geminiApiKey.trim();
  }
  if (typeof patch.geminiModel === 'string') {
    config.geminiModel = patch.geminiModel.trim();
    clearResolvedModel(); // re-discover/use the new model on the next call
  }
  if (typeof patch.ollamaUrl === 'string') {
    config.ollamaUrl = patch.ollamaUrl.trim().replace(/\/$/, '');
  }
  if (typeof patch.ollamaModel === 'string') {
    config.ollamaModel = patch.ollamaModel.trim();
  }
  if (patch.aiMode === 'gemini' || patch.aiMode === 'local') {
    config.aiMode = patch.aiMode;
  }
  if (typeof patch.comfyUrl === 'string') {
    config.comfyUrl = patch.comfyUrl.trim().replace(/\/$/, '');
  }
  if (typeof patch.comfyModel === 'string') {
    config.comfyModel = patch.comfyModel.trim();
  }
  if (typeof patch.ollamaUrl === 'string' || typeof patch.ollamaModel === 'string') {
    void refreshOllama(); // re-probe so the "AI available" signal stays accurate
  }
  if (typeof patch.comfyUrl === 'string') {
    void refreshComfy(); // re-probe the ComfyUI connection
  }
  try {
    fs.writeFileSync(
      config.settingsPath,
      JSON.stringify(
        {
          geminiApiKey: config.geminiApiKey,
          geminiModel: config.geminiModel,
          ollamaUrl: config.ollamaUrl,
          ollamaModel: config.ollamaModel,
          aiMode: config.aiMode,
          comfyUrl: config.comfyUrl,
          comfyModel: config.comfyModel,
        },
        null,
        2,
      ),
    );
  } catch (err) {
    console.warn('  [settings] could not persist:', (err as Error).message);
  }
  return publicSettings();
}

/** Never expose the raw API key to clients — only whether one is set. */
export type PublicSettings = {
  hasKey: boolean;
  geminiModel: string;
  ollamaUrl: string;
  ollamaModel: string;
  aiMode: 'gemini' | 'local';
  comfyUrl: string;
  comfyModel: string;
  dmPassphraseRequired: boolean;
};

export function publicSettings(): PublicSettings {
  return {
    hasKey: !!config.geminiApiKey,
    geminiModel: config.geminiModel,
    ollamaUrl: config.ollamaUrl,
    ollamaModel: config.ollamaModel,
    aiMode: config.aiMode,
    comfyUrl: config.comfyUrl,
    comfyModel: config.comfyModel,
    dmPassphraseRequired: !!config.dmPassphrase,
  };
}
