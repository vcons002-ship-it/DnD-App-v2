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
    rollupOptions: {
      output: {
        // Split the heavy vendors into their own chunks so the main bundle
        // stays under Vite's 500 kB warning and the libs cache/parallel-load.
        manualChunks: {
          konva: ['konva', 'react-konva'],
          react: ['react', 'react-dom', 'react-router-dom'],
        },
      },
    },
  },
});
