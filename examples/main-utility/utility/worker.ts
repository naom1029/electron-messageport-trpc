import { createElectronTRPCUtility } from 'electron-messageport-trpc/utility';
import { electronTRPC } from '../electron/trpc';
import { utilityRouter } from './router';

createElectronTRPCUtility({
  channel: electronTRPC.worker,
  router: utilityRouter,
  parentPort: process.parentPort,
});

process.parentPort.postMessage({ type: 'ready' });
