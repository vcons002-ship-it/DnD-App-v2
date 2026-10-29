import path from 'node:path';
import fs from 'node:fs';
import {config} from '../server/src/config.js';
// Keep test builds out of client/dist, which the live service also serves.
if(!process.env.E2E_CLIENT_DIST)throw Error('E2E_CLIENT_DIST is required');
const directory=path.resolve(process.env.E2E_CLIENT_DIST);
if(!fs.existsSync(path.join(directory,'index.html')))throw Error('Build the isolated client first');
config.clientDist=directory;
await import('../server/src/index.js');
