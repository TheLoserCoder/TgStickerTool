import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: 'dist/main',
    lib: {
      entry: {
        main: 'src/main/main.ts',
        tileWorker: 'src/main/tileWorker.ts',
        imageWorker: 'src/main/imageWorker.ts',
        'workers/apngWorker': 'src/main/workers/apngWorker.ts',
        'workers/prepareWorker': 'src/main/workers/prepareWorker.ts',
        'workers/resizeWorker': 'src/main/workers/resizeWorker.ts',
        'workers/sliceWorker': 'src/main/workers/sliceWorker.ts',
        'workers/convertWorker': 'src/main/workers/convertWorker.ts',
      },
      formats: ['cjs'],
      fileName: (format, entryName) => `${entryName}.js`,
    },
    rollupOptions: {
      external: ['electron', 'path', 'fs', 'os', 'sharp', 'fluent-ffmpeg', '@ffmpeg-installer/ffmpeg', 'worker_threads', 'electron-store', 'child_process', 'util'],
    },
    emptyOutDir: true,
    target: 'node18',
  },
});
