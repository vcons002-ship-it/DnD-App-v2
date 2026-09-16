import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Character } from '../../../shared/types';
import {
  remainingAfterMax,
  remainingAfterPip,
  slotReference2024,
  SLOT_REFERENCE_SOURCE,
} from '../../../shared/resourceDisplay';
import { prioritizeResourceRows, resourceSigilPresentation } from '../../../shared/resourceSigils';
import { useStore } from '../state/socket';
import { ResourceSigil } from './ResourceSigil';
import { ResourceGem, type ResourceGemMotion } from './ResourceGem';
import type { ResourceLayout } from '../lib/usePlayerLayout';
import { arcPoint, resourceArc, MAX_RESOURCE_RINGS, RESOURCE_SYMBOL_BASELINE_INSET, type OrbArc, type OrbGeometry } from '../../../shared/orbResourceLayout';
import './orb-resource-dock.css';

type Counter = Character['spellSlots'][string];
type Group = 'spellSlots' | 'resources';

function ResourceLabel({
  group,
  name,
  counter,
  onEdit,
}: {
  group: Group;
  name: string;
  counter: Counter;
  onEdit: () => void;
}) {
  const tipId = useId();
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const presentation = resourceSigilPresentation(group, name);
  const remaining = counter.max - counter.used;
  const description = `${presentation.name}: ${remaining} of ${counter.max} remaining. Adjust maximum and remaining`;
  return (
    <>
      <button
        type="button"
        className="resource-sigil-trigger"
        aria-label={description}
        aria-describedby={anchor ? tipId : undefined}
        onClick={() => {
          setAnchor(null);
          onEdit();
        }}
        onMouseEnter={(e) => setAnchor(e.currentTarget.getBoundingClientRect())}
        onMouseLeave={(e) => {
          if (document.activeElement !== e.currentTarget) setAnchor(null);
        }}
        onFocus={(e) => setAnchor(e.currentTarget.getBoundingClientRect())}
        onBlur={() => setAnchor(null)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setAnchor(null);
        }}
      >
        <ResourceSigil presentation={presentation} />
        {presentation.caption && (
          <span className="resource-sigil-caption" aria-hidden="true">
            {presentation.caption}
          </span>
        )}
      </button>
      {anchor && createPortal(
        <div
          id={tipId}
          role="tooltip"
          className="player-resource-tooltip"
          style={{
            left: Math.max(8, Math.min(anchor.left, window.innerWidth - 268)),
            top: Math.max(8, anchor.top - 71),
          }}
        >
          <strong>{presentation.name}</strong>
          {remaining} / {counter.max} remaining
          <small>Click to edit maximum and remaining</small>
        </div>,
        document.body,
      )}
    </>
  );
}

function AdjustCounter({
  character,
  group,
  name,
  counter,
  reference,
  onClose,
}: {
  character: Character;
  group: Group;
  name: string;
  counter: Counter;
  reference: number | null;
  onClose: () => void;
}) {
  const setResource = useStore((s) => s.setResource);
  const [original, setOriginal] = useState(counter);
  const [maximum, setMaximum] = useState(String(counter.max));
  const [maxEdited, setMaxEdited] = useState(false);
  const [remaining, setRemaining] = useState<string | null>(null);
  const max = Number(maximum);
  const left =
    remaining === null
      ? remainingAfterMax(max, original.used)
      : Number(remaining);
  const stale = counter.max !== original.max || counter.used !== original.used;
  const valid =
    maximum.trim() !== '' &&
    Number.isSafeInteger(max) &&
    max >= 0 &&
    (remaining === null || remaining.trim() !== '') &&
    Number.isSafeInteger(left) &&
    left >= 0 &&
    left <= max;
  return (
    <form
      className="resource-adjust"
      aria-label={`Adjust ${name}`}
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid || stale) return;
        setResource({
          characterId: character.id,
          group,
          key: name,
          ...(maxEdited ? { max, preserveMax: true } : {}),
          used: max - left,
        });
        onClose();
      }}
    >
      <div className="hud-heading">
        <strong>Adjust {name.replace(/^L(\d)$/, 'Level $1')}</strong>
        <button type="button" className="btn tiny" onClick={onClose}>
          Cancel
        </button>
      </div>
      {group === 'spellSlots' && (
        <p className="hint">
          {reference === null
            ? '2024 reference unavailable — custom / ambiguous class or Pact Magic.'
            : `2024 reference: ${reference} standard slots. This is guidance, not a limit.`}
        </p>
      )}
      <div className="adjust-fields">
        <label>
          Total maximum
          <input
            autoFocus
            type="number"
            min="0"
            step="1"
            value={maximum}
            onChange={(e) => {
              setMaximum(e.target.value);
              setMaxEdited(true);
            }}
          />
        </label>
        <label>
          Remaining
          <input
            type="number"
            min="0"
            step="1"
            value={remaining ?? String(left)}
            onChange={(e) => setRemaining(e.target.value)}
          />
        </label>
      </div>
      <p className="hint">
        {valid
          ? `${left} / ${max} available after Apply${reference === null ? '' : ` · ${Math.max(0, max - reference)} extra capacity`}`
          : 'Enter whole numbers; remaining must be between zero and maximum.'}
      </p>
      <p className="muted">
        Maximum changes keep spent uses unless you edit Remaining. Saved totals
        are not recalculated from this reference.
      </p>
      {stale && (
        <p role="status">
          This resource changed during play.{' '}
          <button
            type="button"
            className="btn tiny"
            onClick={() => {
              setOriginal(counter);
              setMaximum(String(counter.max));
              setMaxEdited(false);
              setRemaining(null);
            }}
          >
            Reload current values
          </button>
        </p>
      )}
      <div className="hud-heading">
        <button className="btn" disabled={!valid || stale}>
          Apply correction
        </button>
        <button
          type="button"
          className="btn danger tiny"
          onClick={() => {
            if (
              window.confirm(
                `Remove the ${name} tracker? This does not remove spells or abilities.`,
              )
            ) {
              setResource({
                characterId: character.id,
                group,
                key: name,
                remove: true,
              });
              onClose();
            }
          }}
        >
          Remove tracker
        </button>
      </div>
    </form>
  );
}

