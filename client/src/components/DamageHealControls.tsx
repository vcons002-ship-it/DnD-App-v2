import { useState } from 'react';

/**
 * Shared damage/heal control: an amount input + Damage/Heal buttons. `onApply`
 * receives a positive (damage) or negative (heal) delta. When `onTemp` is given
 * a third button grants temporary HP, setting the buffer to the entered amount.
 * `compact` renders the floating-menu style (tiny −HP/+HP buttons); otherwise
 * the full panel style.
 */
export function DamageHealControls({
  onApply,
  onTemp,
  compact,
  initial = 1,
}: {
  onApply: (delta: number) => void;
  onTemp?: (amount: number) => void;
  compact?: boolean;
  initial?: number;
}) {
  const [amount, setAmount] = useState(initial);
  const tiny = compact ? 'tiny ' : '';
  return (
    <div className={compact ? 'fm-dmg' : 'dmg-row'}>
      <input
        type="number"
        value={amount}
        onChange={(e) => setAmount(Number(e.target.value))}
      />
      <button className={`btn ${tiny}red`} onClick={() => onApply(amount)}>
        {compact ? '−HP' : 'Damage'}
      </button>
      <button className={`btn ${tiny}green`} onClick={() => onApply(-amount)}>
        {compact ? '+HP' : 'Heal'}
      </button>
      {onTemp && (
        <button
          className={`btn ${tiny}cyan`}
          title="Grant temporary HP (sets the buffer pool, drained before real HP)"
          onClick={() => onTemp(Math.max(0, amount))}
        >
          {compact ? 'Temp' : 'Temp HP'}
        </button>
      )}
    </div>
  );
}
