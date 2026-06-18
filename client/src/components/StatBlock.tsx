import { useEffect, useState } from 'react';
import type { CreatureAbility, SheetAbility, Weapon } from '../../../shared/types';
import { signed } from '../../../shared/skills';
import { type ModSource, effectiveAc, effectiveStats } from '../../../shared/modifiers';
import { damageParts, weaponAttackBonusDetail } from '../../../shared/combatMath';
import { DAMAGE_TYPES } from '../../../shared/damage';

/** Common 5e weapon tags, offered as add-suggestions in the tag editor. */
const TAG_SUGGESTIONS = [
  'finesse', 'light', 'heavy', 'versatile', 'two-handed', 'thrown',
  'reach', 'ammunition', 'loading',
];

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
  /** PCs only: enemies defeated (shown as a header badge). Monsters omit it. */
  killCount?: number;
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
  /** When given, each ability score becomes clickable to roll that saving throw
   *  (server-resolved via `save:roll`, honoring the creature's adv/dis toggle). */
  onRollSave?: (ability: string) => void;
  /** When given (alongside `onRollSave`), clicking a stat opens a small Stat/Save
   *  menu — "Stat" rolls a plain ability check (no proficiency) via `check:roll`. */
  onRollCheck?: (ability: string) => void;
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
  onRollSave,
  onRollCheck,
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
        onRollSave={onRollSave}
        onRollCheck={onRollCheck}
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
      {!deferActionsTraits && (
        <>
          {/* Monster rollable actions live in the Spells & Abilities section
              (merged system); the stat block edits only the descriptive Traits. */}
          {!monster && (
            <EntryEditor
              title="Actions"
              entries={d.actions}
              onChange={(actions) => set({ actions })}
            />
          )}
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
  onRollSave,
  onRollCheck,
  deferActionsTraits = false,
}: {
  creature: StatSheet;
  subtitle?: string;
  levelLabel: string;
  onEdit?: () => void;
  onAiFill?: () => void;
  aiBusy?: boolean;
  masteries?: SheetAbility[];
  onRollSave?: (ability: string) => void;
  onRollCheck?: (ability: string) => void;
  deferActionsTraits?: boolean;
}) {
  const m = creature;
  // Which ability's Stat/Save menu is open (click a score to toggle it).
  const [rollMenu, setRollMenu] = useState<string | null>(null);
  const hasStats = ABILITIES.some((a) => m.stats[a] !== undefined);
  // Effective ability scores fold in feat/ASI + equipped-item modifiers (a PC
  // carries `modifiers`/`items`; a monster has neither → base scores), with a
  // per-ability breakdown for the stat-math tooltip.
  const eff = effectiveStats(m as unknown as ModSource);
  const effAc = effectiveAc(m as unknown as ModSource) || m.armorClass;
  // PCs (masteries passed) store dice-only damage; show it with the live ability
  // modifier added (finesse-aware). Monsters keep their pre-baked damage as-is.
  const isPc = masteries !== undefined;
  // PCs and `diceOnly` creature attacks show the live ability modifier; other
  // monster attacks keep their pre-baked damage string as-is. For dice-only
  // weapons any baked flat is stripped first so the modifier shows exactly once
  // (matching the engine, which ignores a stray flat on dice-only weapons).
  const dmgWithMod = (dice: string | undefined, w: Weapon): string => {
    if (!dice) return '';
    // PC weapons AND dice-only creature attacks show DICE ONLY — their ability
    // modifier and to-hit are applied live at roll time (from stats + proficiency),
    // so the line stays clean. Only truly pre-baked monster attacks show as-is.
    if (isPc || w.diceOnly) return damageParts(dice).dice || dice;
    return dice;
  };
  // The to-hit to SHOW: a fixed `attackBonus` wins; otherwise it's derived from
  // live stats (ability mod + proficiency by level/CR) for PCs and creature
  // attacks, so the DM/player can always see it. Pre-baked monster attacks with
  // no bonus set fall back to the derived value too.
  const toHitOf = (w: Weapon): number | undefined => {
    if (typeof w.attackBonus === 'number') return w.attackBonus;
    if (!hasStats) return undefined;
    return weaponAttackBonusDetail({ stats: m.stats, level: m.level, isMonster: !isPc }, w).bonus;
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
        {/* Effective AC (base + equipped-item/feat bonuses) — what the server
            actually defends with; the dot + tooltip show the math. */}
        {m.armorClass > 0 && (
          <span
            title={
              effAc !== m.armorClass
                ? `AC ${effAc} = ${m.armorClass} base ${signed(effAc - m.armorClass)} from modifiers`
                : undefined
            }
          >
            AC {effAc}
            {effAc !== m.armorClass && <span className="sb-ab-mod-dot">•</span>}
          </span>
        )}
        <span>
          HP {m.curHp}/{m.maxHp}
          {m.tempHp > 0 && <span className="temp-hp"> +{m.tempHp} temp</span>}
        </span>
        {m.speed && <span>{m.speed}</span>}
        {!!m.killCount && m.killCount > 0 && (
          <span className="kill-badge" title="Enemies this character has defeated">
            💀 {m.killCount}
          </span>
        )}
      </div>

      {hasStats && (
        <div className="sb-abilities">
          {ABILITIES.map((a) => {
            const bd = eff.breakdown[a];
            const score = bd?.total;
            // Tooltip ALWAYS leads with the stat math, so hovering answers
            // "where does this number come from": with modifiers it reads
            // "STR 19 = 16 base →19 Gauntlets…" (a set part shows "→N"), and an
            // unmodified score reads "STR 16 = 16 base" — which also makes an
            // unequipped magic item easy to spot (its bonus is absent).
            const mathTitle = bd
              ? `${a} ${bd.total} = ${bd.base} base${bd.parts
                  .map((p) => ` ${p.set ? `→${p.value}` : signed(p.value)} ${p.source}`)
                  .join('')}`
              : '';
            const rollable = !!onRollSave && score !== undefined;
            const title =
              [mathTitle, rollable ? `roll a ${a} check or save` : '']
                .filter(Boolean)
                .join(' · ') || undefined;
            const cell = (
              <>
                <div className="sb-ab-name">{a}</div>
                <div className="sb-ab-val">
                  {score ?? '—'}
                  {score !== undefined && <span className="muted"> ({mod(score)})</span>}
                  {bd && bd.parts.length > 0 && <span className="sb-ab-mod-dot">•</span>}
                </div>
              </>
            );
            // Clicking an ability opens a small Stat/Save menu (when both rolls are
            // wired); falls back to rolling the save directly if only that's given.
            if (!rollable) {
              return (
                <div key={a} className="sb-ability" title={title}>
                  {cell}
                </div>
              );
            }
            const open = rollMenu === a;
            return (
              <div key={a} className="sb-ability-wrap">
                <button
                  type="button"
                  className={`sb-ability sb-ability-roll ${open ? 'on' : ''}`}
                  title={title ?? `Roll a ${a} check or save`}
                  onClick={() =>
                    onRollCheck ? setRollMenu(open ? null : a) : onRollSave!(a)
                  }
                >
                  {cell}
                </button>
                {open && onRollCheck && (
                  <>
                    {/* Click-away catcher closes the menu. */}
                    <div className="sb-roll-menu-backdrop" onClick={() => setRollMenu(null)} />
                    <div className="sb-roll-menu">
                      <button
                        type="button"
                        className="btn tiny"
                        title={`Plain ${a} ability check (no proficiency)`}
                        onClick={() => {
                          onRollCheck(a);
                          setRollMenu(null);
                        }}
                      >
                        🎲 Stat
                      </button>
                      <button
                        type="button"
                        className="btn tiny"
                        title={`${a} saving throw (adds proficiency if proficient)`}
                        onClick={() => {
                          onRollSave!(a);
                          setRollMenu(null);
                        }}
                      >
                        🛡 Save
                      </button>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {m.weapons.length > 0 && (
        <div className="sb-section">
          <h4>{isPc ? 'Weapons' : 'Attacks'}</h4>
          {m.weapons.map((w, i) => {
            const mNames = masteryNamesForWeapon(w, masteries ?? []);
            const th = toHitOf(w);
            return (
              <p key={i} className="sb-entry">
                <strong>
                  {w.kind === 'ranged' ? '🏹' : '⚔️'} {w.name}.
                </strong>{' '}
                {!isPc && !w.diceOnly && th !== undefined && `${signed(th)} to hit. `}
                {dmgWithMod(w.damage, w)}
                {w.versatileDamage ? ` (2H ${dmgWithMod(w.versatileDamage, w)})` : ''}
                {w.damageType ? ` ${w.damageType}` : ''}
                {w.magicBonus ? ` +${w.magicBonus} magic` : ''}
                {w.extraDamage ? ` + ${w.extraDamage}${w.extraDamageType ? ` ${w.extraDamageType}` : ''}` : ''}
                {w.attackAbility ? (
                  <span className="muted" title="Uses this ability for attack + damage">
                    {' '}
                    ({w.attackAbility})
                  </span>
                ) : ''}
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
        />
      )}
    </div>
  );
}

/** The read-only Actions + Traits sections, shared by the inline stat block and
 *  the character sheet's collapsed bottom panel. Exported so a parent can render
 *  the rollable Actions list inside its own "Spells & Abilities" section. */
export function ActionsTraitsReadSections({
  actions,
  abilities,
}: {
  actions: CreatureAbility[];
  abilities: CreatureAbility[];
}) {
  return (
    <>
      {actions.length > 0 && (
        <div className="sb-section">
          <h4>Actions</h4>
          {actions.map((a, i) => (
            <p key={i} className="sb-entry">
              <strong>{a.name}.</strong> {a.description}
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
  showActions = true,
  showTraits = true,
}: {
  actions: CreatureAbility[];
  abilities: CreatureAbility[];
  editable?: boolean;
  onSave?: (patch: { actions: CreatureAbility[]; abilities: CreatureAbility[] }) => void;
  /** Render/edit only Actions (the spells/abilities area) or only Traits (the
   *  sheet) — the unshown kind is preserved untouched on save. */
  showActions?: boolean;
  showTraits?: boolean;
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
      actions: showActions ? dActions.filter((a) => a.name.trim()) : actions,
      abilities: showTraits ? dAbilities.filter((a) => a.name.trim()) : abilities,
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
        {(showActions ? actions.length : 0) + (showTraits ? abilities.length : 0) === 0 ? (
          <p className="muted">None yet.</p>
        ) : (
          <ActionsTraitsReadSections
            actions={showActions ? actions : []}
            abilities={showTraits ? abilities : []}
          />
        )}
      </div>
    );
  }
  return (
    <div className="statblock editing">
      {showActions && (
        <EntryEditor title="Actions" entries={dActions} onChange={setDActions} />
      )}
      {showTraits && (
        <EntryEditor title="Traits" entries={dAbilities} onChange={setDAbilities} />
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

/**
 * Add/remove editor for a weapon's tags (finesse, heavy, versatile, …). Tags
 * drive the finesse STR/DEX choice, the versatile 2H toggle, and weapon-mastery
 * triggering, so they're shown for both creatures and PCs. Type a tag and press
 * Enter or comma to add it; click ✕ on a chip (or Backspace in the empty box)
 * to remove the last one.
 */
function TagInput({ tags, onChange }: { tags: string[]; onChange: (t: string[]) => void }) {
  const [draft, setDraft] = useState('');
  const add = (raw: string) => {
    const t = raw.trim().toLowerCase();
    if (t && !tags.some((x) => x.toLowerCase() === t)) onChange([...tags, t]);
    setDraft('');
  };
  return (
    <div
      className="sb-tag-input"
      title="Tags drive mechanics: finesse → better of STR/DEX; versatile → 2H toggle; heavy/light → feats; weapon masteries trigger on matching tags."
    >
      {tags.map((t, i) => (
        <span key={i} className="sb-tag-chip">
          {t}
          <button
            type="button"
            className="sb-tag-x"
            aria-label={`Remove ${t}`}
            onClick={() => onChange(tags.filter((_, j) => j !== i))}
          >
            ×
          </button>
        </span>
      ))}
      <input
        className="sb-tag-add"
        list="weapon-tag-suggestions"
        placeholder="+ tag"
        value={draft}
        onChange={(e) =>
          e.target.value.includes(',')
            ? add(e.target.value.replace(/,/g, ''))
            : setDraft(e.target.value)
        }
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            add(draft);
          } else if (e.key === 'Backspace' && !draft && tags.length) {
            onChange(tags.slice(0, -1));
          }
        }}
        onBlur={() => draft && add(draft)}
      />
      <datalist id="weapon-tag-suggestions">
        {TAG_SUGGESTIONS.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>
    </div>
  );
}

/** A damage-type picker over the canonical 5e set list. Preserves any legacy
 *  custom value already stored (shown as an extra option) so old data isn't lost. */
function DamageTypeSelect({
  value,
  onChange,
  title,
  placeholder,
}: {
  value?: string;
  onChange: (t: string | undefined) => void;
  title?: string;
  placeholder?: string;
}) {
  const v = value ?? '';
  const known = (DAMAGE_TYPES as readonly string[]).includes(v.toLowerCase());
  return (
    <select
      className="sb-dmg-type"
      title={title}
      value={v}
      onChange={(e) => onChange(e.target.value || undefined)}
    >
      <option value="">{placeholder ?? 'type'}</option>
      {DAMAGE_TYPES.map((t) => (
        <option key={t} value={t}>
          {t}
        </option>
      ))}
      {v && !known && <option value={v}>{v}</option>}
    </select>
  );
}

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
      <p className="hint sb-weapon-hint">
        Damage is <strong>dice only</strong> — the ability modifier is added
        automatically at roll time. To-hit auto-computes as ability modifier +
        proficiency{monster ? ' by CR (CR 0–4 +2, 5–8 +3, 9–12 +4…)' : ' by level'};
        fill the “hit” field only to override it.
      </p>
      {weapons.map((w, i) => {
        const diceOnly = !monster || !!w.diceOnly; // ability mod auto-added at roll time
        return (
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
          <select
            className="sb-weapon-ability"
            value={w.attackAbility ?? ''}
            title="Ability used for attack + damage. Auto = STR (melee) / DEX (ranged) / better of the two (finesse). Override for Shillelagh (WIS), custom or magic weapons."
            onChange={(e) =>
              setAt(i, { attackAbility: (e.target.value || undefined) as Weapon['attackAbility'] })
            }
          >
            <option value="">auto</option>
            {['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'].map((ab) => (
              <option key={ab} value={ab}>
                {ab}
              </option>
            ))}
          </select>
          <input
            className="sb-dmg"
            placeholder={diceOnly ? '1d8 (dice only)' : '2d6+3'}
            title={
              diceOnly
                ? "Damage DICE ONLY — the ability modifier is added automatically at roll time. Don't include it here (e.g. 1d8, not 1d8+3)."
                : 'Damage (dice + modifier, baked in), e.g. 2d6+3'
            }
            value={w.damage ?? ''}
            onChange={(e) => setAt(i, { damage: e.target.value })}
          />
          {!monster && (
            <input
              className="sb-dmg"
              placeholder="2H dmg"
              title="Two-handed damage (dice only) for a versatile weapon, e.g. 1d10"
              value={w.versatileDamage ?? ''}
              onChange={(e) => setAt(i, { versatileDamage: e.target.value })}
            />
          )}
          <input
            className="sb-tohit"
            type="number"
            placeholder="hit"
            title="To-hit bonus. Leave blank to auto-compute (ability modifier + proficiency by level/CR); enter a number to override."
            value={w.attackBonus ?? ''}
            onChange={(e) =>
              setAt(i, {
                attackBonus:
                  e.target.value === '' ? undefined : Number(e.target.value),
              })
            }
          />
          <DamageTypeSelect
            value={w.damageType}
            onChange={(damageType) => setAt(i, { damageType })}
            title="Damage type — drives resistance/vulnerability"
            placeholder="type"
          />
          <input
            className="sb-tohit"
            type="number"
            placeholder="magic"
            title="Magic damage bonus (e.g. 1 for a +1 weapon), added to every hit"
            value={w.magicBonus ?? ''}
            onChange={(e) =>
              setAt(i, {
                magicBonus:
                  e.target.value === '' ? undefined : Number(e.target.value),
              })
            }
          />
          <input
            className="sb-dmg"
            placeholder="+dmg 1d6"
            title="Secondary damage dice of a different type (e.g. a flaming sword's 1d6 fire), rolled on a hit and doubled on a crit"
            value={w.extraDamage ?? ''}
            onChange={(e) => setAt(i, { extraDamage: e.target.value || undefined })}
          />
          <DamageTypeSelect
            value={w.extraDamageType}
            onChange={(extraDamageType) => setAt(i, { extraDamageType })}
            title="Type of the secondary (+dmg) damage"
            placeholder="+type"
          />
          {monster && (
            <input
              className="sb-dmg"
              placeholder="reach/range"
              title="Reach or range text, e.g. reach 5 ft. or range 80/320"
              value={w.range ?? ''}
              onChange={(e) => setAt(i, { range: e.target.value || undefined })}
            />
          )}
          <TagInput tags={w.tags ?? []} onChange={(tags) => setAt(i, { tags })} />
          <button
            className="btn tiny"
            onClick={() => onChange(weapons.filter((_, j) => j !== i))}
          >
            ✕
          </button>
        </div>
        );
      })}
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
