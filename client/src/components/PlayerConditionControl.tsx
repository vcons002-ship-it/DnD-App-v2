import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Character } from '../../../shared/types';
import { ConditionPicker } from './ConditionPicker';
import './player-condition-control.css';

type Anchor = { left: number; top?: number; bottom?: number; scale: number; width: number };

/** Player-only shortcut to the existing manual picker; no separate condition model. */
export function PlayerConditionControl({ character }: { character: Character }) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<Anchor>({ left: 8, bottom: 8, scale: 1, width: 320 });
  const control = useRef<HTMLDivElement>(null);
  const editor = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const headingId = useId();
  const editorId = useId();

  const updateAnchor = () => {
    const element = trigger.current?.isConnected ? trigger.current : control.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    const root = element.closest('.player-fantasy');
    const preference = root ? Number(getComputedStyle(root).getPropertyValue('--player-ui-scale')) : 1;
    const scale = Number.isFinite(preference) && preference > 0 ? preference : 1;
    const width = Math.min(320, (window.innerWidth - 16) / scale);
    const above = rect.top > window.innerHeight - rect.bottom;
    setAnchor({
      left: Math.max(8, Math.min(rect.left, window.innerWidth - width * scale - 8)),
      ...(above ? { bottom: window.innerHeight - rect.top + 6 } : { top: rect.bottom + 6 }),
      scale,
      width,
    });
  };

  const closeAndRestoreFocus = () => {
    setOpen(false);
    const destination = trigger.current?.isConnected
      ? trigger.current
      : control.current?.querySelector<HTMLButtonElement>('button');
    destination?.focus();
  };

  useEffect(() => {
    if (!open) return;
    // Focus the named panel, then Tab reaches the existing picker controls.
    editor.current?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      closeAndRestoreFocus();
    };
    const onOutside = (event: Event) => {
      const target = event.target as Node | null;
      if (target && !editor.current?.contains(target) && !control.current?.contains(target)) {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey, true);
    document.addEventListener('pointerdown', onOutside, true);
    document.addEventListener('focusin', onOutside, true);
    window.addEventListener('resize', updateAnchor);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      document.removeEventListener('pointerdown', onOutside, true);
      document.removeEventListener('focusin', onOutside, true);
      window.removeEventListener('resize', updateAnchor);
    };
  }, [open]);

  useEffect(() => { setOpen(false); }, [character.id]);

  const showEditor = (button: HTMLButtonElement) => {
    trigger.current = button;
    updateAnchor();
    setOpen(true);
    if (open) editor.current?.focus({ preventScroll: true });
  };

  return (
    <div ref={control} className="player-condition-control" role="group" aria-label="Active conditions">
      {character.conditions.length ? character.conditions.map((condition) => (
        <button
          key={condition.id}
          type="button"
          className={`player-condition-chip aura-${condition.aura}`}
          aria-label={`${condition.label}. Edit conditions`}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={open ? editorId : undefined}
          title={`${condition.label}${condition.customText ? `: ${condition.customText}` : ''} — edit conditions`}
          onClick={(event) => showEditor(event.currentTarget)}
        >
          <span className="player-condition-dot" aria-hidden="true" />
          {condition.label}
        </button>
      )) : (
        <button
          type="button"
          className="player-condition-chip empty"
          aria-label="No conditions. Add or edit conditions"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={open ? editorId : undefined}
          title="Add or edit conditions"
          onClick={(event) => showEditor(event.currentTarget)}
        >
          No conditions <span aria-hidden="true">+</span>
        </button>
      )}
      {open && createPortal(
        <div
          className="player-condition-anchor player-fantasy"
          style={{ left: anchor.left, top: anchor.top, bottom: anchor.bottom }}
        >
          <div
            id={editorId}
            ref={editor}
            className="player-condition-editor fantasy-window"
            role="dialog"
            aria-labelledby={headingId}
            tabIndex={-1}
            style={{
              width: anchor.width,
              zoom: anchor.scale,
              maxHeight: `calc((100vh - ${anchor.top ?? anchor.bottom ?? 8}px - 8px) / ${anchor.scale})`,
            }}
          >
            <header>
              <h3 id={headingId}>Conditions</h3>
              <button type="button" className="btn tiny" onClick={closeAndRestoreFocus}>Close</button>
            </header>
            <ConditionPicker kind="pc" refId={character.id} conditions={character.conditions} />
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
