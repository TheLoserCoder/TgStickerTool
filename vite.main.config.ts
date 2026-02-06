import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: 'dist/main',
    lib: {
      entry: 'src/main/main.ts',
      formats: ['cjs'],
      fileName: () => 'main.js',
    },
    rollupOptions: {
      external: ['electron'],
    },
    emptyOutDir: true,
  },
});
