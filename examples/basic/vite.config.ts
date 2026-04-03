import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    react(),
    electron([
      {
        entry: 'electron/main.ts',
        onstart(args) {
          args.startup();
        },
      },
      {
        entry: 'preload/index.ts',
        onstart(args) {
          args.reload();
        },
      },
    ]),
  ],
});
