import { useState } from 'react';
import type { CreatureAbility, Monster, Weapon } from '../../../shared/types';
import { useStore } from '../state/socket';

const ABILITIES = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'];
const mod = (score: number) => {
  const m = Math.floor((score - 10) / 2);
  return `${m >= 0 ? '+' : ''}${m}`;
};

/** Editable draft mirroring a monster's tagged stat-block fields. */
type Draft = {
  name: string;
  creatureType: string;
  maxHp: number;
  curHp: number;
  armorClass: number;
  speed: string;
  stats: Record<string, number>;
  resistances: string;
  weaknesses: string;
  weapons: Weapon[];
  actions: CreatureAbility[];
  abilities: CreatureAbility[];
};

const toDraft = (m: Monster): Draft => ({
  name: m.name,
  creatureType: m.creatureType,
  maxHp: m.maxHp,
  curHp: m.curHp,
  armorClass: m.armorClass,
  speed: m.speed,
  stats: { ...m.stats },
  resistances: m.resistances.join(', '),
  weaknesses: m.weaknesses.join(', '),
  weapons: m.weapons.map((w) => ({ ...w })),
  actions: m.actions.map((a) => ({ ...a })),
  abilities: m.abilities.map((a) => ({ ...a })),
});

const splitList = (s: string) =>
  s.split(',').map((x) => x.trim()).filter(Boolean);

/** DM-only full creature stat block — read-only view with an inline edit form. */
export function StatBlock({ monster }: { monster: Monster }) {
  const updateMonster = useStore((s) => s.updateMonster);
  const [editing, setEditing] = useState(false);
  const [d, setD] = useState<Draft>(() => toDraft(monster));

  const startEdit = () => {
    setD(toDraft(monster));
    setEditing(true);
  };

  const save = () => {
    updateMonster({
      monsterId: monster.id,
      name: d.name.trim() || monster.name,
      creatureType: d.creatureType.trim(),
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
    });
    setEditing(false);
  };

  if (!editing) {
    return <ReadView monster={monster} onEdit={startEdit} />;
  }

  const set = (patch: Partial<Draft>) => setD((cur) => ({ ...cur, ...patch }));
  const num = (v: string) => (Number.isFinite(Number(v)) ? Number(v) : 0);

  return (
    <div className="statblock editing">
      <label className="sb-field">
        Name
        <input value={d.name} onChange={(e) => set({ name: e.target.value })} />
      </label>
      <label className="sb-field">
        Type
        <input
          value={d.creatureType}
          onChange={(e) => set({ creatureType: e.target.value })}
        />
      </label>
      <div className="sb-meta-edit">
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

      <WeaponEditor
        weapons={d.weapons}
        onChange={(weapons) => set({ weapons })}
      />
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
  monster,
  onEdit,
}: {
  monster: Monster;
  onEdit: () => void;
}) {
  const hasStats = ABILITIES.some((a) => monster.stats[a] !== undefined);
  return (
    <div className="statblock">
      <div className="sb-head">
        {monster.creatureType && (
          <div className="sb-type">{monster.creatureType}</div>
        )}
        <button className="btn tiny" onClick={onEdit}>
          Edit
        </button>
      </div>
      <div className="sb-meta">
        {monster.armorClass > 0 && <span>AC {monster.armorClass}</span>}
        <span>
          HP {monster.curHp}/{monster.maxHp}
        </span>
        {monster.speed && <span>{monster.speed}</span>}
      </div>

      {hasStats && (
        <div className="sb-abilities">
          {ABILITIES.map((a) => (
            <div key={a} className="sb-ability">
              <div className="sb-ab-name">{a}</div>
              <div className="sb-ab-val">
                {monster.stats[a] ?? '—'}
                {monster.stats[a] !== undefined && (
                  <span className="muted"> ({mod(monster.stats[a])})</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {monster.weapons.length > 0 && (
        <div className="sb-section">
          <h4>Weapons</h4>
          {monster.weapons.map((w, i) => (
            <p key={i} className="sb-entry">
              <strong>{w.kind === 'ranged' ? '🏹' : '⚔️'} {w.name}.</strong>{' '}
              {w.attackBonus !== undefined && `${w.attackBonus >= 0 ? '+' : ''}${w.attackBonus} to hit. `}
              {w.damage}
              {w.range ? ` (${w.range})` : ''}
            </p>
          ))}
        </div>
      )}

      {monster.resistances.length > 0 && (
        <div className="sb-line">
          <strong>Resist:</strong> {monster.resistances.join(', ')}
        </div>
      )}
      {monster.weaknesses.length > 0 && (
        <div className="sb-line">
          <strong>Vulnerable:</strong> {monster.weaknesses.join(', ')}
        </div>
      )}

      {monster.actions.length > 0 && (
        <div className="sb-section">
          <h4>Actions</h4>
          {monster.actions.map((a, i) => (
            <p key={i} className="sb-entry">
              <strong>{a.name}.</strong> {a.description}
            </p>
          ))}
        </div>
      )}
      {monster.abilities.length > 0 && (
        <div className="sb-section">
          <h4>Traits</h4>
          {monster.abilities.map((a, i) => (
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
            onChange={(e) =>
              setAt(i, { kind: e.target.value as Weapon['kind'] })
            }
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
            placeholder="+"
            value={w.attackBonus ?? ''}
            onChange={(e) =>
              setAt(i, {
                attackBonus:
                  e.target.value === '' ? undefined : Number(e.target.value),
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
