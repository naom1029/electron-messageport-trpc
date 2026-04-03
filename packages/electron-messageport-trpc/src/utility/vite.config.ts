import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    lib: {
      entry: 'src/utility/index.ts',
      formats: ['es'],
      fileName: () => 'utility.mjs',
    },
    outDir: 'dist',
    emptyOutDir: false,
    rollupOptions: {
      external: ['electron', '@trpc/server', '@trpc/client'],
    },
  },
});
