/** Approximate 2024 species descriptions are suggestions, not hard limits.
 * SRD 5.2, Character Origins; Aasimar uses the generic editable default. */
export const SPECIES_HEIGHTS:Record<string,{inches:number;hint:string}>={
  Human:{inches:68,hint:'Medium: about 4–7 ft; Small: about 2–4 ft'},
  Elf:{inches:66,hint:'About 5–6 ft'},Dwarf:{inches:54,hint:'About 4–5 ft'},
  Gnome:{inches:42,hint:'About 3–4 ft'},Halfling:{inches:30,hint:'About 2–3 ft'},
  Goliath:{inches:90,hint:'About 7–8 ft'},Orc:{inches:78,hint:'About 6–7 ft'},
  Dragonborn:{inches:72,hint:'About 5–7 ft'},Tiefling:{inches:68,hint:'Medium: about 4–7 ft; Small: about 3–4 ft'},
};
export const validCharacterHeight=(value:unknown):value is number=>typeof value==='number'&&Number.isInteger(value)&&value>=6&&value<=240;
export function suggestedCharacterHeight(species:string):number{return SPECIES_HEIGHTS[species]?.inches??68;}
export function formatCharacterHeight(inches:number):string{return `${Math.floor(inches/12)} ft ${inches%12} in`;}
