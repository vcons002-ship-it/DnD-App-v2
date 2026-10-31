import { useCallback, useEffect, useState } from 'react';
import { getPlayerId } from '../state/socket';
import { safeSetItem } from '../lib/storage';
import { useEnvironmentQuality } from '../lib/useEnvironmentQuality';

const TOKEN_APPEARANCE_EVENT = 'dnd:token-appearance';

function readPlayer3d(tokenKey: string): boolean {
  try {
    return localStorage.getItem(tokenKey) !== '2d';
  } catch {
    return true;
  }
}

function readMonster3d(monsterKey: string, tokenKey: string): boolean {
  try {
    return (localStorage.getItem(monsterKey) ?? localStorage.getItem(tokenKey)) !== '2d';
  } catch {
    return true;
  }
}

export function useTokenAppearance() {
  const { budget } = useEnvironmentQuality();
  const legacy = budget.legacy;
  const playerId = getPlayerId();
  const tokenPreferenceKey = `dnd.tokenView:${playerId}`;
  const monsterPreferenceKey = `dnd.monsterTokenView:${playerId}`;

  const [preferred3dTokens, setPreferred3dTokens] = useState(() => readPlayer3d(tokenPreferenceKey));
  const [preferred3dMonsters, setPreferred3dMonsters] = useState(() => readMonster3d(monsterPreferenceKey, tokenPreferenceKey));

  useEffect(() => {
    const sync = () => {
      setPreferred3dTokens(readPlayer3d(tokenPreferenceKey));
      setPreferred3dMonsters(readMonster3d(monsterPreferenceKey, tokenPreferenceKey));
    };
    window.addEventListener(TOKEN_APPEARANCE_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(TOKEN_APPEARANCE_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, [tokenPreferenceKey, monsterPreferenceKey]);

  const use3dTokens = !legacy && preferred3dTokens;
  const use3dMonsters = !legacy && preferred3dMonsters;

  const setUse3dTokens = useCallback((enabled: boolean) => {
    // Freeze the inherited monster setting before changing the legacy PC key.
    safeSetItem(monsterPreferenceKey, readMonster3d(monsterPreferenceKey, tokenPreferenceKey) ? '3d' : '2d');
    safeSetItem(tokenPreferenceKey, enabled ? '3d' : '2d');
    setPreferred3dTokens(enabled);
    window.dispatchEvent(new Event(TOKEN_APPEARANCE_EVENT));
  }, [monsterPreferenceKey, tokenPreferenceKey]);

  const setUse3dMonsters = useCallback((enabled: boolean) => {
    safeSetItem(monsterPreferenceKey, enabled ? '3d' : '2d');
    setPreferred3dMonsters(enabled);
    window.dispatchEvent(new Event(TOKEN_APPEARANCE_EVENT));
  }, [monsterPreferenceKey]);

  return {
    legacy,
    use3dTokens,
    use3dMonsters,
    setUse3dTokens,
    setUse3dMonsters,
  };
}

export function TokenAppearanceControl({ onChanged }: { onChanged?: () => void } = {}) {
  const { legacy, use3dTokens, use3dMonsters, setUse3dTokens, setUse3dMonsters } = useTokenAppearance();
  return (
    <div className="token-appearance-settings">
      {([
        { label: 'Players', kind: 'player', enabled: use3dTokens, set: setUse3dTokens },
        { label: 'Monsters', kind: 'monster', enabled: use3dMonsters, set: setUse3dMonsters },
      ] as const).map((group) => (
        <div
          key={group.kind}
          className="battlefield-view-options token-appearance-options"
          role="group"
          aria-label={`${group.label} token appearance`}
        >
          <span className="muted">{group.label}</span>
          {[false, true].map((enabled) => (
            <button
              type="button"
              disabled={legacy && enabled}
              key={String(enabled)}
              className={`btn tiny ${group.enabled === enabled ? 'on' : ''}`}
              aria-label={`${enabled ? '3D' : '2D'} ${group.kind} tokens`}
              aria-pressed={group.enabled === enabled}
              title={
                group.kind === 'monster'
                  ? 'Changes monsters, chests and traps in your view'
                  : 'Only changes player tokens in your view'
              }
              onClick={() => {
                if (group.enabled === enabled) return;
                group.set(enabled);
                onChanged?.();
              }}
            >
              {enabled ? '3D' : '2D'}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
