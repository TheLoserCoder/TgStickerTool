import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: 'dist/main',
    lib: {
      entry: {
        main: 'src/main/main.ts',
        tileWorker: 'src/main/tileWorker.ts',
      },
      formats: ['cjs'],
      fileName: (format, entryName) => `${entryName}.js`,
    },
    rollupOptions: {
      external: ['electron', 'path', 'fs', 'os', 'sharp', 'fluent-ffmpeg', '@ffmpeg-installer/ffmpeg', 'worker_threads', 'electron-store'],
    },
    emptyOutDir: true,
    target: 'node18',
  },
});
