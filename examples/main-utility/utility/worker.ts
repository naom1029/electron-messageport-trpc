import { createParentPortHandler } from 'electron-messageport-trpc/utility';
import { utilityRouter } from './router';

createParentPortHandler({
  router: utilityRouter,
  parentPort: process.parentPort,
});

process.parentPort.postMessage({ type: 'ready' });
