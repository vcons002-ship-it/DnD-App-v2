import { useEffect } from 'react';
import { useStore } from '../state/socket';

/** Bottom-centred transient toast, driven by server `notice` events. */
export function Toast() {
  const toast = useStore((s) => s.toast);
  const dismiss = useStore((s) => s.dismissToast);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(dismiss, 3000);
    return () => clearTimeout(t);
  }, [toast, dismiss]);

  if (!toast) return null;
  return (
    <div className="toast" onClick={dismiss}>
      {toast.message}
    </div>
  );
}
