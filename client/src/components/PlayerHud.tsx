import { useEffect, useRef, useState } from 'react';
import type { Character, StateSnapshot } from '../../../shared/types';
import { useStore } from '../state/socket';
import { LiquidOrb } from './LiquidOrb';
import { TemporaryHpShield } from './TemporaryHpShield';
import { ArmorClassBadge } from './ArmorClassBadge';
import { JeweledResources } from './JeweledResources';
import { ResourceBranchArt, type GuardianArt } from './ResourceBranchArt';
import { PlayerResourceRowEditor } from './PlayerResourceRowEditor';
import { CharacterSheet } from './CharacterSheet';
import { CharacterItems } from './CharacterItems';
import { CharacterSpells } from './CharacterSpells';
import { CharacterChecks } from './CharacterChecks';
import { ActionsTraitsView } from './StatBlock';
import { effectiveAc } from '../../../shared/modifiers';
import { resourceSigilPresentation } from '../../../shared/resourceSigils';
import { PlayerConditionControl } from './PlayerConditionControl';
import { DamageHealControls } from './DamageHealControls';
import { DeathSaves } from './DeathSaves';
import { HudIcon } from './HudIcon';
import type { ResourceLayout } from '../lib/usePlayerLayout';
import './orb-identity.css';

type WindowTab =
  | 'Character'
  | 'Inventory'
  | 'Spellbook'
  | 'Checks & saves'
  | 'Party';
export function orbArt(character: Character): GuardianArt | null {
  const race = character.race.toLowerCase().replace(/[\s-]/g, '');
  const cls = character.className.trim().toLowerCase();
  if (race === 'halforc' && cls === 'fighter') return 'half-orc-fighter';
  if (race === 'tiefling' && cls === 'sorcerer') return 'tiefling-sorcerer';
  if (race === 'halfelf' && cls === 'ranger') return 'half-elf-ranger';
  return null;
}

