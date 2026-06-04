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
  const setTokenHidden = useStore((s) => s.setTokenHidden);
  const setTokensIcon = useStore((s) => s.setTokensIcon);
  const [amount, setAmount] = useState(1);
  const [emoji, setEmoji] = useState('');
  const [iconBusy, setIconBusy] = useState(false);

  const d = resolveToken(snapshot, token);
  const canSeeHp = d.curHp !== undefined && d.maxHp !== undefined;
  const isDm = snapshot.role === 'dm';
  // Full stat block for the DM when a monster is selected.
  const monster =
    isDm && token.kind === 'monster'
      ? (snapshot.monsters.find((m) => m.id === token.refId) as Monster | undefined)
      : undefined;
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

      {monster && <StatBlock monster={monster} />}

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
