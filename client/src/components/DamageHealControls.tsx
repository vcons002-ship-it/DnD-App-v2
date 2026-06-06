import { useState } from 'react';

/**
 * Shared damage/heal control: an amount input + Damage/Heal buttons. `onApply`
 * receives a positive (damage) or negative (heal) delta. `compact` renders the
 * floating-menu style (tiny −HP/+HP buttons); otherwise the full panel style.
 */
export function DamageHealControls({
  onApply,
  compact,
  initial = 1,
}: {
  onApply: (delta: number) => void;
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
    </div>
  );
}
