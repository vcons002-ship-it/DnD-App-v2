import { describe, expect, it } from 'vitest';
import { diceThemeForClass, diceThemeForRoll, DICE_THEMES } from '../../shared/diceThemes.js';
describe('cosmetic class dice', () => {
  it('uses the same purple material for every DM/NPC roll without overriding player class dice', () => {
    expect(diceThemeForRoll('Fighter', false, 'enemy')).toBe(DICE_THEMES.fighter);
    for(const affinity of ['enemy','friendly','neutral','red','blue',undefined]) {
      expect(diceThemeForRoll('Sorcerer',true,affinity)).toBe(diceThemeForRoll('',true));
      expect(diceThemeForRoll('',true,affinity).hue).toBe(265);
    }
    expect(diceThemeForRoll('', true).id).toBe('dm-neutral-roll');
    expect(diceThemeForRoll('', true).ink).toBe('#eac36b');
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
