import { useEffect } from 'react';
import { useStore } from '../state/socket';

/** Bottom-centred transient toast, driven by server `notice` events. */
export function Toast() {
  const toast = useStore((s) => s.toast);
  const dismiss = useStore((s) => s.dismissToast);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(dismiss, toast.durationMs ?? 3000);
    return () => clearTimeout(t);
  }, [toast?.id, toast?.durationMs, dismiss]);

  if (!toast) return null;
  return (
    <div className="toast" role="status" aria-live="polite" onClick={dismiss}>
      {toast.message}
    </div>
  );
}
