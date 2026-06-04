import { useEffect, useState } from 'react';

/** Minimal image loader for Konva (avoids an extra dependency). */
export function useImage(src: string | null): HTMLImageElement | null {
  const [image, setImage] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    if (!src) {
      setImage(null);
      return;
    }
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    let active = true;
    img.onload = () => active && setImage(img);
    img.onerror = () => active && setImage(null);
    img.src = src;
    return () => {
      active = false;
    };
  }, [src]);

  return image;
}
