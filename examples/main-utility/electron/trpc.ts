import { defineElectronTRPC } from 'electron-messageport-trpc';
import type { UtilityRouter } from '../utility/router';

export const electronTRPC = defineElectronTRPC<{
  worker: UtilityRouter;
}>();