function CharacterWindow({
  character,
  overflowCustomResources,
  onCustomResourceVisibilityChange,
  snapshot,
  tab,
  setTab,
  onClose,
  onRelease,
}: {
  character: Character;
  overflowCustomResources: readonly string[];
  onCustomResourceVisibilityChange: (name: string, show: boolean) => void;
  snapshot: StateSnapshot;
  tab: WindowTab;
  setTab: (tab: WindowTab) => void;
  onClose: () => void;
  onRelease: () => void;
}) {
  const updateCharacter = useStore((s) => s.updateCharacter);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = dialog.current;
    el?.showModal();
    return () => el?.close();
  }, []);
  return (
    <dialog
      className="character-window fantasy-window"
      ref={dialog}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === dialog.current) onClose();
      }}
    >
      <div className="character-window-head">
        <div>
          <small>CHARACTER RECORD</small>
          <h2>{character.name}</h2>
          <p>
            {character.race} · {character.subclass} {character.className} ·
            Level {character.level}
          </p>
        </div>
        <button
          className="btn"
          onClick={onClose}
          aria-label="Close character window"
        >
          Close ✕
        </button>
      </div>
      <nav className="character-tabs" aria-label="Character sections">
        {(
          [
            'Character',
            'Inventory',
            'Spellbook',
            'Checks & saves',
            'Party',
          ] as WindowTab[]
        ).map((t) => (
          <button
            className={`btn${tab === t ? ' on' : ''}`}
            aria-current={tab === t ? 'page' : undefined}
            key={t}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </nav>
      <div
        className={`character-window-content tab-${tab.split(' ')[0].toLowerCase()}`}
      >
        {tab === 'Character' && (
          <CharacterSheet character={character} editable abilitiesElsewhere
            resourceManagementControl={<PlayerResourceRowEditor character={character} />}
            resourceDisplayControl={(name) => resourceSigilPresentation('resources', name).kind !== 'custom' ? null : (
              <label className="custom-resource-preference" title="Checked: show beside the orb when space permits. Unchecked: keep this tracker in Additional resources.">
                <input type="checkbox" checked={!overflowCustomResources.includes(name)}
                  aria-label={`Show ${name} beside the health orb`}
                  onChange={(event) => onCustomResourceVisibilityChange(name, event.target.checked)} />
                Show by orb
              </label>
            )}
          />
        )}
        {tab === 'Inventory' && (
          <>
            <h3>Inventory & equipment</h3>
            <p className="muted">
              Your existing items, quantities, equipped effects and consumables.
              Weapon editing remains on the Character page.
            </p>
            <CharacterItems character={character} editable />
          </>
        )}
        {tab === 'Spellbook' && (
          <>
            <h3>Spells & abilities</h3>
            <p className="muted">
              Manage and read abilities here. The combat panel retains every
              spell, mastery, maneuver and roll control. Saved spell text may
              use 2014, 2024 or custom rules; check each description. No saved
              entries are converted.
            </p>
            <CharacterSpells character={character} editable rollsElsewhere />
            <ActionsTraitsView
              actions={character.actions}
              abilities={character.abilities}
              editable
              showTraits={false}
              heading="Custom actions"
              onSave={(patch) =>
                updateCharacter({ characterId: character.id, ...patch })
              }
            />
          </>
        )}
        {tab === 'Checks & saves' && (
          <>
            <h3>Checks & saving throws</h3>
            <CharacterChecks character={character} onRolled={onClose} />
          </>
        )}
        {tab === 'Party' && (
          <>
            <button className="btn" onClick={onRelease}>
              Change my character
            </button>
            {snapshot.characters
              .filter((c) => c.id !== character.id)
              .map((c) => (
                <details key={c.id}>
                  <summary>
                    {c.name} · {c.race} {c.className} · {c.curHp}/{c.maxHp} HP
                  </summary>
                  <CharacterSheet character={c} editable={false} />
                </details>
              ))}
          </>
        )}
      </div>
      <footer>
        Saved campaign values remain authoritative · 2024 slot reference · no
        automatic conversion
      </footer>
    </dialog>
  );
}

export function PlayerHud({
  character,
  resourceLayout,
  snapshot,
  placing,
  isPlaced,
  onPlace,
  onRelease,
}: {
  character: Character;
  resourceLayout: ResourceLayout;
  snapshot: StateSnapshot;
  placing: boolean;
  isPlaced: boolean;
  onPlace: () => void;
  onRelease: () => void;
}) {
  const applyDamage = useStore((s) => s.applyDamage);
  const setTempHp = useStore((s) => s.setTempHp);
  const [windowTab, setWindowTab] = useState<WindowTab | null>(null);
  const [vitals, setVitals] = useState(false);
  const [checks, setChecks] = useState(false);
  const [resourceRingCount, setResourceRingCount] = useState(0);
  // PlayerView keys this HUD by character id. This local display preference
  // follows that character on this browser, without writing campaign data.
  const resourceDisplayKey = `dnd:player-custom-resource-overflow:v1:${character.id}`;
  const [overflowCustomResources, setOverflowCustomResources] = useState<string[]>(() => {
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(resourceDisplayKey) ?? '[]');
      return Array.isArray(saved) ? saved.filter((name): name is string => typeof name === 'string') : [];
    } catch { return []; }
  });
  useEffect(() => {
    try { localStorage.setItem(resourceDisplayKey, JSON.stringify(overflowCustomResources)); }
    catch { /* The current page still works when browser storage is unavailable. */ }
  }, [resourceDisplayKey, overflowCustomResources]);
  const setCustomResourceVisibility = (name: string, show: boolean) => setOverflowCustomResources((current) =>
    show ? current.filter((key) => key !== name) : current.includes(name) ? current : [...current, name]);
  useEffect(() => {
    const closeDrawer = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setVitals(false); setChecks(false); }
    };
    window.addEventListener('keydown', closeDrawer);
    return () => window.removeEventListener('keydown', closeDrawer);
  }, []);
  const art = orbArt(character);
  return (
    <div className="player-hud" data-testid="player-hud" data-orb-art={art ?? 'generic-orb'}>
      <nav className="hud-actions" aria-label="Player action bar">
        <button className="btn hud-icon-button" aria-label="Character" onClick={() => setWindowTab('Character')}>
          <HudIcon name="character" />
          <span className="hud-tooltip"><strong>Character</strong><small>Stats, equipment & character details</small></span>
        </button>
        <button className="btn hud-icon-button" aria-label="Inventory" onClick={() => setWindowTab('Inventory')}>
          <HudIcon name="inventory" />
          <span className="hud-tooltip"><strong>Inventory</strong><small>Items, equipment & consumables</small></span>
        </button>
        <button className="btn hud-icon-button" aria-label="Spellbook" onClick={() => setWindowTab('Spellbook')}>
          <HudIcon name="spellbook" />
          <span className="hud-tooltip"><strong>Spellbook</strong><small>Read & manage spells and abilities</small></span>
        </button>
        <button
          className={`btn hud-icon-button${checks ? ' on' : ''}`}
          aria-label="Checks"
          aria-expanded={checks}
          onClick={() => {
            setChecks((v) => !v);
            setVitals(false);
          }}
        >
          <HudIcon name="checks" />
          <span className="hud-tooltip"><strong>Checks & saves</strong><small>Quick skill checks and saving throws</small></span>
        </button>
        <button className="btn hud-icon-button" aria-label="Party" onClick={() => setWindowTab('Party')}>
          <HudIcon name="party" />
          <span className="hud-tooltip"><strong>Party</strong><small>Party records & change character</small></span>
        </button>
      </nav>
      <div className="hud-bottom">
        <div className="hud-orb-cluster">
          <div className="hud-identity-line">
            <button className="hud-identity" aria-label={`Open ${character.name}'s character record`} onClick={() => setWindowTab('Character')}>
              <strong title={character.name}>{character.name}</strong>
              <small>{character.className} <span aria-label={`Level ${character.level}`}>· Level {character.level}</span></small>
            </button>
          </div>
        <button
          className={`health-reliquary ${art ?? 'generic-orb'}`}
          aria-label={`Health ${character.curHp} of ${character.maxHp}.${character.tempHp > 0 ? ` ${character.tempHp} temporary HP.` : ''} Open health controls.`}
          aria-expanded={vitals}
          onClick={() => {
            setVitals((v) => !v);
            setChecks(false);
          }}
        >
          <span className="main-orb">
            <LiquidOrb
              key={`health-${character.id}`}
              amount={character.curHp}
              maxAmount={character.maxHp}
              fraction={
                character.maxHp > 0 ? character.curHp / character.maxHp : 0
              }
            />
            <TemporaryHpShield key={`ward-${character.id}`} amount={character.tempHp} />
          </span>
          {art && (
            <img
              className="orb-holder"
              src={`/art/hud/${art}-${art === 'half-orc-fighter' ? 'v9' : art === 'half-elf-ranger' ? 'v7' : 'v6'}.png`}
              alt=""
              draggable={false}
            />
          )}
          <span className="orb-readout">
            <strong>{character.curHp}</strong>
            <span> / {character.maxHp}</span>
            {character.tempHp > 0 && (
              <span className="orb-temp-bonus" title="Temporary hit points" aria-hidden="true">+{character.tempHp}</span>
            )}
            <small>HIT POINTS</small>
          </span>
        </button>
            <ArmorClassBadge value={effectiveAc(character) || character.armorClass} />
        </div>
        <div className="hud-attached-panel hud-resource-wing">
          <ResourceBranchArt guardian={art} extended={resourceLayout === 'concentric' && resourceRingCount > 5} />
          <JeweledResources character={character} layout={resourceLayout} overflowCustomResources={overflowCustomResources} onRingCountChange={setResourceRingCount} />
          <div className="hud-status-strip">
            <PlayerConditionControl character={character} />
            {!isPlaced && (
              <button onClick={onPlace}>
                {placing ? 'Click map…' : 'Place token'}
              </button>
            )}
          </div>
        </div>
      </div>
      {character.curHp <= 0 && (
        <div className="hud-death fantasy-window">
          <DeathSaves character={character} editable />
        </div>
      )}
      {vitals && (
        <section
          className="hud-drawer fantasy-window"
          aria-label="Health controls"
        >
          <div className="hud-heading">
            <h3>Health & temporary HP</h3>
            <button className="btn tiny" onClick={() => setVitals(false)}>
              Close
            </button>
          </div>
          <p>
            {character.curHp} / {character.maxHp} HP · {character.tempHp}{' '}
            temporary HP
          </p>
          <DamageHealControls
            onApply={(n) => applyDamage('pc', character.id, n)}
            onTemp={(n) => setTempHp('pc', character.id, n)}
          />
          <button
            className="btn tiny"
            onClick={() => setWindowTab('Character')}
          >
            Edit maximum HP / full sheet
          </button>
        </section>
      )}
      {checks && (
        <section
          className="hud-drawer fantasy-window hud-checks-drawer"
          aria-label="Quick skill checks"
        >
          <div className="hud-heading">
            <h3>Checks & saves</h3>
            <button className="btn tiny" onClick={() => setChecks(false)}>
              Close
            </button>
          </div>
          <CharacterChecks character={character} compact />
        </section>
      )}
      {windowTab && (
        <CharacterWindow
          character={character}
          overflowCustomResources={overflowCustomResources}
          onCustomResourceVisibilityChange={setCustomResourceVisibility}
          snapshot={snapshot}
          tab={windowTab}
          setTab={setWindowTab}
          onClose={() => setWindowTab(null)}
          onRelease={() => {
            setWindowTab(null);
            onRelease();
          }}
        />
      )}
    </div>
  );
}
