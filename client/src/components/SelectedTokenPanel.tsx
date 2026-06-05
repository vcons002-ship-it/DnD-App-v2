import { useState } from 'react';
import type { Monster, StateSnapshot, Token } from '../../../shared/types';
import { resolveToken } from '../lib/entities';
import { useStore } from '../state/socket';
import { ConditionPicker } from './ConditionPicker';
import { StatBlock } from './StatBlock';

type Props = {
  snapshot: StateSnapshot;
  token: Token;
  /** All selected token ids, so icon changes can apply to the whole selection. */
  selectedIds?: string[];
};

/** Right-side detail panel for the currently selected token (DM + player). */
export function SelectedTokenPanel({ snapshot, token, selectedIds }: Props) {
  const applyDamage = useStore((s) => s.applyDamage);
  const resizeToken = useStore((s) => s.resizeToken);
  const deleteToken = useStore((s) => s.deleteToken);
  const duplicateToken = useStore((s) => s.duplicateToken);
  const updateMonster = useStore((s) => s.updateMonster);
  const aiFillCreature = useStore((s) => s.aiFillCreature);
  const updateCharacter = useStore((s) => s.updateCharacter);
  const aiFillCharacter = useStore((s) => s.aiFillCharacter);
  const aiBusy = useStore((s) => s.aiBusy);
  const setTokenHidden = useStore((s) => s.setTokenHidden);
  const setTokensCombatRole = useStore((s) => s.setTokensCombatRole);
  const setTokensHideCombatRole = useStore((s) => s.setTokensHideCombatRole);
  const setTokensIcon = useStore((s) => s.setTokensIcon);
  const [amount, setAmount] = useState(1);
  const [emoji, setEmoji] = useState('');
  const [iconBusy, setIconBusy] = useState(false);

  const d = resolveToken(snapshot, token);
  const canSeeHp = d.curHp !== undefined && d.maxHp !== undefined;
  const isDm = snapshot.role === 'dm';
  const mySocketId = useStore((s) => s.socket?.id);
  // Full stat block for the DM when a monster is selected.
  const monster =
    isDm && token.kind === 'monster'
      ? (snapshot.monsters.find((m) => m.id === token.refId) as Monster | undefined)
      : undefined;
  // The PC's character, editable by the DM or the owning player.
  const character =
    token.kind === 'pc'
      ? snapshot.characters.find((c) => c.id === token.refId)
      : undefined;
  const canEditCharacter =
    !!character && (isDm || character.claimedBy === mySocketId);
  const iconTargets =
    selectedIds && selectedIds.length ? selectedIds : [token.id];

  const uploadIcon = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIconBusy(true);
    try {
      const fd = new FormData();
      fd.append('image', file);
      const res = await fetch('/api/icons', { method: 'POST', body: fd });
      if (res.ok) setTokensIcon(iconTargets, (await res.json()).icon);
    } finally {
      setIconBusy(false);
      e.target.value = '';
    }
  };

  return (
    <div className="panel-section">
      <h3>{d.name}</h3>
      {canSeeHp ? (
        <div className="hp-line">
          HP: {d.curHp} / {d.maxHp}
        </div>
      ) : (
        <div className="hp-line muted">HP hidden</div>
      )}

      <div className="dmg-row">
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(Number(e.target.value))}
        />
        <button
          className="btn red"
          onClick={() => applyDamage(token.kind, token.refId, amount)}
        >
          Damage
        </button>
        <button
          className="btn green"
          onClick={() => applyDamage(token.kind, token.refId, -amount)}
        >
          Heal
        </button>
      </div>

      <div className="size-row">
        <span>Size</span>
        <button
          className="btn"
          disabled={!isDm}
          onClick={() => resizeToken(token.id, token.size - 0.5)}
        >
          −
        </button>
        <span>{token.size}</span>
        <button
          className="btn"
          disabled={!isDm}
          onClick={() => resizeToken(token.id, token.size + 0.5)}
        >
          +
        </button>
      </div>

      {monster && (
        <div className="disposition-row">
          <h4>Disposition</h4>
          <div className="disposition-btns">
            {(['friendly', 'neutral', 'enemy'] as const).map((d) => (
              <button
                key={d}
                className={`btn tiny disp-${d} ${
                  monster.disposition === d ? 'on' : ''
                }`}
                onClick={() =>
                  updateMonster({ monsterId: monster.id, disposition: d })
                }
                title={
                  d === 'friendly'
                    ? 'Players see full stats'
                    : d === 'neutral'
                    ? 'Players see name + HP + type/AC'
                    : 'Players see name + conditions only'
                }
              >
                {d[0].toUpperCase() + d.slice(1)}
              </button>
            ))}
          </div>
        </div>
      )}

      {monster && (
        <StatBlock
          creature={monster}
          subtitle={monster.creatureType}
          identity={[
            { key: 'creatureType', label: 'Type', value: monster.creatureType },
          ]}
          levelLabel="CR"
          aiBusy={aiBusy}
          onAiFill={() => aiFillCreature(monster.id)}
          onSave={(patch) => updateMonster({ monsterId: monster.id, ...patch })}
        />
      )}

      {canEditCharacter && character && (
        <StatBlock
          creature={character}
          subtitle={`${character.race} · ${character.className}`}
          identity={[
            { key: 'race', label: 'Race', value: character.race },
            { key: 'className', label: 'Class', value: character.className },
          ]}
          levelLabel="Level"
          aiBusy={aiBusy}
          onAiFill={() => aiFillCharacter(character.id)}
          onSave={(patch) =>
            updateCharacter({ characterId: character.id, ...patch })
          }
        />
      )}

      <h4>Conditions</h4>
      <ConditionPicker kind={token.kind} refId={token.refId} conditions={d.conditions} />

      {isDm && (
        <div className="dm-token-actions">
          <h4>Token icon</h4>
          <div className="icon-tools">
            <input
              className="emoji-input"
              maxLength={2}
              placeholder="🐉"
              value={emoji}
              onChange={(e) => setEmoji(e.target.value)}
            />
            <button
              className="btn tiny"
              disabled={!emoji}
              onClick={() => setTokensIcon(iconTargets, emoji)}
            >
              Set
            </button>
            <label className="btn tiny upload-icon">
              {iconBusy ? '…' : 'Upload'}
              <input type="file" accept="image/*" hidden onChange={uploadIcon} />
            </label>
            <button
              className="btn tiny"
              onClick={() => setTokensIcon(iconTargets, '')}
            >
              Clear
            </button>
          </div>
          {iconTargets.length > 1 && (
            <p className="hint">Applies to {iconTargets.length} selected tokens</p>
          )}

          <h4>Combat role</h4>
          <div className="disposition-btns">
            {([null, 'melee', 'ranged', 'caster'] as const).map((r) => {
              const active = (token.combatRoleOverride ?? null) === r;
              const label =
                r === null
                  ? 'Auto'
                  : r === 'melee'
                  ? '⚔️'
                  : r === 'ranged'
                  ? '🏹'
                  : '✨';
              return (
                <button
                  key={r ?? 'auto'}
                  className={`btn tiny ${active ? 'on' : ''}`}
                  title={r === null ? 'Derive from stats' : r}
                  onClick={() => setTokensCombatRole(iconTargets, r)}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <button
            className={`btn tiny ${token.hideCombatRole ? 'on' : ''}`}
            onClick={() =>
              setTokensHideCombatRole(iconTargets, !token.hideCombatRole)
            }
            title="Hide the role badge from everyone"
          >
            {token.hideCombatRole ? '🙈 Role badge hidden' : 'Hide role badge'}
          </button>

          <button
            className="btn"
            onClick={() => duplicateToken(token.id)}
            title="Drop an identical, independently-tracked copy of this token"
          >
            ⧉ Duplicate token
          </button>
          <button
            className={`btn ${token.isHidden ? 'on' : ''}`}
            onClick={() => setTokenHidden(token.id, !token.isHidden)}
            title="Hidden tokens are not shown to players"
          >
            {token.isHidden ? '🙈 Hidden from players' : 'Hide from players'}
          </button>
          <button
            className="btn red delete-token"
            onClick={() => deleteToken(token.id)}
          >
            Delete token
          </button>
        </div>
      )}
    </div>
  );
}
