import { hitFeature, markSpell } from '../../../shared/hitFeatures';
import { RechargeChip } from './RechargeChip';
import { isOnHitManeuver } from '../../../shared/maneuvers';
import { applyRulesUpdate, isOutdated } from '../../../shared/rulesUpdate';
import { classFeatureUses } from '../../../shared/classFeatureUses';
import { useEffect, useMemo, useState } from 'react';
import type {
  Character,
  Monster,
  SheetAbility,
  StateSnapshot,
  Token,
  TokenKind,
} from '../../../shared/types';
import { healTargets, validTargets, targetLabel } from '../lib/targets';
import {ShowDeadTargets} from './ShowDeadTargets';
import { useStore } from '../state/socket';
import { classProgression2024, type CoreClass } from '../../../shared/characterProgression';
import { classLevelFor, resolveClassRoster, resourceNameForClass, spellcastingAbilityForClass } from '../../../shared/multiclass';
import {
  ACTION_ICON,
  cantripsKnown,
  parseActionType,
  spellCapacity,
} from '../../../shared/spellPrep';
import { spellAllowances, spellBudgetBreakdown } from '../../../shared/spellLists';
import { effectiveStats } from '../../../shared/modifiers';
import { featUsage, isFeatAbility } from '../../../shared/feats';
import {
  confirmConcentration,
  spellBaseLevel,
  upcastable,
} from '../lib/spellcasting';
import { useAbilityToggles } from './AbilityToggles';
import { Spellbook } from './Spellbook';
import { isCanonicalHasteProfile, effectiveSheetAbility, isMultiTargetSpell, spellDamageTypeChoices } from '../../../shared/spellExecution';
import { spellCombatSupport } from '../../../shared/spellSupport';
import { SpellCombatSupportBadge, SpellCombatSupportDetails } from './SpellCombatSupport';
import { spellActionBlock, spellActionBlockMessage } from '../../../shared/spellBuffs';

const manualRiderNote = (ability: SheetAbility): string | undefined => {
  const name = ability.name.replace(/[\u2018\u2019]/g, "'").trim().toLowerCase();
  return ability.type === 'spell' && ability.roll?.kind === 'damage' && (name === 'ensnaring strike' || name === "hunter's mark")
    ? 'Legacy damage-only action: this button casts and spends a spell slot, but does not implement the spell’s on-hit/ongoing effects. Resolve follow-up damage manually without recasting.'
    : undefined;
};

const SAVE_ABILITIES = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'] as const;

type SpellHit = Omit<SheetAbility, 'id'>;

/** Short tag line for an entry, e.g. "Cantrip · Evocation" or "Mastery". */
function tagFor(a: SheetAbility): string {
  if (a.type === 'mastery') return a.mastery?.effect ? 'Mastery' : 'Mastery · manual';
  if (a.type === 'maneuver') return 'Maneuver';
  if (a.type === 'stance')
    return (a.level ?? 0) >= 1
      ? `Spell · L${a.level}${a.school ? ` · ${a.school}` : ''}${a.sourceClass ? ` · ${classLabel(a.sourceClass)}` : ''}`
      : a.school || 'Stance';
  const bits: string[] = [];
  if (a.type === 'spell') {
    bits.push(a.level === 0 ? 'Cantrip' : `Lvl ${a.level ?? '?'}`);
  }
  if (a.school) bits.push(a.school);
  if (a.roll?.damageType) bits.push(a.roll.damageType);
  if (a.sourceClass) bits.push(classLabel(a.sourceClass));
  return bits.join(' · ');
}
const classLabel = (name: string) => name.charAt(0).toUpperCase() + name.slice(1);

/** Label for the roll button based on what the roll does. */
function rollLabel(roll: NonNullable<SheetAbility['roll']>): string {
  switch (roll.kind) {
    case 'attack':
      return '🎲 Attack';
    case 'heal':
      return '🎲 Heal';
    case 'save':
      return roll.dice?.trim() ? '🎲 Damage (save)' : '🎯 Saving throw';
    default:
      return '🎲 Damage';
  }
}

/** An effect-bearing mastery gets a weapon binding + active toggle. */
const autoMastery = (a: SheetAbility): boolean =>
  a.type === 'mastery' && !!a.mastery?.effect;

/** A maneuver gets an on/off toggle (it spends a Superiority Die on the next attack). */
const isManeuver = (a: SheetAbility): boolean =>
  a.type === 'maneuver' && !!a.maneuver;

/** A stance gets an on/off toggle (a persistent attack modifier while active). */
const isStance = (a: SheetAbility): boolean => a.type === 'stance' && !!a.stance && !hitFeature(a) && !markSpell(a);

/**
 * A character's spells, abilities & weapon masteries. Each entry is collapsible
 * (name + tag + details). Spells/abilities with a `roll` get a roll button
 * (upcastable spells get a level selector). Masteries with an effect get a
 * weapon binding + an on/off toggle that, when on, adjusts that weapon's attack
 * server-side; manual masteries are description-only. Owners/DM can add from the
 * local rules database (with an AI fallback for spells) and remove entries.
 */
