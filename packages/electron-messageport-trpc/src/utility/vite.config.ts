import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    lib: {
      entry: 'src/utility/index.ts',
      formats: ['es', 'cjs'],
      fileName: 'utility',
    },
    outDir: '../../dist',
    emptyOutDir: false,
    rollupOptions: {
      external: ['electron', '@trpc/server', '@trpc/client'],
    },
  },
});
