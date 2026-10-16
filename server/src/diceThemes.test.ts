import { describe, expect, it } from 'vitest';
import { diceThemeForClass, diceThemeForRoll, DICE_THEMES, GOLD_DICE_THEME, diceArtForSaveOwner } from '../../shared/diceThemes.js';
describe('cosmetic class dice', () => {
  it('uses one explicit gold appearance for creation without changing normal class or DM dice',()=>{
    for(const name of ['Fighter','Paladin','Wizard',''])for(const dm of [false,true])expect(diceThemeForRoll(name,dm,undefined,'gold')).toBe(GOLD_DICE_THEME);
    expect(diceThemeForRoll('Paladin')).toBe(DICE_THEMES.paladin);
  });
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

it('chooses save art by the saving character controller, never the caster',()=>{
 for(const className of ['Fighter','Ranger','Sorcerer','Cleric','Paladin','Wizard']){
  const character={className,claimedBy:'owner'};
  expect(diceArtForSaveOwner('pc',character,'player')).toEqual({className,dmDice:false});
  expect(diceArtForSaveOwner('pc',character,'dm')).toEqual({className:'',dmDice:true});
  expect(diceArtForSaveOwner('pc',character,undefined)).toEqual({className:'',dmDice:true});
  expect(diceArtForSaveOwner('pc',{...character,claimedBy:null},'player')).toEqual({className:'',dmDice:true});
  expect(diceArtForSaveOwner('monster',character,'player')).toEqual({className:'',dmDice:true});
 }
});