/** A skin over the existing aggregate max/used model and resource:set action. */
export function JeweledResources({ character, layout = 'concentric', overflowCustomResources = [], onRingCountChange }: {
  character: Character;
  layout?: ResourceLayout;
  overflowCustomResources?: readonly string[];
  onRingCountChange?: (count: number) => void;
}) {
  const setResource = useStore((s) => s.setResource);
  const [expanded, setExpanded] = useState(false);
  // One visibility/media subscription for the entire rack, not one per gem.
  const [gemMotion, setGemMotion] = useState<ResourceGemMotion>(() => ({
    reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
    hidden: document.hidden,
  }));
  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setGemMotion((previous) => {
      const next = { reduced: media.matches, hidden: document.hidden };
      return previous.reduced === next.reduced && previous.hidden === next.hidden ? previous : next;
    });
    update();
    media.addEventListener('change', update);
    document.addEventListener('visibilitychange', update);
    return () => {
      media.removeEventListener('change', update);
      document.removeEventListener('visibilitychange', update);
    };
  }, []);
  const [editing, setEditing] = useState<{ group: Group; name: string } | null>(
    null,
  );
  const root = useRef<HTMLElement>(null);
  const customTooltipId = useId();
  const customDrawerId = useId();
  const [dockWidth, setDockWidth] = useState(356);
  const [orb, setOrb] = useState<OrbGeometry>({ size: 204, cx: 126.48, cy: 99.55, radius: 63.24, rim: 72.63 });
  useEffect(() => {
    const hud = root.current?.closest<HTMLElement>('.player-hud');
    const sculpture = hud?.querySelector<HTMLElement>('.hud-orb-cluster');
    const globe = hud?.querySelector<HTMLElement>('.main-orb');
    if (!hud || !sculpture || !globe) return;
    const measure = () => {
      // offsetLeft/offsetWidth round to whole CSS pixels. Preserve subpixel
      // geometry through browser zoom so the rails and actual globe share one
      // precise centre, including art variants with fractional percentages.
      const frame = sculpture.getBoundingClientRect();
      const circle = globe.getBoundingClientRect();
      const size = parseFloat(getComputedStyle(sculpture).width);
      const scale = frame.width / size;
      if (!(size > 0 && scale > 0)) return;
      const radius = circle.width / scale / 2;
      const rimRatio = hud?.dataset.orbArt === 'half-elf-ranger' ? .411 : hud?.dataset.orbArt === 'half-orc-fighter' ? .374 : hud?.dataset.orbArt === 'tiefling-sorcerer' ? .356 : .405;
      const next = { size, cx: (circle.left - frame.left) / scale + radius, cy: (circle.top - frame.top) / scale + radius, radius, rim: size * rimRatio };
      setOrb((previous) => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
      setDockWidth(parseFloat(getComputedStyle(hud).width));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(sculpture);
    observer.observe(globe);
    observer.observe(hud);
    return () => observer.disconnect();
  }, [character.id, character.race, character.className]);
  useEffect(() => {
    if (!expanded) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setExpanded(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setExpanded(false);
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [expanded]);
  const reference = slotReference2024(
    character.className,
    character.level,
    character.subclass,
  );
  const rows = prioritizeResourceRows([
    ...Object.entries(character.spellSlots)
      .map(([name, counter]) => ({
        group: 'spellSlots' as const,
        name,
        counter,
      })),
    ...Object.entries(character.resources).map(([name, counter]) => ({
      group: 'resources' as const,
      name,
      counter,
    })),
  ]);
  // Every saved tracker can occupy the rack. Priority is presentation-only:
  // new spell/class rows push custom rows outward without rewriting counters.
  const eligibleRows = rows.filter((row) => !overflowCustomResources.includes(row.name) || row.group === 'spellSlots'
    || resourceSigilPresentation(row.group, row.name).kind !== 'custom');
  const compactRows = eligibleRows.slice(0, MAX_RESOURCE_RINGS);
  // Curves are a presentation option only. Non-fitting/extra rows retain all
  // their controls in the additional-resources drawer; no counters are lost.
  const arcs = new Map<string, OrbArc>();
  if (layout === 'concentric') {
    for (const row of eligibleRows) {
      const arc = resourceArc(orb, arcs.size, row.counter.max);
      if (arc) arcs.set(`${row.group}:${row.name}`, arc);
    }
  }
  const curvedRows = rows.filter((row) => arcs.has(`${row.group}:${row.name}`));
  const overflowRows = layout === 'concentric'
    ? rows.filter((row) => !arcs.has(`${row.group}:${row.name}`))
    : rows.filter((row) => !compactRows.includes(row));
  const hasOverflow = overflowRows.length > 0;
  useEffect(() => {
    if (!hasOverflow) setExpanded(false);
  }, [hasOverflow]);
  const ringCount = arcs.size;
  useLayoutEffect(() => { onRingCountChange?.(ringCount); }, [onRingCountChange, ringCount]);
  const current = editing ? character[editing.group][editing.name] : undefined;
  const outermostRight = Math.max(orb.size, ...Array.from(arcs.values()).flatMap((arc) =>
    Array.from({ length: arc.count + 1 }, (_, index) => orb.cx + arcPoint(arc, index).x + (index === 0 ? 13 : 8.5)),
  ));
  const iconFitsRight = outermostRight + 33 <= dockWidth - 4;
  // Usually just right of the outer ring. With five wide rings, tuck below the
  // symbol baseline instead of covering a jewel or extending the HUD bounds.
  const customPosition = layout === 'concentric'
    ? { left: Math.min(outermostRight + 7, dockWidth - 30), top: orb.size - RESOURCE_SYMBOL_BASELINE_INSET - 13 + (iconFitsRight ? 0 : 30) }
    : undefined;
  return (
    <section
      ref={root}
      className={`jeweled-resources orb-resource-dock${expanded ? ' expanded' : ''}`}
      data-resource-rings={ringCount}
      aria-label="Character resources"
    >
      {hasOverflow && <div className="hud-heading resource-dock-tools" style={customPosition}>
        <button
          type="button"
          className="resource-title resource-custom-trigger"
          aria-label={`Additional resources (${overflowRows.length})`}
          aria-expanded={expanded}
          aria-controls={customDrawerId}
          aria-describedby={customTooltipId}
          title={expanded ? 'Close additional resources' : `Open ${overflowRows.length} additional resource trackers`}
          onClick={() => setExpanded((v) => !v)}
        >
          <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">
            <path d="m16 1 10 5 5 10-5 10-10 5-10-5L1 16 6 6Z" fill="#362c20" stroke="#c9ac78" />
            <path d="m16 4 8 4 4 8-4 8-8 4-8-4-4-8 4-8Z" fill="#151619" stroke="#786242" />
            <g fill="#8d744e" stroke="#ead2a0" strokeWidth="1.1" strokeLinejoin="round">
              <path d="m16 7 4 7-4 9-4-9Z" /><path d="m8 15 4 3 1 8-6-5Z" /><path d="m24 15-4 3-1 8 6-5Z" />
            </g>
            <path d="M16 8v13M8 16l4 8m12-8-4 8" fill="none" stroke="#f4deb2" strokeWidth=".65" />
          </svg>
          <span id={customTooltipId} role="tooltip" className="resource-tool-tooltip">Additional resources</span>
        </button>
      </div>}
      <div className="core-resource-rows" aria-label="Spell slots, class and custom resources">
        {curvedRows.length > 0 && <div className="concentric-resource-rows" style={{ height: orb.size }}>
          {curvedRows.map((row) => renderRow(row, true, arcs.get(`${row.group}:${row.name}`)))}
        </div>}
        {layout === 'compact' && compactRows.length > 0 && <div className="compact-resource-rows" aria-label="Spell slots, class and custom resource rows">
          {compactRows.map((row) => renderRow(row, true))}
        </div>}
      </div>
      {curvedRows.some((row) => row.group === 'spellSlots') && reference === null && <small className="resource-reference-warning">2024 slot reference unconfirmed · saved values retained</small>}
      {expanded && hasOverflow && <section id={customDrawerId} className="custom-resource-drawer fantasy-window" aria-label="Additional resource trackers">
        <div className="hud-heading"><strong>Additional resources</strong><button type="button" className="btn tiny" aria-label="Close additional resources" onClick={() => setExpanded(false)}>Close</button></div>
        <div className="resource-rows custom-resource-rows">
          {overflowRows.map((row) => renderRow(row, false))}
          {!overflowRows.length && <p className="muted">No additional trackers. Add one in Character → Resources → + Row.</p>}
        </div>
        <p className="muted custom-resource-help">Add trackers in Character → Resources → + Row. Click a tracker symbol here to edit its maximum and remaining uses.</p>
        <a className="resource-reference" href={SLOT_REFERENCE_SOURCE} target="_blank" rel="noreferrer" aria-label="2024 resource reference: advisory only" title="Your saved values and manual overrides are retained.">2024 reference · advisory only</a>
      </section>}
      {!rows.length && <small className="empty-resource-dock">Add trackers in Character → Resources.</small>}
      {renderEditors()}
    </section>
  );

  function renderRow({ name, counter, group }: typeof rows[number], compact: boolean, arc?: OrbArc) {
          const presentation = resourceSigilPresentation(group, name);
          const standard =
            group === 'spellSlots' && reference !== null
              ? (reference[name] ?? 0)
              : null;
          const remaining = counter.max - counter.used;
          const position = (index: number) => {
            if (!arc) return undefined;
            const { x, y } = arcPoint(arc, index);
            return { left: orb.cx + x, top: orb.cy + y };
          };
          const start = arc ? arcPoint(arc, 0) : null, end = arc ? arcPoint(arc, counter.max) : null;
          return (
            <div
              className={`jewel-row ${group === 'spellSlots' ? 'arcane' : 'class-resource'}${compact ? ' core-resource' : ''}${arc ? ' curved-resource' : ''}`}
              key={`${group}:${name}`}
            >
              {arc && start && end && <svg className="resource-arc-metal" aria-hidden="true" style={{ left: orb.cx, top: orb.cy }}>
                <path d={`M${start.x} ${start.y} A${arc.radius} ${arc.radius} 0 0 0 ${end.x} ${end.y}`} />
              </svg>}
              <div className="jewel-label" style={position(0)}>
                <ResourceLabel
                  group={group}
                  name={name}
                  counter={counter}
                  onEdit={() => {
                    setEditing({ group, name });
                  }}
                />
              </div>
              <div
                className="jewel-sockets"
                role="group"
                aria-label={`${name}: ${remaining} of ${counter.max} remaining`}
              >
                {Array.from(
                  {
                    length: Math.min(24, Math.max(0, Math.floor(counter.max))),
                  },
                  (_, i) => {
                    const n = i + 1;
                    const bonus = standard !== null && n > standard;
                    const next = remainingAfterPip(
                      counter.max,
                      counter.used,
                      n,
                    );
                    return (
                      <ResourceGem
                        key={`${character.id}:${group}:${name}:${n}`}
                        active={n <= remaining}
                        capacity={counter.max}
                        ordinal={n}
                        kind={presentation.kind}
                        spellLevel={presentation.kind === 'spell' ? Number(name.slice(1)) : undefined}
                        extra={bonus}
                        motion={gemMotion}
                        style={position(n)}
                        label={`${name}${bonus ? ' extra slot' : ' slot'} ${n}: set ${next} remaining`}
                        title={`Set ${next} / ${counter.max} remaining${bonus ? ' · beyond 2024 reference' : ''}`}
                        onClick={() =>
                          setResource({
                            characterId: character.id,
                            group,
                            key: name,
                            used: counter.max - next,
                          })
                        }
                      />
                    );
                  },
                )}
                {counter.max > 24 && (
                  <button
                    className="btn tiny"
                    onClick={() => setEditing({ group, name })}
                  >
                    +{counter.max - 24} · Adjust
                  </button>
                )}
                {counter.max === 0 && (
                  <span className="muted">
                    No capacity · click label to adjust
                  </span>
                )}
              </div>
              {group === 'spellSlots' && reference === null && (
                <small className="muted resource-reference-warning">
                  Reference unconfirmed · saved values retained
                </small>
              )}
            </div>
          );
  }

  function renderEditors() {
    return <>
      {editing && current && (
        <AdjustCounter
          key={`${editing.group}:${editing.name}`}
          character={character}
          group={editing.group}
          name={editing.name}
          counter={current}
          reference={
            editing.group === 'spellSlots' && reference !== null
              ? (reference[editing.name] ?? 0)
              : null
          }
          onClose={() => setEditing(null)}
        />
      )}
    </>;
  }
}
