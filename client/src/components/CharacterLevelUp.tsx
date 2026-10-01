import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Character } from '../../../shared/types';
import { SKILLS, type AbilityKey } from '../../../shared/skills';
import type { ClassRosterEntry, LevelUpChoices, LevelUpCommitRequest, LevelUpPlan, LevelUpPreview } from '../../../shared/levelingTypes';
import { CORE_CLASSES_2024, permanentStats2024, subclassChoices2024, type CoreClass } from '../../../shared/characterProgression';
import { resolveClassRoster } from '../../../shared/multiclass';
import { useStore } from '../state/socket';
import './character-level-up.css';

const ABILITIES: AbilityKey[] = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'];
type Step = 'hp' | 'features' | 'feat' | 'spells' | 'summary';
const STEP_LABELS: Record<Step, string> = { hp: 'Hit points', features: 'Class choices', feat: 'Feat / abilities', spells: 'Spells', summary: 'Review' };
const normalize = (name: string) => name.trim().toLowerCase();
const classLabel = (name: string) => name.charAt(0).toUpperCase() + name.slice(1);
const rosterLabel = (classes: ClassRosterEntry[]) => classes.map(entry => `${classLabel(entry.className)} ${entry.level}`).join(' / ');

/** One small sheet control. A grant never changes a character's level itself. */
export function CharacterLevelUp({ character, editable }: { character: Character; editable: boolean }) {
  const role = useStore(s => s.snapshot?.role);
  const connected = useStore(s => s.status === 'connected');
  const grantLevelUp = useStore(s => s.grantLevelUp);
  const cancelLevelUp = useStore(s => s.cancelLevelUp);
  const [open, setOpen] = useState(false);
  const [configuring, setConfiguring] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pending = character.leveling?.pending;
  const classes = resolveClassRoster(character);
  if (!editable || (role !== 'dm' && !pending && !classes)) return null;

  const grant = async () => {
    setBusy(true); setError('');
    try {
      const result = await grantLevelUp(character.id);
      if (result.ok) setOpen(true);
      else setError(result.error);
    } catch { setError('Could not reach the server. Reconnect and try again.'); }
    finally { setBusy(false); }
  };
  const cancel = async () => {
    if (!pending) return;
    setBusy(true); setError('');
    try {
      const result = await cancelLevelUp(character.id, pending.id);
      if (!result.ok) setError(result.error);
    } catch { setError('Could not reach the server. Reconnect and try again.'); }
    finally { setBusy(false); }
  };

  return <section className={`char-level-up${pending ? ' is-ready' : ''}`} aria-label="Character leveling">
    <div className="char-level-up-line">
      <span><strong>{pending ? `Level ${pending.toLevel} is ready` : `Level ${character.level}`}</strong><small>{classes ? rosterLabel(classes) : 'Class levels need configuration'}</small></span>
      {pending ? <>
        <button className="btn tiny level-up-primary" disabled={busy || !connected} onClick={() => setOpen(true)}>Continue level-up</button>
        {role === 'dm' && <button className="btn tiny" disabled={busy || !connected} onClick={cancel}>Cancel grant</button>}
      </> : role === 'dm' && (character.level < 20 ? <button className="btn tiny" disabled={busy || !connected || !classes} onClick={grant}>{busy ? 'Granting…' : `Grant level ${character.level + 1}`}</button>
        : <small>Maximum level</small>)}
      {role === 'dm' && <button className="btn tiny" disabled={busy || !connected || !!pending} title={pending ? 'Cancel this grant before changing existing class levels' : 'Set the existing class levels; this does not rebuild the sheet'} onClick={() => setConfiguring(true)}>Edit class levels</button>}
    </div>
    {error && <p className="level-up-error" role="alert">{error}</p>}
    {open && <LevelUpWizard character={character} onClose={() => setOpen(false)} />}
    {configuring && <ClassLevelsDialog character={character} onClose={() => setConfiguring(false)} />}
  </section>;
}

