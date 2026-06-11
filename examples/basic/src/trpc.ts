import { createElectronTRPCClient } from 'electron-messageport-trpc/renderer';
import { electronTRPC } from '../electron/trpc';

export const trpc = createElectronTRPCClient(electronTRPC).main;
