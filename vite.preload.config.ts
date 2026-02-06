import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: 'dist/main',
    lib: {
      entry: 'src/main/preload.ts',
      formats: ['cjs'],
      fileName: () => 'preload.js',
    },
    rollupOptions: {
      external: ['electron'],
    },
    emptyOutDir: false,
  },
});
