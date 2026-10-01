import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../state/socket';

/** Private image bytes are fetched with a header, then shown through a local
 * blob URL. Neither thumbnails nor the viewer put credentials in URLs. */
export function ChatImageAttachment({ image, preview = false, onReady }: {
  image: { id: string; name: string };
  preview?: boolean;
  onReady?: () => void;
}) {
  const token = useStore(s => s.chatAccessToken);
  const [source, setSource] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [fullSize, setFullSize] = useState(false);
  const [retry, setRetry] = useState(0);
  const viewer = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    setSource(null);
    setFailed(false);
    if (!token) return;
    const controller = new AbortController();
    let blobUrl: string | undefined;
    fetch(`/api/chat-images/${encodeURIComponent(image.id)}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    }).then(async response => {
      if (!response.ok) throw new Error('Image unavailable');
      const blob = await response.blob();
      if (controller.signal.aborted) return;
      blobUrl = URL.createObjectURL(blob);
      setSource(blobUrl);
    }).catch(() => {
      if (!controller.signal.aborted) setFailed(true);
    });
    return () => {
      controller.abort();
      viewer.current?.close();
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [image.id, token, retry]);

  return <div className={`chat-image ${preview ? 'chat-image-preview' : ''}`}>
    {source ? <button
      type="button"
      className="chat-image-thumb"
      title={`View ${image.name}`}
      onClick={() => { setFullSize(false); viewer.current?.showModal(); }}
    >
      <img src={source} alt={image.name} onLoad={onReady} onError={() => { setFailed(true); setSource(null); }} />
      <span>{image.name}</span>
    </button> : <span className="muted" role="status">
      {failed ? 'Image unavailable. ' : token ? 'Loading image…' : 'Reconnect to view image.'}
      {failed && <button type="button" className="btn tiny" onClick={() => setRetry(n => n + 1)}>Retry</button>}
    </span>}
    {source && createPortal(<dialog
      ref={viewer}
      className="chat-image-viewer"
      aria-label={`Private image: ${image.name}`}
      onClick={event => { if (event.target === event.currentTarget) viewer.current?.close(); }}
    >
      <div className="chat-image-viewer-head">
        <strong>{image.name}</strong>
        <button type="button" className="btn tiny" onClick={() => setFullSize(v => !v)}>{fullSize ? 'Fit image' : 'Full size'}</button>
        <button type="button" className="btn tiny" autoFocus onClick={() => viewer.current?.close()}>Close</button>
      </div>
      <div className={`chat-image-viewer-body ${fullSize ? 'full-size' : ''}`}>
        <img src={source} alt={image.name} />
      </div>
    </dialog>, document.body)}
  </div>;
}
