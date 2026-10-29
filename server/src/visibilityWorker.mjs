// Workers do not inherit tsx's main-thread hooks. Register the ESM loader here.
import {register} from 'tsx/esm/api';
register();
await import('./visibilityWorker.ts');
