import { useEffect, useState } from 'react';

/** Local ComfyUI image generation — availability probe (cached) + a generate call. */
export type ComfyKind = 'token' | 'map' | 'decal';

type ComfyStatus = { reachable: boolean; models: string[] };
let cache: ComfyStatus | null = null;
let inflight: Promise<ComfyStatus> | null = null;

function fetchStatus(): Promise<ComfyStatus> {
  if (cache) return Promise.resolve(cache);
  if (!inflight) {
    inflight = fetch('/api/comfy/status')
      .then((r) => r.json())
      .then((d) => (cache = { reachable: !!d.reachable, models: Array.isArray(d.models) ? d.models : [] }))
      .catch(() => (cache = { reachable: false, models: [] }))
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/** Drop the cached status so the next probe re-checks (call after Settings save). */
export function refreshComfyStatus(): void {
  cache = null;
  inflight = null;
}

/** Whether a local ComfyUI is reachable — gates the 🎨 Generate controls. */
export function useComfyAvailable(): boolean {
  const [ok, setOk] = useState(cache?.reachable ?? false);
  useEffect(() => {
    let live = true;
    fetchStatus().then((s) => live && setOk(s.reachable));
    return () => {
      live = false;
    };
  }, []);
  return ok;
}

/** Generate an image from a prompt. Resolves to the saved `/uploads/...` path,
 *  or a specific `error` message from the server (missing model, rejected
 *  workflow, timeout…) the caller can show. */
export async function comfyGenerate(
  prompt: string,
  kind: ComfyKind,
): Promise<{ path?: string; error?: string }> {
  try {
    const r = await fetch('/api/comfy/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: prompt.trim(), kind }),
    });
    const data = await r.json().catch(() => ({}) as { path?: string; error?: string });
    if (!r.ok) return { error: data.error || 'Generation failed.' };
    return { path: data.path };
  } catch {
    return { error: 'Could not reach the server.' };
  }
}
