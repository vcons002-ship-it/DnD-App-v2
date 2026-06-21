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

/** Generate an image from a prompt; resolves to the `/uploads/...` path or null. */
export async function comfyGenerate(prompt: string, kind: ComfyKind): Promise<string | null> {
  try {
    const r = await fetch('/api/comfy/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: prompt.trim(), kind }),
    });
    if (!r.ok) return null;
    return (await r.json()).path ?? null;
  } catch {
    return null;
  }
}
