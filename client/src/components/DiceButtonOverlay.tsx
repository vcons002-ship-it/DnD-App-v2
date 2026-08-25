import { useEffect, useState } from 'react';
import type { StateSnapshot } from '../../../shared/types';
import { useStore } from '../state/socket';

// Basic dice revealed above the d20 (matches DicePanel's quick set).
const DICE = ['d20', 'd12', 'd10', 'd8', 'd6', 'd4', 'd100'];

/** Touch devices have no hover, so the CSS-hover reveal can't work; detect them
 *  to switch the d20 button from "click rolls" to "tap opens the dice menu". */
const isTouch = (): boolean =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(hover: none)').matches;

/**
 * WHOSE advantage this arms — the same per-entity key the roll will consume, so
 * the map switch and the panels are one switch, never two.
 *
 * The DM acts as the token they've selected (its attacks consume that creature's
 * key in `CombatSection`), falling back to the generic dice-panel key. A player
 * acts as their own claimed PC, unless they've selected a friendly creature they
 * control (a companion/summon) — then it's that creature's, mirroring how
 * `floatingAttacker` picks the attacker on the map.
 */
function advKeyFor(
  snapshot: StateSnapshot,
  selectedIds: string[],
  mySocketId: string | undefined,
): { key: string; who: string } {
  const isDm = snapshot.role === 'dm';
  const selected = snapshot.tokens.filter((t) => selectedIds.includes(t.id));
  const nameOf = (refId: string, kind: string) =>
    (kind === 'pc'
      ? snapshot.characters.find((c) => c.id === refId)?.name
      : snapshot.monsters.find((m) => m.id === refId)?.name) ?? 'selection';
  if (isDm) {
    const t = selected[0];
    return t ? { key: t.refId, who: nameOf(t.refId, t.kind) } : { key: 'dm-dice', who: 'DM' };
  }
  const mine = snapshot.characters.find((c) => c.claimedBy === mySocketId);
  const friendly = selected.find(
    (t) =>
      t.kind === 'monster' &&
      snapshot.monsters.find((m) => m.id === t.refId)?.disposition === 'friendly',
  );
  if (friendly) return { key: friendly.refId, who: nameOf(friendly.refId, 'monster') };
  return mine ? { key: mine.id, who: mine.name } : { key: 'dm-dice', who: 'you' };
}

/**
 * The map's dice corner: an always-visible ADV / DIS pair over a D20-shaped
 * quick-roll button, pinned bottom-right.
 *
 * The adv/dis switch lives HERE because it needs to be reachable (and readable)
 * without hunting through a side panel — it's armed mid-turn, right before a
 * roll. It's the same per-entity toggle the character sheet and dice panel show,
 * so arming it here arms it everywhere; it clears itself when the roll fires.
 *
 * The d20 sits semi-transparent until hovered, which fades it in and reveals the
 * basic dice; clicking it rolls 1d20 (with whatever is armed). On touch (no
 * hover), a tap OPENS the dice menu instead of rolling — otherwise hover
 * emulation made one tap both roll a d20 AND open the menu. Rolls go through the
 * same server-authoritative `dice:roll` path as DicePanel.
 */
export function DiceButtonOverlay({ selectedIds }: { selectedIds: string[] }) {
  const rollDice = useStore((s) => s.rollDice);
  const snapshot = useStore((s) => s.snapshot);
  const mySocketId = useStore((s) => s.socket?.id);
  const setAdv = useStore((s) => s.setManualAdvantage);
  const consumeAdvantage = useStore((s) => s.consumeAdvantage);
  const [open, setOpen] = useState(false);

  const { key, who } = snapshot
    ? advKeyFor(snapshot, selectedIds, mySocketId)
    : { key: 'dm-dice', who: 'DM' };
  const adv = useStore((s) => s.manualAdvantage[key]);

  const roll = (d: string) => {
    // The map d20 honors the armed adv/dis like every other roll surface.
    rollDice({ expr: `1${d}`, advantage: consumeAdvantage(key) });
    setOpen(false);
  };

  // While the touch menu is open, a tap anywhere else closes it.
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const id = window.setTimeout(() => window.addEventListener('pointerdown', close), 0);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener('pointerdown', close);
    };
  }, [open]);

  return (
    <div className={`dice-button-overlay${open ? ' open' : ''}${adv ? ' armed' : ''}`}>
      {/* stopPropagation so tapping a die doesn't trip the tap-away close first */}
      <div className="dice-quick-menu" onPointerDown={(e) => e.stopPropagation()}>
        {DICE.map((d) => (
          <button
            key={d}
            className="btn tiny"
            onClick={() => roll(d)}
            title={`Roll 1${d}`}
          >
            {d}
          </button>
        ))}
      </div>
      <div className="dice-adv-row" onPointerDown={(e) => e.stopPropagation()}>
        <button
          className={`dice-adv-btn up${adv === 'adv' ? ' on' : ''}`}
          title={`Advantage on ${who}'s next roll of any kind, then it clears`}
          onClick={() => setAdv(key, adv === 'adv' ? null : 'adv')}
        >
          ⬆ ADV
        </button>
        <button
          className={`dice-adv-btn down${adv === 'dis' ? ' on' : ''}`}
          title={`Disadvantage on ${who}'s next roll of any kind, then it clears`}
          onClick={() => setAdv(key, adv === 'dis' ? null : 'dis')}
        >
          ⬇ DIS
        </button>
      </div>
      {/* Armed state names WHO it applies to — on the DM's screen the answer
          changes with the selection, so it can't be left implicit. */}
      {adv && (
        <div className={`dice-adv-armed ${adv}`}>
          {who}: {adv === 'adv' ? 'advantage' : 'disadvantage'}
        </div>
      )}
      <button
        className="dice-d20-btn"
        onClick={() => (isTouch() ? setOpen((o) => !o) : roll('d20'))}
        title="Roll a d20 — hover (or tap) for more dice"
        aria-label="Roll a d20"
      >
        <svg viewBox="0 0 100 100" aria-hidden="true">
          <polygon className="d20-outline" points="50,4 90,27 90,73 50,96 10,73 10,27" />
          <polygon className="d20-face" points="50,30 72,68 28,68" />
          <line className="d20-edge" x1="50" y1="30" x2="50" y2="4" />
          <line className="d20-edge" x1="28" y1="68" x2="10" y2="73" />
          <line className="d20-edge" x1="72" y1="68" x2="90" y2="73" />
          <text className="d20-num" x="50" y="55">20</text>
        </svg>
      </button>
    </div>
  );
}
