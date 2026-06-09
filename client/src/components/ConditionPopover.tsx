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
  // Either anchor the popover's top below the button, or its bottom above it
  // (so a card near the screen bottom doesn't push the dropdown off-screen).
  const [pos, setPos] = useState<{ x: number; top?: number; bottom?: number }>({ x: 0 });

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
      const x = Math.max(8, Math.min(r.left, window.innerWidth - W - 8));
      // Open downward when there's room; otherwise anchor above the button so the
      // dropdown is never clipped at the bottom of the screen.
      const spaceBelow = window.innerHeight - r.bottom;
      setPos(
        spaceBelow > 300
          ? { x, top: r.bottom + 4 }
          : { x, bottom: window.innerHeight - r.top + 4 },
      );
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
            style={{ left: pos.x, top: pos.top, bottom: pos.bottom }}
            onClick={(e) => e.stopPropagation()}
          >
            <ConditionPicker kind={kind} refId={refId} conditions={conditions} />
          </div>
        </>
      )}
    </>
  );
}
