import { useEffect, useRef, useState } from 'react';
import type {
  Character,
  Monster,
  StateSnapshot,
  Token,
  TokenKind,
} from '../../../shared/types';
import { healTargets, validTargets, targetLabel } from '../lib/targets';
import { useWeaponAttackOptions } from '../lib/useWeaponAttackOptions';
import { useStore } from '../state/socket';
import { AbilityButtons } from './AbilityButtons';
import { AbilityToggles, hasToggle } from './AbilityToggles';
import { AdvantageToggle } from './AdvantageToggle';
import { CharacterResources } from './CharacterResources';
import { WeaponButtons } from './WeaponButtons';
import { effectiveSheetAbility, isCanonicalHasteProfile } from '../../../shared/spellExecution';
import { spellCombatSupport } from '../../../shared/spellSupport';
import { spellSlotOptions, selectSpellSlot, type SpellSlotPool } from '../../../shared/spellSlotPools';
import { confirmConcentration, spellBaseLevel, upcastable } from '../lib/spellcasting';
import { SpellCombatSupportBadge } from './SpellCombatSupport';
import { activeHasteCondition, spellActionBlock, spellActionBlockMessage } from '../../../shared/spellBuffs';
import {ActiveSpellActions} from './ActiveSpellActions';
import { HasteExtraAction } from './HasteExtraAction';

/**
 * The right panel's unified "Combat" section: ONE target dropdown plus every
 * rollable action the attacker has against it — weapon attacks (with the
 * off-hand / versatile-2H toggles; the server resolves to-hit vs the target's
 * AC and auto-applies damage) and rollable abilities (attack/save/damage fire
 * at the target; heals pick an ally, self default). This replaces the old
 * standalone Attacks section — the Spells & Abilities section stays for
 * editing/preparing and points its rolls here (`rollsElsewhere`).
 * `defaultTargetId` pre-selects the target (the token a player clicked);
 * players can't target friendly creatures (`validTargets`).
 */
