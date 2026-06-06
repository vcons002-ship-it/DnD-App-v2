import { useEffect, useState } from 'react';
import type { AbilityRoll, CreatureAbility, SheetAbility, Weapon } from '../../../shared/types';
import { abilityMod, signed } from '../../../shared/skills';
import { parseActionRoll, weaponsFromActions } from '../../../shared/monsterAttacks';

/** Short button label for a structured action roll. */
const rollLabel = (r: AbilityRoll): string =>
  r.kind === 'attack'
    ? '🎯 Attack'
    : r.kind === 'heal'
      ? '✚ Heal'
      : r.kind === 'save'
        ? `🎲 Damage (${r.save ?? 'save'})`
        : '🎲 Damage';

const ABILITIES = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'];
const mod = (score: number) => {
  const m = Math.floor((score - 10) / 2);
  return `${m >= 0 ? '+' : ''}${m}`;
};

/** The shared, tagged stat fields edited for both creatures and characters. */
export type StatSheet = {
  id: string;
  name: string;
  level: number;
  curHp: number;
  maxHp: number;
  /** Temporary HP buffer pool (0 = none). */
  tempHp: number;
  armorClass: number;
  speed: string;
  stats: Record<string, number>;
  resistances: string[];
  weaknesses: string[];
  /** Ability codes proficient in for saving throws (adds the proficiency bonus). */
  saveProficiencies: string[];
  weapons: Weapon[];
  actions: CreatureAbility[];
  abilities: CreatureAbility[];
};

/** An extra identity text field (Type for monsters; Race/Class for PCs). */
export type IdentityField = { key: string; label: string; value: string };

type Props = {
  creature: StatSheet;
  /** Read-view subtitle line (e.g. creature type, or "Elf · Wizard · Lvl 5"). */
  subtitle?: string;
  /** Extra editable identity fields, keyed by their update-payload field name. */
  identity?: IdentityField[];
  /** Label for the level field ("Level" for PCs, "CR" for monsters). */
  levelLabel?: string;
  /** Omit to render read-only (no Edit / AI-fill) — e.g. a player viewing an
   *  ally or a friendly creature's sheet. */
  onSave?: (patch: Record<string, unknown>) => void;
  onAiFill?: () => void;
  aiBusy?: boolean;
  /** The character's sheet abilities — used to show which masteries apply to
   *  each weapon (cross-checking weapon tags against masteries' appliesToTags). */
  masteries?: SheetAbility[];
  /** A creature (monster/NPC) rather than a PC. Its attacks are edited like
   *  weapons but as natural attacks — baked damage + to-hit + type/range, and
   *  NOT sourced from the 2024 PC weapon book. */
  monster?: boolean;
  /** DM-only: roll a monster action that carries a structured `roll`. When given,
   *  each such action shows a roll button (server-resolved via `monster:action`). */
  onRollAction?: (actionIndex: number, advantage?: 'adv' | 'dis') => void;
  /** Omit the Actions & Traits blocks here so a parent can render them elsewhere
   *  (the character sheet collapses them to the bottom via `ActionsTraitsView`). */
  deferActionsTraits?: boolean;
};

/**
 * The mechanic labels to show on a weapon for the character's masteries that
 * trigger on it (tag overlap). A mastery shows its `weaponLabel` (the mechanic,
 * e.g. "Slow"; defaults to the entry name), plus a `meleeLabel` (e.g. GWM's
 * "Hew") only when the weapon is melee.
 */
function masteryNamesForWeapon(w: Weapon, masteries: SheetAbility[]): string[] {
  const wtags = (w.tags ?? []).map((t) => t.trim().toLowerCase());
  if (!wtags.length) return [];
  const labels: string[] = [];
  for (const a of masteries) {
    const m = a.mastery;
    if (a.type !== 'mastery' || !m) continue;
    if (!(m.appliesToTags ?? []).some((t) => wtags.includes(t.trim().toLowerCase()))) continue;
    labels.push(m.weaponLabel || a.name);
    if (m.meleeLabel && w.kind === 'melee') labels.push(m.meleeLabel);
  }
  return labels;
}

