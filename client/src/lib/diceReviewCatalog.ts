import {diceThemeForClass,diceThemeForRoll} from '../../../shared/diceThemes';
import {CLASS_DICE_ART} from '../../../shared/classDiceArt';
export const diceReviewNames=['Druk','Varis','Vanec','DM',...Object.values(CLASS_DICE_ART).map(s=>s.name)];
export const diceReviewMaterials=['Molten obsidian & gold','Forest resin, wood & bronze | Woodland wake','Red glass, lightning & silver','Purple resin, flowing ink & gold',...Object.values(CLASS_DICE_ART).map(s=>s.material)];
export const diceReviewThemes=[diceThemeForClass('Fighter'),diceThemeForClass('Ranger'),diceThemeForClass('Sorcerer'),diceThemeForRoll('',true),...Object.keys(CLASS_DICE_ART).map(n=>diceThemeForClass(n))];