export function CombatSection({
  snapshot,
  attacker,
  caster,
  kind,
  defaultTargetId,
  compactPlayer = false,
}: {
  snapshot: StateSnapshot;
  attacker: Token;
  /** The attacking entity (the attacker token's PC or creature). */
  caster: Character | Monster;
  kind: TokenKind;
  defaultTargetId?: string;
  /** Presentation only; all rolling, targeting and resource actions are shared. */
  compactPlayer?: boolean;
}) {
  const combatAttack = useStore((s) => s.combatAttack);
  const [hasteAttackArmed, setHasteAttackArmed] = useState(false);
  const haste = activeHasteCondition(caster);
  const ownTurn = snapshot.activeTurnTokenId === attacker.id;
  const actionBlock = spellActionBlock(caster);
  useEffect(() => {
    if (!haste || haste.combatEffect?.hasteActionUsed || !ownTurn) setHasteAttackArmed(false);
  }, [haste?.id, haste?.combatEffect?.hasteActionUsed, ownTurn, caster.id]);
  // Advantage/disadvantage is the attacking creature's shared per-entity toggle
  // (set in the skills panel for a PC, or the creature panel for a monster);
  // we just consume it when an attack fires.
  const consumeAdvantage = useStore((s) => s.consumeAdvantage);
  // …and show it right here, big, so it's obvious BEFORE you click an attack
  // (it used to live only in the skills/dice panels, nowhere near the buttons).
  const armedAdv = useStore((s) => s.manualAdvantage[attacker.refId]);
  const summonCast = useStore((s) => s.summonCast);
  const summonMap = useStore((s) => s.snapshot?.map);
  const notify = useStore((s) => s.notify);
  const weapons = caster.weapons;
  const abilities = caster.sheetAbilities.filter((a) => !!effectiveSheetAbility(a).roll || spellCombatSupport(a)?.manualCastOnly);
  const [summonLevels, setSummonLevels] = useState<Record<string, number>>({});
  const [summonPools, setSummonPools] = useState<Record<string, SpellSlotPool>>({});
  const summonLevel = (a: (typeof caster.sheetAbilities)[number]) => summonLevels[a.id] ?? spellBaseLevel(a);
  // Summon-tagged spells/abilities get a ✋ Summon button right here in the console.
  const summonAbilities = caster.sheetAbilities.filter(a=>!spellCombatSupport(a)?.manualCastOnly).map(a=>effectiveSheetAbility(a)).filter((a) => a.summon);
  const castSummon = (a: (typeof summonAbilities)[number]) => {
    if (!summonMap) {
      notify('No active map to summon onto.');
      return;
    }
    if (!confirmConcentration(caster, a)) return;
    const g = summonMap.gridSizePx || 50;
    summonCast({
      kind,
      refId: caster.id,
      abilityId: a.id,
      mapId: summonMap.id,
      x: g * 2 + Math.random() * g * 2,
      y: g * 2 + Math.random() * g * 2,
      castLevel: upcastable(a) ? summonLevel(a) : undefined,
      slotPool: 'spellSlots' in caster ? summonPools[a.id] ?? selectSpellSlot(caster, summonLevel(a))?.pool : undefined,
    });
    notify(`Summon requested — drag ${a.summon?.name?.trim() || a.name} into place after it appears.`);
  };

  const targets = validTargets(snapshot, attacker);
  const validDefault =
    defaultTargetId && targets.some((t) => t.id === defaultTargetId)
      ? defaultTargetId
      : undefined;
  const [targetId, setTargetId] = useState(validDefault ?? targets[0]?.id ?? '');
  const { offhand, twoHanded, toggleOption } = useWeaponAttackOptions(attacker);
  // Pre-select the clicked token as the target when it changes.
  useEffect(() => {
    if (validDefault) setTargetId(validDefault);
  }, [validDefault]);

  // Right-clicking a token on the map aims this dropdown at it (same target the
  // floating menu used), so closing the menu still leaves the panel set up.
  // Only CHANGES count (the nonce ref) — a stale value never overrides the
  // clicked-token default on mount.
  const combatTarget = useStore((s) => s.combatTarget);
  const seenTargetNonce = useRef(combatTarget?.n ?? 0);
  useEffect(() => {
    if (!combatTarget || combatTarget.n === seenTargetNonce.current) return;
    seenTargetNonce.current = combatTarget.n;
    if (targets.some((t) => t.id === combatTarget.id)) setTargetId(combatTarget.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [combatTarget]);

  // Heals pick from allies instead (self first = default) and apply on cast.
  const healList = healTargets(snapshot, attacker);
  const hasHeal = abilities.some((a) => effectiveSheetAbility(a).roll?.kind === 'heal');
  const [healTargetId, setHealTargetId] = useState(healList[0]?.id ?? '');
  const buffList = healList.filter(token => token.mapId === attacker.mapId && !token.sharedSightOnly);
  const hasHasteSpell = abilities.some(isCanonicalHasteProfile);
  const [buffTargetId, setBuffTargetId] = useState(attacker.id);

  const nothingRollable = weapons.length === 0 && abilities.length === 0;
  const anyToggle = caster.sheetAbilities.some(hasToggle);
  const isPc = 'resources' in caster;
  if (nothingRollable && !anyToggle && !isPc && summonAbilities.length === 0)
    return <><HasteExtraAction caster={caster} kind={kind} ownTurn={ownTurn} attackArmed={hasteAttackArmed} onArmAttack={setHasteAttackArmed} /><p className="muted">No attacks or rollable abilities.</p></>;

  // The select state can hold an id no longer in the list (the target token was
  // deleted, or the DM switched maps) — a stale-but-truthy id would leave the
  // attack buttons enabled while firing at a token the server drops silently.
  // Clamp to the live list for everything that reads it.
  const effectiveTargetId = targets.some((t) => t.id === targetId)
    ? targetId
    : targets[0]?.id ?? '';
  const effectiveHealId = healList.some((t) => t.id === healTargetId)
    ? healTargetId
    : healList[0]?.id ?? '';
  const effectiveBuffId = buffList.some(token => token.id === buffTargetId) ? buffTargetId : attacker.id;

  // A 2H toggle only matters when some weapon is versatile (has 2H damage).
  const anyVersatile = weapons.some(
    (w) =>
      w.versatileDamage?.trim() ||
      (w.tags ?? []).some((t) => t.toLowerCase() === 'versatile'),
  );

  const rollControls = (
    <>
      {targets.length > 0 && !nothingRollable && (
        <div className="dice-row combat-target-row">
          <span className="muted spell-tag">Target</span>
          <select aria-label="Attack target" value={effectiveTargetId} onChange={(e) => setTargetId(e.target.value)}>
            {targets.map((t) => (
              <option key={t.id} value={t.id}>
                {targetLabel(snapshot, t, attacker)}
              </option>
            ))}
          </select>
        </div>
      )}
      {!nothingRollable && (
        <div className="dice-row combat-adv-row">
          <span className="muted spell-tag">{compactPlayer ? 'Roll' : 'Next roll'}</span>
          <AdvantageToggle entityId={attacker.refId} size="lg" />
          {armedAdv && (
            <span className={`${armedAdv === 'adv' ? 'adv-up' : 'adv-down'}${compactPlayer ? ' combat-armed-note' : ''}`} role="status">
              {armedAdv === 'adv' ? 'advantage armed' : 'disadvantage armed'}
            </span>
          )}
        </div>
      )}
    </>
  );

  const weaponButtons = (
    <WeaponButtons
      weapons={weapons}
      twoHanded={twoHanded}
      disabled={!effectiveTargetId || !!actionBlock}
      onAttack={(i) =>
        combatAttack({
          attackerTokenId: attacker.id,
          targetTokenId: effectiveTargetId,
          weaponIndex: i,
          advantage: consumeAdvantage(attacker.refId),
          offhand: !hasteAttackArmed && offhand || undefined,
          twoHanded: twoHanded || undefined,
          hasteAction: hasteAttackArmed || undefined,
        })
      }
    />
  );

  return (
    <div className={`attack-controls${compactPlayer ? ' compact-player-combat' : ''}`}>
      <ActiveSpellActions caster={caster} kind={kind} ownTurn={ownTurn} targetTokenId={effectiveTargetId||undefined} />
      <HasteExtraAction caster={caster} kind={kind} ownTurn={ownTurn} attackArmed={hasteAttackArmed} onArmAttack={setHasteAttackArmed} />
      {actionBlock === 'Hold Person paralysis' && <div className="spell-action-block" role="status">
        {spellActionBlockMessage(caster, { inCombat: snapshot.round > 0 })}
        <div><button className="btn tiny" onClick={() => {
          const message = spellActionBlockMessage(caster, { inCombat: snapshot.round > 0 });
          if (message) notify(`${caster.name}: ${message}`, { durationMs: 8000 });
        }}>Why blocked?</button></div>
      </div>}
      {compactPlayer ? <div className="combat-roll-controls">{rollControls}</div> : rollControls}
      {nothingRollable && (
        <p className="muted">No attacks or rollable abilities.</p>
      )}
      {/* Damage/attack-altering toggles (Rage, masteries, maneuvers, marks). */}
      <fieldset disabled={!!actionBlock} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}><AbilityToggles
        character={caster}
        kind={kind}
        snapshot={snapshot}
        targets={targets}
        currentTargetId={effectiveTargetId || undefined}
      /></fieldset>
      {weapons.length > 0 && (
        <>
          <div className="dice-row combat-weapon-options">
            {compactPlayer && <span className="muted spell-tag">Weapons</span>}
            <button
              className={`btn tiny ${offhand ? 'on' : ''}`}
              title="Off-hand attack: drop the ability modifier from damage"
              aria-pressed={offhand}
              onClick={() => toggleOption('offhand')}
            >
              Off-hand
            </button>
            {anyVersatile && (
              <button
                className={`btn tiny ${twoHanded ? 'on' : ''}`}
                title="Two-handed: use a versatile weapon's 2H damage dice"
                aria-pressed={twoHanded}
                onClick={() => toggleOption('twoHanded')}
              >
                2H
              </button>
            )}
          </div>
          {compactPlayer ? <div className="combat-weapon-list">{weaponButtons}</div> : weaponButtons}
        </>
      )}
      {hasHeal && healList.length > 0 && (
        <div className="dice-row">
          <span className="muted spell-tag">Heal target</span>
          <select
            value={effectiveHealId}
            onChange={(e) => setHealTargetId(e.target.value)}
          >
            {healList.map((t, i) => (
              <option key={t.id} value={t.id}>
                {targetLabel(snapshot, t, attacker)}
                {i === 0 && t.refId === caster.id ? ' (you)' : ''}
              </option>
            ))}
          </select>
        </div>
      )}
      {hasHasteSpell && buffList.length > 0 && <div className="dice-row combat-buff-target">
        <span className="muted spell-tag">Buff target</span>
        <select aria-label="Buff target" value={effectiveBuffId} onChange={event => setBuffTargetId(event.target.value)}>
          {buffList.map(token => <option key={token.id} value={token.id}>{targetLabel(snapshot, token, attacker)}{token.id === attacker.id ? ' (you)' : ''}</option>)}
        </select>
      </div>}
      <AbilityButtons
        abilities={abilities}
        kind={kind}
        caster={caster}
        targetTokenId={effectiveTargetId || undefined}
        healTargetId={effectiveHealId || undefined}
        buffTargetId={effectiveBuffId}
      />
      {summonAbilities.length > 0 && (
        <div className="combat-summon-row">
          {summonAbilities.map((a) => <div key={a.id} className="combat-ability-row">
            <button
              className="btn tiny"
              disabled={!!actionBlock}
              title={`Summon ${a.summon?.name?.trim() || a.name}${(a.level ?? 0) >= 1 ? ' (spends a spell slot)' : ''}`}
              onClick={() => castSummon(a)}
            >
              {a.summon?.icon || '✋'} {a.summon?.name?.trim() || a.name}
            </button>
            <SpellCombatSupportBadge ability={a} />
            {upcastable(a) && <select aria-label={`${a.name} summon level`} className="spell-level" value={summonLevel(a)} onChange={event => setSummonLevels(values => ({ ...values, [a.id]: Number(event.target.value) }))}>
              {Array.from({ length: 10 - spellBaseLevel(a) }, (_, index) => spellBaseLevel(a) + index).map(level => <option key={level} value={level}>L{level}</option>)}
            </select>}
            {'spellSlots' in caster && upcastable(a) && Object.keys(caster.spellSlots).some(key => /^P[1-5]$/.test(key)) && <select aria-label={`${a.name} summon slot pool`} value={summonPools[a.id] ?? selectSpellSlot(caster, summonLevel(a))?.pool ?? 'spellcasting'} onChange={event => {
              const pool = event.target.value as SpellSlotPool;
              setSummonPools(values => ({ ...values, [a.id]: pool }));
              const slot = spellSlotOptions(caster, spellBaseLevel(a)).find(option => option.pool === pool && option.remaining > 0);
              if (slot) setSummonLevels(values => ({ ...values, [a.id]: slot.level }));
            }}><option value="spellcasting">Spellcasting</option><option value="pact">Pact Magic</option></select>}
          </div>)}
        </div>
      )}
      {/* The compact player HUD already owns the editable resource rack.
          Keep the original resource controls in the unchanged DM console. */}
      {'resources' in caster && !compactPlayer && (
        <CharacterResources character={caster} editable compact />
      )}
    </div>
  );
}
