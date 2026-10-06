import {defineConfig} from 'vite';
export default defineConfig({base:'./',publicDir:false,
 build:{outDir:'dice-models-dist',rollupOptions:{input:'dice-models.html'}},
});
