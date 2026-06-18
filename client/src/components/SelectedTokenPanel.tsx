import { useEffect, useRef, useState } from 'react';
import type {
  Character,
  Monster,
  MonsterPublic,
  StateSnapshot,
  Token,
} from '../../../shared/types';
import { resolveToken } from '../lib/entities';
import { useStore } from '../state/socket';
import { ConditionPicker } from './ConditionPicker';
import { StatBlock, ActionsTraitsView } from './StatBlock';
import { CharacterSheet } from './CharacterSheet';
import { CharacterSpells } from './CharacterSpells';
import { LibrarySaveDialog } from './LibrarySaveDialog';
import { CombatSection } from './CombatSection';
import { DamageHealControls } from './DamageHealControls';
import { ObjectControls } from './ObjectControls';
import { LootControls } from './LootControls';
import { IconTools } from './IconTools';
import { TokenAdminButtons } from './TokenAdminButtons';
import { AdvantageToggle } from './AdvantageToggle';
import { ReorderableSections, type Section } from './ReorderableSections';

type Props = {
  snapshot: StateSnapshot;
  token: Token;
  /** All selected token ids, so icon changes can apply to the whole selection. */
  selectedIds?: string[];
};

/** Right-side detail panel for the currently selected token (DM + player). */
export function SelectedTokenPanel({ snapshot, token, selectedIds }: Props) {
  const applyDamage = useStore((s) => s.applyDamage);
  const setTempHp = useStore((s) => s.setTempHp);
  const resizeToken = useStore((s) => s.resizeToken);
  const updateMonster = useStore((s) => s.updateMonster);
  const updateCharacter = useStore((s) => s.updateCharacter);
  const setCondition = useStore((s) => s.setCondition);
  const clearCondition = useStore((s) => s.clearCondition);
  const aiFillCreature = useStore((s) => s.aiFillCreature);
  const rollSave = useStore((s) => s.rollSave);
  const rollCheck = useStore((s) => s.rollCheck);
  const consumeAdvantage = useStore((s) => s.consumeAdvantage);
  const aiBusy = useStore((s) => s.aiBusy);
  const setTokensCombatRole = useStore((s) => s.setTokensCombatRole);
  const setTokensIcon = useStore((s) => s.setTokensIcon);
  const setTokenShape = useStore((s) => s.setTokenShape);
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
  // A non-combat object (trap/door/chest/item) → show interact controls.
  const objectKind = monsterEntity?.objectKind;
  // The PC's character — anyone may VIEW the sheet; the DM or owning player edits.
  const character =
    token.kind === 'pc'
      ? snapshot.characters.find((c) => c.id === token.refId)
      : undefined;
  const canEditCharacter =
    !!character && (isDm || character.claimedBy === mySocketId);
  // The viewer can roll this token's attacks if they're the DM or own the PC.
  const canAttack = isDm || (!!character && character.claimedBy === mySocketId);
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

  // A player viewing an object (chest/door/…) sees its state read-only — not a
  // combat console. The DM falls through to the full editable panel below.
  if (objectKind && !isDm) {
    return (
      <div className="panel-section">
        <h3>{d.name}</h3>
        {canSeeHp && (
          <div className="hp-line">
            HP: {d.curHp} / {d.maxHp}
          </div>
        )}
        <ObjectControls snapshot={snapshot} token={token} editable={false} />
        {!!monsterEntity?.playerNotes && (
          <p className="muted">{monsterEntity.playerNotes}</p>
        )}
      </div>
    );
  }

  // Player combat console: their attacks (vs the clicked token) + abilities.
  // Same rearrangeable/collapsible sections as the DM token panel.
  if (myChar) {
    const selectingOwn = !!myToken && token.id === myToken.id;
    const consoleSections: Section[] = [];
    // The ONE rolling surface: target dropdown + weapons + rollable abilities.
    // First in the fallback order so it lands on top (existing saved orders
    // slot never-seen ids in at their designed position).
    consoleSections.push({
      id: 'combat',
      label: 'Combat',
      node: myToken ? (
        <CombatSection
          snapshot={snapshot}
          attacker={myToken}
          caster={myChar}
          kind="pc"
          defaultTargetId={selectingOwn ? undefined : token.id}
        />
      ) : (
        <p className="muted">Place your token on the map to attack.</p>
      ),
    });
    if (!selectingOwn) {
      consoleSections.push({
        id: 'target',
        label: 'Target details',
        node: (
          <CreatureDetails
            monster={monster}
            monsterEntity={monsterEntity}
            character={character}
          />
        ),
      });
    }
    consoleSections.push({
      id: 'abilities',
      label: 'Spells & Abilities',
      node: (
        // Read-only reference list (collapsible rows → description) so the
        // player sees everything they added without scrolling; rolling +
        // toggles live in the Combat section, editing on the left-panel sheet.
        <CharacterSpells character={myChar} editable={false} rollsElsewhere />
      ),
    });
    // Loot a fallen creature whose loot the DM revealed (server-gated).
    if (token.kind === 'monster' && monsterEntity && 'loot' in monsterEntity && monsterEntity.loot) {
      consoleSections.push({
        id: 'loot',
        label: 'Loot',
        node: (
          <LootControls
            snapshot={snapshot}
            monsterId={monsterEntity.id}
            loot={monsterEntity.loot}
            editable={false}
          />
        ),
      });
    }
    return (
      <div className="panel-section">
        {selectingOwn ? (
          <h3>Your attacks &amp; abilities</h3>
        ) : (
          <>
            <h3>{d.name}</h3>
            {canSeeHp && (
              <div className={`hp-line ${(d.curHp ?? 1) <= 0 ? 'zero-hp' : ''}`}>
                HP: {d.curHp} / {d.maxHp}
                {!!d.tempHp && d.tempHp > 0 && (
                  <span className="temp-hp"> +{d.tempHp} temp</span>
                )}
              </div>
            )}
          </>
        )}
        <ReorderableSections
          storageKey={`playerConsole:${snapshot.sessionCode}`}
          sections={consoleSections}
        />
      </div>
    );
  }

  // Standardized, rearrangeable main sections (creatures AND characters). Each is
  // collapsible and reorderable; order + collapse state persist per role + kind.
  const entityKind = monster ? 'monster' : character ? 'pc' : 'token';
  const sections: Section[] = [];

  // The ONE rolling surface (target dropdown + weapons + rollable abilities) —
  // first in the fallback order so it lands on top. Always shown for a
  // creature/PC (CombatSection itself shows a "No attacks" note when empty), so
  // the toggles/resources still have a home and the section never disappears.
  const attackerEntity = monster ?? character;
  const combatShown = canAttack && !!attackerEntity && !objectKind;
  if (combatShown) {
    sections.push({
      id: 'combat',
      label: 'Combat',
      node: (
        <CombatSection
          snapshot={snapshot}
          attacker={token}
          caster={attackerEntity}
          kind={monster ? 'monster' : 'pc'}
        />
      ),
    });
  }

  // Creatures get the same rich, searchable, rollable abilities as PCs — the ONE
  // ability system (legacy free-text actions are converted into it on creation/
  // load). Traits/feats stay in the Sheet info section.
  if (monster && (monster.sheetAbilities.length > 0 || isDm)) {
    sections.push({
      id: 'abilities',
      label: 'Spells & Abilities',
      node: (
        <CharacterSpells
          character={monster}
          kind="monster"
          editable={isDm}
          snapshot={snapshot}
          attackerToken={token}
          rollsElsewhere={combatShown}
        />
      ),
    });
  }

  // DM: stock + reveal loot on any creature (objects carry it via ObjectControls).
  if (isDm && monster && !objectKind) {
    const dead =
      monster.curHp <= 0 ||
      monster.conditions.some((c) => c.label.toLowerCase() === 'dead');
    const revealCond = monster.conditions.find(
      (c) => c.label.toLowerCase() === 'loot revealed',
    );
    sections.push({
      id: 'loot',
      label: 'Loot',
      node: (
        <LootControls
          snapshot={snapshot}
          monsterId={monster.id}
          loot={monster.loot}
          editable
          reveal={{
            revealed: !!revealCond,
            dead,
            onToggle: () =>
              revealCond
                ? clearCondition('monster', monster.id, revealCond.id)
                : setCondition('monster', monster.id, {
                    label: 'Loot revealed',
                    aura: 'blue',
                    isConcentration: false,
                  }),
          }}
        />
      ),
    });
  }

  // PCs mirror the creature layout: spells/abilities (+ free-text actions) live
  // in their own section, and the sheet below omits them (abilitiesElsewhere).
  if (character) {
    sections.push({
      id: 'abilities',
      label: 'Spells & Abilities',
      node: (
        <>
          <CharacterSpells
            character={character}
            editable={canEditCharacter}
            snapshot={snapshot}
            attackerToken={token}
            rollsElsewhere={combatShown}
          />
          {(character.actions.length > 0 || canEditCharacter) && (
            <ActionsTraitsView
              actions={character.actions}
              abilities={character.abilities}
              editable={canEditCharacter}
              showTraits={false}
              onSave={
                canEditCharacter
                  ? (patch) =>
                      updateCharacter({ characterId: character.id, ...patch })
                  : undefined
              }
            />
          )}
        </>
      ),
    });
  }

  if (monster) {
    sections.push({
      id: 'sheet',
      label: 'Sheet info',
      node: (
        <>
          {isDm && (
            <div className="disposition-row">
              <h4>Disposition</h4>
              <div className="disposition-btns">
                {(['friendly', 'neutral', 'enemy'] as const).map((disp) => (
                  <button
                    key={disp}
                    className={`btn tiny disp-${disp} ${monster.disposition === disp ? 'on' : ''}`}
                    onClick={() => updateMonster({ monsterId: monster.id, disposition: disp })}
                    title={
                      disp === 'friendly'
                        ? 'Players see full stats'
                        : disp === 'neutral'
                          ? 'Players see name + HP + type/AC'
                          : 'Players see name + conditions only'
                    }
                  >
                    {disp[0].toUpperCase() + disp.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          )}
          {isDm && (
            <div className="creature-adv-row">
              <span className="muted">Next roll</span>
              <AdvantageToggle entityId={monster.id} />
            </div>
          )}
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
            onSave={isDm ? (patch) => updateMonster({ monsterId: monster.id, ...patch }) : undefined}
            onRollSave={
              isDm
                ? (ability) =>
                    rollSave({
                      kind: 'monster',
                      refId: monster.id,
                      ability,
                      advantage: consumeAdvantage(monster.id),
                    })
                : undefined
            }
            onRollCheck={
              isDm
                ? (ability) =>
                    rollCheck({
                      kind: 'monster',
                      refId: monster.id,
                      ability,
                      advantage: consumeAdvantage(monster.id),
                    })
                : undefined
            }
          />
          {isDm && (
            <button
              className="btn tiny save-library"
              onClick={() => setSavingMonster(monster)}
              title="Save this creature to the cross-session library"
            >
              💾 Save to library
            </button>
          )}
        </>
      ),
    });
  } else if (character) {
    sections.push({
      id: 'sheet',
      label: 'Sheet info',
      node: (
        <CharacterSheet
          character={character}
          editable={canEditCharacter}
          abilitiesElsewhere
        />
      ),
    });
  }

  sections.push({
    id: 'conditions',
    label: 'Conditions',
    node: (
      <ConditionPicker kind={token.kind} refId={token.refId} conditions={d.conditions} />
    ),
  });

  if (monsterEntity) {
    sections.push({
      id: 'notes',
      label: 'Notes',
      node: <CreatureNotes monsterId={monsterEntity.id} notes={monsterEntity.playerNotes} />,
    });
  }

  if (isDm) {
    sections.push({
      id: 'dmtools',
      label: 'DM tools',
      node: (
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
          <h4>Shape</h4>
          <div className="disposition-btns">
            {(
              [
                ['circle', '●'],
                ['square', '■'],
                ['diamond', '◆'],
                ['triangle', '▲'],
                ['image', '🖼'],
              ] as const
            ).map(([sh, glyph]) => (
              <button
                key={sh}
                className={`btn tiny ${(token.shape ?? 'circle') === sh ? 'on' : ''}`}
                title={sh === 'image' ? 'Show the full icon image (no clip)' : sh}
                onClick={() => setTokenShape(token.id, sh)}
              >
                {glyph}
              </button>
            ))}
          </div>
          <h4>Combat role</h4>
          <div className="disposition-btns">
            {([null, 'melee', 'ranged', 'caster'] as const).map((r) => {
              const active = (token.combatRoleOverride ?? null) === r;
              const label =
                r === null ? 'Auto' : r === 'melee' ? '⚔️' : r === 'ranged' ? '🏹' : '✨';
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
          <TokenAdminButtons token={token} variant="panel" roleBadgeTargets={iconTargets} />
        </div>
      ),
    });
  }

  return (
    <div className="panel-section">
      <h3>{d.name}</h3>
      {canSeeHp ? (
        <div className={`hp-line ${(d.curHp ?? 1) <= 0 ? 'zero-hp' : ''}`}>
          HP: {d.curHp} / {d.maxHp}
          {!!d.tempHp && d.tempHp > 0 && (
            <span className="temp-hp"> +{d.tempHp} temp</span>
          )}
        </div>
      ) : (
        <div className="hp-line muted">HP hidden</div>
      )}

      {objectKind && (
        <ObjectControls snapshot={snapshot} token={token} editable={isDm} />
      )}

      <DamageHealControls
        onApply={(delta) => applyDamage(token.kind, token.refId, delta)}
        onTemp={(amt) => setTempHp(token.kind, token.refId, amt)}
      />

      <div className="size-row">
        <span>Size</span>
        <button
          className="btn"
          disabled={!isDm}
          title="Smaller (−2.5 ft)"
          onClick={() => resizeToken(token.id, token.widthFt - 2.5)}
        >
          −
        </button>
        {/* Manual entry in half-foot steps (server snaps + clamps 0.5–120). */}
        <input
          className="size-input"
          type="number"
          step={0.5}
          min={0.5}
          max={120}
          disabled={!isDm}
          value={token.widthFt}
          onChange={(e) =>
            e.target.value !== '' && resizeToken(token.id, Number(e.target.value))
          }
        />
        <span className="muted">ft</span>
        <button
          className="btn"
          disabled={!isDm}
          title="Larger (+2.5 ft)"
          onClick={() => resizeToken(token.id, token.widthFt + 2.5)}
        >
          +
        </button>
      </div>

      <ReorderableSections
        storageKey={`tokenPanel:${snapshot.role}:${entityKind}:${snapshot.sessionCode}`}
        sections={sections}
      />

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
  monsterEntity?: Monster | MonsterPublic;
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
        <>
          <StatBlock
            creature={monster}
            subtitle={monster.creatureType}
            levelLabel="CR"
            monster
          />
          {/* A friendly creature's abilities (the merged action system), read-only. */}
          {monster.sheetAbilities.length > 0 && (
            <CharacterSpells character={monster} kind="monster" editable={false} />
          )}
        </>
      ) : character ? (
        <CharacterSheet character={character} editable={false} />
      ) : monsterEntity ? (
        <div className="muted creature-details-body">
          {hasType && <div>Type: {(monsterEntity as Monster).creatureType}</div>}
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
      {monsterEntity && (
        <CreatureNotes monsterId={monsterEntity.id} notes={monsterEntity.playerNotes} />
      )}
    </details>
  );
}

/**
 * Shared, free-text party notes on a creature/NPC. Editable by the DM AND any
 * player (server gates by session), so the table can jot down what they've
 * learned. Local draft is committed on blur; incoming snapshot edits only
 * overwrite the draft when this field isn't the one being typed in.
 */
function CreatureNotes({ monsterId, notes }: { monsterId: string; notes: string }) {
  const setCreatureNotes = useStore((s) => s.setCreatureNotes);
  const ref = useRef<HTMLTextAreaElement>(null);
  const [draft, setDraft] = useState(notes);
  useEffect(() => {
    if (document.activeElement !== ref.current) setDraft(notes);
  }, [notes]);
  const commit = () => {
    if (draft !== notes) setCreatureNotes(monsterId, draft);
  };
  return (
    <div className="creature-notes">
      <h4>Player notes</h4>
      <textarea
        ref={ref}
        className="creature-notes-text"
        placeholder="Shared notes on this creature/NPC — what the party has learned…"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
      />
    </div>
  );
}
