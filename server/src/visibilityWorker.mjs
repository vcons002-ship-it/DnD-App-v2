// Workers do not inherit tsx's main-thread hooks. Register the ESM loader here.
import os from 'node:os';
process.env.UV_THREADPOOL_SIZE ??= String(Math.max(8, Math.min(32, os.availableParallelism?.() ?? os.cpus().length)));
import {register} from 'tsx/esm/api';
register();
await import('./visibilityWorker.ts');
