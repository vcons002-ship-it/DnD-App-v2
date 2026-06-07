import { useEffect, useState } from 'react';
import type {
  Character,
  SheetAbility,
  StateSnapshot,
  Token,
} from '../../../shared/types';
import { resolveToken } from '../lib/entities';
import { validTargets } from '../lib/targets';
import { useStore } from '../state/socket';
import { Spellbook } from './Spellbook';

const SAVE_ABILITIES = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'] as const;

type SpellHit = Omit<SheetAbility, 'id'>;

/** Short tag line for an entry, e.g. "Cantrip · Evocation" or "Mastery". */
function tagFor(a: SheetAbility): string {
  if (a.type === 'mastery') return a.mastery?.effect ? 'Mastery' : 'Mastery · manual';
  if (a.type === 'maneuver') return 'Maneuver';
  if (a.type === 'stance') return a.school || 'Stance';
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

/** Does this entry support an upcast level selector (leveled, scaling roll)? */
const upcastable = (a: SheetAbility): boolean =>
  !!a.roll?.scaleDice && (a.roll.baseLevel ?? 0) >= 1;

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
  editable,
  snapshot,
  attackerToken,
  defaultTargetId,
}: {
  character: Character;
  editable: boolean;
  /** When provided (the combat console), attack-roll spells pick a target and
   *  resolve to-hit vs its AC like a weapon attack. */
  snapshot?: StateSnapshot;
  attackerToken?: Token;
  defaultTargetId?: string;
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
  // for the panel, like the weapon AttackControls dropdown.
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
    setSheetAbility(character.id, {
      ...e,
      id: crypto.randomUUID?.() ?? String(Date.now()),
    });
    // A feature with a linked use-counter (Rage, Channel Divinity…) creates that
    // resource on the sheet so it's tracked alongside spell slots.
    if (e.useCounter && !character.resources[e.useCounter.name]) {
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

  const patchStance = (
    a: SheetAbility,
    patch: Partial<NonNullable<SheetAbility['stance']>>,
  ) => {
    if (!a.stance) return;
    setSheetAbility(character.id, { ...a, stance: { ...a.stance, ...patch } });
  };

  // Toggling a stance ON spends one use of its linked counter (if it has charges).
  const toggleStance = (a: SheetAbility) => {
    const goingActive = !a.stance?.active;
    const stance = { ...a.stance!, active: goingActive };
    // A marking stance defaults to the current target when first switched on.
    if (goingActive && stance.targeted && !stance.targetId)
      stance.targetId = validDefault ?? targets[0]?.id;
    setSheetAbility(character.id, { ...a, stance });
    if (goingActive && a.useCounter) {
      const c = character.resources[a.useCounter.name];
      if (c && c.used < c.max) {
        setResource({
          characterId: character.id,
          group: 'resources',
          key: a.useCounter.name,
          used: c.used + 1,
        });
      }
    }
  };

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

  const doRoll = (a: SheetAbility) =>
    rollAbility({
      characterId: character.id,
      abilityId: a.id,
      castLevel: upcastable(a) ? castLevel[a.id] ?? a.roll?.baseLevel : undefined,
      // Advantage/disadvantage only affects the d20 of an attack roll; it comes
      // from the character's shared toggle and is consumed when the attack fires.
      advantage: a.roll?.kind === 'attack' ? consumeAdvantage(character.id) : undefined,
      // Attack-roll spells resolve to-hit vs the chosen target's AC (combat console).
      targetTokenId:
        a.roll?.kind === 'attack' && targetId ? targetId : undefined,
    });

  const patchRoll = (
    a: SheetAbility,
    patch: Partial<NonNullable<SheetAbility['roll']>>,
  ) =>
    setSheetAbility(character.id, {
      ...a,
      roll: { ...(a.roll ?? { kind: 'damage' }), ...patch },
    });

  const patchMastery = (
    a: SheetAbility,
    patch: Partial<NonNullable<SheetAbility['mastery']>>,
  ) => {
    if (!a.mastery) return;
    setSheetAbility(character.id, { ...a, mastery: { ...a.mastery, ...patch } });
  };

  const patchManeuver = (
    a: SheetAbility,
    patch: Partial<NonNullable<SheetAbility['maneuver']>>,
  ) => {
    if (!a.maneuver) return;
    setSheetAbility(character.id, { ...a, maneuver: { ...a.maneuver, ...patch } });
  };

  return (
    <div className="spells">
      <h4>Spells, Abilities &amp; Masteries</h4>
      {hasAttackSpell && targets.length > 0 && (
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
      {character.sheetAbilities.length === 0 && (
        <p className="muted">None yet.</p>
      )}
      <ul className="spell-list">
        {character.sheetAbilities.map((a) => {
          const lvl = castLevel[a.id] ?? a.roll?.baseLevel ?? 1;
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
                  {tagFor(a) && <span className="muted spell-tag">{tagFor(a)}</span>}
                </button>

                {editable && autoMastery(a) && (
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

                {editable && isManeuver(a) && (
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

                {editable && isStance(a) && a.stance!.targeted && targets.length > 0 && (
                  <select
                    className="spell-level"
                    value={a.stance!.targetId ?? ''}
                    title="Marked target — the stance only affects attacks against it"
                    onChange={(e) => patchStance(a, { targetId: e.target.value || undefined })}
                  >
                    <option value="">— mark —</option>
                    {targets.map((t) => (
                      <option key={t.id} value={t.id}>
                        {resolveToken(snapshot!, t).name}
                      </option>
                    ))}
                  </select>
                )}
                {editable && isStance(a) && (
                  <button
                    className={`btn tiny ${a.stance!.active ? 'on' : ''}`}
                    title={
                      a.stance!.active
                        ? 'Active — modifying your attacks; click to end'
                        : a.useCounter
                          ? 'Off — click to activate (spends one use)'
                          : 'Off — click to activate'
                    }
                    onClick={() => toggleStance(a)}
                  >
                    {a.stance!.active ? 'On' : 'Off'}
                  </button>
                )}

                {editable && a.roll && upcastable(a) && (
                  <select
                    className="spell-level"
                    value={lvl}
                    title="Cast at level (upcast)"
                    onChange={(e) =>
                      setCastLevel((c) => ({ ...c, [a.id]: Number(e.target.value) }))
                    }
                  >
                    {Array.from({ length: 9 - (a.roll.baseLevel ?? 1) + 1 }).map(
                      (_, i) => {
                        const v = (a.roll!.baseLevel ?? 1) + i;
                        return (
                          <option key={v} value={v}>
                            L{v}
                          </option>
                        );
                      },
                    )}
                  </select>
                )}
                {editable && a.roll && (
                  <button className="btn tiny" onClick={() => doRoll(a)}>
                    {rollLabel(a.roll)}
                  </button>
                )}
                {editable && (
                  <button
                    className="res-x"
                    title="Remove"
                    onClick={() => removeSheetAbility(character.id, a.id)}
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
