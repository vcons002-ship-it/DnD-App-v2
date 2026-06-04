import { type ReactNode, useCallback, useEffect, useState } from 'react';

type Props = {
  side: 'left' | 'right';
  /** localStorage key prefix so width/collapsed persist per panel. */
  storageKey: string;
  children: ReactNode;
};

const MIN = 200;
const MAX = 560;
const DEFAULT = 300;

/** A collapsible, drag-to-resize side panel (width persisted locally). */
export function SidePanel({ side, storageKey, children }: Props) {
  const [width, setWidth] = useState<number>(() => {
    const v = Number(localStorage.getItem(`${storageKey}:w`));
    return v >= MIN && v <= MAX ? v : DEFAULT;
  });
  const [collapsed, setCollapsed] = useState<boolean>(
    () => localStorage.getItem(`${storageKey}:c`) === '1',
  );

  useEffect(() => {
    localStorage.setItem(`${storageKey}:w`, String(width));
  }, [width, storageKey]);
  useEffect(() => {
    localStorage.setItem(`${storageKey}:c`, collapsed ? '1' : '0');
  }, [collapsed, storageKey]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startW = width;
      const onMove = (ev: PointerEvent) => {
        const dx = ev.clientX - startX;
        const next = side === 'left' ? startW + dx : startW - dx;
        setWidth(Math.max(MIN, Math.min(MAX, next)));
      };
      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
    [side, width],
  );

  if (collapsed) {
    return (
      <div className={`side ${side} collapsed`}>
        <button
          className="collapse-btn"
          onClick={() => setCollapsed(false)}
          title="Expand panel"
        >
          {side === 'left' ? '›' : '‹'}
        </button>
      </div>
    );
  }

  return (
    <aside className={`side ${side}`} style={{ width }}>
      <button
        className="collapse-btn"
        onClick={() => setCollapsed(true)}
        title="Collapse panel"
      >
        {side === 'left' ? '‹' : '›'}
      </button>
      <div className="side-content">{children}</div>
      <div className={`resize-handle ${side}`} onPointerDown={onPointerDown} />
    </aside>
  );
}
