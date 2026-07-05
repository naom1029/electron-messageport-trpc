import { createElectronTRPCUtility } from 'electron-messageport-trpc/utility';
import { electronTRPC } from '../electron/trpc';
import { utilityRouter } from './router';

// The library emits the 'ready' signal once its parentPort listener is live,
// so consumers no longer hand-write process.parentPort.postMessage({type:'ready'}).
createElectronTRPCUtility({
  channel: electronTRPC.worker,
  router: utilityRouter,
  parentPort: process.parentPort,
});
