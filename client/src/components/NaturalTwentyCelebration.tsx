import type {CSSProperties} from 'react';
import './NaturalTwentyCelebration.css';

/** Presentation only: a natural 20 never changes a check's actual outcome. */
export function NaturalTwentyCelebration(){
 return <div className="nat20-celebration" role="status" aria-label="Natural 20 celebration">
   <span className="nat20-halo" aria-hidden="true"/>
   <strong>Nat 20!</strong>
   <span className="nat20-sparks" aria-hidden="true">{Array.from({length:12},(_,i)=>
     <i key={i} style={{'--spark-angle':i*30+'deg','--spark-delay':(i%3)*45+'ms'} as CSSProperties}/>)}</span>
 </div>;
}
