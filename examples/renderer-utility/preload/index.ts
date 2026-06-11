import { exposeElectronTRPC } from 'electron-messageport-trpc/preload';
import { electronTRPC } from '../electron/trpc';

exposeElectronTRPC(electronTRPC);
