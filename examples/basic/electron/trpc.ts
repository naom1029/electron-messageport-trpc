import { defineElectronTRPC } from 'electron-messageport-trpc';
import type { AppRouter } from './router';

export const electronTRPC = defineElectronTRPC<{
  main: AppRouter;
}>();
