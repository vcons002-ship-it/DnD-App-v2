// Concise, original paraphrases of the 5e (2024) condition rules — for the
// instant, deterministic tooltips shown on condition chips. Framework-free so
// both client (tooltips) and server (rules lookups) can use it. NOT the same as
// conditionEffects.ts, which is the narrower subset the engine AUTO-APPLIES to
// attack/save rolls; this is the full human-readable description.

export const CONDITION_RULES: Record<string, string> = {
  blinded:
    "Can't see and automatically fails any check requiring sight. Attack rolls against it have advantage; its own attack rolls have disadvantage.",
  charmed:
    "Can't attack the charmer or target it with harmful effects. The charmer has advantage on social ability checks with it.",
  deafened: "Can't hear and automatically fails any check requiring hearing.",
  dead: 'The creature is dead.',
  frightened:
    'Disadvantage on ability checks and attack rolls while the source of fear is in line of sight, and it can’t willingly move closer to that source.',
  grappled:
    "Speed becomes 0 and can't benefit from bonuses to speed. Ends if the grappler is incapacitated or the two are pulled apart.",
  incapacitated: "Can't take actions, bonus actions, or reactions, and concentration breaks.",
  invisible:
    "Can't be seen without special senses (heavily obscured for targeting). Attacks against it have disadvantage; its attacks have advantage. Its position can still be guessed from noise or tracks.",
  paralyzed:
    'Incapacitated, can’t move or speak, and automatically fails Strength and Dexterity saves. Attacks against it have advantage, and any hit from within 5 ft is a critical hit.',
  petrified:
    'Turned to solid substance: incapacitated, unaware, can’t move or speak; auto-fails Strength and Dexterity saves; resistance to all damage; immune to poison and disease. Attacks against it have advantage.',
  poisoned: 'Disadvantage on attack rolls and ability checks.',
  prone:
    'Can only crawl unless it stands (costs half its speed). Disadvantage on its attack rolls. Attacks against it have advantage from within 5 ft, otherwise disadvantage.',
  restrained:
    'Speed 0. Disadvantage on attack rolls and Dexterity saves; attacks against it have advantage.',
  stunned:
    'Incapacitated, can’t move, speaks only falteringly, and auto-fails Strength and Dexterity saves. Attacks against it have advantage.',
  unconscious:
    'Incapacitated, can’t move or speak, unaware, drops what it holds and falls prone. Auto-fails Strength and Dexterity saves. Attacks have advantage, and any hit from within 5 ft is a critical hit.',
  exhaustion:
    'Tracked in levels (1–6). Each level gives −2 to all d20 tests (checks, attacks, saves) and −5 ft speed, cumulatively; 6 levels means death. A long rest removes one level.',
};

/** The rules text for a condition label (case-insensitive), or '' if unknown. */
export function conditionRule(label: string): string {
  return CONDITION_RULES[label.trim().toLowerCase()] ?? '';
}
