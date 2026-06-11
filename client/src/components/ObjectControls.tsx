import type { AuraColor, ObjectKind, StateSnapshot, Token } from '../../../shared/types';
import { useStore } from '../state/socket';
import { LootControls } from './LootControls';
import { TrapControls } from './TrapControls';

/** Object kinds that can hold loot (a container or a pile). */
const LOOTABLE: ObjectKind[] = ['chest', 'item', 'other'];

/** Glyph + label per object kind. */
const OBJECT_META: Record<ObjectKind, { icon: string; label: string }> = {
  trap: { icon: '🪤', label: 'Trap' },
  door: { icon: '🚪', label: 'Door' },
  chest: { icon: '📦', label: 'Chest' },
  item: { icon: '✨', label: 'Item' },
  other: { icon: '⚙️', label: 'Object' },
};

/** State toggles offered per object kind (each is a condition on the object). */
const STATE_CHIPS: Record<ObjectKind, { label: string; aura: AuraColor }[]> = {
  door: [
    { label: 'Locked', aura: 'red' },
    { label: 'Open', aura: 'green' },
  ],
  chest: [
    { label: 'Locked', aura: 'red' },
    { label: 'Open', aura: 'green' },
    { label: 'Looted', aura: 'blue' },
  ],
  trap: [
    { label: 'Armed', aura: 'red' },
    { label: 'Disarmed', aura: 'green' },
    { label: 'Triggered', aura: 'red' },
  ],
  item: [{ label: 'Taken', aura: 'blue' }],
  other: [
    { label: 'Active', aura: 'red' },
    { label: 'Resolved', aura: 'green' },
  ],
};

/**
 * Interaction controls for a non-combat object (trap/door/chest/item). State is
 * stored as conditions on the underlying entity, so it shows in the hover card
 * and everywhere conditions render. The DM toggles state + reveals/hides; players
 * see the object's current state read-only.
 */
export function ObjectControls({
  snapshot,
  token,
  editable,
}: {
  snapshot: StateSnapshot;
  token: Token;
  editable: boolean;
}) {
  const setCondition = useStore((s) => s.setCondition);
  const clearCondition = useStore((s) => s.clearCondition);
  const setTokenHidden = useStore((s) => s.setTokenHidden);
  const interactObject = useStore((s) => s.interactObject);
  const socketId = useStore((s) => s.socket?.id);

  const m = snapshot.monsters.find((x) => x.id === token.refId);
  if (!m || !m.objectKind) return null;
  const meta = OBJECT_META[m.objectKind];
  const chips = STATE_CHIPS[m.objectKind] ?? STATE_CHIPS.other;
  const has = (label: string) =>
    m.conditions.find((c) => c.label.toLowerCase() === label.toLowerCase());

  const toggle = (label: string, aura: AuraColor) => {
    const existing = has(label);
    if (existing) clearCondition('monster', m.id, existing.id);
    else setCondition('monster', m.id, { label, aura, isConcentration: false });
  };

  return (
    <div className="object-controls">
      <div className="object-head">
        <span className="object-kind">
          {meta.icon} {meta.label}
        </span>
        {token.isHidden && <span className="muted">· hidden from players</span>}
      </div>
      {m.conditions.length > 0 && (
        <div className="object-state">
          {m.conditions.map((c) => (
            <span key={c.id} className={`chip chip-on ${c.aura}`}>
              {c.label}
              {c.customText ? `: ${c.customText}` : ''}
            </span>
          ))}
        </div>
      )}
      {editable ? (
        <div className="object-actions">
          {chips.map((chip) => (
            <button
              key={chip.label}
              className={`chip ${has(chip.label) ? `chip-on ${chip.aura}` : ''}`}
              onClick={() => toggle(chip.label, chip.aura)}
              title={`Toggle ${chip.label}`}
            >
              {chip.label}
            </button>
          ))}
          <button
            className="chip"
            onClick={() => setTokenHidden(token.id, !token.isHidden)}
            title="Hidden objects aren't shown to players"
          >
            {token.isHidden ? '🙈 Reveal' : '👁 Hide'}
          </button>
        </div>
      ) : (
        m.conditions.length === 0 && <p className="muted">No visible state.</p>
      )}
      {/* Players (and the DM) can pick a locked door/chest or open an unlocked
          one — the missing affordance that made locked chests feel broken. */}
      {(m.objectKind === 'door' || m.objectKind === 'chest') && (() => {
        const locked = !!has('locked');
        const open = !!has('open');
        const myPc = snapshot.characters.find((c) => c.claimedBy === socketId);
        const actorId = editable ? undefined : myPc?.id;
        const canAct = editable || !!myPc;
        if (!canAct) return null;
        return (
          <div className="object-interact">
            {locked ? (
              <button
                className="btn tiny"
                onClick={() =>
                  interactObject({ monsterId: m.id, characterId: actorId, action: 'unlock' })
                }
                title={
                  editable
                    ? 'Force the lock open (DM)'
                    : `Pick the lock — DEX check vs DC ${('objectDc' in m && m.objectDc) || 12}`
                }
              >
                🔓 {editable ? 'Unlock' : 'Pick lock'}
              </button>
            ) : (
              <button
                className="btn tiny"
                onClick={() => interactObject({ monsterId: m.id, action: 'open' })}
                title={open ? 'Close it' : 'Open it'}
              >
                {open ? '🚪 Close' : '🔓 Open'}
              </button>
            )}
          </div>
        );
      })()}
      {m.objectKind === 'trap' && (
        <TrapControls snapshot={snapshot} monsterId={m.id} editable={editable} />
      )}
      {LOOTABLE.includes(m.objectKind) && (
        <LootControls
          snapshot={snapshot}
          monsterId={m.id}
          loot={m.loot}
          editable={editable}
        />
      )}
    </div>
  );
}
