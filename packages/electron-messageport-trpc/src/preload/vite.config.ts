import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    lib: {
      entry: 'src/preload/index.ts',
      formats: ['es', 'cjs'],
      fileName: 'preload',
    },
    outDir: '../../dist',
    emptyOutDir: false,
    rollupOptions: {
      external: ['electron'],
    },
  },
});
