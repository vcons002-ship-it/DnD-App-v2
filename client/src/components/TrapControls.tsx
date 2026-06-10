import type { StateSnapshot } from '../../../shared/types';
import { useStore } from '../state/socket';

/**
 * Trap-specific controls layered onto a trap object. The DM gets a **Trigger**
 * button per authored effect (a sheet ability with a structured roll — fired via
 * the same `ability:roll` flow as any creature, then applied from the log) plus
 * a disarm-DC field. A player holding a character gets a **Disarm** button
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
  const rollAbility = useStore((s) => s.rollAbility);
  const disarmTrap = useStore((s) => s.disarmTrap);
  const updateMonster = useStore((s) => s.updateMonster);
  const setCondition = useStore((s) => s.setCondition);
  const socketId = useStore((s) => s.socket?.id);

  const m = snapshot.monsters.find((x) => x.id === monsterId);
  if (!m) return null;
  // `sheetAbilities` only ride on the DM (full) snapshot; players never get them.
  const rollable = ('sheetAbilities' in m ? m.sheetAbilities : []).filter(
    (a) => !!a.roll,
  );
  const dc = 'objectDc' in m ? m.objectDc : undefined;
  const myCharacter = snapshot.characters.find((c) => c.claimedBy === socketId);

  const fire = (abilityId: string) => {
    rollAbility({ kind: 'monster', refId: monsterId, abilityId });
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
              Add a save/attack ability in the Spells &amp; Abilities section to
              give this trap a triggerable effect.
            </p>
          ) : (
            rollable.map((a) => (
              <button
                key={a.id}
                className="btn tiny"
                onClick={() => fire(a.id)}
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
