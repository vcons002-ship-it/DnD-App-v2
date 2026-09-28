import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';

// Independent static preview using the production miniature renderer.
export default defineConfig({
  plugins:[react()],base:'./',publicDir:false,
  build:{outDir:'environment-dist',rollupOptions:{input:'environment-test.html'}},
});