function LevelUpWizard({ character, onClose }: { character: Character; onClose: () => void }) {
  const getPlan = useStore(s => s.getLevelUpPlan);
  const previewLevelUp = useStore(s => s.previewLevelUp);
  const applyLevelUp = useStore(s => s.applyLevelUp);
  const rollHp = useStore(s => s.rollLevelUpHp);
  const notify = useStore(s => s.notify);
  const connected = useStore(s => s.status === 'connected');
  const dialog = useRef<HTMLDialogElement>(null);
  const requestNumber = useRef(0);
  const titleId = useId();
  const [plan, setPlan] = useState<LevelUpPlan | null>(null);
  const initialClass = character.leveling?.pending?.hpClassName ?? resolveClassRoster(character)?.[0]?.className;
  const [choices, setChoices] = useState<LevelUpChoices>({ hpMethod: character.leveling?.pending?.hpRoll === undefined ? 'fixed' : 'roll', className: initialClass });
  const [step, setStep] = useState<Step>('hp');
  const [busy, setBusy] = useState(true);
  const [rolling, setRolling] = useState(false);
  const [rollRequested, setRollRequested] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<LevelUpPreview | null>(null);
  const [featMode, setFeatMode] = useState<'asi' | 'feat'>('asi');
  const [asiFirst, setAsiFirst] = useState<AbilityKey | ''>('');
  const [asiSecond, setAsiSecond] = useState<AbilityKey | ''>('');
  const [query, setQuery] = useState('');
  const [featQuery, setFeatQuery] = useState('');

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => { requestNumber.current++; element?.close(); };
  }, []);
  const loadPlan = async (subclass?: string, className?: CoreClass) => {
    const request = ++requestNumber.current;
    setBusy(true); setError('');
    try {
      const result = await getPlan(character.id, subclass, className);
      if (request !== requestNumber.current) return;
      if (result.ok) {
        setPlan(result.value);
        const selectedClass = result.value.progression.classKey;
        const existingSubclass = result.value.classes.find(entry => entry.className === selectedClass)?.subclass;
        setChoices(c => ({ ...c, className: selectedClass, subclass: subclass ?? existingSubclass }));
        if (result.value.progression.featChoice === 'epicBoonOrFeat') setFeatMode('feat');
        if (result.value.grant.hpRoll !== undefined) {
          setChoices(c => ({ ...c, hpMethod: 'roll' }));
          setRolling(false);
        }
      } else setError(result.error);
    } catch { if (request === requestNumber.current) setError('Could not load level-up choices. Reconnect and try again.'); }
    finally { if (request === requestNumber.current) setBusy(false); }
  };
  useEffect(() => { void loadPlan(undefined, initialClass); }, [character.id]);

  // The rolled face comes from the snapshot only, after the server settles it.
  const pending = character.leveling?.pending;
  const hpFace = pending && pending.id === plan?.grant.id ? pending.hpRoll ?? plan?.grant.hpRoll : plan?.grant.hpRoll;
  const hpClassLocked = pending?.hpClassName ?? plan?.grant.hpClassName;
  useEffect(() => {
    if (hpFace !== undefined) {
      setRolling(false);
      setError('');
      setChoices(c => c.hpMethod === 'roll' ? c : { ...c, hpMethod: 'roll' });
      setPreview(null);
    }
  }, [hpFace]);
  useEffect(() => {
    if (!rolling) return;
    const timer = window.setTimeout(() => {
      setRolling(false);
      setError('The HP roll has not arrived yet. Check the connection, then reopen this guide to resume the same roll.');
    }, 30_000);
    return () => window.clearTimeout(timer);
  }, [rolling]);

  const change = (patch: Partial<LevelUpChoices>) => {
    setChoices(current => ({ ...current, ...patch }));
    setPreview(null); setError('');
  };
  const progression = plan?.progression;
  const spellsRequired = plan?.spellChoices.newSpells ?? 0;
  const cantripsRequired = plan?.spellChoices.newCantrips ?? 0;
  const replacements = choices.replaceSpellIds ?? [];
  const spellsChosen = choices.spellNames ?? [];
  const cantripsChosen = choices.cantripNames ?? [];
  const steps: Step[] = ['hp', 'features', ...(progression?.featChoice ? ['feat' as const] : []),
    ...(spellsRequired || cantripsRequired || plan?.spellChoices.replacementLimit ? ['spells' as const] : []), 'summary'];
  const stats = permanentStats2024(character);
  const chosenFeat = plan?.feats.find(feat => feat.name === choices.featName);
  const visibleFeatureChoices = plan?.featureChoices.filter(choice => !choice.when || choices.featureSelections?.[choice.when.key]?.includes(choice.when.option)) ?? [];
  const selectedClassEntry = plan?.classes.find(entry => entry.className === progression?.classKey);
  const needsSubclass = !!plan && !selectedClassEntry?.subclass && plan.toClassLevel >= 3;
  const spellClass = progression?.classKey === 'fighter' || progression?.classKey === 'rogue' ? 'wizard' : progression?.classKey;
  const replaceClasses = progression?.classKey === 'bard' && progression.level >= 10 ? ['bard', 'cleric', 'druid', 'wizard'] : spellClass ? [spellClass] : [];
  const belongsToClass = (ability: Character['sheetAbilities'][number]) => ability.sourceClass ? ability.sourceClass === progression?.classKey : (plan?.classes.length ?? 0) === 1;
  const oldSpells = character.sheetAbilities.filter(a => a.type === 'spell' && (a.level ?? 0) > 0 && belongsToClass(a) &&
    a.classes?.some(name => replaceClasses.includes(name)) && !a.tags?.some(tag => ['feat', 'always-prepared', 'subclass-spell'].includes(tag)));
  const knownNames = new Set(character.sheetAbilities.filter(a => a.type === 'spell' && belongsToClass(a)).map(a => normalize(a.name)));

  const stepProblem = (current: Step): string | null => {
    if (!plan) return 'Load the choices before continuing.';
    if (current === 'hp' && choices.hpMethod === 'roll' && hpFace === undefined) return 'Roll your HP die and wait for its result.';
    if (current === 'features') {
      if (needsSubclass && !choices.subclass) return 'Choose a subclass.';
      const incomplete = visibleFeatureChoices.find(c => (choices.featureSelections?.[c.key]?.length ?? 0) !== c.count);
      if (incomplete) return `Choose ${incomplete.count} for ${incomplete.label}.`;
    }
    if (current === 'feat') {
      if (featMode === 'asi') {
        if (!asiFirst || !asiSecond) return 'Choose where to put both ability-score points.';
        if (Object.entries(choices.asi ?? {}).some(([key, amount]) => (stats[key] ?? 10) + (amount ?? 0) > 20)) return 'Ability improvements cannot raise a score above 20.';
      } else {
        if (!chosenFeat) return 'Choose a feat.';
        if (chosenFeat.abilityChoices?.length && !choices.featAbility) return 'Choose the ability score increased by this feat.';
        if (chosenFeat.name === 'Skilled' && choices.featureSelections?.skilled?.length !== 3) return 'Choose three new skill proficiencies for Skilled.';
      }
    }
    if (current === 'spells') {
      if (plan.spellChoices.spellSelectionRequired && spellsChosen.length !== spellsRequired + replacements.length) return `Choose ${spellsRequired + replacements.length} new spell${spellsRequired + replacements.length === 1 ? '' : 's'}.`;
      if (spellsChosen.length < replacements.length) return 'Choose a new spell to replace the one you are removing.';
      if (plan.spellChoices.cantripSelectionRequired && cantripsChosen.length !== cantripsRequired) return `Choose ${cantripsRequired} new cantrip${cantripsRequired === 1 ? '' : 's'}.`;
    }
    return null;
  };
  const request = (): LevelUpCommitRequest => ({ characterId: character.id, grantId: plan!.grant.id, expectedLevel: plan!.grant.fromLevel, choices });
  const review = async () => {
    const problem = steps.filter(s => s !== 'summary').map(stepProblem).find(Boolean);
    if (problem) { setError(problem); return; }
    setBusy(true); setError(''); setPreview(null);
    try {
      const result = await previewLevelUp(request());
      if (result.ok) { setPreview(result.value); setStep('summary'); }
      else setError(result.error);
    } catch { setError('Could not check your choices. Reconnect and try again.'); }
    finally { setBusy(false); }
  };
  const advance = () => {
    const problem = stepProblem(step);
    if (problem) { setError(problem); return; }
    const next = steps[steps.indexOf(step) + 1];
    if (next === 'summary') void review();
    else { setError(''); setStep(next); }
  };
  const apply = async () => {
    if (!preview) return;
    setBusy(true); setError('');
    try {
      const result = await applyLevelUp(request());
      if (result.ok) { notify(`${character.name} is now level ${result.value.level}.`); onClose(); }
      else { setError(result.error); setPreview(null); }
    } catch { setError('Could not apply the level. Your choices have not been applied; reconnect and review again.'); setPreview(null); }
    finally { setBusy(false); }
  };
  const selectAsi = (first: AbilityKey | '', second: AbilityKey | '') => {
    setAsiFirst(first); setAsiSecond(second);
    const asi: Partial<Record<AbilityKey, number>> = {};
    if (first) asi[first] = 1;
    if (second) asi[second] = (asi[second] ?? 0) + 1;
    change({ asi, featName: undefined, featAbility: undefined, featureSelections: Object.fromEntries(Object.entries(choices.featureSelections ?? {}).filter(([key]) => key !== 'skilled')) });
  };
  const toggleSpell = (name: string, cantrip: boolean) => {
    const selected = cantrip ? cantripsChosen : spellsChosen;
    const max = cantrip ? cantripsRequired : spellsRequired + replacements.length;
    const next = selected.includes(name) ? selected.filter(n => n !== name) : selected.length < max ? [...selected, name] : selected;
    change(cantrip ? { cantripNames: next } : { spellNames: next });
  };
  const selectClass = (className: CoreClass) => {
    const entry = plan?.classes.find(c => c.className === className);
    setChoices({ hpMethod: hpFace === undefined ? 'fixed' : 'roll', className, subclass: entry?.subclass });
    setAsiFirst(''); setAsiSecond(''); setFeatMode('asi'); setPreview(null); setQuery(''); setStep('hp');
    void loadPlan(entry?.subclass, className);
  };

  return createPortal(<dialog ref={dialog} className="character-level-up-dialog fantasy-window" data-level-up="true" aria-labelledby={titleId}
    onCancel={event => { event.preventDefault(); event.stopPropagation(); if (!busy) onClose(); }}>
    <header className="level-up-header">
      <div><small>LEVEL UP · 2024</small><h2 id={titleId}>{character.name}<span>Level {plan?.grant.fromLevel ?? character.level} → {plan?.grant.toLevel ?? character.level + 1}</span></h2></div>
      <button type="button" className="btn tiny" disabled={busy} onClick={onClose} aria-label="Close level-up guide">Close</button>
    </header>
    {plan && <nav className="level-up-steps" aria-label="Level-up steps">{steps.map((s, index) => <span key={s} className={step === s ? 'current' : steps.indexOf(step) > index ? 'complete' : ''} aria-current={step === s ? 'step' : undefined}><b>{index + 1}</b>{STEP_LABELS[s]}</span>)}</nav>}
    <div className="level-up-body" aria-busy={busy}>
      {!plan && !error && <p role="status">Loading your class progression…</p>}
      {error && <p className="level-up-error" role="alert">{error}</p>}
      {!connected && <p className="level-up-warning" role="status">Reconnect before making or applying choices.</p>}
      {plan && <>
        {step === 'hp' && <section aria-label="Choose level-up hit points">
          <label className="level-up-field">Class to advance<select value={choices.className ?? plan.progression.classKey} disabled={busy || rolling || rollRequested || !!hpClassLocked} onChange={event => selectClass(event.target.value as CoreClass)}>
            {plan.classOptions.map(option => <option key={option.className} value={option.className} disabled={!option.eligible}>{classLabel(option.className)} {option.level} → {option.level + 1}{option.level === 0 ? ' · New class' : ''}{!option.eligible && option.reason ? ` · ${option.reason}` : ''}</option>)}
          </select></label>
          <p className="level-up-note"><strong>{classLabel(plan.progression.classKey)} {plan.fromClassLevel} → {plan.toClassLevel}</strong>{plan.newClass ? ' · Your first level in this class.' : ''}<br />{rosterLabel(plan.classes)}{hpClassLocked ? ' · Class choice is locked by your HP roll.' : ''}</p>
          <details className="level-up-prerequisites"><summary>Multiclass requirements</summary>{plan.classOptions.filter(option => !option.eligible).map(option => <p key={option.className}><strong>{classLabel(option.className)}:</strong> {option.reason}</p>)}{plan.classOptions.every(option => option.eligible) && <p>Your permanent ability scores meet all core-class requirements.</p>}</details>
          <h3>Grow stronger</h3><p>Choose the fixed hit-point increase or roll your class die. Constitution and any feat changes are included in the final review.</p>
          <div className="level-up-choice-grid">
            <label className={`level-up-option${choices.hpMethod === 'fixed' ? ' selected' : ''}`}>
              <input type="radio" name="level-up-hp" checked={choices.hpMethod === 'fixed'} disabled={hpFace !== undefined || rollRequested || rolling || busy} onChange={() => change({ hpMethod: 'fixed' })} />
              <strong>Fixed increase</strong><span>{plan.progression.fixedHp} + Constitution</span>
            </label>
            <label className={`level-up-option${choices.hpMethod === 'roll' ? ' selected' : ''}`}>
              <input type="radio" name="level-up-hp" checked={choices.hpMethod === 'roll'} disabled={hpFace !== undefined || rollRequested || rolling || busy} onChange={() => change({ hpMethod: 'roll' })} />
              <strong>Roll for HP</strong><span>d{plan.progression.hitDie} + Constitution</span>
            </label>
          </div>
          {choices.hpMethod === 'roll' && <div className="level-up-hp-roll">
            {hpFace === undefined ? <button className="btn" disabled={busy || rollRequested || rolling || !connected} onClick={() => { setRolling(true); setRollRequested(true); setError(''); rollHp(character.id, plan.grant.id, choices.className); }}>{rollRequested ? 'Rolling HP…' : `Roll d${plan.progression.hitDie} for HP`}</button>
              : <p role="status">Your d{plan.progression.hitDie} rolled <strong className="level-up-hp-face">{hpFace}</strong>.</p>}
            <p className="muted">One roll per granted level. Once rolled, its result is used for this level.</p>
          </div>}
        </section>}
        {step === 'features' && <section aria-label="Choose level-up class features">
          <h3>Your new class features</h3>
          {!!plan.proficiencies.length && <div className="level-up-note"><strong>Multiclass proficiencies</strong><ul>{plan.proficiencies.map(name => <li key={name}>{name}</li>)}</ul></div>}
          {needsSubclass && <label className="level-up-field">Subclass<select value={choices.subclass ?? ''} disabled={busy} onChange={e => {
            const subclass = e.target.value;
            change({ subclass, featureSelections: {}, spellNames: [], cantripNames: [], replaceSpellIds: [] });
            void loadPlan(subclass || undefined, choices.className);
          }}><option value="">Choose a subclass</option>{subclassChoices2024(plan.progression.classKey).map(name => <option key={name} value={name}>{name}</option>)}</select></label>}
          {!!plan.features.length && <div className="level-up-feature-list">{plan.features.map(feature => <details key={feature.name}><summary>{feature.name}{feature.existing && <small>Already on your sheet</small>}</summary><p>{feature.description}</p></details>)}</div>}
          {!plan.features.length && <p className="muted">No new automatic class features at this level.</p>}
          {visibleFeatureChoices.map(choice => {
            const selected = choices.featureSelections?.[choice.key] ?? [];
            return <fieldset className="level-up-selection" key={choice.key}><legend>{choice.label} <small>{selected.length} / {choice.count}</small></legend>
              <p className="muted">Choose {choice.count}.</p>
              {choice.options.map(option => <label className={`level-up-check${selected.includes(option.name) ? ' selected' : ''}`} key={option.name}>
                <input type="checkbox" checked={selected.includes(option.name)} disabled={busy || (!selected.includes(option.name) && selected.length >= choice.count && choice.count > 1)} onChange={() => {
                  const next = selected.includes(option.name) ? selected.filter(n => n !== option.name) : choice.count === 1 ? [option.name] : [...selected, option.name];
                  const selections = { ...choices.featureSelections, [choice.key]: next };
                  for (const dependent of plan.featureChoices) if (dependent.when?.key === choice.key) delete selections[dependent.key];
                  change({ featureSelections: selections });
                }} /><span><strong>{option.name}</strong><small>{option.description}</small></span>
              </label>)}
            </fieldset>;
          })}
        </section>}
        {step === 'feat' && <section aria-label="Choose level-up feat or ability scores">
          <h3>{plan.progression.featChoice === 'epicBoonOrFeat' ? 'Choose an Epic Boon or feat' : 'Choose a feat or improve your abilities'}</h3>
          <div className="level-up-mode" role="group" aria-label="Feat or ability improvement">
            {plan.progression.featChoice === 'asiOrFeat' && <button className={`btn${featMode === 'asi' ? ' active' : ''}`} aria-pressed={featMode === 'asi'} onClick={() => { setFeatMode('asi'); selectAsi(asiFirst, asiSecond); }}>Ability improvement</button>}
            <button className={`btn${featMode === 'feat' ? ' active' : ''}`} aria-pressed={featMode === 'feat'} onClick={() => { setFeatMode('feat'); change({ asi: undefined }); }}>Choose a feat</button>
          </div>
          {featMode === 'asi' ? <>
            <p>Add 2 to one ability or 1 to two different abilities, up to 20. These are your permanent scores, without equipment bonuses.</p>
            <div className="level-up-choice-grid">{([['First +1', asiFirst], ['Second +1', asiSecond]] as const).map(([label, value], index) => <label className="level-up-field" key={label}>{label}<select value={value} onChange={e => {
              const next = e.target.value as AbilityKey | '';
              selectAsi(index === 0 ? next : asiFirst, index === 1 ? next : asiSecond);
            }}><option value="">Choose an ability</option>{ABILITIES.map(key => <option key={key} value={key}>{key} · {stats[key] ?? 10}</option>)}</select></label>)}</div>
            <div className="level-up-stat-preview">{ABILITIES.map(key => <span key={key} className={choices.asi?.[key] ? 'changed' : ''}>{key}<strong>{stats[key] ?? 10}{choices.asi?.[key] ? ` → ${(stats[key] ?? 10) + choices.asi[key]!}` : ''}</strong></span>)}</div>
          </> : <>
            <label className="level-up-field">Find a feat<input type="search" value={featQuery} onChange={e => setFeatQuery(e.target.value)} placeholder="Search eligible feats" /></label>
            <div className="level-up-feat-list">{plan.feats.filter(feat => `${feat.name} ${feat.description}`.toLowerCase().includes(featQuery.toLowerCase())).map(feat => <label key={feat.name} className={`level-up-check${choices.featName === feat.name ? ' selected' : ''}`}>
              <input type="radio" name="level-up-feat" checked={choices.featName === feat.name} onChange={() => change({ featName: feat.name, featAbility: undefined, asi: undefined, featureSelections: Object.fromEntries(Object.entries(choices.featureSelections ?? {}).filter(([key]) => key !== 'skilled')) })} />
              <span><strong>{feat.name}<small>{feat.category}</small></strong><small>{feat.description}</small>{feat.prerequisite && <small>Requires {feat.prerequisite}</small>}</span>
            </label>)}</div>
            {chosenFeat?.abilityChoices?.length && <label className="level-up-field">{chosenFeat.name}: ability increase<select value={choices.featAbility ?? ''} onChange={e => change({ featAbility: e.target.value as AbilityKey })}>
              <option value="">Choose an ability</option>{chosenFeat.abilityChoices.map(key => <option key={key} value={key}>{key} +{chosenFeat.abilityIncrease ?? 1}</option>)}</select></label>}
            {chosenFeat?.name === 'Skilled' && <fieldset className="level-up-selection"><legend>Skilled proficiencies <small>{choices.featureSelections?.skilled?.length ?? 0} / 3</small></legend>
              {SKILLS.filter(skill => !character.proficientSkills.includes(skill.name)).map(skill => {
                const selected = choices.featureSelections?.skilled ?? [];
                return <label className="level-up-check" key={skill.name}><input type="checkbox" checked={selected.includes(skill.name)} disabled={!selected.includes(skill.name) && selected.length >= 3} onChange={() => change({ featureSelections: { ...choices.featureSelections, skilled: selected.includes(skill.name) ? selected.filter(name => name !== skill.name) : [...selected, skill.name] } })} /><strong>{skill.name}</strong></label>;
              })}
            </fieldset>}
          </>}
        </section>}
        {step === 'spells' && <section aria-label="Choose level-up spells">
          <h3>Grow your spell collection</h3>
          <p className="level-up-note">These spells belong to <strong>{classLabel(plan.progression.classKey)} {plan.toClassLevel}</strong>. Available spell levels come from this class, even if your shared spell slots are higher.</p>
          <p>{spellsRequired > 0 && `${plan.spellChoices.spellSelectionRequired ? 'Add' : 'You may add up to'} ${spellsRequired} new spell${spellsRequired === 1 ? '' : 's'}. `}{cantripsRequired > 0 && `${plan.spellChoices.cantripSelectionRequired ? 'Add' : 'You may add up to'} ${cantripsRequired} new cantrip${cantripsRequired === 1 ? '' : 's'}. `}You can choose spells up to level {plan.progression.maxSpellLevel}.</p>
          {plan.progression.classKey === 'wizard' && <p className="level-up-note">New spells enter your spellbook. After leveling, open Spellbook to choose which spells you prepare.</p>}
          {plan.spellChoices.replacementLimit > 0 && oldSpells.length > 0 && <label className="level-up-field">Replace one existing spell (optional)<select value={replacements[0] ?? ''} onChange={e => change({ replaceSpellIds: e.target.value ? [e.target.value] : [], spellNames: [] })}>
            <option value="">Keep my existing spells</option>{oldSpells.map(spell => <option value={spell.id} key={spell.id}>{spell.name}</option>)}</select></label>}
          <div className="level-up-spell-counts"><span>Spells <strong>{spellsChosen.length} / {spellsRequired + replacements.length}</strong></span><span>Cantrips <strong>{cantripsChosen.length} / {cantripsRequired}</strong></span></div>
          {(spellsChosen.length > 0 || cantripsChosen.length > 0) && <div className="level-up-picked" aria-label="Selected spells">{[...cantripsChosen, ...spellsChosen].map(name => <button className="btn tiny" key={name} onClick={() => toggleSpell(name, cantripsChosen.includes(name))}>{name} ×</button>)}</div>}
          <label className="level-up-field">Find a spell<input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Name or school" /></label>
          <div className="level-up-spell-list">{plan.spells.filter(spell => `${spell.name} ${spell.school ?? ''}`.toLowerCase().includes(query.toLowerCase())).map(spell => {
            const cantrip = spell.level === 0;
            const selected = (cantrip ? cantripsChosen : spellsChosen).includes(spell.name);
            const count = cantrip ? cantripsChosen.length : spellsChosen.length;
            const limit = cantrip ? cantripsRequired : spellsRequired + replacements.length;
            const known = knownNames.has(normalize(spell.name));
            return <label key={spell.name} className={`level-up-check${selected ? ' selected' : ''}${known ? ' already-known' : ''}`}>
              <input type="checkbox" checked={selected} disabled={busy || known || (!selected && count >= limit)} onChange={() => toggleSpell(spell.name, cantrip)} />
              <span><strong>{spell.name}<small>{cantrip ? 'Cantrip' : `Level ${spell.level}`}{spell.school ? ` · ${spell.school}` : ''}{known ? ' · On your sheet' : ''}</small></strong><small>{spell.description}</small></span>
            </label>;
          })}</div>
        </section>}
        {step === 'summary' && <section aria-label="Level-up preview">
          <h3>Review level {plan.grant.toLevel}</h3>
          <p><strong>{classLabel(plan.progression.classKey)} {plan.fromClassLevel} → {plan.toClassLevel}</strong></p>
          {preview ? <>
            <div className="level-up-summary-numbers"><span>Max HP<strong>{preview.maxHpBefore} → {preview.maxHpAfter}</strong><small>+{preview.hpGain} HP</small></span><span>Proficiency<strong>+{preview.proficiencyBefore} → +{preview.proficiencyAfter}</strong></span></div>
            {choices.subclass && <p><strong>Subclass:</strong> {choices.subclass}</p>}
            {!!preview.statChanges.length && <ul>{preview.statChanges.map(change => <li key={change.ability}>{change.ability}: {change.before} → <strong>{change.after}</strong></li>)}</ul>}
            {!!choices.featName && <p><strong>Feat:</strong> {choices.featName}</p>}
            {!!preview.addedAbilities.length && <><h4>Added to your sheet</h4><ul>{preview.addedAbilities.map(name => <li key={name}>{name}</li>)}</ul></>}
            <CounterChanges label="Spell slots" before={character.spellSlots} after={preview.spellSlots} />
            <CounterChanges label="Resources" before={character.resources} after={preview.resources} />
            <p className="level-up-note">Current HP becomes {preview.curHpAfter}. Spent resources stay spent; leveling does not grant a rest.</p>
            {preview.warnings.map(warning => <p className="level-up-warning" key={warning}>{warning}</p>)}
          </> : <button className="btn" disabled={busy || !connected} onClick={review}>Refresh preview</button>}
        </section>}
        {step !== 'summary' && plan.warnings.map(warning => <p className="level-up-warning" key={warning}>{warning}</p>)}
      </>}
    </div>
    <footer className="level-up-footer">
      <span className="muted">{busy ? 'Checking with the server…' : 'Your sheet changes only when you apply.'}</span>
      <div>{plan && steps.indexOf(step) > 0 && <button className="btn" disabled={busy || rolling} onClick={() => { setError(''); setStep(steps[steps.indexOf(step) - 1]); }}>Back</button>}
        {!plan ? error && <button className="btn" disabled={busy || !connected} onClick={() => void loadPlan(choices.subclass, choices.className)}>Retry</button>
          : step === 'summary' ? <button className="btn level-up-primary" disabled={busy || !preview || !connected} onClick={apply}>{busy ? 'Applying…' : `Apply level ${plan.grant.toLevel}`}</button>
            : <button className="btn level-up-primary" disabled={busy || rolling || !connected} onClick={advance}>{steps[steps.indexOf(step) + 1] === 'summary' ? 'Preview level-up' : 'Next'}</button>}
      </div>
    </footer>
  </dialog>, document.body);
}

