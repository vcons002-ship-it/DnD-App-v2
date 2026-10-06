/** Cosmetic palettes: never used by roll resolution. Multiclass uses the first listed class. */
export type DiceTheme = { id: string; hue: number; saturation: number; metal: string; ink: string; motif: 'steel' | 'leaf' | 'arcane' | 'sun' | 'scale' };
const theme = (id: string, hue: number, saturation: number, metal: string, motif: DiceTheme['motif']): DiceTheme => ({id,hue,saturation,metal,motif,ink:'#fff4dc'});
export const DICE_THEMES: Record<string, DiceTheme> = {
  fighter: theme('fighter',210,16,'#b9c9d4','steel'),
  ranger: theme('ranger',145,42,'#c9ab70','leaf'),
  sorcerer: theme('sorcerer',350,58,'#e6ad88','arcane'),
  barbarian: theme('barbarian',15,45,'#d19b73','scale'),
  bard: theme('bard',290,43,'#e7c681','arcane'),
  cleric: theme('cleric',200,27,'#f2d18b','sun'),
  druid: theme('druid',95,38,'#c4aa73','leaf'),
  monk: theme('monk',175,40,'#d5be84','sun'),
  paladin: theme('paladin',225,48,'#efcc78','sun'),
  rogue: theme('rogue',260,22,'#b1accc','steel'),
  warlock: theme('warlock',275,55,'#c0a0dd','arcane'),
  wizard: theme('wizard',225,62,'#b8caed','arcane'),
  artificer: theme('artificer',30,35,'#e0b779','steel'),
  neutral: theme('neutral',228,27,'#d4bb87','steel'),
};
export function diceThemeForClass(className = ''): DiceTheme {
  const match = className.toLowerCase().match(/\b(fighter|ranger|sorcerer|barbarian|bard|cleric|druid|monk|paladin|rogue|warlock|wizard|artificer)\b/);
  return DICE_THEMES[match?.[1] ?? 'neutral'];
}

const DM_DICE_THEME: DiceTheme = {...theme('dm-neutral-roll',265,65,'#c0c7d1','scale'),ink:'#edf0f5'};
// Affinity remains accepted for older recorded frames; all DM/NPC rolls now
// share one purple material rather than switching colors by disposition.
export function diceThemeForRoll(className = '', dmDice = false, _affinity?: string): DiceTheme {
  if (!dmDice) return diceThemeForClass(className);
  return DM_DICE_THEME;
}
