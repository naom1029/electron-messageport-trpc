import { createElectronTRPCClient } from 'electron-messageport-trpc/renderer';
import type { AppRouter } from '../electron/router';

export const trpc = createElectronTRPCClient<AppRouter>();
