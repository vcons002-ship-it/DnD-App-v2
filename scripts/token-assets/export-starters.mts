import fs from 'node:fs';
import {starterCreatures} from '../../server/src/creatures/starterLibrary.js';
const target=process.argv[2];if(!target)throw Error('Provide output JSON path');
fs.writeFileSync(target,JSON.stringify(starterCreatures(),null,2));
