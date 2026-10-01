import type { SheetAbility, TokenKind } from '../../../shared/types';
import { effectiveRecharge, rechargeLabel } from '../../../shared/monsterAttacks';
import { useStore } from '../state/socket';

/**
 * Ready / Spent chip for a limited-use ability ("Recharge 5–6", "1/Day").
 * Recharge is resolved MANUALLY: using the ability marks it spent, and the DM
 * clicks the chip to ready it again after their own d6 (or a rest). Read-only
 * (`editable` false) it just shows the state. Renders nothing for an at-will
 * ability.
 */
export function RechargeChip({ ability, kind, refId, editable = true }: {
  ability: SheetAbility;
  kind: TokenKind;
  refId: string;
  editable?: boolean;
}) {
  const setRecharge = useStore((s) => s.setAbilityRecharge);
  const recharge = effectiveRecharge(ability);
  if (!recharge) return null;
  const spent = !!recharge.spent;
  const how = recharge.min
    ? `Recharges on a d6 roll of ${recharge.min === 6 ? '6' : `${recharge.min}–6`} — roll it yourself at the start of the creature's turn.`
    : `Recharges after a ${recharge.rest === 'short' ? 'Short or Long' : 'Long'} Rest.`;
  return (
    <button
      type="button"
      className={`recharge-chip${spent ? ' spent' : ''}`}
      data-spent={spent}
      disabled={!editable}
      aria-pressed={spent}
      aria-label={`${ability.name}: ${spent ? 'spent' : 'ready'}${editable ? ` — mark ${spent ? 'ready' : 'spent'}` : ''}`}
      title={`${spent ? 'Spent' : 'Ready'}. ${how}${editable ? ` Click to mark it ${spent ? 'ready' : 'spent'}.` : ''}`}
      onClick={() => setRecharge(kind, refId, ability.id, !spent)}
    >
      {rechargeLabel(recharge)} · {spent ? 'Spent' : 'Ready'}
    </button>
  );
}
