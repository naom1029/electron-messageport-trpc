import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    lib: {
      entry: 'src/core/index.ts',
      formats: ['es'],
      fileName: () => 'index.mjs',
    },
    outDir: 'dist',
    emptyOutDir: false,
    rollupOptions: {
      external: [/^@trpc\/server(\/.*)?$/],
    },
  },
});
