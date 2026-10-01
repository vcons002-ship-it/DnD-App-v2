import { useEffect, useRef, useState } from 'react';
import { useStore } from '../state/socket';

const WHAT: Record<'short' | 'long', string> = {
  short: 'Refills short-rest features (Action Surge, Ki, Superiority Dice, Warlock slots…) and one use of Second Wind, Rage, Channel Divinity and Wild Shape. Players heal by spending Hit Dice from their sheet.',
  long: 'Restores all HP, all Hit Dice, every spell slot and feature, and ends temp HP. Characters at 0 HP or dead don\'t benefit.',
};

/**
 * DM toolbar menu: the whole party takes a Short or Long Rest. Two clicks (pick,
 * then confirm in place) because a rest refills everyone's resources — the same
 * `.measure-menu` popover pattern as the map tools, no browser confirm().
 */
export function RestMenu() {
  const restParty = useStore((s) => s.restParty);
  const btn = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState<'short' | 'long' | null>(null);
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
      setPos({ x: Math.max(8, Math.min(r.left, window.innerWidth - 268)), y: r.bottom + 4 });
    }
    setConfirm(null);
    setOpen((o) => !o);
  };

  return (
    <>
      <button ref={btn} type="button" className="btn tiny" onClick={toggle} title="The party takes a Short or Long Rest">
        🏕 Rest ▾
      </button>
      {open && (
        <>
          <div className="popover-backdrop" onClick={() => setOpen(false)} />
          <div className="measure-menu rest-menu" role="menu" style={{ left: pos.x, top: pos.y, width: 260 }}>
            {(['short', 'long'] as const).map((kind) => (
              <div key={kind} className="rest-option">
                {confirm === kind ? (
                  <div className="rest-confirm">
                    <button type="button" className="btn tiny primary" onClick={() => { restParty(kind); setOpen(false); }}>
                      Confirm {kind === 'short' ? 'Short' : 'Long'} Rest
                    </button>
                    <button type="button" className="btn tiny" onClick={() => setConfirm(null)}>Cancel</button>
                  </div>
                ) : (
                  <button type="button" role="menuitem" className="measure-row" onClick={() => setConfirm(kind)}>
                    <span>{kind === 'short' ? '☕ Short Rest' : '🏕 Long Rest'}</span>
                    <span className="muted">party</span>
                  </button>
                )}
                <p className="rest-what">{WHAT[kind]}</p>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
