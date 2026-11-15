import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ isSsrBuild }) => ({
  plugins: [react()],
  build: isSsrBuild ? {} : {
    rollupOptions: {
      output: {
        manualChunks(id) {
          const modulePath = id.replaceAll('\\', '/');
          if (!modulePath.includes('/node_modules/')) return;
          if (modulePath.includes('/node_modules/lucide-react/')) return 'vendor-icons';
          // Keep React and its router together to avoid interdependent runtime chunks.
          if (/\/node_modules\/(react|react-dom|scheduler|react-router|react-router-dom)\//.test(modulePath)) {
            return 'vendor-react';
          }
        }
      }
    }
  },
  server: {
    port: 5173,
    host: '127.0.0.1',
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true
      }
    }
  }
}));