export function CharacterSpells({
  character,
  kind = 'pc',
  editable,
  snapshot,
  attackerToken,
  defaultTargetId,
  rollsElsewhere,
  onCombatRequest,
}: {
  /** A PC or a creature — both carry `sheetAbilities`. */
  character: Character | Monster;
  /** Which entity kind, so add/remove/roll route to the right server path. */
  kind?: TokenKind;
  editable: boolean;
  /** When provided (the combat console), attack-roll spells pick a target and
   *  resolve to-hit vs its AC like a weapon attack. */
  snapshot?: StateSnapshot;
  attackerToken?: Token;
  defaultTargetId?: string;
  /** The right panel's Combat section owns the roll buttons + target selects —
   *  hide them here (keep add/edit/prep/stance management) so rolling has ONE
   *  home (naming precedent: CharacterSheet's `abilitiesElsewhere`). */
  rollsElsewhere?: boolean;
  /** Close a character modal so its owner can use the map's Combat controls. */
  onCombatRequest?: () => void;
}) {
  const setSheetAbility = useStore((s) => s.setSheetAbility);
  const removeSheetAbility = useStore((s) => s.removeSheetAbility);
  const reorderSheetAbilities = useStore((s) => s.reorderSheetAbilities);
  const setResource = useStore((s) => s.setResource);
  const rollAbility = useStore((s) => s.rollAbility);
  const summonCast = useStore((s) => s.summonCast);
  // The active/viewed map a summon spawns onto (from the live store, so it works
  // on the full sheet too — not just the combat console where `snapshot` is passed).
  const summonMap = useStore((s) => s.snapshot?.map);
  const notify = useStore((s) => s.notify);
  const actionBlock = spellActionBlock(character);
  const explainBlock = () => {
    const live = useStore.getState().snapshot;
    const message = spellActionBlockMessage(character, { inCombat: (live?.round ?? 0) > 0 });
    if (message) notify(`${character.name}: ${message}`, { durationMs: 8000 });
  };
  // Spell-attack adv/dis comes from this character's shared toggle (set above the
  // skill list / roll log), so it's one switch for all of the character's rolls.
  const consumeAdvantage = useStore((s) => s.consumeAdvantage);

  // Attack-roll spells target a token (combat console only). One shared target
  // for the panel, like the Combat section's dropdown.
  const showDead = useStore(s => s.showDeadTargets);
  const targets = snapshot && attackerToken ? validTargets(snapshot, attackerToken, showDead) : [];
  const hasAttackSpell = character.sheetAbilities.some((a) => {
    const roll = effectiveSheetAbility(a).roll;
    return roll && roll.kind !== 'heal' && !isMultiTargetSpell(a);
  });
  const validDefault =
    defaultTargetId && targets.some((t) => t.id === defaultTargetId)
      ? defaultTargetId
      : undefined;
  const [targetId, setTargetId] = useState(validDefault ?? targets[0]?.id ?? '');
  useEffect(() => {
    if (validDefault) setTargetId(validDefault);
  }, [validDefault]);
  // Heals pick from allies instead (self first = default) and apply on cast.
  const healList = snapshot && attackerToken ? healTargets(snapshot, attackerToken, showDead) : [];
  const effectiveTargetId = targets.some(t => t.id === targetId) ? targetId : targets[0]?.id ?? '';
  const hasHealSpell = character.sheetAbilities.some((a) => a.roll?.kind === 'heal');
  const [healTargetId, setHealTargetId] = useState(healList[0]?.id ?? '');
  const effectiveHealId = healList.some(t => t.id === healTargetId) ? healTargetId : healList[0]?.id ?? '';

  const [open, setOpen] = useState<Record<string, boolean>>({});
  // The CURRENT rules-DB definition of each entry on the sheet (local DB only,
  // no AI), so an entry whose definition has since changed can offer an
  // explicit "Update to current rules" — never a silent conversion.
  const [current, setCurrent] = useState<Record<string, Partial<SheetAbility>>>({});
  const nameKey = character.sheetAbilities.map((a) => a.name.trim().toLowerCase()).sort().join('|');
  useEffect(() => {
    if (!editable || !nameKey) return;
    let live = true;
    fetch('/api/spells/resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ names: nameKey.split('|') }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { resolved?: Record<string, Partial<SheetAbility>> } | null) => {
        if (live && d?.resolved) setCurrent(d.resolved);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [editable, nameKey]);
  const rulesUpdateFor = (a: SheetAbility): Partial<SheetAbility> | null => {
    // The general resolver still includes legacy definitions. Keep the guide's
    // class-granted preparation metadata until it can resolve rules versions.
    if ('leveling' in character && character.leveling?.rules === '2024' && a.tags?.includes('always-prepared')) return null;
    const hit = current[a.name.trim().toLowerCase()];
    return hit && isOutdated(a, hit) ? hit : null;
  };
  const updateToCurrentRules = (a: SheetAbility, hit: Partial<SheetAbility>) => {
    const ok = window.confirm(
      `Update "${a.name}" to the current rules version?\n\n` +
        'This replaces its rules text and mechanics (dice, toggles, counters) ' +
        'with the current definition. If it is a toggle, it comes back switched ' +
        'OFF. Only this entry changes.',
    );
    if (ok) setSheetAbility(kind, character.id, applyRulesUpdate(a, hit));
  };
  // Collapsible spell GROUPS (Cantrips / Level N / Other) — default open
  // (undefined → open), so an existing sheet shows everything until collapsed.
  const [groupOpen, setGroupOpen] = useState<Record<string, boolean>>({});
  const [castLevel, setCastLevel] = useState<Record<string, number>>({});
  const [slotPools, setSlotPools] = useState<Record<string, 'spellcasting' | 'pact'>>({});
  const classRoster = 'className' in character ? resolveClassRoster(character) : null;
  const hasPactPool = 'spellSlots' in character && Object.keys(character.spellSlots).some(key => /^P[1-5]$/.test(key));
  const poolFor = (ability: SheetAbility) => slotPools[ability.id] ?? (ability.sourceClass === 'warlock' ? 'pact' : 'spellcasting');
  const pactPool = 'spellSlots' in character ? Object.entries(character.spellSlots).find(([key]) => /^P[1-5]$/.test(key)) : undefined;
  const levelFor = (ability: SheetAbility) => hasPactPool && poolFor(ability) === 'pact' && pactPool ? Number(pactPool[0].slice(1)) : castLevel[ability.id] ?? (spellBaseLevel(ability) || 1);
  // This is an execution choice, not a saved edit to the ability's damage type.
  const [castDamageTypes, setCastDamageTypes] = useState<Record<string, string>>({});
  const damageChoice = (abilityId: string, choices: string[]) => {
    const chosen = castDamageTypes[`${character.id}:${abilityId}`];
    return choices.includes(chosen) ? chosen : choices[0];
  };
  const [adding, setAdding] = useState(false);
  const [addClass, setAddClass] = useState<CoreClass | ''>('');
  // Monsters have no race; only a PC sheet offers the racial-trait shortcut.
  const myRace = ('race' in character ? character.race : '')?.trim() ?? '';
  const [bookOpen, setBookOpen] = useState(false);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SpellHit[]>([]);
  const [aiAvail, setAiAvail] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [enrichId, setEnrichId] = useState<string | null>(null);

  useEffect(() => {
    if (!adding) return;
    // Debounced and cancelled: typing sends one search after a short pause
    // instead of one request per keystroke.
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/spells?q=${encodeURIComponent(q)}`, { signal: ctrl.signal })
        .then((r) => r.json())
        .then((d) => {
          if (ctrl.signal.aborted) return;
          setResults(d.results ?? []);
          setAiAvail(!!d.aiAvailable);
        })
        .catch(() => !ctrl.signal.aborted && setResults([]));
    }, q ? 200 : 0);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [q, adding]);

  const add = (e: SpellHit) => {
    const sourceClass = e.sourceClass ?? (addClass || (classRoster?.length === 1 ? classRoster[0].className : undefined));
    if ((e.type === 'spell' || e.useCounter) && (classRoster?.length ?? 0) > 1 && !sourceClass) {
      notify('Choose the class that learns this spell or feature before adding it.');
      return;
    }
    const resourceName = e.useCounter ? classRoster && sourceClass ? resourceNameForClass(classRoster, sourceClass, e.useCounter.name) : e.useCounter.name : undefined;
    // Hard feat/ASI cap (5e): block adding a feat past the level-based limit.
    if ('className' in character && isFeatAbility(e)) {
      const u = featUsage(character);
      if (u.used >= u.cap) {
        notify(`Feat cap reached (${u.used}/${u.cap}) — remove a feat/ASI first.`);
        setAdding(false);
        return;
      }
    }
    setSheetAbility(kind, character.id, {
      ...e,
      id: crypto.randomUUID?.() ?? String(Date.now()),
      actionType: parseActionType(e.meta),
      ...((e.type === 'spell' || e.useCounter) && sourceClass ? { sourceClass, ...(e.type === 'spell' && e.roll ? { roll: { ...e.roll, castingAbility: spellcastingAbilityForClass(sourceClass) ?? e.roll.castingAbility } } : {}) } : {}),
      ...(e.useCounter && resourceName ? { useCounter: { ...e.useCounter, name: resourceName } } : {}),
      // Newly-added leveled spells start prepared for prepared casters.
      ...(e.type === 'spell' && (e.level ?? 0) > 0 ? { prepared: true } : {}),
    });
    // A feature with a linked use-counter (Rage, Channel Divinity…) creates that
    // resource on the sheet so it's tracked alongside spell slots. PC-only —
    // creatures have no resource counters.
    if ('resources' in character && e.useCounter && resourceName && !character.resources[resourceName]) {
      setResource({
        characterId: character.id,
        group: 'resources',
        key: resourceName,
        // A level-scaled feature (Channel Divinity, Wild Shape) starts at the
        // character's real count, not the entry's generic default.
        max:
          classFeatureUses(e.useCounter.name, sourceClass ?? character.className, sourceClass ? classLevelFor(character, sourceClass) : character.level) ||
          e.useCounter.max,
        used: 0,
      });
    }
    setAdding(false);
    setQ('');
  };

  // The ONE toggle implementation (shared with the Combat section's chips).
  const { toggleStance, patchMastery, patchManeuver, moveMark } = useAbilityToggles(
    kind,
    character,
    snapshot,
  );

  const askAI = async () => {
    const name = q.trim();
    if (!name || aiBusy) return;
    setAiBusy(true);
    notify(`✨ Asking AI for "${name}"…`);
    try {
      const r = await fetch('/api/spells/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (r.ok) {
        add(await r.json());
        notify(`Added "${name}".`);
      } else {
        const msg = await r.json().catch(() => null);
        notify(msg?.error ?? `No result for "${name}".`);
      }
    } catch {
      notify('AI lookup failed — check your connection. Local search still works.');
    } finally {
      setAiBusy(false);
    }
  };

  // Look a text-only entry up in the rules (local DB first, AI fallback) and
  // REPLACE it in place — keeping its id/level/prep — so it becomes rollable
  // without making a duplicate. Differs from "AI fill": this is grounded in the
  // local rules DB first (exact SRD roll), and targets one named ability.
  const makeRollable = async (a: SheetAbility) => {
    if (a.tags?.includes('leveling-2024')) return;
    setEnrichId(a.id);
    notify(`Looking up "${a.name}"…`);
    try {
      const r = await fetch('/api/spells/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: a.name }),
      });
      if (!r.ok) {
        notify(`No rules entry found for "${a.name}".`);
        return;
      }
      const hit = (await r.json()) as Omit<SheetAbility, 'id'>;
      setSheetAbility(kind, character.id, {
        ...hit,
        id: a.id, // replace in place — no duplicate
        level: a.level ?? hit.level,
        ...(a.prepared !== undefined ? { prepared: a.prepared } : {}),
        ...(a.sourceClass ? { sourceClass: a.sourceClass, ...(hit.roll ? { roll: { ...hit.roll, castingAbility: spellcastingAbilityForClass(a.sourceClass) ?? hit.roll.castingAbility } } : {}) } : {}),
        actionType: parseActionType(hit.meta) ?? a.actionType,
      });
      notify(effectiveSheetAbility(hit as SheetAbility).roll ? `Updated "${a.name}" mechanics.` : `Updated "${a.name}"; see its support details for manual effects.`);
    } catch {
      notify('Lookup failed — check your connection.');
    } finally {
      setEnrichId(null);
    }
  };

  // Cast a summon-tagged ability: spawn its friendly companion near the top-left of
  // the active map (with a little jitter so repeats don't stack) — the owner then
  // drags it. The server spends a slot for a leveled summon spell.
  const castSummon = (a: SheetAbility) => {
    if (actionBlock) { explainBlock(); return; }
    if (!summonMap) {
      notify('No active map to summon onto.');
      return;
    }
    const g = summonMap.gridSizePx || 50;
    const spectral=a.name.toLowerCase()==='spiritual weapon';
    const live=snapshot??useStore.getState().snapshot;
    const anchor=spectral?live?.tokens.find(t=>t.id===effectiveTargetId)??live?.tokens.find(t=>t.kind===kind&&t.refId===character.id):undefined;
    const reachPx=5*g/(summonMap.feetPerSquare||5);
    summonCast({
      kind,
      refId: character.id,
      abilityId: a.id,
      mapId: summonMap.id,
      x: anchor?anchor.x-reachPx:g * 2 + Math.random() * g * 2,
      y: anchor?anchor.y:g * 2 + Math.random() * g * 2,
      castLevel: upcastable(a) ? levelFor(a) : undefined,
      slotPool: hasPactPool ? poolFor(a) : undefined,
    });
    notify(`Summon requested — drag ${a.summon?.name?.trim() || a.name} into place after it appears.`);
  };

  const doRoll = (a: SheetAbility) => {
    if (actionBlock) { explainBlock(); return; }
    const level = upcastable(a) ? levelFor(a) : undefined;
    const execution = effectiveSheetAbility(a, level);
    if (!spellCombatSupport(a)?.manualCastOnly && execution.roll && execution.roll.kind !== 'heal' && !isMultiTargetSpell(a, level) && !effectiveTargetId) {
      notify('Choose a target in the Combat panel to cast this spell.');
      return;
    }
    if (!confirmConcentration(character, a)) return;
    rollAbility({
      kind,
      refId: character.id,
      abilityId: a.id,
      castLevel: level,
      slotPool: hasPactPool ? poolFor(a) : undefined,
      damageType: damageChoice(a.id, spellDamageTypeChoices(a, level)),
      // Advantage/disadvantage only affects the d20 of an attack roll; it comes
      // from the character's shared toggle and is consumed when the attack fires.
      advantage: !spellCombatSupport(a)?.manualCastOnly && execution.roll?.kind === 'attack' ? consumeAdvantage(character.id) : undefined,
      // Attack-roll spells resolve to-hit vs the chosen target's AC; heals apply
      // to the chosen ally (combat console).
      targetTokenId:
        spellCombatSupport(a)?.manualCastOnly ? undefined : execution.roll?.kind === 'heal' ? effectiveHealId || undefined
          : isMultiTargetSpell(a, level) ? undefined : effectiveTargetId || undefined,
    });
  };

  const useInCombat = () => {
    onCombatRequest?.();
    requestAnimationFrame(() => document.querySelector<HTMLElement>('.compact-player-combat select, .attack-controls select')?.focus());
  };

  const patchRoll = (
    a: SheetAbility,
    patch: Partial<NonNullable<SheetAbility['roll']>>,
  ) => {
    const inherited = effectiveSheetAbility(a).roll;
    const changesProfile = (patch.kind !== undefined && patch.kind !== inherited?.kind) ||
      (patch.save !== undefined && patch.save !== inherited?.save);
    const optOut = a.executionProfile === 'manual' || !!spellCombatSupport(a)?.manualCastOnly ||
      changesProfile || !!markSpell(a) || isCanonicalHasteProfile(a) || !!hitFeature(a);
    // Routine edits keep sparse fields so reviewed upcast targeting can still
    // change per cast. A deliberate mechanics override preserves the displayed
    // profile and opts out of canonical defaults.
    setSheetAbility(kind, character.id, {
      ...a,
      ...(optOut ? { executionProfile: 'manual' as const } : {}),
      roll: { ...((optOut ? inherited : a.roll) ?? { kind: inherited?.kind ?? 'damage' }), ...patch },
    });
  };
  /** Strip a roll back to a text-only entry. */
  const clearRoll = (a: SheetAbility) =>
    setSheetAbility(kind, character.id, { ...a, roll: undefined, executionProfile: 'manual' });

  /** Author a homebrew spell from scratch: a leveled spell pre-seeded with a
   *  damage roll + the inline editor open so name/level/dice are editable. */
  const addCustomSpell = () => {
    const sourceClass = addClass || (classRoster?.length === 1 ? classRoster[0].className : undefined);
    if ((classRoster?.length ?? 0) > 1 && !sourceClass) { notify('Choose the class that learns this spell before adding it.'); return; }
    const id = crypto.randomUUID?.() ?? String(Date.now());
    setSheetAbility(kind, character.id, {
      id,
      name: 'New Spell',
      type: 'spell',
      source: 'custom',
      level: 1,
      school: '',
      actionType: 'action',
      prepared: true,
      ...(sourceClass ? { sourceClass } : {}),
      description: '',
      roll: { kind: 'damage', dice: '1d6', ...(sourceClass ? { castingAbility: spellcastingAbilityForClass(sourceClass) ?? undefined } : {}) },
    });
    setOpen((o) => ({ ...o, [id]: true }));
  };

  /** Move an entry up/down WITHIN its display group. Swaps it with its group
   *  neighbour in the full `sheetAbilities` order and persists via ability:reorder,
   *  so other groups stay put. `groupIds` is the group's ids in display order. */
  const moveInGroup = (a: SheetAbility, groupIds: string[], dir: -1 | 1) => {
    const gi = groupIds.indexOf(a.id);
    const swapId = groupIds[gi + dir];
    if (!swapId) return;
    const ids = character.sheetAbilities.map((x) => x.id);
    const i = ids.indexOf(a.id);
    const j = ids.indexOf(swapId);
    if (i < 0 || j < 0) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    reorderSheetAbilities(kind, character.id, ids);
  };

  /** Render one ability row. `groupIds` drives the ▲/▼ reorder enablement. */
  const renderEntry = (a: SheetAbility, groupIds: string[]) => {
    const support = spellCombatSupport(a);
    const summon = support?.manualCastOnly ? undefined : effectiveSheetAbility(a).summon;
    const lvl = levelFor(a);
    const displayRoll = hitFeature(a) || support?.manualCastOnly || summon ? undefined : effectiveSheetAbility(a, lvl).roll;
    const damageTypes = spellDamageTypeChoices(a, lvl);
    const gi = groupIds.indexOf(a.id);
    // Leveled spells carry a prepared state — show prepared ones bright/bold and
    // unprepared ones greyed, so the ready-to-cast set is obvious at a glance.
    const isLeveledSpell = a.type === 'spell' && (a.level ?? 0) > 0;
    const alwaysPrepared = 'leveling' in character && character.leveling?.rules === '2024' &&
      !!a.tags?.includes('always-prepared');
    const prepClass = isLeveledSpell ? (a.prepared !== false ? 'prep-on' : 'prep-off') : '';
    return (
      <li key={a.id} className={`spell-entry ${prepClass}`.trim()}>
        <div className="spell-head">
          <button
            className="spell-toggle"
            onClick={() => setOpen((o) => ({ ...o, [a.id]: !o[a.id] }))}
            title="Show details"
          >
            <span className="spell-caret">{open[a.id] ? '▾' : '▸'}</span>
            <span className="spell-name">{a.name}</span>
            {a.actionType && (
              <span className="action-icon" title={ACTION_ICON[a.actionType].label}>
                {ACTION_ICON[a.actionType].icon}
              </span>
            )}
            {tagFor(a) && <span className="muted spell-tag">{tagFor(a)}</span>}
            <SpellCombatSupportBadge ability={a} />
          </button>
          <RechargeChip ability={a} kind={kind} refId={character.id} editable={editable} />

          {editable && a.type === 'spell' && (a.level ?? 0) > 0 && (
            <button
              className={`btn tiny ${a.prepared !== false ? 'on' : ''}`}
              disabled={alwaysPrepared}
              title={alwaysPrepared ? 'Always prepared by a 2024 class feature' : a.prepared !== false ? 'Prepared — click to unprepare' : 'Not prepared'}
              onClick={() =>
                setSheetAbility(kind, character.id, { ...a, prepared: a.prepared === false })
              }
            >
              {alwaysPrepared ? 'Always prepared' : a.prepared !== false ? '✓ Prep' : 'Prep'}
            </button>
          )}

          {/* Play-time toggles live in the Combat section when one is
              shown (rollsElsewhere); inline only on the full sheet. */}
          {editable && !rollsElsewhere && autoMastery(a) && (
            <button
              className={`btn tiny ${a.mastery!.active ? 'on' : ''}`}
              title={
                a.mastery!.active
                  ? 'Active — triggers on weapons with a matching tag'
                  : 'Inactive — click to enable'
              }
              onClick={() => patchMastery(a, { active: !a.mastery!.active })}
            >
              {a.mastery!.active ? 'On' : 'Off'}
            </button>
          )}

          {editable && !rollsElsewhere && isManeuver(a) && (
            <button
              className={`btn tiny ${a.maneuver!.active ? 'on' : ''}`}
              title={
                a.name.trim().toLowerCase() === 'riposte' ? 'Offered after an enemy melee attack misses you' :
                isOnHitManeuver(a) ? 'Choose this maneuver after a hit, beside Roll damage' : a.maneuver!.active
                  ? 'Armed — spends a Superiority Die on your next attack'
                  : 'Off — click to arm for your next attack'
              }
              disabled={!!actionBlock || isOnHitManeuver(a) || a.name.trim().toLowerCase() === 'riposte'}
              onClick={() => patchManeuver(a, { active: !a.maneuver!.active })}
            >
              {a.name.trim().toLowerCase() === 'riposte' ? 'On enemy miss' : isOnHitManeuver(a) ? 'On hit' : a.maneuver!.active ? 'Armed' : 'Off'}
            </button>
          )}

          {editable &&
            !rollsElsewhere &&
            isStance(a) &&
            a.stance!.targeted &&
            targets.length > 0 && (
              <select
                className="spell-level"
                value={a.stance!.targetId ?? ''}
                title="Marked target — the stance only affects attacks against it"
                onChange={(e) => moveMark(a, e.target.value || undefined)}
              >
                <option value="">— mark —</option>
                {targets.map((t) => (
                  <option key={t.id} value={t.id}>
                    {targetLabel(snapshot!, t, attackerToken ?? undefined)}
                  </option>
                ))}
              </select>
            )}
          {editable && !rollsElsewhere && isStance(a) && (
            <button
              className={`btn tiny ${a.stance!.active ? 'on' : ''}`}
              title={
                a.stance!.active
                  ? 'Active — modifying your attacks; click to end'
                  : a.useCounter
                    ? 'Off — click to activate (spends one use)'
                    : 'Off — click to activate'
              }
              onClick={() => toggleStance(a, validDefault ?? targets[0]?.id)}
            >
              {a.stance!.active ? 'On' : 'Off'}
            </button>
          )}

          {editable &&
            upcastable(a) &&
            !hitFeature(a) && !rollsElsewhere && (displayRoll || support?.manualCastOnly || summon) && (
              <select
                className="spell-level"
                value={lvl}
                disabled={hasPactPool && poolFor(a) === 'pact'}
                title="Cast at level (upcast)"
                onChange={(e) =>
                  setCastLevel((c) => ({ ...c, [a.id]: Number(e.target.value) }))
                }
              >
                {Array.from({ length: 9 - spellBaseLevel(a) + 1 }).map((_, i) => {
                  const v = spellBaseLevel(a) + i;
                  return (
                    <option key={v} value={v}>
                      L{v}
                    </option>
                  );
                })}
              </select>
            )}
          {editable && displayRoll && !rollsElsewhere && (
            <button className="btn tiny" disabled={!!actionBlock} title={manualRiderNote(a)} onClick={() => doRoll(a)}>
              {isCanonicalHasteProfile(a) ? 'Cast Haste' : markSpell(a) ? 'Cast mark' : rollLabel(displayRoll)}
            </button>
          )}
          {editable && hasPactPool && (a.type === 'spell' || a.type === 'stance') && spellBaseLevel(a) > 0 && (!rollsElsewhere || a.summon) && !hitFeature(a) && !isStance(a) && <select className="spell-level" aria-label={`${a.name} slot pool`} value={poolFor(a)} onChange={event => {
            const pool = event.target.value as 'spellcasting' | 'pact';
            setSlotPools(current => ({ ...current, [a.id]: pool }));
            setCastLevel(current => ({ ...current, [a.id]: pool === 'pact' && pactPool ? Number(pactPool[0].slice(1)) : spellBaseLevel(a) }));
          }}>
            <option value="spellcasting">Spellcasting slots</option><option value="pact">Pact Magic{pactPool ? ` · L${pactPool[0].slice(1)} (${Math.max(0, pactPool[1].max - pactPool[1].used)}/${pactPool[1].max})` : ''}</option>
          </select>}
          {editable && displayRoll && !rollsElsewhere && damageTypes.length > 0 && (
            <select
              className="spell-level spell-damage-type"
              aria-label={`${a.name} damage type`}
              title={`Damage type for ${a.name} — this cast only; the saved spell is unchanged`}
              value={damageChoice(a.id, damageTypes)}
              onChange={(e) => setCastDamageTypes((current) => ({
                ...current, [`${character.id}:${a.id}`]: e.target.value,
              }))}
            >
              {damageTypes.map((damageType) => (
                <option key={damageType} value={damageType}>
                  {damageType.charAt(0).toUpperCase() + damageType.slice(1)}
                </option>
              ))}
            </select>
          )}
          {hitFeature(a) && <span className="muted spell-meta">{hitFeature(a)==='hail of thorns'?'Ranged hit → Hail of Thorns → slot; automatic 5 ft burst':'Offered after a hit, beside Roll damage'}</span>}
          {editable && !rollsElsewhere && !displayRoll && !hitFeature(a) && support?.manualCastOnly && (
            <button
              className="btn tiny"
              title="Record this casting and spend its spell slot; resolve its effects manually."
              disabled={!!actionBlock}
              onClick={() => doRoll(a)}
            >
              Cast manually
            </button>
          )}
          {editable && rollsElsewhere && onCombatRequest && (displayRoll || support?.manualCastOnly || summon || a.smite || hitFeature(a)) &&
            <button className="btn tiny" onClick={useInCombat} title={a.smite || hitFeature(a) ? 'Attack from Combat; choose this effect after a qualifying hit.' : 'Close the character record and use the Combat panel.'}>Use in Combat</button>}
          {/* Summon-tagged spell/ability: spawn its friendly companion (leveled
              spells spend a slot server-side). Shown even in the combat console. */}
          {editable && summon && (
            <button
              className="btn tiny"
              title={`Summon ${summon.name?.trim() || a.name}${(a.level ?? 0) >= 1 ? ' (spends a spell slot)' : ''}`}
              disabled={!!actionBlock}
              onClick={() => castSummon(effectiveSheetAbility(a))}
            >
              {summon.icon || '✋'} Summon
            </button>
          )}
          {/* A text-only entry (e.g. imported) → look it up and make it
              rollable in place. Skipped for toggle-driven items. */}
          {editable && !a.tags?.includes('leveling-2024') && !displayRoll && !hitFeature(a) && !a.mastery && !a.maneuver && !a.stance && !a.smite && !summon && (
            <button
              className="btn tiny"
              disabled={enrichId === a.id}
              title="Look up rules and supported mechanics (local first, AI fallback); utility effects may remain manual."
              onClick={() => makeRollable(a)}
            >
              {enrichId === a.id ? '…' : 'Look up mechanics'}
            </button>
          )}
          {/* Reorder within the group (tap ▲/▼ — works on touch too). */}
          {editable && groupIds.length > 1 && (
            <span className="spell-reorder">
              <button
                className="res-x"
                title="Move up"
                disabled={gi <= 0}
                onClick={() => moveInGroup(a, groupIds, -1)}
              >
                ▲
              </button>
              <button
                className="res-x"
                title="Move down"
                disabled={gi >= groupIds.length - 1}
                onClick={() => moveInGroup(a, groupIds, 1)}
              >
                ▼
              </button>
            </span>
          )}
          {editable && (() => {
            const hit = rulesUpdateFor(a);
            return hit ? (
              <button
                className="btn tiny rules-update"
                title="The rules DB has a newer definition of this — click to review and update"
                onClick={() => updateToCurrentRules(a, hit)}
              >
                ⬆ Update
              </button>
            ) : null;
          })()}
          {editable && (
            <button
              className="res-x"
              title="Remove"
              onClick={() => removeSheetAbility(kind, character.id, a.id)}
            >
              ✕
            </button>
          )}
        </div>
        {open[a.id] && (
          <div className="spell-body">
            <SpellCombatSupportDetails ability={a} />
            {editable && a.type === 'spell' && (classRoster?.length ?? 0) > 1 && <label className="action-type-edit muted">Spell class<select aria-label={`${a.name} spell class`} value={a.sourceClass ?? ''} onChange={event => {
              const sourceClass = (event.target.value || undefined) as CoreClass | undefined;
              setSheetAbility(kind, character.id, { ...a, sourceClass, ...(a.roll && sourceClass ? { roll: { ...a.roll, castingAbility: spellcastingAbilityForClass(sourceClass) ?? a.roll.castingAbility } } : {}) });
            }}><option value="">Unassigned legacy / custom</option>{classRoster?.map(entry => <option key={entry.className} value={entry.className}>{classLabel(entry.className)} {entry.level}</option>)}</select></label>}
            {/* Inline header editor — rename / relevel / set school (homebrew). */}
            {editable && (
              <div className="sb-roll-edit">
                <input
                  className="sb-dice"
                  placeholder="name"
                  value={a.name}
                  onChange={(e) => setSheetAbility(kind, character.id, { ...a, name: e.target.value })}
                />
                {a.type === 'spell' && (
                  <input
                    className="sb-dc"
                    type="number"
                    min={0}
                    max={9}
                    title="Spell level (0 = cantrip)"
                    value={a.level ?? 0}
                    onChange={(e) =>
                      setSheetAbility(kind, character.id, { ...a, level: Number(e.target.value) })
                    }
                  />
                )}
                <input
                  className="sb-dmg-type"
                  placeholder="school"
                  value={a.school ?? ''}
                  onChange={(e) =>
                    setSheetAbility(kind, character.id, { ...a, school: e.target.value || undefined })
                  }
                />
              </div>
            )}
            {a.meta && <p className="muted spell-meta">{a.meta}</p>}
            {autoMastery(a) && (
              <p className="muted spell-meta">
                Triggers on weapons tagged:{' '}
                {(a.mastery!.appliesToTags ?? []).length
                  ? a.mastery!.appliesToTags.map((t) => `[${t}]`).join(' ')
                  : '—'}
              </p>
            )}
            {isManeuver(a) && (
              <p className="muted spell-meta">
                Spends a Superiority Die
                {a.maneuver!.addDieTo === 'attack'
                  ? ' → added to the attack roll'
                  : a.maneuver!.addDieTo === 'damage'
                    ? ' → added to damage on a hit'
                    : a.maneuver!.addDieTo === 'heal'
                      ? ' → temp HP'
                      : ''}
                {a.maneuver!.save
                  ? ` · ${a.maneuver!.save.ability} save${a.maneuver!.save.onFail ? ` or ${a.maneuver!.save.onFail}` : ''}`
                  : ''}
              </p>
            )}
            {editable && (
              <label className="action-type-edit muted">
                Action:
                <select
                  value={a.actionType ?? ''}
                  onChange={(e) =>
                    setSheetAbility(kind, character.id, {
                      ...a,
                      actionType: (e.target.value || undefined) as
                        | 'action'
                        | 'bonus'
                        | 'reaction'
                        | undefined,
                    })
                  }
                >
                  <option value="">—</option>
                  <option value="action">● Action</option>
                  <option value="bonus">⚡ Bonus</option>
                  <option value="reaction">↩ Reaction</option>
                </select>
              </label>
            )}
            {/* Mark this spell/ability as a SUMMON: a ✋ Summon button spawns its
                friendly companion token (icon shown on the token). */}
            {editable && (
              <div className="action-type-edit muted summon-edit">
                <button
                  className={`btn tiny ${a.summon ? 'on' : ''}`}
                  title={a.summon ? 'A summon — click to remove' : 'Make this a summon (adds a ✋ Summon button)'}
                  onClick={() =>
                    setSheetAbility(kind, character.id, {
                      ...a,
                      summon: a.summon ? undefined : { icon: '✋' },
                    })
                  }
                >
                  ✋ Summon
                </button>
                {a.summon && (
                  <>
                    <input
                      className="summon-icon"
                      value={a.summon.icon ?? ''}
                      maxLength={2}
                      placeholder="✋"
                      title="Token icon (emoji)"
                      onChange={(e) =>
                        setSheetAbility(kind, character.id, {
                          ...a,
                          summon: { ...a.summon, icon: e.target.value || undefined },
                        })
                      }
                    />
                    <input
                      className="sb-dmg-type"
                      value={a.summon.name ?? ''}
                      placeholder={`name (default: ${a.name})`}
                      title="Summoned token name"
                      onChange={(e) =>
                        setSheetAbility(kind, character.id, {
                          ...a,
                          summon: { ...a.summon, name: e.target.value || undefined },
                        })
                      }
                    />
                  </>
                )}
              </div>
            )}
            {/* Homebrew: add a manual roll to a text-only entry (no AI). The
                editor below then sets kind/dice/save/dc/type. */}
            {editable && !displayRoll && !hitFeature(a) && !a.smite && !a.mastery && !a.maneuver && !a.stance && (
              <button
                className="btn tiny"
                title="Add a manual damage / save / attack / heal roll (homebrew — no AI needed)"
                onClick={() => patchRoll(a, { kind: 'damage', dice: '1d6' })}
              >
                ✏️ Add roll
              </button>
            )}
            {manualRiderNote(a) && <p className="muted">{manualRiderNote(a)}</p>}
            {isCanonicalHasteProfile(a) && <p className="muted">Choose a willing creature with Buff target in Combat or from its map menu. Haste adds +2 AC, doubles speed, grants Dexterity-save advantage, and supplies one restricted extra action. When it ends, the target is Incapacitated with speed 0 until the end of its next turn.</p>}
            {editable && displayRoll && !isCanonicalHasteProfile(a) && (
              <div className="sb-roll-edit">
                <select
                  value={displayRoll.kind}
                  title="What this roll does"
                  onChange={(e) =>
                    patchRoll(a, {
                      kind: e.target.value as NonNullable<SheetAbility['roll']>['kind'],
                    })
                  }
                >
                  <option value="attack">Attack</option>
                  <option value="save">Save</option>
                  <option value="damage">Damage</option>
                  <option value="heal">Heal</option>
                </select>
                <input
                  className="sb-dice"
                  placeholder="dice e.g. 8d6"
                  value={displayRoll.dice ?? ''}
                  onChange={(e) => patchRoll(a, { dice: e.target.value })}
                />
                {displayRoll.kind === 'save' && (
                  <>
                    <select
                      value={displayRoll.save ?? 'DEX'}
                      title="Saving throw ability"
                      onChange={(e) => patchRoll(a, { save: e.target.value })}
                    >
                      {SAVE_ABILITIES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                    <input
                      className="sb-dc"
                      placeholder="DC"
                      value={displayRoll.dc ?? ''}
                      onChange={(e) =>
                        patchRoll(a, {
                          dc: e.target.value ? Number(e.target.value) : undefined,
                        })
                      }
                    />
                    <select title="Damage on a successful save" aria-label="Damage on a successful save"
                      value={displayRoll.saveDamage ?? 'half'}
                      onChange={(e) => patchRoll(a, { saveDamage: e.target.value as 'none' | 'half' })}>
                      <option value="none">Success: no damage</option>
                      <option value="half">Success: half damage</option>
                    </select>
                  </>
                )}
                {(displayRoll.kind === 'save' || displayRoll.kind === 'damage') && <select
                  title="Spell target workflow" aria-label="Spell target workflow"
                  value={a.roll?.targetMode ?? ''}
                  onChange={(e) => patchRoll(a, { targetMode: (e.target.value || undefined) as 'single' | 'multiple' | undefined })}>
                  <option value="">Default for this spell</option>
                  <option value="single">Selected target</option>
                  <option value="multiple">Roll, then choose targets</option>
                </select>}
                <select title="Spellcasting ability" aria-label="Spellcasting ability"
                  value={a.roll?.castingAbility ?? ''}
                  onChange={(e) => patchRoll(a, { castingAbility: (e.target.value || undefined) as 'INT' | 'WIS' | 'CHA' | undefined })}>
                  <option value="">Class / existing fallback</option>
                  <option value="INT">Intelligence</option>
                  <option value="WIS">Wisdom</option>
                  <option value="CHA">Charisma</option>
                </select>
                {displayRoll.kind === 'heal' && (
                  <>
                    <select title="Bonus added to the healing roll" aria-label="Healing bonus"
                      value={a.roll?.healingBonus ?? ''}
                      onChange={(e) => patchRoll(a, { healingBonus: (e.target.value || undefined) as 'none' | 'spellcasting' | 'fighterLevel' | undefined })}>
                      <option value="">Default ({displayRoll.healingBonus === 'fighterLevel' ? 'Fighter level'
                        : displayRoll.healingBonus === 'none' || (displayRoll.healingBonus === undefined && a.type !== 'spell') ? 'no bonus' : 'spellcasting modifier'})</option>
                      <option value="none">No healing bonus</option>
                      <option value="spellcasting">Spellcasting modifier</option>
                      <option value="fighterLevel">Fighter level</option>
                    </select>
                    <select title="Who receives this healing" aria-label="Healing target"
                      value={a.roll?.healTarget ?? ''}
                      onChange={(e) => patchRoll(a, { healTarget: (e.target.value || undefined) as 'self' | 'selected' | undefined })}>
                      <option value="">Default ({displayRoll.healTarget === 'self' ? 'self' : 'selected ally'})</option>
                      <option value="self">Self</option>
                      <option value="selected">Selected ally</option>
                    </select>
                  </>
                )}
                {displayRoll.kind !== 'heal' && (
                  <input
                    className="sb-dmg-type"
                    placeholder="damage type e.g. fire"
                    title="Damage type — drives resistance/vulnerability"
                    value={displayRoll.damageType ?? ''}
                    onChange={(e) => patchRoll(a, { damageType: e.target.value || undefined })}
                  />
                )}
                <button
                  className="res-x"
                  title="Remove this roll (back to text-only)"
                  onClick={() => clearRoll(a)}
                >
                  ✕
                </button>
              </div>
            )}
            {editable ? (
              <textarea
                className="spell-desc-edit"
                placeholder="Description"
                value={a.description ?? ''}
                onChange={(e) =>
                  setSheetAbility(kind, character.id, { ...a, description: e.target.value })
                }
              />
            ) : (
              <p>{a.description}</p>
            )}
            {a.upcast && (
              <p className="muted spell-meta">
                <strong>At higher levels:</strong> {a.upcast}
              </p>
            )}
          </div>
        )}
      </li>
    );
  };

  // ---- Group abilities for display: Cantrips / Level N / Other ----
  // Memoized: only re-buckets when the ability list identity changes, not on every
  // render (target/cast-level/open-state changes re-render but don't regroup).
  const groups = useMemo(() => {
    const all = character.sheetAbilities;
    const cantrips = all.filter((a) => a.type === 'spell' && (a.level ?? 0) === 0);
    const leveled = all.filter((a) => a.type === 'spell' && (a.level ?? 0) > 0);
    const others = all.filter((a) => a.type !== 'spell');
    const levels = Array.from(new Set(leveled.map((a) => a.level ?? 1))).sort((x, y) => x - y);
    const out: { id: string; label: string; entries: SheetAbility[] }[] = [];
    if (cantrips.length) out.push({ id: 'cantrips', label: 'Cantrips', entries: cantrips });
    for (const L of levels)
      out.push({
        id: `lvl-${L}`,
        label: `Level ${L}`,
        // Prepared spells float to the TOP of each level; a stable sort keeps the
        // manual ▲/▼ order within each of the prepared / unprepared groups.
        entries: leveled
          .filter((a) => (a.level ?? 1) === L)
          .sort((a, b) => (a.prepared === false ? 1 : 0) - (b.prepared === false ? 1 : 0)),
      });
    if (others.length) out.push({ id: 'other', label: 'Other abilities', entries: others });
    return out;
  }, [character.sheetAbilities]);

  // Keep the empty read-only case below every hook, including grouping. A
  // level-up can add the first ability while the combat panel stays mounted.
  if (character.sheetAbilities.length === 0 && !editable) return null;

  return (
    <div className="spells">
      <h4>Spells, Abilities &amp; Masteries</h4>
      {'className' in character &&
        (() => {
          if (character.leveling?.rules === '2024' && classRoster && classRoster.length > 1)
            return <MulticlassSpellCaps character={character} />;
          const lvl = character.level || 1;
          const spells = character.sheetAbilities.filter((a) => a.type === 'spell');
          // Allowed spell lists: class + subclass + feats named in the sheet's
          // abilities/traits (Magic Initiate, Fey Touched…).
          const allowances = spellAllowances(character.className, character.subclass, [
            ...character.sheetAbilities.map((a) => a.name),
            ...character.abilities.map((a) => a.name),
          ]);
          const progression = character.leveling?.rules === '2024'
            ? classProgression2024(character.className, lvl, character.subclass) : null;
          const classCantrips = progression?.cantrips ?? cantripsKnown(character.className, lvl, character.subclass);
          // Effective scores so a stat item (Headband of Intellect) raises the
          // prepared cap like every other derived number.
          const legacyCap = spellCapacity(
            character.className,
            lvl,
            effectiveStats(character).scores,
            character.subclass,
          );
          const cap = progression && progression.preparedSpells > 0
            ? { kind: 'prepared' as const, max: progression.preparedSpells } : legacyCap;
          // Per-LIST budget breakdown so the user sees how many of each list they
          // get ("4 Wizard + 2 Druid"), not one merged number.
          const bd = spellBudgetBreakdown(allowances, classCantrips, cap ? cap.max : null);
          const cantripMax = bd.cantrips.reduce((s, p) => s + p.value, 0);
          const spellMax = bd.spells.reduce((s, p) => s + p.value, 0);
          const bonusCantrip = (a: SheetAbility) => !!progression && !!a.tags?.includes('bonus-cantrip');
          const alwaysPreparedSpell = (a: SheetAbility) => !!progression &&
            !!a.tags?.some(tag => tag === 'always-prepared' || tag === 'subclass-spell');
          const extraCantrips = spells.filter(a => (a.level ?? 0) === 0 && bonusCantrip(a)).length;
          const extraPrepared = spells.filter(a => (a.level ?? 0) > 0 && alwaysPreparedSpell(a)).length;
          const cantripHave = spells.filter((a) => (a.level ?? 0) === 0 && !bonusCantrip(a)).length;
          const leveled = spells.filter((a) => (a.level ?? 0) > 0);
          const have = cap?.kind === 'prepared'
            ? leveled.filter((a) => a.prepared !== false && !alwaysPreparedSpell(a)).length
            : leveled.length;
          if (cantripMax === 0 && spellMax === 0 && bd.credits.length === 0 && !extraCantrips && !extraPrepared) return null;
          const sum = (parts: { label: string; value: number }[]) =>
            parts.map((p) => `${p.value} ${p.label}`).join(' + ');
          return (
            <div className="spell-caps muted">
              {(cantripMax > 0 || extraCantrips > 0) && (
                <div className={cantripHave > cantripMax ? 'over' : ''}>
                  {cantripMax > 0 ? <>Cantrips {cantripHave}/{cantripMax}</> : 'Cantrips'}
                  {extraCantrips > 0 && <span className="spell-split">{cantripMax > 0 ? ' + ' : ' '}{extraCantrips} bonus</span>}
                  {bd.cantrips.length > 1 && (
                    <span className="spell-split"> = {sum(bd.cantrips)}</span>
                  )}
                </div>
              )}
              {cap && spellMax > 0 && (
                <div className={have > spellMax ? 'over' : ''}>
                  {progression || cap.kind === 'prepared' ? 'Prepared' : 'Known'} {have}/{spellMax}
                  {extraPrepared > 0 && <span className="spell-split"> + {extraPrepared} always prepared</span>}
                  {bd.spells.length > 1 && (
                    <span className="spell-split"> = {sum(bd.spells)}</span>
                  )}
                </div>
              )}
              {bd.credits.length > 0 && (
                <div className="spell-credits">+ {bd.credits.join(' · ')}</div>
              )}
            </div>
          );
        })()}
      {rollsElsewhere && character.sheetAbilities.some((a) => effectiveSheetAbility(a).roll || spellCombatSupport(a)?.manualCastOnly || a.smite || hitFeature(a)) && (
        <p className="muted spell-tag">Cast and roll from Combat. On-hit spells are offered after a qualifying hit.</p>
      )}
      {!rollsElsewhere && snapshot && attackerToken && (hasAttackSpell || hasHealSpell || character.sheetAbilities.some(a=>a.stance?.targeted)) && <ShowDeadTargets/>}
      {!rollsElsewhere && hasAttackSpell && (
        <div className="dice-row">
          <span className="muted spell-tag">Spell target</span>
          <select aria-label="Spell target" value={effectiveTargetId} onChange={(e) => setTargetId(e.target.value)}>
            {!targets.length && <option value="">No living targets</option>}
            {targets.map((t) => (
              <option key={t.id} value={t.id}>
                {targetLabel(snapshot!, t, attackerToken ?? undefined)}
              </option>
            ))}
          </select>
        </div>
      )}
      {!rollsElsewhere && hasHealSpell && healList.length > 0 && (
        <div className="dice-row">
          <span className="muted spell-tag">Heal target</span>
          <select aria-label="Heal target" value={effectiveHealId} onChange={(e) => setHealTargetId(e.target.value)}>
            {healList.map((t, i) => (
              <option key={t.id} value={t.id}>
                {targetLabel(snapshot!, t, attackerToken ?? undefined)}
                {i === 0 && t.refId === character.id ? ' (you)' : ''}
              </option>
            ))}
          </select>
        </div>
      )}
      {groups.length === 0 && <p className="muted">None yet.</p>}
      {groups.map((g) => {
        const gOpen = groupOpen[g.id] !== false;
        const groupIds = g.entries.map((e) => e.id);
        return (
          <div key={g.id} className="spell-group">
            <button
              className="spell-group-head"
              onClick={() => setGroupOpen((o) => ({ ...o, [g.id]: !gOpen }))}
              title={gOpen ? 'Collapse' : 'Expand'}
            >
              <span className="spell-caret">{gOpen ? '▾' : '▸'}</span>
              <span className="spell-group-title">{g.label}</span>
              <span className="muted spell-tag">{g.entries.length}</span>
            </button>
            {gOpen && (
              <ul className="spell-list">{g.entries.map((a) => renderEntry(a, groupIds))}</ul>
            )}
          </div>
        );
      })}

      {editable && (
        <>
          {/* One primary "add" affordance; the search, full spellbook, and custom
              builder all live inside the panel it opens — not three loose buttons. */}
          <button
            className={`add-row-btn ${adding ? 'on' : ''}`}
            onClick={() => setAdding((p) => !p)}
          >
            {adding ? '✕ Close' : '＋ Add spell or ability'}
          </button>
          {bookOpen && (
            <Spellbook
              onAdd={add}
              onClose={() => setBookOpen(false)}
              ownedNames={
                new Set(character.sheetAbilities.filter(a => (classRoster?.length ?? 0) <= 1 || a.sourceClass === addClass).map((a) => a.name.toLowerCase()))
              }
              learningClasses={classRoster ?? undefined}
              learningClass={addClass}
              onLearningClassChange={name => setAddClass(name as CoreClass | '')}
            />
          )}
          {adding && (
            <div className="spell-add">
              {(classRoster?.length ?? 0) > 1 && <label className="action-type-edit muted">Learn spells / features as<select aria-label="Class for added spells" value={addClass} onChange={event => setAddClass(event.target.value as CoreClass | '')}><option value="">Choose a class</option>{classRoster?.map(entry => <option key={entry.className} value={entry.className}>{classLabel(entry.className)} {entry.level}</option>)}</select></label>}
              <input
                autoFocus
                placeholder="Search — Fireball, cantrip, maneuver, mastery, racial trait…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
              {/* Racial traits are their own source in the results, but a player
                  has to know to search for them. One click fills in their race. */}
              {myRace && (
                <button
                  className="btn tiny"
                  title={`Show ${myRace} traits`}
                  onClick={() => setQ(myRace)}
                >
                  🧬 {myRace} traits
                </button>
              )}
              {(q.trim() || results.length > 0) && (
                <div className="item-picker">
                  {results.map((r) => (
                    <button
                      key={r.name}
                      className="suggest-row"
                      onClick={() => add(r)}
                      title={r.description}
                    >
                      {r.name}
                      <SpellCombatSupportBadge ability={r} />
                      <span className="muted">{tagFor(r as SheetAbility) || r.type}</span>
                    </button>
                  ))}
                  {results.length === 0 && q.trim() && !aiBusy && (
                    <p className="muted spell-none">
                      No local match.{' '}
                      {aiAvail
                        ? 'Try AI lookup below.'
                        : 'Add a Gemini API key in Settings to use AI lookup.'}
                    </p>
                  )}
                </div>
              )}
              {q.trim() && aiAvail && (
                <button className="btn tiny" disabled={aiBusy} onClick={askAI}>
                  {aiBusy ? 'Asking AI…' : `✨ Ask AI for "${q.trim()}"`}
                </button>
              )}
              <div className="spell-add-more">
                <span className="muted">or</span>
                <button
                  className="btn tiny"
                  onClick={() => setBookOpen(true)}
                  title="Browse the full spell list by class"
                >
                  📖 Browse spellbook
                </button>
                <button
                  className="btn tiny"
                  onClick={addCustomSpell}
                  title="Author a homebrew spell — sets name, level, dice & roll inline"
                >
                  ✏️ Create custom
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Spell preparation and cantrips remain separate for each learned class. A
 * higher shared slot never grants higher-level spells in an individual class. */
function MulticlassSpellCaps({ character }: { character: Character }) {
  const classes = resolveClassRoster(character);
  if (!classes) return null;
  const spells = character.sheetAbilities.filter(ability => ability.type === 'spell');
  const unassigned = spells.filter(ability => !ability.sourceClass && !ability.tags?.includes('feat')).length;
  return <div className="spell-caps muted" aria-label="Spells by class">
    {classes.map(entry => {
      const progression = classProgression2024(entry.className, entry.level, entry.subclass);
      if (!progression || (!progression.cantrips && !progression.preparedSpells)) return null;
      const own = spells.filter(ability => ability.sourceClass === entry.className);
      const bonus = own.filter(ability => (ability.level ?? 0) === 0 && ability.tags?.includes('bonus-cantrip')).length;
      const cantrips = own.filter(ability => (ability.level ?? 0) === 0 && !ability.tags?.includes('bonus-cantrip')).length;
      const alwaysPrepared = (ability: SheetAbility) => ability.tags?.some(tag => tag === 'always-prepared' || tag === 'subclass-spell');
      const extraPrepared = own.filter(ability => (ability.level ?? 0) > 0 && alwaysPrepared(ability)).length;
      const prepared = own.filter(ability => (ability.level ?? 0) > 0 && ability.prepared !== false && !alwaysPrepared(ability)).length;
      const casting = spellcastingAbilityForClass(entry.className);
      return <div key={entry.className} data-spell-class={entry.className}>
        <strong>{classLabel(entry.className)} {entry.level}</strong>{casting ? ` · ${casting}` : ''}{` · spells up to L${progression.maxSpellLevel}`}
        {(progression.cantrips > 0 || bonus > 0) && <div className={cantrips > progression.cantrips ? 'over' : ''}>Cantrips {cantrips}/{progression.cantrips}{bonus > 0 ? ` + ${bonus} bonus` : ''}</div>}
        {progression.preparedSpells > 0 && <div className={prepared > progression.preparedSpells ? 'over' : ''}>Prepared {prepared}/{progression.preparedSpells}{extraPrepared > 0 ? ` + ${extraPrepared} always prepared` : ''}</div>}
      </div>;
    })}
    {unassigned > 0 && <div className="spell-credits">{unassigned} legacy / custom spell{unassigned === 1 ? '' : 's'} without a class. Set Spell class in each entry to count it here.</div>}
    {Object.entries(character.spellSlots).filter(([key]) => /^P[1-5]$/.test(key)).map(([key, counter]) => <div key={key}>Pact Magic · L{key.slice(1)}: {Math.max(0, counter.max - counter.used)}/{counter.max} slots</div>)}
  </div>;
}
