import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    lib: {
      entry: 'src/main/index.ts',
      formats: ['es', 'cjs'],
      fileName: 'main',
    },
    outDir: '../../dist',
    emptyOutDir: true,
    rollupOptions: {
      external: ['electron', '@trpc/server', '@trpc/client'],
    },
  },
});
