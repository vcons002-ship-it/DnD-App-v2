import { spellCombatSupport } from '../../../shared/spellSupport';
import './spell-combat-support.css';

type Spell = Parameters<typeof spellCombatSupport>[0];

/** Describe the actions the app can execute without promising every spell rule. */
export function SpellCombatSupportBadge({ ability }: { ability: Spell }) {
  const support = spellCombatSupport(ability);
  if (!support) return null;
  const detail = [
    support.automated.length ? `App handles: ${support.automated.join('; ')}` : '',
    support.manual.length ? `You handle: ${support.manual.join('; ')}` : '',
  ].filter(Boolean).join('\n');
  return <span className={`spell-support-badge spell-support-${support.status}`}
    data-spell-support={support.status} title={detail}>
    {support.label}
  </span>;
}

export function SpellCombatSupportDetails({ ability }: { ability: Spell }) {
  const support = spellCombatSupport(ability);
  if (!support) return null;
  return <div className="spell-support-details" aria-label={`${ability.name} combat support`}>
    <p><strong>App handles:</strong> {support.automated.join('; ') || 'No automatic combat action.'}</p>
    {support.manual.length > 0 && <p><strong>You handle:</strong> {support.manual.join('; ')}</p>}
  </div>;
}
