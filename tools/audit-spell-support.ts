import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { getAllSpells } from '../server/src/spells/srd.js';
import { spellCombatSupport } from '../shared/spellSupport.js';

// Static catalogue imports only: never opens the campaign database.
const entries = getAllSpells().filter(entry => entry.type === 'spell')
  .sort((a, b) => (a.level ?? 0) - (b.level ?? 0) || a.name.localeCompare(b.name))
  .map(entry => ({ entry, support: spellCombatSupport(entry)! }));
const count = (status: string) => entries.filter(({ support }) => support.status === status).length;
const cell = (text: string) => text.replace(/\|/g, '\\|').replace(/[\r\n]+/g, ' ');
const report = `# Spellbook combat support audit

Generated from the current catalogue and shared runtime capability registry. Run
\`npm run audit:spells\` to inspect it or \`npm run audit:spells -- --write\` to regenerate this file.
The command reads static spell data; it does not open a campaign save.

${entries.length} spells: **${count('ready')} Combat ready**, **${count('partial')} Partial**, **${count('manual')} Manual**.

- **Combat ready:** a reviewed core combat path (roll, target, HP and slot handling). Range, components, action economy, eligibility, and situational rules still need table adjudication.
- **Partial:** the app handles the listed part, but not the entire effect. A save result alone does not apply a condition. A summon token is not a fully configured summoned creature.
- **Manual:** record the cast and resolve the effect with the DM. Known incomplete or incompatible catalogue rolls are suppressed so they cannot apply misleading damage or healing.

Badges appear in the Spellbook browse view, add-spell search, and saved spell headers.
Expand an entry for **App handles** and **You handle** details. Use the support filter
in the browse view to find flagged spells. Targeted rolls are performed from Combat
or the right-click target menu, not from a targetless character panel.

No saved sheet is rewritten or automatically converted between rules editions.
Explicit custom entries and authored roll opt-outs retain their configured rolls,
with an unreviewed Partial flag. The catalogue contains older/incomplete descriptions
and formulas despite its 2024 label; the Manual rows below identify known unsafe
execution paths. This audit does not certify every description as 2024-correct.
Rules checked against [official 2024 Free Rules spell descriptions](https://www.dndbeyond.com/sources/dnd/br-2024/spell-descriptions).

| Level | Spell | Support | App handles | You handle / limitation |
|---|---|---|---|---|
${entries.map(({ entry, support }) => `| ${entry.level ?? 0} | ${cell(entry.name)} | ${support.label} | ${cell(support.automated.join(' '))} | ${cell(support.manual.join(' ') || 'Situational rules and target eligibility.')} |`).join('\n')}
`;
if (process.argv.includes('--write')) {
  const path = fileURLToPath(new URL('../docs/SPELLBOOK_COMBAT_SUPPORT.md', import.meta.url));
  writeFileSync(path, report, 'utf8');
  console.log(`Wrote ${path}: ${entries.length} spells; ${count('ready')} ready, ${count('partial')} partial, ${count('manual')} manual.`);
} else {
  console.log(report);
}
