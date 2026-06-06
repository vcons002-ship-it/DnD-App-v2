import { useState } from 'react';
import type {
  Character,
  Monster,
  MonsterNeutral,
  MonsterPublic,
  StateSnapshot,
  Token,
} from '../../../shared/types';
import { resolveToken } from '../lib/entities';
import { useStore } from '../state/socket';
import { ConditionPicker } from './ConditionPicker';
import { StatBlock } from './StatBlock';
import { CharacterSheet } from './CharacterSheet';
import { CharacterSpells } from './CharacterSpells';
import { LibrarySaveDialog } from './LibrarySaveDialog';
import { AttackControls } from './AttackControls';
import { DamageHealControls } from './DamageHealControls';
import { IconTools } from './IconTools';
import { TokenAdminButtons } from './TokenAdminButtons';

type Props = {
  snapshot: StateSnapshot;
  token: Token;
  /** All selected token ids, so icon changes can apply to the whole selection. */
  selectedIds?: string[];
};

/** Right-side detail panel for the currently selected token (DM + player). */
export function SelectedTokenPanel({ snapshot, token, selectedIds }: Props) {
  const applyDamage = useStore((s) => s.applyDamage);
  const resizeToken = useStore((s) => s.resizeToken);
  const updateMonster = useStore((s) => s.updateMonster);
  const aiFillCreature = useStore((s) => s.aiFillCreature);
  const rollMonsterAction = useStore((s) => s.rollMonsterAction);
  const aiBusy = useStore((s) => s.aiBusy);
  const setTokensCombatRole = useStore((s) => s.setTokensCombatRole);
  const setTokensIcon = useStore((s) => s.setTokensIcon);
  const [savingMonster, setSavingMonster] = useState<Monster | null>(null);

  const d = resolveToken(snapshot, token);
  const canSeeHp = d.curHp !== undefined && d.maxHp !== undefined;
  const isDm = snapshot.role === 'dm';
  const mySocketId = useStore((s) => s.socket?.id);
  // The full monster stat block, when available to this viewer: always for the
  // DM, and for players when the creature is Friendly (the server sends them the
  // full Monster — Neutral/Enemy views lack `stats`, so no block).
  const monsterEntity =
    token.kind === 'monster'
      ? snapshot.monsters.find((m) => m.id === token.refId)
      : undefined;
  const monster =
    monsterEntity && 'stats' in monsterEntity
      ? (monsterEntity as Monster)
      : undefined;
  // The PC's character — anyone may VIEW the sheet; the DM or owning player edits.
  const character =
    token.kind === 'pc'
      ? snapshot.characters.find((c) => c.id === token.refId)
      : undefined;
  const canEditCharacter =
    !!character && (isDm || character.claimedBy === mySocketId);
  // The viewer can roll this token's attacks if they're the DM or own the PC.
  const canAttack = isDm || (!!character && character.claimedBy === mySocketId);
  const attackerWeapons = monster?.weapons ?? character?.weapons ?? [];
  const iconTargets =
    selectedIds && selectedIds.length ? selectedIds : [token.id];

  // A player's own claimed PC + its token on the map — their right panel becomes
  // a combat console (attacks targeting the selected token + abilities/masteries)
  // instead of duplicating the full sheet already shown in the left PlayerPanel.
  const myChar = !isDm
    ? snapshot.characters.find((c) => c.claimedBy === mySocketId)
    : undefined;
  const myToken = myChar
    ? snapshot.tokens.find((t) => t.kind === 'pc' && t.refId === myChar.id)
    : undefined;

  // Player combat console: their attacks (vs the clicked token) + abilities.
  if (myChar) {
    const selectingOwn = !!myToken && token.id === myToken.id;
    return (
      <div className="panel-section">
        {selectingOwn ? (
          <h3>Your attacks &amp; abilities</h3>
        ) : (
          <>
            <h3>{d.name}</h3>
            {canSeeHp && (
              <div className="hp-line">
                HP: {d.curHp} / {d.maxHp}
                {!!d.tempHp && d.tempHp > 0 && (
                  <span className="temp-hp"> +{d.tempHp} temp</span>
                )}
              </div>
            )}
            <CreatureDetails
              monster={monster}
              monsterEntity={monsterEntity}
              character={character}
            />
          </>
        )}
        {myToken ? (
          <AttackControls
            snapshot={snapshot}
            attacker={myToken}
            weapons={myChar.weapons}
            defaultTargetId={selectingOwn ? undefined : token.id}
          />
        ) : (
          <p className="muted">Place your token on the map to attack.</p>
        )}
        <CharacterSpells character={myChar} editable />
      </div>
    );
  }

  return (
    <div className="panel-section">
      <h3>{d.name}</h3>
      {canSeeHp ? (
        <div className="hp-line">
          HP: {d.curHp} / {d.maxHp}
          {!!d.tempHp && d.tempHp > 0 && (
            <span className="temp-hp"> +{d.tempHp} temp</span>
          )}
        </div>
      ) : (
        <div className="hp-line muted">HP hidden</div>
      )}

      <DamageHealControls
        onApply={(delta) => applyDamage(token.kind, token.refId, delta)}
      />

      <div className="size-row">
        <span>Size</span>
        <button
          className="btn"
          disabled={!isDm}
          onClick={() => resizeToken(token.id, token.size - 0.5)}
        >
          −
        </button>
        <span>{token.size}</span>
        <button
          className="btn"
          disabled={!isDm}
          onClick={() => resizeToken(token.id, token.size + 0.5)}
        >
          +
        </button>
      </div>

      {isDm && monster && (
        <div className="disposition-row">
          <h4>Disposition</h4>
          <div className="disposition-btns">
            {(['friendly', 'neutral', 'enemy'] as const).map((d) => (
              <button
                key={d}
                className={`btn tiny disp-${d} ${
                  monster.disposition === d ? 'on' : ''
                }`}
                onClick={() =>
                  updateMonster({ monsterId: monster.id, disposition: d })
                }
                title={
                  d === 'friendly'
                    ? 'Players see full stats'
                    : d === 'neutral'
                    ? 'Players see name + HP + type/AC'
                    : 'Players see name + conditions only'
                }
              >
                {d[0].toUpperCase() + d.slice(1)}
              </button>
            ))}
          </div>
        </div>
      )}

      {monster && (
        <StatBlock
          creature={monster}
          subtitle={monster.creatureType}
          identity={
            isDm
              ? [{ key: 'creatureType', label: 'Type', value: monster.creatureType }]
              : undefined
          }
          levelLabel="CR"
          monster
          aiBusy={aiBusy}
          onAiFill={isDm ? () => aiFillCreature(monster.id) : undefined}
          onSave={
            isDm
              ? (patch) => updateMonster({ monsterId: monster.id, ...patch })
              : undefined
          }
          onRollAction={
            isDm
              ? (actionIndex, advantage) =>
                  rollMonsterAction(monster.id, actionIndex, advantage)
              : undefined
          }
        />
      )}

      {isDm && monster && (
        <button
          className="btn tiny save-library"
          onClick={() => setSavingMonster(monster)}
          title="Save this creature to the cross-session library"
        >
          💾 Save to library
        </button>
      )}

      {character && (
        <CharacterSheet character={character} editable={canEditCharacter} />
      )}

      {canAttack && attackerWeapons.length > 0 && (
        <AttackControls
          snapshot={snapshot}
          attacker={token}
          weapons={attackerWeapons}
        />
      )}

      <h4>Conditions</h4>
      <ConditionPicker kind={token.kind} refId={token.refId} conditions={d.conditions} />

      {isDm && (
        <details className="dm-token-tools">
          <summary>DM tools</summary>
          <div className="dm-token-actions">
            <h4>Token icon</h4>
            <IconTools
              onApply={(icon) => setTokensIcon(iconTargets, icon)}
              note={
                iconTargets.length > 1
                  ? `Applies to ${iconTargets.length} selected tokens`
                  : undefined
              }
            />

            <h4>Combat role</h4>
            <div className="disposition-btns">
              {([null, 'melee', 'ranged', 'caster'] as const).map((r) => {
                const active = (token.combatRoleOverride ?? null) === r;
                const label =
                  r === null
                    ? 'Auto'
                    : r === 'melee'
                    ? '⚔️'
                    : r === 'ranged'
                    ? '🏹'
                    : '✨';
                return (
                  <button
                    key={r ?? 'auto'}
                    className={`btn tiny ${active ? 'on' : ''}`}
                    title={r === null ? 'Derive from stats' : r}
                    onClick={() => setTokensCombatRole(iconTargets, r)}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            <TokenAdminButtons
              token={token}
              variant="panel"
              roleBadgeTargets={iconTargets}
            />
          </div>
        </details>
      )}

      {savingMonster && (
        <LibrarySaveDialog
          monster={savingMonster}
          onClose={() => setSavingMonster(null)}
        />
      )}
    </div>
  );
}

/**
 * A collapsible, read-only "Details" panel for the selected creature, shown at
 * the top of a player's combat console. Collapsed by default (sticky via the
 * store; double-clicking a token forces it open). The content is exactly what
 * the player's disposition tier already grants — the server pre-shapes it, so a
 * friendly creature yields a full read-only stat block while a neutral/enemy one
 * exposes only the few fields the snapshot carries.
 */
function CreatureDetails({
  monster,
  monsterEntity,
  character,
}: {
  monster?: Monster;
  monsterEntity?: Monster | MonsterNeutral | MonsterPublic;
  character?: Character;
}) {
  const open = useStore((s) => s.detailsExpanded);
  const setOpen = useStore((s) => s.setDetailsExpanded);
  const hasType =
    !!monsterEntity && 'creatureType' in monsterEntity && !!monsterEntity.creatureType;
  return (
    <details
      className="creature-details"
      open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
    >
      <summary>Details</summary>
      {monster ? (
        <StatBlock
          creature={monster}
          subtitle={monster.creatureType}
          levelLabel="CR"
          monster
        />
      ) : character ? (
        <CharacterSheet character={character} editable={false} />
      ) : monsterEntity ? (
        <div className="muted creature-details-body">
          {hasType && <div>Type: {(monsterEntity as MonsterNeutral).creatureType}</div>}
          {'armorClass' in monsterEntity && monsterEntity.armorClass ? (
            <div>AC {monsterEntity.armorClass}</div>
          ) : null}
          {monsterEntity.conditions.length > 0 ? (
            <div>Conditions: {monsterEntity.conditions.map((c) => c.label).join(', ')}</div>
          ) : (
            <div>No conditions.</div>
          )}
          {!hasType && <div>No further details available.</div>}
        </div>
      ) : (
        <p className="muted">No details available.</p>
      )}
    </details>
  );
}
