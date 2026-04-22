import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { copyFileSync } from 'fs';
import { resolve } from 'path';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'copy-icons',
      writeBundle() {
        copyFileSync(resolve('icon.svg'), resolve('dist/icon.svg'));
        copyFileSync(resolve('icon16.png'), resolve('dist/icon16.png'));
        copyFileSync(resolve('icon48.png'), resolve('dist/icon48.png'));
        copyFileSync(resolve('icon128.png'), resolve('dist/icon128.png'));
      }
    }
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        code: 'code.ts',
        ui: 'ui-entry.tsx'
      },
      output: {
        entryFileNames: (chunkInfo) => {
          // Keep code.ts as code.js
          if (chunkInfo.name === 'code') return 'code.js';
          // ui-entry.tsx becomes ui.js
          if (chunkInfo.name === 'ui') return 'ui.js';
          return '[name].js';
        },
        chunkFileNames: '[name].js',
        assetFileNames: '[name].[ext]'
      }
    },
    assetsInlineLimit: 100000000
  }
});
