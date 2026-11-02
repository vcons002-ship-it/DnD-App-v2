import { useCallback, useEffect, useRef, useState } from 'react';
import { cropImage, removeBackground } from '../lib/imageEdit';
import { screenToMap } from './miniatureProjection';

type View = { scale: number; x: number; y: number };

export function useClipboardImagePaste(
  actualDm: boolean,
  openPasteDialog: (icon: string) => Promise<void>,
  notify: (msg: string) => void,
) {
  useEffect(() => {
    if (!actualDm) return;
    const onPaste = async (e: ClipboardEvent) => {
      const item = [...(e.clipboardData?.items ?? [])].find((i) =>
        i.type.startsWith('image/'),
      );
      const file = item?.getAsFile();
      if (file) {
        e.preventDefault();
        const fd = new FormData();
        fd.append('image', file);
        try {
          const res = await fetch('/api/icons', { method: 'POST', body: fd });
          if (!res.ok) throw new Error('upload failed');
          const { icon } = await res.json();
          await openPasteDialog(icon);
        } catch {
          notify('Could not paste that image.');
        }
        return;
      }
      // No pixel data — look for an <img src> in an HTML paste, or a URL in a
      // text paste. NEVER hijack a paste aimed at a text field (chat etc.).
      const el = e.target as HTMLElement | null;
      const editable =
        !!el &&
        (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
      if (editable) return;
      const html = e.clipboardData?.getData('text/html') ?? '';
      const text = e.clipboardData?.getData('text/plain')?.trim() ?? '';
      const srcMatch = html.match(/<img[^>]+src=(?:"([^"]+)"|'([^']+)')/i);
      const src = (srcMatch?.[1] ?? srcMatch?.[2])?.replace(/&amp;/g, '&');
      // Inline data: URI (some apps embed the pixels in the HTML) — upload it
      // directly, no server fetch needed.
      if (src?.startsWith('data:image/')) {
        e.preventDefault();
        try {
          const blob = await (await fetch(src)).blob();
          const fd = new FormData();
          fd.append('image', blob, 'paste.png');
          const res = await fetch('/api/icons', { method: 'POST', body: fd });
          if (!res.ok) throw new Error('upload failed');
          const { icon } = await res.json();
          await openPasteDialog(icon);
        } catch {
          notify('Could not paste that image.');
        }
        return;
      }
      // Any http(s) URL is worth trying — Slides/Docs image URLs carry no file
      // extension; the server verifies the response really is an image.
      const remote =
        (src && /^https?:\/\//i.test(src) ? src : '') ||
        (/^https?:\/\/\S+$/i.test(text) ? text : '');
      if (!remote) {
        if (html || text)
          notify('No image on the clipboard — copy the image itself (right-click → Copy image).');
        return;
      }
      e.preventDefault();
      try {
        const res = await fetch('/api/icons/from-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: remote }),
        });
        if (!res.ok) {
          const why = (await res.json().catch(() => null))?.error;
          notify(`Could not fetch that image link${why ? ` — ${why}` : ''}.`);
          return;
        }
        const { icon } = await res.json();
        await openPasteDialog(icon);
      } catch {
        notify('Could not fetch that image link.');
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [actualDm, openPasteDialog, notify]);
}

export function usePasteImageState() {
  const [pasteImg, setPasteImg] = useState<{ url: string; w: number; h: number } | null>(null);
  const [pasteOrig, setPasteOrig] = useState<{ url: string; w: number; h: number } | null>(null);

  const openPasteDialog = useCallback(async (icon: string) => {
    const dims = await new Promise<{ w: number; h: number }>((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = () => resolve({ w: 200, h: 200 });
      img.src = icon;
    });
    setPasteImg({ url: icon, w: dims.w, h: dims.h });
    setPasteOrig({ url: icon, w: dims.w, h: dims.h });
  }, []);

  return { pasteImg, setPasteImg, pasteOrig, openPasteDialog };
}

export function PasteImageModal({
  pasteImg,
  pasteOrig,
  setPasteImg,
  mapId,
  size,
  view,
  tiltDegrees,
  grid,
  pasteObject,
  addAnnotation,
  notify,
}: {
  pasteImg: { url: string; w: number; h: number };
  pasteOrig: { url: string; w: number; h: number } | null;
  setPasteImg: (next: { url: string; w: number; h: number } | null) => void;
  mapId: string | undefined;
  size: { w: number; h: number };
  view: View;
  tiltDegrees: number;
  grid: number;
  pasteObject: (payload: { mapId: string; x: number; y: number; icon: string; name: string }) => void;
  addAnnotation: (payload: {
    kind: 'image';
    x: number;
    y: number;
    url: string;
    width: number;
    height: number;
    color: string;
  }) => void;
  notify: (msg: string) => void;
}) {
  const [pasteName, setPasteName] = useState('');
  const [pasteBusy, setPasteBusy] = useState(false);
  const [cropSel, setCropSel] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const cropStart = useRef<{ x: number; y: number } | null>(null);
  const pastePreviewRef = useRef<HTMLImageElement>(null);

  return (
    <div className="modal-backdrop" onClick={() => setPasteImg(null)}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>Paste image</h3>
          <button className="btn tiny" onClick={() => setPasteImg(null)}>✕</button>
        </div>
        {/* Drag on the preview to select a crop; checkerboard shows
            transparency after "Cut background". */}
        <div
          className="paste-preview"
          onMouseDown={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            cropStart.current = { x: e.clientX - r.left, y: e.clientY - r.top };
            setCropSel(null);
          }}
          onMouseMove={(e) => {
            const s = cropStart.current;
            if (!s) return;
            const r = e.currentTarget.getBoundingClientRect();
            const cx = Math.max(0, Math.min(r.width, e.clientX - r.left));
            const cy = Math.max(0, Math.min(r.height, e.clientY - r.top));
            setCropSel({
              x: Math.min(s.x, cx),
              y: Math.min(s.y, cy),
              w: Math.abs(cx - s.x),
              h: Math.abs(cy - s.y),
            });
          }}
          onMouseUp={() => {
            cropStart.current = null;
            setCropSel((c) => (c && c.w > 4 && c.h > 4 ? c : null));
          }}
          onMouseLeave={() => {
            cropStart.current = null;
          }}
        >
          <img ref={pastePreviewRef} src={pasteImg.url} alt="pasted" draggable={false} />
          {cropSel && (
            <div
              className="paste-crop-box"
              style={{ left: cropSel.x, top: cropSel.y, width: cropSel.w, height: cropSel.h }}
            />
          )}
        </div>
        <div className="paste-tools">
          <button
            className="btn tiny"
            disabled={!cropSel || pasteBusy}
            title="Crop to the dragged selection"
            onClick={async () => {
              const img = pastePreviewRef.current;
              if (!cropSel || !img) return;
              // Preview px → natural px.
              const f = pasteImg.w / img.clientWidth;
              setPasteBusy(true);
              try {
                const next = await cropImage(pasteImg.url, {
                  x: cropSel.x * f,
                  y: cropSel.y * f,
                  w: cropSel.w * f,
                  h: cropSel.h * f,
                });
                setPasteImg(next);
                setCropSel(null);
              } catch {
                notify('Crop failed.');
              } finally {
                setPasteBusy(false);
              }
            }}
          >
            ✂ Crop
          </button>
          <button
            className="btn tiny"
            disabled={pasteBusy}
            title="Make the (flat) background transparent — flood-fills from the corners"
            onClick={async () => {
              setPasteBusy(true);
              try {
                setPasteImg(await removeBackground(pasteImg.url));
                setCropSel(null);
              } catch {
                notify('Could not cut the background.');
              } finally {
                setPasteBusy(false);
              }
            }}
          >
            🪄 Cut background
          </button>
          {pasteOrig && pasteOrig.url !== pasteImg.url && (
            <button
              className="btn tiny"
              disabled={pasteBusy}
              onClick={() => {
                setPasteImg(pasteOrig);
                setCropSel(null);
              }}
            >
              ↺ Undo edits
            </button>
          )}
          <span className="muted">{pasteBusy ? 'working…' : 'drag preview to crop'}</span>
        </div>
        <label className="settings-field">
          Name (for object)
          <input value={pasteName} onChange={(e) => setPasteName(e.target.value)} placeholder="Object" />
        </label>
        <div className="modal-actions">
          <button
            className="btn green"
            onClick={() => {
              if (!mapId) return;
              // Place at the centre of the current view, in image space.
              const { x: cx, y: cy } = screenToMap(size.w / 2, size.h / 2, view, tiltDegrees);
              pasteObject({ mapId, x: cx, y: cy, icon: pasteImg.url, name: pasteName.trim() || 'Object' });
              setPasteImg(null);
            }}
            title="Add as a draggable object token (image, unclipped)"
          >
            🪙 Object
          </button>
          <button
            className="btn"
            onClick={() => {
              if (!mapId) return;
              const { x: cx, y: cy } = screenToMap(size.w / 2, size.h / 2, view, tiltDegrees);
              // Clamp the decal to ~6 grid squares wide, keeping aspect.
              const maxW = grid * 6;
              const scale = pasteImg.w > maxW ? maxW / pasteImg.w : 1;
              const w = pasteImg.w * scale;
              const h = pasteImg.h * scale;
              addAnnotation({
                kind: 'image',
                x: cx - w / 2,
                y: cy - h / 2,
                url: pasteImg.url,
                width: w,
                height: h,
                color: '#ffffff',
              });
              setPasteImg(null);
            }}
            title="Add as flat scenery under the tokens (set dressing)"
          >
            🖼 Scenery decal
          </button>
          <button className="btn" onClick={() => setPasteImg(null)}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
