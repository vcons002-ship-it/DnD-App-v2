import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
// Separate static sandbox: production renderer and rules, no campaign connection.
export default defineConfig({plugins:[react()],base:'./',publicDir:false,
 define:{'import.meta.env.VITE_ARCH_ART_STUDY':JSON.stringify('1')},
 build:{outDir:'exploration-dist',rollupOptions:{input:'exploration-test.html'}},
});