type Draft = Omit<StatSheet, 'id' | 'resistances' | 'weaknesses'> & {
  resistances: string;
  weaknesses: string;
  identity: Record<string, string>;
};

const splitList = (s: string) =>
  s.split(',').map((x) => x.trim()).filter(Boolean);

export function StatBlock({
  creature,
  subtitle,
  identity = [],
  levelLabel = 'Level',
  onSave,
  onAiFill,
  aiBusy,
  masteries,
  monster = false,
  onRollAction,
  deferActionsTraits = false,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [d, setD] = useState<Draft>(() => toDraft(creature, identity));

  function toDraft(c: StatSheet, ids: IdentityField[]): Draft {
    return {
      name: c.name,
      level: c.level,
      curHp: c.curHp,
      maxHp: c.maxHp,
      tempHp: c.tempHp,
      armorClass: c.armorClass,
      speed: c.speed,
      stats: { ...c.stats },
      resistances: c.resistances.join(', '),
      weaknesses: c.weaknesses.join(', '),
      saveProficiencies: [...c.saveProficiencies],
      weapons: c.weapons.map((w) => ({ ...w })),
      actions: c.actions.map((a) => ({ ...a })),
      abilities: c.abilities.map((a) => ({ ...a })),
      identity: Object.fromEntries(ids.map((f) => [f.key, f.value])),
    };
  }

  const startEdit = () => {
    setD(toDraft(creature, identity));
    setEditing(true);
  };

  const save = () => {
    onSave?.({
      name: d.name.trim() || creature.name,
      level: d.level,
      maxHp: d.maxHp,
      curHp: d.curHp,
      tempHp: d.tempHp,
      armorClass: d.armorClass,
      speed: d.speed.trim(),
      stats: d.stats,
      resistances: splitList(d.resistances),
      weaknesses: splitList(d.weaknesses),
      saveProficiencies: d.saveProficiencies,
      weapons: d.weapons.filter((w) => w.name.trim()),
      actions: d.actions.filter((a) => a.name.trim()),
      abilities: d.abilities.filter((a) => a.name.trim()),
      ...d.identity,
    });
    setEditing(false);
  };

  if (!editing) {
    return (
      <ReadView
        creature={creature}
        subtitle={subtitle}
        levelLabel={levelLabel}
        onEdit={onSave ? startEdit : undefined}
        onAiFill={onAiFill}
        aiBusy={aiBusy}
        masteries={masteries}
        onRollAction={onRollAction}
        deferActionsTraits={deferActionsTraits}
      />
    );
  }

  const set = (patch: Partial<Draft>) => setD((cur) => ({ ...cur, ...patch }));
  const num = (v: string) => (Number.isFinite(Number(v)) ? Number(v) : 0);

  return (
    <div className="statblock editing">
      <label className="sb-field">
        Name
        <input value={d.name} onChange={(e) => set({ name: e.target.value })} />
      </label>
      {identity.map((f) => (
        <label key={f.key} className="sb-field">
          {f.label}
          <input
            value={d.identity[f.key] ?? ''}
            onChange={(e) =>
              set({ identity: { ...d.identity, [f.key]: e.target.value } })
            }
          />
        </label>
      ))}
      <div className="sb-meta-edit">
        <label className="mini">
          {levelLabel}
          <input
            type="number"
            value={d.level}
            onChange={(e) => set({ level: num(e.target.value) })}
          />
        </label>
        <label className="mini">
          HP
          <input
            type="number"
            value={d.curHp}
            onChange={(e) => set({ curHp: num(e.target.value) })}
          />
        </label>
        <label className="mini">
          Max
          <input
            type="number"
            value={d.maxHp}
            onChange={(e) => set({ maxHp: num(e.target.value) })}
          />
        </label>
        <label className="mini">
          Temp
          <input
            type="number"
            value={d.tempHp}
            onChange={(e) => set({ tempHp: Math.max(0, num(e.target.value)) })}
          />
        </label>
        <label className="mini">
          AC
          <input
            type="number"
            value={d.armorClass}
            onChange={(e) => set({ armorClass: num(e.target.value) })}
          />
        </label>
        <label className="mini">
          Speed
          <input value={d.speed} onChange={(e) => set({ speed: e.target.value })} />
        </label>
      </div>

      <div className="sb-abilities">
        {ABILITIES.map((a) => (
          <label key={a} className="sb-ability sb-ability-edit">
            <div className="sb-ab-name">{a}</div>
            <input
              type="number"
              value={d.stats[a] ?? ''}
              onChange={(e) =>
                set({ stats: { ...d.stats, [a]: num(e.target.value) } })
              }
            />
          </label>
        ))}
      </div>

      <div className="sb-saves-edit">
        <span className="sb-saves-label">Save proficiencies</span>
        {ABILITIES.map((a) => {
          const on = d.saveProficiencies.includes(a);
          return (
            <label key={a} className={`sb-save-chip ${on ? 'on' : ''}`}>
              <input
                type="checkbox"
                checked={on}
                onChange={() =>
                  set({
                    saveProficiencies: on
                      ? d.saveProficiencies.filter((x) => x !== a)
                      : [...d.saveProficiencies, a],
                  })
                }
              />
              {a}
            </label>
          );
        })}
      </div>

      <label className="sb-field">
        Resist (comma-sep)
        <input
          value={d.resistances}
          onChange={(e) => set({ resistances: e.target.value })}
        />
      </label>
      <label className="sb-field">
        Vulnerable (comma-sep)
        <input
          value={d.weaknesses}
          onChange={(e) => set({ weaknesses: e.target.value })}
        />
      </label>

      <WeaponEditor
        weapons={d.weapons}
        onChange={(weapons) => set({ weapons })}
        monster={monster}
      />
      {monster && d.actions.length > 0 && (
        <button
          className="btn tiny"
          title="Turn the creature's '+N to hit … NdM' actions into rollable attacks"
          onClick={() => {
            const { weapons, actions } = weaponsFromActions(d.actions);
            set({ weapons: [...d.weapons, ...weapons], actions });
          }}
        >
          ↻ Pull attacks from description
        </button>
      )}
      {!deferActionsTraits && (
        <>
          <EntryEditor
            title="Actions"
            entries={d.actions}
            onChange={(actions) => set({ actions })}
            withRoll={monster}
          />
          <EntryEditor
            title="Traits"
            entries={d.abilities}
            onChange={(abilities) => set({ abilities })}
          />
        </>
      )}

      <div className="sb-edit-actions">
        <button className="btn tiny green" onClick={save}>
          Save
        </button>
        <button className="btn tiny" onClick={() => setEditing(false)}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function ReadView({
  creature,
  subtitle,
  levelLabel,
  onEdit,
  onAiFill,
  aiBusy,
  masteries,
  onRollAction,
  deferActionsTraits = false,
}: {
  creature: StatSheet;
  subtitle?: string;
  levelLabel: string;
  onEdit?: () => void;
  onAiFill?: () => void;
  aiBusy?: boolean;
  masteries?: SheetAbility[];
  onRollAction?: (actionIndex: number, advantage?: 'adv' | 'dis') => void;
  deferActionsTraits?: boolean;
}) {
  const m = creature;
  const hasStats = ABILITIES.some((a) => m.stats[a] !== undefined);
  // PCs (masteries passed) store dice-only damage; show it with the live ability
  // modifier added (finesse-aware). Monsters keep their pre-baked damage as-is.
  const isPc = masteries !== undefined;
  // PCs and `diceOnly` creature attacks show the live ability modifier; other
  // monster attacks keep their pre-baked damage string as-is.
  const dmgWithMod = (dice: string | undefined, w: Weapon): string => {
    if (!dice) return '';
    if (!isPc && !w.diceOnly) return dice;
    const finesse = (w.tags ?? []).some((t) => t.trim().toLowerCase() === 'finesse');
    const useDex =
      w.kind === 'ranged' ||
      (finesse && abilityMod(m.stats.DEX) >= abilityMod(m.stats.STR));
    const mod = abilityMod(m.stats[useDex ? 'DEX' : 'STR'] ?? 10);
    return mod ? `${dice}${signed(mod)}` : dice;
  };
  return (
    <div className="statblock">
      <div className="sb-head">
        {subtitle && <div className="sb-type">{subtitle}</div>}
        {onEdit && (
          <button className="btn tiny" onClick={onEdit}>
            Edit
          </button>
        )}
      </div>
      {onAiFill && (
        <button
          className="btn tiny ai-fill"
          disabled={aiBusy}
          onClick={onAiFill}
          title="Use AI to fill only the empty fields (stats, weapons, actions…)"
        >
          {aiBusy ? '✨ …' : '✨ Fill missing details with AI'}
        </button>
      )}
      <div className="sb-meta">
        {m.level > 0 && <span>{levelLabel} {m.level}</span>}
        {m.armorClass > 0 && <span>AC {m.armorClass}</span>}
        <span>
          HP {m.curHp}/{m.maxHp}
          {m.tempHp > 0 && <span className="temp-hp"> +{m.tempHp} temp</span>}
        </span>
        {m.speed && <span>{m.speed}</span>}
      </div>

      {hasStats && (
        <div className="sb-abilities">
          {ABILITIES.map((a) => (
            <div key={a} className="sb-ability">
              <div className="sb-ab-name">{a}</div>
              <div className="sb-ab-val">
                {m.stats[a] ?? '—'}
                {m.stats[a] !== undefined && (
                  <span className="muted"> ({mod(m.stats[a])})</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {m.weapons.length > 0 && (
        <div className="sb-section">
          <h4>{isPc ? 'Weapons' : 'Attacks'}</h4>
          {m.weapons.map((w, i) => {
            const mNames = masteryNamesForWeapon(w, masteries ?? []);
            return (
              <p key={i} className="sb-entry">
                <strong>
                  {w.kind === 'ranged' ? '🏹' : '⚔️'} {w.name}.
                </strong>{' '}
                {w.attackBonus !== undefined &&
                  `${w.attackBonus >= 0 ? '+' : ''}${w.attackBonus} to hit. `}
                {dmgWithMod(w.damage, w)}
                {w.versatileDamage ? ` (2H ${dmgWithMod(w.versatileDamage, w)})` : ''}
                {w.damageType ? ` ${w.damageType}` : ''}
                {w.magicBonus ? ` +${w.magicBonus} magic` : ''}
                {w.range ? ` (${w.range})` : ''}
                {w.tags && w.tags.length > 0 && (
                  <span className="muted"> · {w.tags.map((t) => `[${t}]`).join(' ')}</span>
                )}
                {mNames.length > 0 && (
                  <span className="weapon-masteries">
                    {' '}
                    · <strong>{mNames.join(', ')}</strong>
                  </span>
                )}
              </p>
            );
          })}
        </div>
      )}

      {m.saveProficiencies.length > 0 && (
        <div className="sb-line">
          <strong>Saves:</strong> {m.saveProficiencies.join(', ')}
        </div>
      )}
      {m.resistances.length > 0 && (
        <div className="sb-line">
          <strong>Resist:</strong> {m.resistances.join(', ')}
        </div>
      )}
      {m.weaknesses.length > 0 && (
        <div className="sb-line">
          <strong>Vulnerable:</strong> {m.weaknesses.join(', ')}
        </div>
      )}

      {!deferActionsTraits && (
        <ActionsTraitsReadSections
          actions={m.actions}
          abilities={m.abilities}
          onRollAction={onRollAction}
        />
      )}
    </div>
  );
}

/** The read-only Actions + Traits sections, shared by the inline stat block and
 *  the character sheet's collapsed bottom panel. */
function ActionsTraitsReadSections({
  actions,
  abilities,
  onRollAction,
}: {
  actions: CreatureAbility[];
  abilities: CreatureAbility[];
  onRollAction?: (actionIndex: number, advantage?: 'adv' | 'dis') => void;
}) {
  return (
    <>
      {actions.length > 0 && (
        <div className="sb-section">
          <h4>Actions</h4>
          {actions.map((a, i) => (
            <p key={i} className="sb-entry">
              <strong>{a.name}.</strong> {a.description}
              {a.roll && onRollAction && (
                <ActionRollButton roll={a.roll} onRoll={(adv) => onRollAction(i, adv)} />
              )}
            </p>
          ))}
        </div>
      )}
      {abilities.length > 0 && (
        <div className="sb-section">
          <h4>Traits</h4>
          {abilities.map((a, i) => (
            <p key={i} className="sb-entry">
              <strong>{a.name}.</strong> {a.description}
            </p>
          ))}
        </div>
      )}
    </>
  );
}

/**
 * Self-contained, read/edit Actions & Traits panel — the character sheet renders
 * it collapsed at the bottom (so the stat block leads with stats/health/weapons).
 * It carries its own Edit toggle + drafts and saves via `onSave`, reusing the same
 * EntryEditor as the inline stat block so the two never diverge.
 */
export function ActionsTraitsView({
  actions,
  abilities,
  editable = false,
  onSave,
  onRollAction,
}: {
  actions: CreatureAbility[];
  abilities: CreatureAbility[];
  editable?: boolean;
  onSave?: (patch: { actions: CreatureAbility[]; abilities: CreatureAbility[] }) => void;
  onRollAction?: (actionIndex: number, advantage?: 'adv' | 'dis') => void;
}) {
  const [editing, setEditing] = useState(false);
  const [dActions, setDActions] = useState<CreatureAbility[]>(actions);
  const [dAbilities, setDAbilities] = useState<CreatureAbility[]>(abilities);

  const startEdit = () => {
    setDActions(actions.map((a) => ({ ...a })));
    setDAbilities(abilities.map((a) => ({ ...a })));
    setEditing(true);
  };
  const save = () => {
    onSave?.({
      actions: dActions.filter((a) => a.name.trim()),
      abilities: dAbilities.filter((a) => a.name.trim()),
    });
    setEditing(false);
  };

  if (!editing) {
    return (
      <div className="statblock">
        {editable && onSave && (
          <div className="sb-head">
            <button className="btn tiny" onClick={startEdit}>
              Edit
            </button>
          </div>
        )}
        {actions.length === 0 && abilities.length === 0 ? (
          <p className="muted">None yet.</p>
        ) : (
          <ActionsTraitsReadSections
            actions={actions}
            abilities={abilities}
            onRollAction={onRollAction}
          />
        )}
      </div>
    );
  }
  return (
    <div className="statblock editing">
      <EntryEditor title="Actions" entries={dActions} onChange={setDActions} />
      <EntryEditor title="Traits" entries={dAbilities} onChange={setDAbilities} />
      <div className="sb-edit-actions">
        <button className="btn tiny green" onClick={save}>
          Save
        </button>
        <button className="btn tiny" onClick={() => setEditing(false)}>
          Cancel
        </button>
      </div>
    </div>
  );
}

/** DM roll button for a monster action's structured roll (Adv/Dis for attacks). */
function ActionRollButton({
  roll,
  onRoll,
}: {
  roll: AbilityRoll;
  onRoll: (advantage?: 'adv' | 'dis') => void;
}) {
  const [adv, setAdv] = useState<'adv' | 'dis' | null>(null);
  return (
    <span className="sb-action-roll">
      {roll.kind === 'attack' && (
        <>
          <button
            className={`btn tiny ${adv === 'adv' ? 'on' : ''}`}
            onClick={() => setAdv((a) => (a === 'adv' ? null : 'adv'))}
            title="Roll the attack with advantage"
          >
            Adv
          </button>
          <button
            className={`btn tiny ${adv === 'dis' ? 'on' : ''}`}
            onClick={() => setAdv((a) => (a === 'dis' ? null : 'dis'))}
            title="Roll the attack with disadvantage"
          >
            Dis
          </button>
        </>
      )}
      <button
        className="btn tiny"
        onClick={() => onRoll(roll.kind === 'attack' ? adv ?? undefined : undefined)}
      >
        {rollLabel(roll)}
      </button>
    </span>
  );
}

/** A picker row: a 2024 weapon OR a creature natural attack (shape-compatible). */
type PickRow = {
  name: string;
  kind: Weapon['kind'];
  damage: string;
  damageType: string;
  versatileDamage?: string;
  range?: string;
  properties: string[];
  natural?: boolean;
};

function WeaponEditor({
  weapons,
  onChange,
  monster = false,
}: {
  weapons: Weapon[];
  onChange: (w: Weapon[]) => void;
  /** Creature attacks: library picks are flagged `diceOnly` (mod/to-hit live). */
  monster?: boolean;
}) {
  const setAt = (i: number, patch: Partial<Weapon>) =>
    onChange(weapons.map((w, j) => (j === i ? { ...w, ...patch } : w)));

  const [picking, setPicking] = useState(false);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<PickRow[]>([]);
  useEffect(() => {
    if (!picking) return;
    let live = true;
    const qs = encodeURIComponent(q);
    // Creatures pick from BOTH libraries (natural attacks first, then weapons);
    // PCs pick from the weapon book only.
    const sources = monster
      ? [fetch(`/api/attacks?q=${qs}`), fetch(`/api/weapons?q=${qs}`)]
      : [fetch(`/api/weapons?q=${qs}`)];
    Promise.all(sources.map((p) => p.then((r) => r.json()).catch(() => ({ results: [] }))))
      .then((ds) => live && setHits(ds.flatMap((d) => d.results ?? [])))
      .catch(() => live && setHits([]));
    return () => {
      live = false;
    };
  }, [q, picking, monster]);

  // Add a library attack. Both PCs and creatures store DICE ONLY and pull the
  // ability modifier + to-hit from LIVE stats at roll time; creatures get the
  // `diceOnly` flag so the engine adds the mod for them too (their stat-block
  // damage is otherwise pre-baked). Tags carry finesse/versatile so the live
  // ability choice (STR/DEX) and the 2H toggle still work.
  const addFromLibrary = (w: PickRow) => {
    const next: Weapon = {
      name: w.name,
      kind: w.kind,
      damage: w.damage,
      versatileDamage: w.versatileDamage,
      damageType: w.damageType,
      range: w.range,
      tags: [w.name.toLowerCase(), ...w.properties],
      ...(monster ? { diceOnly: true } : {}),
    };
    onChange([...weapons, next]);
    setPicking(false);
    setQ('');
  };

  const addCustom = () => {
    onChange([...weapons, { name: '', kind: 'melee' }]);
    setPicking(false);
    setQ('');
  };

  return (
    <div className="sb-section">
      <h4>{monster ? 'Attacks' : 'Weapons'}</h4>
      {weapons.map((w, i) => (
        <div key={i} className="sb-weapon-edit">
          <input
            placeholder="Name"
            value={w.name}
            onChange={(e) => setAt(i, { name: e.target.value })}
          />
          <select
            value={w.kind}
            onChange={(e) => setAt(i, { kind: e.target.value as Weapon['kind'] })}
          >
            <option value="melee">melee</option>
            <option value="ranged">ranged</option>
          </select>
          <input
            className="sb-dmg"
            placeholder={monster ? '2d6+3' : '1d8+3'}
            title={
              monster
                ? 'Damage (dice + modifier, baked in), e.g. 2d6+3'
                : 'One-handed damage (dice + ability modifier)'
            }
            value={w.damage ?? ''}
            onChange={(e) => setAt(i, { damage: e.target.value })}
          />
          {!monster && (
            <input
              className="sb-dmg"
              placeholder="2H dmg"
              title="Two-handed damage for a versatile weapon, e.g. 1d10+3"
              value={w.versatileDamage ?? ''}
              onChange={(e) => setAt(i, { versatileDamage: e.target.value })}
            />
          )}
          <input
            className="sb-tohit"
            type="number"
            placeholder="hit"
            title="To-hit bonus"
            value={w.attackBonus ?? ''}
            onChange={(e) =>
              setAt(i, {
                attackBonus:
                  e.target.value === '' ? undefined : Number(e.target.value),
              })
            }
          />
          {monster ? (
            <>
              <input
                className="sb-dmg"
                placeholder="type"
                title="Damage type, e.g. slashing, fire"
                value={w.damageType ?? ''}
                onChange={(e) =>
                  setAt(i, { damageType: e.target.value || undefined })
                }
              />
              <input
                className="sb-dmg"
                placeholder="reach/range"
                title="Reach or range text, e.g. reach 5 ft. or range 80/320"
                value={w.range ?? ''}
                onChange={(e) => setAt(i, { range: e.target.value || undefined })}
              />
            </>
          ) : (
            <>
              <input
                className="sb-tohit"
                type="number"
                placeholder="magic"
                title="Magic damage bonus (e.g. 1 for a +1 weapon)"
                value={w.magicBonus ?? ''}
                onChange={(e) =>
                  setAt(i, {
                    magicBonus:
                      e.target.value === '' ? undefined : Number(e.target.value),
                  })
                }
              />
              <input
                className="sb-tags"
                placeholder="tags: heavy, finesse, versatile, light"
                title="Comma-separated tags. finesse → DEX; versatile → 2H toggle; light → off-hand (future feats); weapon masteries trigger on matching tags."
                value={(w.tags ?? []).join(', ')}
                onChange={(e) =>
                  setAt(i, {
                    tags: e.target.value
                      .split(',')
                      .map((t) => t.trim())
                      .filter(Boolean),
                  })
                }
              />
            </>
          )}
          <button
            className="btn tiny"
            onClick={() => onChange(weapons.filter((_, j) => j !== i))}
          >
            ✕
          </button>
        </div>
      ))}
      <div className="dice-row">
        <button className="btn tiny" onClick={() => setPicking((p) => !p)}>
          {picking ? 'Close' : monster ? '+ Attack' : '+ Weapon'}
        </button>
      </div>
      {picking && (
        <div className="weapon-picker">
          <input
            autoFocus
            placeholder={
              monster
                ? 'Search attacks e.g. Bite, Claw, Longsword…'
                : 'Search 2024 weapons e.g. Longsword, finesse…'
            }
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <div className="item-picker">
            <button className="suggest-row" onClick={addCustom}>
              ✛ Custom (blank)
              <span className="muted">build an attack by hand</span>
            </button>
            {hits.map((w, i) => (
              <button
                key={`${w.name}-${i}`}
                className="suggest-row"
                onClick={() => addFromLibrary(w)}
                title={`${w.damage}${w.versatileDamage ? `/${w.versatileDamage}` : ''} ${w.damageType}`}
              >
                {w.name}
                <span className="muted">
                  {w.damage}
                  {w.versatileDamage ? `/${w.versatileDamage}` : ''} {w.damageType}
                  {w.natural ? ' · natural' : w.properties.length ? ` · ${w.properties.join(', ')}` : ''}
                </span>
              </button>
            ))}
            {hits.length === 0 && q.trim() && <p className="muted spell-none">No match.</p>}
          </div>
        </div>
      )}
    </div>
  );
}

function EntryEditor({
  title,
  entries,
  onChange,
  withRoll = false,
}: {
  title: string;
  entries: CreatureAbility[];
  onChange: (e: CreatureAbility[]) => void;
  /** Monster actions: also edit an optional structured `roll` + derive from text. */
  withRoll?: boolean;
}) {
  const setAt = (i: number, patch: Partial<CreatureAbility>) =>
    onChange(entries.map((e, j) => (j === i ? { ...e, ...patch } : e)));
  const setRoll = (i: number, patch: Partial<AbilityRoll>) =>
    setAt(i, { roll: { ...(entries[i].roll ?? { kind: 'save' }), ...patch } });
  return (
    <div className="sb-section">
      <h4>{title}</h4>
      {entries.map((e, i) => (
        <div key={i} className="sb-entry-edit">
          <input
            placeholder="Name"
            value={e.name}
            onChange={(ev) => setAt(i, { name: ev.target.value })}
          />
          <textarea
            placeholder="Description"
            value={e.description}
            onChange={(ev) => setAt(i, { description: ev.target.value })}
          />
          {withRoll && (
            <div className="sb-roll-edit">
              <select
                value={e.roll?.kind ?? ''}
                title="Make this action rollable"
                onChange={(ev) =>
                  ev.target.value
                    ? setRoll(i, { kind: ev.target.value as AbilityRoll['kind'] })
                    : setAt(i, { roll: undefined })
                }
              >
                <option value="">(no roll)</option>
                <option value="save">Save</option>
                <option value="attack">Attack</option>
                <option value="damage">Damage</option>
                <option value="heal">Heal</option>
              </select>
              {e.roll && (
                <>
                  <input
                    className="sb-roll-dice"
                    placeholder="8d6"
                    value={e.roll.dice ?? ''}
                    onChange={(ev) => setRoll(i, { dice: ev.target.value })}
                  />
                  {e.roll.kind === 'save' && (
                    <>
                      <select
                        value={e.roll.save ?? 'DEX'}
                        onChange={(ev) => setRoll(i, { save: ev.target.value })}
                      >
                        {ABILITIES.map((a) => (
                          <option key={a} value={a}>
                            {a}
                          </option>
                        ))}
                      </select>
                      <input
                        className="sb-roll-dc"
                        type="number"
                        placeholder="DC"
                        value={e.roll.dc ?? ''}
                        onChange={(ev) =>
                          setRoll(i, {
                            dc: ev.target.value === '' ? undefined : Number(ev.target.value),
                          })
                        }
                      />
                    </>
                  )}
                  {e.roll.kind !== 'heal' && (
                    <input
                      className="sb-roll-type"
                      placeholder="fire"
                      value={e.roll.damageType ?? ''}
                      onChange={(ev) => setRoll(i, { damageType: ev.target.value })}
                    />
                  )}
                </>
              )}
            </div>
          )}
          <button
            className="btn tiny"
            onClick={() => onChange(entries.filter((_, j) => j !== i))}
          >
            ✕
          </button>
        </div>
      ))}
      {withRoll && entries.some((e) => e.description && !e.roll) && (
        <button
          className="btn tiny"
          title="Scrape a save DC + damage dice from each action's description"
          onClick={() =>
            onChange(
              entries.map((e) => {
                if (e.roll || !e.description) return e;
                const r = parseActionRoll(e.description);
                return r ? { ...e, roll: r } : e;
              }),
            )
          }
        >
          ↻ Derive rolls from descriptions
        </button>
      )}
      <button
        className="btn tiny"
        onClick={() => onChange([...entries, { name: '', description: '' }])}
      >
        + {title.replace(/s$/, '')}
      </button>
    </div>
  );
}
