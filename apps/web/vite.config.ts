import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const target = process.env.IRM_API_TARGET ?? 'http://127.0.0.1:8787';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': target,
      '/agent': target,
    },
  },
  build: {
    target: 'es2022',
    rolldownOptions: {
      output: {
        codeSplitting: {
          maxSize: 460_000,
          groups: [
            { name: 'vendor-react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/, priority: 30 },
            { name: 'vendor-data', test: /node_modules[\\/](@tanstack|zod)[\\/]/, priority: 25 },
            { name: 'vendor-lucide', test: /node_modules[\\/]lucide-react[\\/]/, priority: 20 },
            { name: 'vendor-ui', test: /node_modules[\\/]/, priority: 10 },
          ],
        },
      },
    },
  },
});
