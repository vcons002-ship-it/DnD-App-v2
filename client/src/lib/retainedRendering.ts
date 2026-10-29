/** Comparison switch for controlled benchmarks; normal browsers use retention. */
export function retainedRenderingEnabled(){try{return localStorage.getItem('dnd-retained-rendering')!=='off';}catch{return true;}}
