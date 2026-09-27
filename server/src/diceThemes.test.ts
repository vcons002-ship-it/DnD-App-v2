import { describe, expect, it } from 'vitest';
import { diceThemeForClass, DICE_THEMES } from '../../shared/diceThemes.js';
describe('cosmetic class dice', () => {
  it('resolves every supported class and keeps custom classes neutral', () => {
    for (const key of Object.keys(DICE_THEMES)) expect(diceThemeForClass(key).id).toBe(key);
    expect(diceThemeForClass('Homebrew guardian').id).toBe('neutral');
    expect(diceThemeForClass().id).toBe('neutral');
  });
  it('uses the first listed class, tolerating case and level labels', () => {
    expect(diceThemeForClass('RANGER 5 / Rogue 2').id).toBe('ranger');
    expect(diceThemeForClass('Fighter (Battle Master)').id).toBe('fighter');
    expect(diceThemeForClass('sorcerer').motif).toBe('arcane');
  });
});
