import { useEffect, useState } from 'react';
import type {
  Character,
  Monster,
  SheetAbility,
  StateSnapshot,
  Token,
  TokenKind,
} from '../../../shared/types';
import { resolveToken } from '../lib/entities';
import { healTargets, validTargets } from '../lib/targets';
import { useStore } from '../state/socket';
import {
  ACTION_ICON,
  cantripsKnown,
  parseActionType,
  spellCapacity,
} from '../../../shared/spellPrep';
import { spellAllowances, spellBudgetBreakdown } from '../../../shared/spellLists';
import { featUsage, isFeatAbility } from '../../../shared/feats';
import {
  confirmConcentration,
  isConcentration,
  spellBaseLevel,
  upcastable,
} from '../lib/spellcasting';
import { useAbilityToggles } from './AbilityToggles';
import { Spellbook } from './Spellbook';

const SAVE_ABILITIES = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'] as const;

type SpellHit = Omit<SheetAbility, 'id'>;

/** Short tag line for an entry, e.g. "Cantrip · Evocation" or "Mastery". */
function tagFor(a: SheetAbility): string {
  if (a.type === 'mastery') return a.mastery?.effect ? 'Mastery' : 'Mastery · manual';
  if (a.type === 'maneuver') return 'Maneuver';
  if (a.type === 'stance')
    return (a.level ?? 0) >= 1
      ? `Spell · L${a.level}${a.school ? ` · ${a.school}` : ''}`
      : a.school || 'Stance';
  const bits: string[] = [];
  if (a.type === 'spell') {
    bits.push(a.level === 0 ? 'Cantrip' : `Lvl ${a.level ?? '?'}`);
  }
  if (a.school) bits.push(a.school);
  if (a.roll?.damageType) bits.push(a.roll.damageType);
  return bits.join(' · ');
}

