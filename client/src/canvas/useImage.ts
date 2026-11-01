import { useEffect, useState } from 'react';
import {
  cancelLoadingTask,
  completeLoadingTask,
  startLoadingTask,
  type LoadingCategory,
} from '../lib/loadingProgress';

export interface UseImageOptions {
  category?: LoadingCategory;
  weight?: number;
  showDelayMs?: number;
}

/** Minimal image loader for Konva (avoids an extra dependency). */
export function useImage(
  src: string | null,
  options?: UseImageOptions,
): HTMLImageElement | null {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const category = options?.category ?? 'artwork';
  const weight = options?.weight;
  const showDelayMs = options?.showDelayMs;

  useEffect(() => {
    if (!src) {
      setImage(null);
      return;
    }
    const taskId = `image:${src}`;
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    let active = true;
    let settled = false;
    startLoadingTask({
      id: taskId,
      category,
      weight,
      progress: 0.18,
      stageCeiling: 0.9,
      showDelayMs,
    });
    img.onload = () => {
      settled = true;
      completeLoadingTask(taskId);
      if (active) setImage(img);
    };
    img.onerror = () => {
      settled = true;
      cancelLoadingTask(taskId);
      if (active) setImage(null);
    };
    img.src = src;
    if (img.complete && img.naturalWidth > 0 && !settled) {
      settled = true;
      completeLoadingTask(taskId);
      setImage(img);
    }
    return () => {
      active = false;
      if (!settled) cancelLoadingTask(taskId);
    };
  }, [src, category, weight, showDelayMs]);

  return image;
}
