import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    lib: {
      entry: 'src/renderer/index.ts',
      formats: ['es', 'cjs'],
      fileName: 'renderer',
    },
    outDir: '../../dist',
    emptyOutDir: false,
    rollupOptions: {
      external: ['@trpc/server', '@trpc/client'],
    },
  },
});