function ClassLevelsDialog({ character, onClose }: { character: Character; onClose: () => void }) {
  const configure = useStore(s => s.configureClassLevels);
  const connected = useStore(s => s.status === 'connected');
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [classes, setClasses] = useState<ClassRosterEntry[]>(resolveClassRoster(character) ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const total = classes.reduce((sum, entry) => sum + entry.level, 0);
  useEffect(() => { const element = dialog.current; element?.showModal(); return () => element?.close(); }, []);
  const changeEntry = (index: number, patch: Partial<ClassRosterEntry>) => setClasses(current => current.map((entry, i) => i === index ? { ...entry, ...patch } : entry));
  const save = async () => {
    setBusy(true); setError('');
    try {
      const result = await configure(character.id, classes);
      if (result.ok) onClose(); else setError(result.error);
    } catch { setError('Could not save class levels. Reconnect and try again.'); }
    finally { setBusy(false); }
  };
  return createPortal(<dialog ref={dialog} className="character-level-up-dialog fantasy-window" aria-labelledby={titleId} onCancel={event => { event.preventDefault(); event.stopPropagation(); if (!busy) onClose(); }}>
    <header className="level-up-header"><h2 id={titleId}>Class levels · {character.name}</h2><button className="btn tiny" disabled={busy} onClick={onClose} aria-label="Close class levels">Close</button></header>
    <div className="level-up-body">
      <p>Enter the character's existing class levels. They must add up to level {character.level}. The first class is the starting class. This records the split; it does not rebuild HP, equipment, or existing abilities.</p>
      {error && <p className="level-up-error" role="alert">{error}</p>}
      {classes.map((entry, index) => <fieldset className="level-up-class-row" key={index}><legend>{index === 0 ? 'Starting class' : `Additional class ${index}`}</legend>
        <label className="level-up-field">Class {index + 1}<select value={entry.className} disabled={busy} onChange={event => changeEntry(index, { className: event.target.value as ClassRosterEntry['className'], subclass: undefined })}>{CORE_CLASSES_2024.map(name => <option key={name} value={name} disabled={classes.some((other, i) => i !== index && other.className === name)}>{classLabel(name)}</option>)}</select></label>
        <label className="level-up-field">Class level {index + 1}<input type="number" min={1} max={20} value={entry.level} disabled={busy} onChange={event => changeEntry(index, { level: Number(event.target.value) })} /></label>
        {entry.level >= 3 && <label className="level-up-field">Subclass {index + 1}<select value={entry.subclass ?? ''} disabled={busy} onChange={event => changeEntry(index, { subclass: event.target.value || undefined })}><option value="">Choose later / custom subclass</option>{entry.subclass && !subclassChoices2024(entry.className).includes(entry.subclass) && <option value={entry.subclass}>{entry.subclass}</option>}{subclassChoices2024(entry.className).map(name => <option key={name} value={name}>{name}</option>)}</select></label>}
        <button className="btn tiny" disabled={busy} onClick={() => setClasses(current => current.filter((_, i) => i !== index))}>Remove class {index + 1}</button>
      </fieldset>)}
      {classes.length < CORE_CLASSES_2024.length && <button className="btn" disabled={busy} onClick={() => { const className = CORE_CLASSES_2024.find(name => !classes.some(entry => entry.className === name)); if (className) setClasses(current => [...current, { className, level: 1 }]); }}>Add class</button>}
      <p className={total === character.level ? 'level-up-note' : 'level-up-warning'} role="status">Total class levels: {total} / {character.level}</p>
    </div>
    <footer className="level-up-footer"><span className="muted">Existing sheet values remain in place.</span><button className="btn level-up-primary" disabled={busy || !connected || !classes.length || total !== character.level || classes.some(entry => !Number.isInteger(entry.level) || entry.level < 1 || entry.level > 20)} onClick={save}>{busy ? 'Saving…' : 'Save class levels'}</button></footer>
  </dialog>, document.body);
}

function CounterChanges({ label, before, after }: { label: string; before: Character['resources']; after: Character['resources'] }) {
  const changed = Object.entries(after).filter(([key, counter]) => counter.max !== before[key]?.max);
  if (!changed.length) return null;
  return <><h4>{label}</h4><ul>{changed.map(([key, counter]) => <li key={key}>{key}: {before[key]?.max ?? 0} → <strong>{counter.max}</strong>{counter.used > 0 && <span className="muted"> · {counter.used} spent</span>}</li>)}</ul></>;
}
