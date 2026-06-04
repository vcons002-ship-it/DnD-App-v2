import { useEffect } from 'react';
import type { StateSnapshot, Token } from '../../../shared/types';
import { resolveToken } from '../lib/entities';
import { useStore } from '../state/socket';

type Props = {
  snapshot: StateSnapshot;
  token: Token;
  /** Screen position (clientX/clientY) where the menu was summoned. */
  x: number;
  y: number;
  onClose: () => void;
};

/**
 * Right-click / long-press action menu anchored at a token. DM-only actions
 * (duplicate, hide, delete); players get a read-only label only.
 */
export function FloatingMenu({ snapshot, token, x, y, onClose }: Props) {
  const duplicateToken = useStore((s) => s.duplicateToken);
  const setTokenHidden = useStore((s) => s.setTokenHidden);
  const deleteToken = useStore((s) => s.deleteToken);
  const isDm = snapshot.role === 'dm';
  const d = resolveToken(snapshot, token);

  // Dismiss on outside click, scroll, or Escape.
  useEffect(() => {
    const close = () => onClose();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('pointerdown', close);
    window.addEventListener('wheel', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('wheel', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const run = (fn: () => void) => () => {
    fn();
    onClose();
  };

  return (
    <div
      className="floating-menu"
      style={{ left: x, top: y }}
      // Stop the menu's own pointerdown from triggering the outside-click close.
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="floating-menu-title">{d.name}</div>
      {isDm ? (
        <>
          <button className="floating-menu-item" onClick={run(() => duplicateToken(token.id))}>
            ⧉ Duplicate
          </button>
          <button
            className="floating-menu-item"
            onClick={run(() => setTokenHidden(token.id, !token.isHidden))}
          >
            {token.isHidden ? '🙈 Show to players' : 'Hide from players'}
          </button>
          <button
            className="floating-menu-item danger"
            onClick={run(() => deleteToken(token.id))}
          >
            ✕ Delete
          </button>
        </>
      ) : (
        <div className="floating-menu-note muted">No actions available</div>
      )}
    </div>
  );
}
