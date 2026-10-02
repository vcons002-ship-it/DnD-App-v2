import type { AbilityKey } from './skills.js';
import type { ClassProgression } from './characterProgression.js';
import type { Character } from './types.js';
import type { ClassRosterEntry } from './multiclass.js';
import type { CoreClass } from './characterProgression.js';
export type { ClassRosterEntry } from './multiclass.js';

export type LevelUpChoices = {
  /** Which class gains this level; omitted by older single-class clients. */
  className?: CoreClass;
  hpMethod: 'fixed' | 'roll';
  subclass?: string;
  asi?: Partial<Record<AbilityKey, number>>;
  featName?: string;
  featAbility?: AbilityKey;
  spellNames?: string[];
  cantripNames?: string[];
  replaceSpellIds?: string[];
  featureSelections?: Record<string, string[]>;
};
export type PendingLevelUp = {
  id: string;
  fromLevel: number;
  toLevel: number;
  approvedAt: number;
  baseFingerprint: string;
  hpRoll?: number;
  hpRollId?: string;
  /** An HP die belongs to this class and cannot be reused for a different class. */
  hpClassName?: CoreClass;
  /** The class roster was inferred from a single-class sheet at grant time;
   *  cancelling the grant removes it again. */
  inferredClasses?: boolean;
};
export type LevelUpRecord = {
  id: string;
  fromLevel: number;
  toLevel: number;
  hpGain: number;
  at: number;
  choices: LevelUpChoices;
};
/** Missing on older sheets; opting into the guide never rebuilds their history. */
export type CharacterLeveling = {
  rules: '2024';
  /** Ordered class levels; the first class is the original class. */
  classes?: ClassRosterEntry[];
  pending?: PendingLevelUp;
  history: LevelUpRecord[];
};
export type LevelUpFeature = { name: string; description: string; existing?: boolean };
export type LevelUpSpell = { name: string; level: number; school?: string; description: string };
export type LevelUpFeat = {
  name: string;
  description: string;
  category: 'Origin' | 'General' | 'Epic Boon';
  abilityChoices?: AbilityKey[];
  abilityIncrease?: number;
  prerequisite?: string;
};
export type LevelUpFeatureChoice = {
  key: string;
  label: string;
  count: number;
  /** A dependent choice only applies when this option is selected. */
  when?: { key: string; option: string };
  options: { name: string; description: string }[];
};
export type LevelUpPlan = {
  grant: PendingLevelUp;
  classes: ClassRosterEntry[];
  classOptions: { className: CoreClass; level: number; eligible: boolean; reason?: string }[];
  fromClassLevel: number;
  toClassLevel: number;
  newClass: boolean;
  proficiencies: string[];
  progression: ClassProgression;
  previous: ClassProgression;
  features: LevelUpFeature[];
  feats: LevelUpFeat[];
  spells: LevelUpSpell[];
  featureChoices: LevelUpFeatureChoice[];
  spellChoices: {
    newSpells: number;
    newCantrips: number;
    replacementLimit: number;
    spellSelectionRequired: boolean;
    cantripSelectionRequired: boolean;
  };
  warnings: string[];
};
export type LevelUpPreview = {
  classes?: ClassRosterEntry[];
  fromLevel: number;
  toLevel: number;
  hpGain: number;
  maxHpBefore: number;
  maxHpAfter: number;
  curHpAfter: number;
  proficiencyBefore: number;
  proficiencyAfter: number;
  statChanges: { ability: AbilityKey; before: number; after: number }[];
  addedAbilities: string[];
  spellSlots: Character['spellSlots'];
  resources: Character['resources'];
  warnings: string[];
};
export type LevelUpResult<T> = { ok: true; value: T } | { ok: false; error: string };
export type LevelUpCommitRequest = {
  characterId: string;
  grantId: string;
  expectedLevel: number;
  choices: LevelUpChoices;
};
