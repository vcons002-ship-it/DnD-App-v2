import { useState } from 'react';
import type { StateSnapshot } from '../../../shared/types';
import { useStore } from '../state/socket';

/** A few common summons/companions as one-tap presets (name + emoji icon). */
const PRESETS: { name: string; icon: string }[] = [
  { name: 'Mage Hand', icon: '✋' },
  { name: 'Familiar', icon: '🦉' },
  { name: 'Spiritual Weapon', icon: '⚔️' },
  { name: 'Summoned Beast', icon: '🐺' },
];

/**
 * Spawn a lightweight friendly summon/companion (Mage Hand, a familiar, a
 * conjured beast…). Available to the DM AND players: it drops a friendly creature
 * token the owner can drag around (the existing token:move gate already lets
 * players move friendly creatures). Placed near the top-left of the active map
 * with a little jitter so repeats don't stack; the player then drags it.
 */
export function SummonControls({ snapshot }: { snapshot: StateSnapshot }) {
  const summonCreate = useStore((s) => s.summonCreate);
  const notify = useStore((s) => s.notify);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('✋');

  const map = snapshot.map;

  const spawn = (n: string, i: string) => {
    if (!map) {
      notify('No active map to summon onto.');
      return;
    }
    const g = map.gridSizePx || 50;
    // Drop near the top-left with a small random offset so several summons don't
    // land exactly on top of each other.
    const x = g * 2 + Math.random() * g * 2;
    const y = g * 2 + Math.random() * g * 2;
    summonCreate({ mapId: map.id, x, y, name: n.trim() || 'Summon', icon: i });
    notify(`Summoned ${n.trim() || 'a creature'} — drag it into place.`);
  };

  return (
    <div className="summon-controls">
      <button className="btn tiny" onClick={() => setOpen((v) => !v)} title="Spawn a friendly companion/summon token you can drag around">
        {open ? 'Close' : '✋ Summon'}
      </button>
      {open && (
        <div className="summon-panel">
          <div className="summon-presets">
            {PRESETS.map((p) => (
              <button
                key={p.name}
                className="btn tiny"
                onClick={() => spawn(p.name, p.icon)}
                title={`Summon ${p.name}`}
              >
                {p.icon} {p.name}
              </button>
            ))}
          </div>
          <div className="dice-row summon-custom">
            <input
              className="summon-icon"
              value={icon}
              maxLength={2}
              title="Icon (emoji)"
              onChange={(e) => setIcon(e.target.value)}
            />
            <input
              placeholder="Custom summon name…"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && name.trim() && spawn(name, icon || '✋')}
            />
            <button
              className="btn tiny"
              disabled={!name.trim()}
              onClick={() => spawn(name, icon || '✋')}
            >
              Summon
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
