import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  plugins: [react()],
  root: __dirname,
  build: {
    outDir: path.resolve(__dirname, '../public'),
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 19001,
    proxy: {
      '/api': 'http://localhost:19000',
      '/health': 'http://localhost:19000',
      '/status': 'http://localhost:19000',
    },
  },
});
