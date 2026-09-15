import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// Express owns URLs and HTML. Vite only owns public/react; never clear public/.
export default defineConfig({
  publicDir: false,
  base: '/react/',
  build: {
    outDir: 'public/react',
    emptyOutDir: true,
    cssCodeSplit: false,
    manifest: true,
    rollupOptions: {
      input: { icons: resolve('frontend/entries/icons.tsx'), login: resolve('frontend/entries/login.tsx'), builder: resolve('frontend/entries/builder.tsx') },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'react.[ext]',
      },
    },
  },
});
