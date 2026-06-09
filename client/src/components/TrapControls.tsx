import type { StateSnapshot } from '../../../shared/types';
import { useStore } from '../state/socket';

/**
 * Trap-specific controls layered onto a trap object. The DM gets a **Trigger**
 * button per authored effect (a stat-block action with a structured roll — fired
 * via the same `monster:action` flow as any creature, then applied from the log)
 * plus a disarm-DC field. A player holding a character gets a **Disarm** button
 * that rolls a DEX (Sleight of Hand) check server-side; on success the trap flips
 * to "Disarmed".
 */
export function TrapControls({
  snapshot,
  monsterId,
  editable,
}: {
  snapshot: StateSnapshot;
  monsterId: string;
  editable: boolean;
}) {
  const rollMonsterAction = useStore((s) => s.rollMonsterAction);
  const disarmTrap = useStore((s) => s.disarmTrap);
  const updateMonster = useStore((s) => s.updateMonster);
  const setCondition = useStore((s) => s.setCondition);
  const socketId = useStore((s) => s.socket?.id);

  const m = snapshot.monsters.find((x) => x.id === monsterId);
  if (!m) return null;
  // `actions` only ride on the DM (full) snapshot; players never receive them.
  const actions = 'actions' in m ? m.actions : [];
  const rollable = actions
    .map((a, i) => ({ a, i }))
    .filter(({ a }) => !!a.roll);
  const dc = 'objectDc' in m ? m.objectDc : undefined;
  const myCharacter = snapshot.characters.find((c) => c.claimedBy === socketId);

  const fire = (index: number) => {
    rollMonsterAction(monsterId, index);
    // Flip the state to Triggered (then apply damage from the roll log).
    if (!m.conditions.some((c) => c.label.toLowerCase() === 'triggered'))
      setCondition('monster', monsterId, {
        label: 'Triggered',
        aura: 'red',
        isConcentration: false,
      });
  };

  return (
    <div className="trap-controls">
      {editable && (
        <div className="trap-fire">
          {rollable.length === 0 ? (
            <p className="muted">
              Add a save/attack action in the stat block below to give this trap a
              triggerable effect.
            </p>
          ) : (
            rollable.map(({ a, i }) => (
              <button
                key={i}
                className="btn tiny"
                onClick={() => fire(i)}
                title="Fire this trap — then assign damage from the roll log"
              >
                ⚡ Trigger: {a.name}
              </button>
            ))
          )}
          <label className="trap-dc" title="Check DC a character must beat to disarm">
            Disarm DC
            <input
              type="number"
              min={1}
              value={dc ?? 12}
              onChange={(e) =>
                updateMonster({ monsterId, objectDc: Math.max(1, Number(e.target.value)) })
              }
            />
          </label>
        </div>
      )}
      {myCharacter && (
        <button
          className="btn tiny"
          onClick={() => disarmTrap({ monsterId, characterId: myCharacter.id })}
          title="Roll a Dexterity (Sleight of Hand) check to disarm this trap"
        >
          🔧 Disarm
        </button>
      )}
    </div>
  );
}
