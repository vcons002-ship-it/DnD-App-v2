import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In dev, proxy API + Socket.IO + uploads to the local server (port 4000).
// In production the server serves the built client, so no proxy is needed.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:4000',
      '/uploads': 'http://localhost:4000',
      '/socket.io': { target: 'http://localhost:4000', ws: true },
    },
  },
  build: {
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      input: ['index.html', 'dice-comparison.html', 'dice-models.html', 'dice-power.html'],
      output: {
        // Split the heavy vendors into their own chunks so the main bundle
        // stays under Vite's 500 kB warning and the libs cache/parallel-load.
        manualChunks(id) {
          if (id.includes('node_modules/konva') || id.includes('node_modules/react-konva')) return 'konva';
          if (
            id.includes('node_modules/react/') ||
            id.includes('node_modules/react-dom/') ||
            id.includes('node_modules/react-router')
          )
            return 'react';
          if (id.includes('node_modules/three/examples/')) return 'three-addons';
          if (id.includes('node_modules/three/')) return 'three-core';
        },
      },
    },
  },
});
