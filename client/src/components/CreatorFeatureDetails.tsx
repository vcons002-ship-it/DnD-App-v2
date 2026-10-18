import type {SheetAbility} from '../../../shared/types';
import './creator-details.css';

function handling(a:SheetAbility){
 if(['Tough','Dwarven Toughness'].includes(a.name))return 'Included in starting HP';
 if(['Unarmored Defense','Defense'].includes(a.name))return 'Included in starting AC when applicable';
 if(['Spellcasting','Pact Magic'].includes(a.name))return 'Starting spells and slots included';
 if(a.name==='Alert')return 'Initiative bonus included · swaps with DM';
 if(['Skillful','Versatile','Skilled'].includes(a.name))return 'Choices included in this builder';
 if(a.meta?.startsWith('Included')||a.meta?.startsWith('Cantrip added'))return a.meta;
 if(a.stance)return 'Toggle on your sheet · situational rules with DM';
 if(a.roll)return 'Roll button on your sheet';
 if(a.useCounter)return 'Use counter on your sheet · effects with DM';
 return 'Saved rules reference · resolve with DM';
}
export function CreatorFeatureDetails({title,abilities,notes=[]}:{title:string;abilities:SheetAbility[];notes?:string[]}){
 return <fieldset className="creator-fieldset creator-feature-details"><legend>{title}</legend>
  <p className="creator-copy">Tap a feature to read what it does and how to use it. Every listed feature is saved on the character sheet.</p>
  {abilities.map((a,i)=><details key={`${a.name}-${i}`}><summary><strong>{a.name}</strong><small>{handling(a)}</small></summary><p>{a.description}</p>{a.meta&&<small>{a.meta}</small>}</details>)}
  {notes.map(note=><p className="creator-note" key={note}><strong>Finish with your DM:</strong> {note}</p>)}
 </fieldset>;
}
