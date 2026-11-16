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
  preview: {
    proxy: {
      '/api': target,
      '/agent': target,
    },
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 550,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: 'vendor-react',
              test: /[\\/]node_modules[\\/](react|react-dom|scheduler|react-is)[\\/]/,
              priority: 50,
            },
            {
              name: 'vendor-data',
              test: /[\\/]node_modules[\\/](@tanstack|zod|dayjs)[\\/]/,
              priority: 40,
            },
            {
              name: 'vendor-lucide',
              test: /[\\/]node_modules[\\/]lucide-react[\\/]/,
              priority: 35,
            },
            {
              name: 'vendor-ant-core',
              test: /[\\/]node_modules[\\/](@ant-design|@emotion|@babel|stylis|clsx|classnames|copy-to-clipboard|toggle-selection)[\\/]/,
              priority: 30,
            },
            {
              name: 'vendor-rc',
              test: /[\\/]node_modules[\\/](@rc-component|rc-[^\\/]+|async-validator|compute-scroll-into-view|scroll-into-view-if-needed|resize-observer-polyfill|throttle-debounce)[\\/]/,
              priority: 20,
            },
            {
              name: 'vendor-antd',
              test: /[\\/]node_modules[\\/]antd[\\/]/,
              priority: 10,
            },
          ],
        },
      },
    },
  },
});
