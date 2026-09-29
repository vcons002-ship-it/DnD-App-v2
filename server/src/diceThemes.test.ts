import { describe, expect, it } from 'vitest';
import { diceThemeForClass, diceThemeForRoll, DICE_THEMES } from '../../shared/diceThemes.js';
describe('cosmetic class dice', () => {
  it('gives NPC rolls affinity palettes without overriding player class dice', () => {
    expect(diceThemeForRoll('Fighter', false, 'enemy')).toBe(DICE_THEMES.fighter);
    expect(diceThemeForRoll('', true, 'enemy').hue).toBe(0);
    expect(diceThemeForRoll('', true, 'friendly').hue).toBe(140);
    expect(diceThemeForRoll('', true, 'neutral').hue).toBe(49);
    expect(diceThemeForRoll('', true).id).toBe('dm-neutral-roll');
    // Store selectors must return a stable reference between snapshots.
    expect(diceThemeForRoll('',true,'enemy')).toBe(diceThemeForRoll('',true,'enemy'));
  });
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
