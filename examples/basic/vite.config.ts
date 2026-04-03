import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import electron from 'vite-plugin-electron';

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
