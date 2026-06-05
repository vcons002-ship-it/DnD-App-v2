import { useState } from 'react';
import type { CreatureAbility, SheetAbility, Weapon } from '../../../shared/types';

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
  armorClass: number;
  speed: string;
  stats: Record<string, number>;
  resistances: string[];
  weaknesses: string[];
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
};

/** Names of the character's masteries that trigger on a weapon (tag overlap). */
function masteryNamesForWeapon(w: Weapon, masteries: SheetAbility[]): string[] {
  const wtags = (w.tags ?? []).map((t) => t.trim().toLowerCase());
  if (!wtags.length) return [];
  return masteries
    .filter(
      (a) =>
        a.type === 'mastery' &&
        a.mastery &&
        (a.mastery.appliesToTags ?? []).some((t) => wtags.includes(t.trim().toLowerCase())),
    )
    .map((a) => a.name);
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
}: Props) {
  const [editing, setEditing] = useState(false);
  const [d, setD] = useState<Draft>(() => toDraft(creature, identity));

  function toDraft(c: StatSheet, ids: IdentityField[]): Draft {
    return {
      name: c.name,
      level: c.level,
      curHp: c.curHp,
      maxHp: c.maxHp,
      armorClass: c.armorClass,
      speed: c.speed,
      stats: { ...c.stats },
      resistances: c.resistances.join(', '),
      weaknesses: c.weaknesses.join(', '),
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
      armorClass: d.armorClass,
      speed: d.speed.trim(),
      stats: d.stats,
      resistances: splitList(d.resistances),
      weaknesses: splitList(d.weaknesses),
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

      <WeaponEditor weapons={d.weapons} onChange={(weapons) => set({ weapons })} />
      <EntryEditor
        title="Actions"
        entries={d.actions}
        onChange={(actions) => set({ actions })}
      />
      <EntryEditor
        title="Traits"
        entries={d.abilities}
        onChange={(abilities) => set({ abilities })}
      />

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
}: {
  creature: StatSheet;
  subtitle?: string;
  levelLabel: string;
  onEdit?: () => void;
  onAiFill?: () => void;
  aiBusy?: boolean;
  masteries?: SheetAbility[];
}) {
  const m = creature;
  const hasStats = ABILITIES.some((a) => m.stats[a] !== undefined);
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
          <h4>Weapons</h4>
          {m.weapons.map((w, i) => {
            const mNames = masteryNamesForWeapon(w, masteries ?? []);
            return (
              <p key={i} className="sb-entry">
                <strong>
                  {w.kind === 'ranged' ? '🏹' : '⚔️'} {w.name}.
                </strong>{' '}
                {w.attackBonus !== undefined &&
                  `${w.attackBonus >= 0 ? '+' : ''}${w.attackBonus} to hit. `}
                {w.damage}
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

      {m.actions.length > 0 && (
        <div className="sb-section">
          <h4>Actions</h4>
          {m.actions.map((a, i) => (
            <p key={i} className="sb-entry">
              <strong>{a.name}.</strong> {a.description}
            </p>
          ))}
        </div>
      )}
      {m.abilities.length > 0 && (
        <div className="sb-section">
          <h4>Traits</h4>
          {m.abilities.map((a, i) => (
            <p key={i} className="sb-entry">
              <strong>{a.name}.</strong> {a.description}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function WeaponEditor({
  weapons,
  onChange,
}: {
  weapons: Weapon[];
  onChange: (w: Weapon[]) => void;
}) {
  const setAt = (i: number, patch: Partial<Weapon>) =>
    onChange(weapons.map((w, j) => (j === i ? { ...w, ...patch } : w)));
  return (
    <div className="sb-section">
      <h4>Weapons</h4>
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
            placeholder="1d8+3"
            value={w.damage ?? ''}
            onChange={(e) => setAt(i, { damage: e.target.value })}
          />
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
            placeholder="tags: heavy, greataxe"
            title="Comma-separated tags. Weapon masteries trigger on matching tags."
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
          <button
            className="btn tiny"
            onClick={() => onChange(weapons.filter((_, j) => j !== i))}
          >
            ✕
          </button>
        </div>
      ))}
      <button
        className="btn tiny"
        onClick={() => onChange([...weapons, { name: '', kind: 'melee' }])}
      >
        + Weapon
      </button>
    </div>
  );
}

function EntryEditor({
  title,
  entries,
  onChange,
}: {
  title: string;
  entries: CreatureAbility[];
  onChange: (e: CreatureAbility[]) => void;
}) {
  const setAt = (i: number, patch: Partial<CreatureAbility>) =>
    onChange(entries.map((e, j) => (j === i ? { ...e, ...patch } : e)));
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
          <button
            className="btn tiny"
            onClick={() => onChange(entries.filter((_, j) => j !== i))}
          >
            ✕
          </button>
        </div>
      ))}
      <button
        className="btn tiny"
        onClick={() => onChange([...entries, { name: '', description: '' }])}
      >
        + {title.replace(/s$/, '')}
      </button>
    </div>
  );
}
