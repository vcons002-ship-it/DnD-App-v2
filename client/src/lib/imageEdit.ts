// Client-side edits for the DM's paste-image dialog (crop / cut out the
// background). Pasted art is already uploaded to same-origin /uploads, so the
// canvas never taints; each edit re-uploads the result and the rest of the
// flow (object token / decal) keeps pointing at a plain served image.

export type EditedImage = { url: string; w: number; h: number };

export type CropRect = { x: number; y: number; w: number; h: number };

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image load failed'));
    img.src = url;
  });
}

async function uploadCanvas(canvas: HTMLCanvasElement): Promise<EditedImage> {
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
  if (!blob) throw new Error('encode failed');
  const fd = new FormData();
  fd.append('image', blob, 'edit.png');
  const res = await fetch('/api/icons', { method: 'POST', body: fd });
  if (!res.ok) throw new Error('upload failed');
  const { icon } = (await res.json()) as { icon: string };
  return { url: icon, w: canvas.width, h: canvas.height };
}

/** Crop to a rect (natural-image pixels) and re-upload. */
export async function cropImage(url: string, rect: CropRect): Promise<EditedImage> {
  const img = await loadImage(url);
  const sx = Math.max(0, Math.min(img.naturalWidth - 1, Math.round(rect.x)));
  const sy = Math.max(0, Math.min(img.naturalHeight - 1, Math.round(rect.y)));
  const w = Math.max(1, Math.min(img.naturalWidth - sx, Math.round(rect.w)));
  const h = Math.max(1, Math.min(img.naturalHeight - sy, Math.round(rect.h)));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d')!.drawImage(img, sx, sy, w, h, 0, 0, w, h);
  return uploadCanvas(canvas);
}

/**
 * Cut out the background: flood-fill from the four corners, turning every
 * pixel within `tolerance` of its corner's colour transparent. Works for flat
 * or lightly-textured backdrops (white art boards, screenshots); busy photo
 * backgrounds won't separate cleanly.
 */
export async function removeBackground(url: string, tolerance = 40): Promise<EditedImage> {
  const img = await loadImage(url);
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0);
  const id = ctx.getImageData(0, 0, w, h);
  const d = id.data;
  const visited = new Uint8Array(w * h);
  const tol2 = tolerance * tolerance * 3; // per-channel tolerance, squared sum
  const corners = [0, w - 1, (h - 1) * w, h * w - 1];
  const stack: number[] = [];
  for (const c of corners) {
    if (visited[c]) continue;
    const r0 = d[c * 4];
    const g0 = d[c * 4 + 1];
    const b0 = d[c * 4 + 2];
    stack.push(c);
    while (stack.length) {
      const p = stack.pop()!;
      if (visited[p]) continue;
      const i = p * 4;
      const dr = d[i] - r0;
      const dg = d[i + 1] - g0;
      const db = d[i + 2] - b0;
      if (d[i + 3] !== 0 && dr * dr + dg * dg + db * db > tol2) continue;
      visited[p] = 1;
      d[i + 3] = 0;
      const x = p % w;
      if (x > 0) stack.push(p - 1);
      if (x < w - 1) stack.push(p + 1);
      if (p >= w) stack.push(p - w);
      if (p < w * (h - 1)) stack.push(p + w);
    }
  }
  ctx.putImageData(id, 0, 0);
  return uploadCanvas(canvas);
}
