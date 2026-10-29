import type {StateSnapshot} from '../../shared/types.js';
/** The snapshot builder hides torch-fixture artwork outside personal sight.
 * That display flag changes along a valid walk; it is not a changed light,
 * wall or fog policy. Every other map field remains a discontinuity guard. */
export function walkingMapKey(map:StateSnapshot['map']){
 if(!map?.environment)return JSON.stringify(map);
 return JSON.stringify({...map,environment:{...map.environment,lights:map.environment.lights.map(({visibleTorch,...light})=>light)}});
}
