type Phase = 'camera' | 'render';
type Callback = (time: number) => void;

/** Camera transforms and their scene paint share one RAF. An effects callback
 * registered before a pointer update must not paint the old camera first. */
export function createBattlefieldFrameScheduler(request: (callback: Callback) => number, cancel: (id: number) => void) {
  const cameras = new Map<number, Callback>(), renders = new Map<number, Callback>();
  let nextId = 1, frame = 0, flushing = false;
  const pending = () => cameras.size > 0 || renders.size > 0;
  const ensureFrame = () => { if (!frame && !flushing && pending()) frame = request(flush); };
  const run = (callbacks: Map<number, Callback>, time: number) => {
    // A callback queued in its own phase belongs to the next frame. Camera
    // callbacks may add/replace a render for the current frame.
    for (const id of [...callbacks.keys()]) {
      const callback = callbacks.get(id);
      callbacks.delete(id);
      callback?.(time);
    }
  };
  const flush = (time: number) => {
    frame = 0; flushing = true;
    try { run(cameras, time); run(renders, time); }
    finally { flushing = false; ensureFrame(); }
  };
  return {
    request(callback: Callback, phase: Phase) {
      const id = nextId++;
      (phase === 'camera' ? cameras : renders).set(id, callback);
      ensureFrame(); return id;
    },
    cancel(id: number) {
      cameras.delete(id); renders.delete(id);
      if (frame && !pending()) { cancel(frame); frame = 0; }
    },
  };
}

let scheduler: ReturnType<typeof createBattlefieldFrameScheduler> | undefined;
export function requestBattlefieldFrame(callback: Callback, phase: Phase = 'render') {
  const browser = globalThis as unknown as {requestAnimationFrame(callback: Callback): number; cancelAnimationFrame(id: number): void};
  scheduler ??= createBattlefieldFrameScheduler(callback => browser.requestAnimationFrame(callback), id => browser.cancelAnimationFrame(id));
  return scheduler.request(callback, phase);
}
export function cancelBattlefieldFrame(id: number) { scheduler?.cancel(id); }