/** Label for the roll button based on what the roll does. */
function rollLabel(roll: NonNullable<SheetAbility['roll']>): string {
  switch (roll.kind) {
    case 'attack':
      return '🎲 Attack';
    case 'heal':
      return '🎲 Heal';
    case 'save':
      return '🎲 Damage (save)';
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
const isStance = (a: SheetAbility): boolean => a.type === 'stance' && !!a.stance;

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
}) {
  const setSheetAbility = useStore((s) => s.setSheetAbility);
  const removeSheetAbility = useStore((s) => s.removeSheetAbility);
  const setResource = useStore((s) => s.setResource);
  const rollAbility = useStore((s) => s.rollAbility);
  const notify = useStore((s) => s.notify);
  // Spell-attack adv/dis comes from this character's shared toggle (set above the
  // skill list / roll log), so it's one switch for all of the character's rolls.
  const consumeAdvantage = useStore((s) => s.consumeAdvantage);

  // Attack-roll spells target a token (combat console only). One shared target
  // for the panel, like the Combat section's dropdown.
  const targets = snapshot && attackerToken ? validTargets(snapshot, attackerToken) : [];
  const hasAttackSpell = character.sheetAbilities.some((a) => a.roll?.kind === 'attack');
  const validDefault =
    defaultTargetId && targets.some((t) => t.id === defaultTargetId)
      ? defaultTargetId
      : undefined;
  const [targetId, setTargetId] = useState(validDefault ?? targets[0]?.id ?? '');
  useEffect(() => {
    if (validDefault) setTargetId(validDefault);
  }, [validDefault]);
  // Heals pick from allies instead (self first = default) and apply on cast.
  const healList = snapshot && attackerToken ? healTargets(snapshot, attackerToken) : [];
  const hasHealSpell = character.sheetAbilities.some((a) => a.roll?.kind === 'heal');
  const [healTargetId, setHealTargetId] = useState(healList[0]?.id ?? '');

  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [castLevel, setCastLevel] = useState<Record<string, number>>({});
  const [adding, setAdding] = useState(false);
  const [bookOpen, setBookOpen] = useState(false);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SpellHit[]>([]);
  const [aiAvail, setAiAvail] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);

  useEffect(() => {
    if (!adding) return;
    let live = true;
    fetch(`/api/spells?q=${encodeURIComponent(q)}`)
      .then((r) => r.json())
      .then((d) => {
        if (!live) return;
        setResults(d.results ?? []);
        setAiAvail(!!d.aiAvailable);
      })
      .catch(() => live && setResults([]));
    return () => {
      live = false;
    };
  }, [q, adding]);

  if (character.sheetAbilities.length === 0 && !editable) return null;

  const add = (e: SpellHit) => {
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
      // Newly-added leveled spells start prepared for prepared casters.
      ...(e.type === 'spell' && (e.level ?? 0) > 0 ? { prepared: true } : {}),
    });
    // A feature with a linked use-counter (Rage, Channel Divinity…) creates that
    // resource on the sheet so it's tracked alongside spell slots. PC-only —
    // creatures have no resource counters.
    if ('resources' in character && e.useCounter && !character.resources[e.useCounter.name]) {
      setResource({
        characterId: character.id,
        group: 'resources',
        key: e.useCounter.name,
        max: e.useCounter.max,
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

  const doRoll = (a: SheetAbility) => {
    if (!confirmConcentration(character, a)) return;
    rollAbility({
      kind,
      refId: character.id,
      abilityId: a.id,
      castLevel: upcastable(a) ? castLevel[a.id] ?? spellBaseLevel(a) : undefined,
      // Advantage/disadvantage only affects the d20 of an attack roll; it comes
      // from the character's shared toggle and is consumed when the attack fires.
      advantage: a.roll?.kind === 'attack' ? consumeAdvantage(character.id) : undefined,
      // Attack-roll spells resolve to-hit vs the chosen target's AC; heals apply
      // to the chosen ally (combat console).
      targetTokenId:
        a.roll?.kind === 'attack' && targetId
          ? targetId
          : a.roll?.kind === 'heal' && healTargetId
            ? healTargetId
            : undefined,
    });
  };

  const patchRoll = (
    a: SheetAbility,
    patch: Partial<NonNullable<SheetAbility['roll']>>,
  ) =>
    setSheetAbility(kind, character.id, {
      ...a,
      roll: { ...(a.roll ?? { kind: 'damage' }), ...patch },
    });

  return (
    <div className="spells">
      <h4>Spells, Abilities &amp; Masteries</h4>
      {'className' in character &&
        (() => {
          const lvl = character.level || 1;
          const spells = character.sheetAbilities.filter((a) => a.type === 'spell');
          // Allowed spell lists: class + subclass + feats named in the sheet's
          // abilities/traits (Magic Initiate, Fey Touched…).
          const allowances = spellAllowances(character.className, character.subclass, [
            ...character.sheetAbilities.map((a) => a.name),
            ...character.abilities.map((a) => a.name),
          ]);
          const classCantrips = cantripsKnown(character.className, lvl, character.subclass);
          const cap = spellCapacity(character.className, lvl, character.stats, character.subclass);
          // Per-LIST budget breakdown so the user sees how many of each list they
          // get ("4 Wizard + 2 Druid"), not one merged number.
          const bd = spellBudgetBreakdown(allowances, classCantrips, cap ? cap.max : null);
          const cantripMax = bd.cantrips.reduce((s, p) => s + p.value, 0);
          const spellMax = bd.spells.reduce((s, p) => s + p.value, 0);
          const cantripHave = spells.filter((a) => (a.level ?? 0) === 0).length;
          const leveled = spells.filter((a) => (a.level ?? 0) > 0);
          const have = cap?.kind === 'prepared'
            ? leveled.filter((a) => a.prepared !== false).length
            : leveled.length;
          if (cantripMax === 0 && spellMax === 0 && bd.credits.length === 0) return null;
          const sum = (parts: { label: string; value: number }[]) =>
            parts.map((p) => `${p.value} ${p.label}`).join(' + ');
          return (
            <div className="spell-caps muted">
              {cantripMax > 0 && (
                <div className={cantripHave > cantripMax ? 'over' : ''}>
                  Cantrips {cantripHave}/{cantripMax}
                  {bd.cantrips.length > 1 && (
                    <span className="spell-split"> = {sum(bd.cantrips)}</span>
                  )}
                </div>
              )}
              {cap && spellMax > 0 && (
                <div className={have > spellMax ? 'over' : ''}>
                  {cap.kind === 'prepared' ? 'Prepared' : 'Known'} {have}/{spellMax}
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
      {rollsElsewhere && character.sheetAbilities.some((a) => a.roll) && (
        <p className="muted spell-tag">Roll these from the Combat section.</p>
      )}
      {!rollsElsewhere && hasAttackSpell && targets.length > 0 && (
        <div className="dice-row">
          <span className="muted spell-tag">Spell target</span>
          <select value={targetId} onChange={(e) => setTargetId(e.target.value)}>
            {targets.map((t) => (
              <option key={t.id} value={t.id}>
                {resolveToken(snapshot!, t).name}
              </option>
            ))}
          </select>
        </div>
      )}
      {!rollsElsewhere && hasHealSpell && healList.length > 0 && (
        <div className="dice-row">
          <span className="muted spell-tag">Heal target</span>
          <select value={healTargetId} onChange={(e) => setHealTargetId(e.target.value)}>
            {healList.map((t, i) => (
              <option key={t.id} value={t.id}>
                {resolveToken(snapshot!, t).name}
                {i === 0 && t.refId === character.id ? ' (you)' : ''}
              </option>
            ))}
          </select>
        </div>
      )}
      {character.sheetAbilities.length === 0 && (
        <p className="muted">None yet.</p>
      )}
      <ul className="spell-list">
        {character.sheetAbilities.map((a) => {
          const lvl = castLevel[a.id] ?? (spellBaseLevel(a) || 1);
          return (
            <li key={a.id} className="spell-entry">
              <div className="spell-head">
                <button
                  className="spell-toggle"
                  onClick={() => setOpen((o) => ({ ...o, [a.id]: !o[a.id] }))}
                  title="Show details"
                >
                  <span className="spell-caret">{open[a.id] ? '▾' : '▸'}</span>
                  <span className="spell-name">{a.name}</span>
                  {a.actionType && (
                    <span
                      className="action-icon"
                      title={ACTION_ICON[a.actionType].label}
                    >
                      {ACTION_ICON[a.actionType].icon}
                    </span>
                  )}
                  {tagFor(a) && <span className="muted spell-tag">{tagFor(a)}</span>}
                </button>

                {editable && a.type === 'spell' && (a.level ?? 0) > 0 && (
                  <button
                    className={`btn tiny ${a.prepared !== false ? 'on' : ''}`}
                    title={a.prepared !== false ? 'Prepared — click to unprepare' : 'Not prepared'}
                    onClick={() =>
                      setSheetAbility(kind, character.id, { ...a, prepared: a.prepared === false })
                    }
                  >
                    {a.prepared !== false ? '✓ Prep' : 'Prep'}
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
                      a.maneuver!.active
                        ? 'Armed — spends a Superiority Die on your next attack'
                        : 'Off — click to arm for your next attack'
                    }
                    onClick={() => patchManeuver(a, { active: !a.maneuver!.active })}
                  >
                    {a.maneuver!.active ? 'Armed' : 'Off'}
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
                          {resolveToken(snapshot!, t).name}
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
                  ((a.roll && !rollsElsewhere) || (!a.roll && isConcentration(a))) && (
                  <select
                    className="spell-level"
                    value={lvl}
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
                {editable && a.roll && !rollsElsewhere && (
                  <button className="btn tiny" onClick={() => doRoll(a)}>
                    {rollLabel(a.roll)}
                  </button>
                )}
                {editable && !a.roll && isConcentration(a) && (
                  <button
                    className="btn tiny"
                    title="Cast — start concentration (drops any spell you were concentrating on)"
                    onClick={() => doRoll(a)}
                  >
                    🔮 Cast
                  </button>
                )}
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
                  {editable && a.roll && (
                    <div className="sb-roll-edit">
                      <select
                        value={a.roll.kind}
                        title="What this roll does"
                        onChange={(e) =>
                          patchRoll(a, {
                            kind: e.target.value as NonNullable<
                              SheetAbility['roll']
                            >['kind'],
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
                        value={a.roll.dice ?? ''}
                        onChange={(e) => patchRoll(a, { dice: e.target.value })}
                      />
                      {a.roll.kind === 'save' && (
                        <>
                          <select
                            value={a.roll.save ?? 'DEX'}
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
                            value={a.roll.dc ?? ''}
                            onChange={(e) =>
                              patchRoll(a, {
                                dc: e.target.value ? Number(e.target.value) : undefined,
                              })
                            }
                          />
                        </>
                      )}
                      {a.roll.kind !== 'heal' && (
                        <input
                          className="sb-dmg-type"
                          placeholder="damage type e.g. fire"
                          title="Damage type — drives resistance/vulnerability"
                          value={a.roll.damageType ?? ''}
                          onChange={(e) =>
                            patchRoll(a, { damageType: e.target.value || undefined })
                          }
                        />
                      )}
                    </div>
                  )}
                  <p>{a.description}</p>
                  {a.upcast && (
                    <p className="muted spell-meta">
                      <strong>At higher levels:</strong> {a.upcast}
                    </p>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {editable && (
        <>
          <div className="dice-row">
            <button className="btn tiny" onClick={() => setAdding((p) => !p)}>
              {adding ? 'Close' : '+ Add spell / ability / mastery'}
            </button>
            <button className="btn tiny" onClick={() => setBookOpen(true)} title="Browse the full spell list by class">
              📖 Spellbook
            </button>
          </div>
          {bookOpen && (
            <Spellbook
              onAdd={add}
              onClose={() => setBookOpen(false)}
              ownedNames={
                new Set(character.sheetAbilities.map((a) => a.name.toLowerCase()))
              }
            />
          )}
          {adding && (
            <div className="spell-add">
              <input
                autoFocus
                placeholder="Search name or tag — Fireball, fire, cantrip, wizard, maneuver…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
              <div className="item-picker">
                {results.map((r) => (
                  <button
                    key={r.name}
                    className="suggest-row"
                    onClick={() => add(r)}
                    title={r.description}
                  >
                    {r.name}
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
              {q.trim() && aiAvail && (
                <button className="btn tiny" disabled={aiBusy} onClick={askAI}>
                  {aiBusy ? 'Asking AI…' : `✨ Ask AI for "${q.trim()}"`}
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
