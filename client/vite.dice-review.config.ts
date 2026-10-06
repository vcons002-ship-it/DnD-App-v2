import {defineConfig} from 'vite';

// Uses the app's actual die meshes and animated resin shader, without a session.
export default defineConfig({base:'./',publicDir:false,
 build:{outDir:'dice-review-dist',rollupOptions:{input:'dice-review.html'}},
});
