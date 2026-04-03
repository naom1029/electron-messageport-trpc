import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    lib: {
      entry: 'src/preload/index.ts',
      formats: ['es'],
      fileName: () => 'preload.mjs',
    },
    outDir: 'dist',
    emptyOutDir: false,
    rollupOptions: {
      external: ['electron'],
    },
  },
});
