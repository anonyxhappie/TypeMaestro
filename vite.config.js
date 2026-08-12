import { defineConfig } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import manifest from './src/manifest.json' with { type: 'json' };
import { resolve } from 'path';

export default defineConfig({
  plugins: [crx({ manifest })],
  build: {
    rollupOptions: {
      input: {
        offscreen: resolve(__dirname, 'src/offscreen.html'),
      },
    },
  },
  optimizeDeps: {
    exclude: ['@xenova/transformers']
  }
});
