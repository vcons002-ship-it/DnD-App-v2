import { useEffect, useRef, useState } from 'react';
import type { Condition, TokenKind } from '../../../shared/types';
import { ConditionPicker } from './ConditionPicker';

/**
 * A "Status" button that opens the condition picker in a floating popover ABOVE
 * everything (fixed position) — used where an inline picker would be clipped or
 * sit behind neighbouring cards (e.g. the DM Data grid).
 */
export function ConditionPopover({
  kind,
  refId,
  conditions,
}: {
  kind: TokenKind;
  refId: string;
  conditions: Condition[];
}) {
  const btn = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const toggle = () => {
    if (!open && btn.current) {
      const r = btn.current.getBoundingClientRect();
      const W = 260;
      setPos({
        x: Math.max(8, Math.min(r.left, window.innerWidth - W - 8)),
        y: r.bottom + 4,
      });
    }
    setOpen((o) => !o);
  };

  return (
    <>
      <button ref={btn} type="button" className="btn tiny" onClick={toggle}>
        Status ▾
      </button>
      {open && (
        <>
          <div className="popover-backdrop" onClick={() => setOpen(false)} />
          <div
            className="status-popover"
            style={{ left: pos.x, top: pos.y }}
            onClick={(e) => e.stopPropagation()}
          >
            <ConditionPicker kind={kind} refId={refId} conditions={conditions} />
          </div>
        </>
      )}
    </>
  );
}
