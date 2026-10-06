import {defineConfig} from 'vite';
export default defineConfig({base:'./',publicDir:false,
 build:{outDir:'dice-comparison-dist',rollupOptions:{input:'dice-comparison.html'}},
});
