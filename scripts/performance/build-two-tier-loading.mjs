import {build} from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

if (!process.argv[2]) throw Error('Pass preview DATA_ROOT/uploads/two-tier-lod');
// This page exercises the production LOD code without overrides or sockets.
await build({configFile:false,root:path.resolve('scripts/performance/two-tier-miniatures'),publicDir:false,
  base:'/uploads/two-tier-lod/',plugins:[react()],
  build:{outDir:path.resolve(process.argv[2]),emptyOutDir:false,chunkSizeWarningLimit:2000}});
