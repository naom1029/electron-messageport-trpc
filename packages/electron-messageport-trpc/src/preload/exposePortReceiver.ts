import { contextBridge, ipcRenderer } from 'electron';
import { PORT_INIT_CHANNEL } from '../shared/constants';

export function exposePortReceiver(): void {
  let resolvePort: (port: MessagePort) => void;
  const portPromise = new Promise<MessagePort>((resolve) => {
    resolvePort = resolve;
  });

  ipcRenderer.on(PORT_INIT_CHANNEL, (event) => {
    const port = event.ports[0];
    if (port) {
      resolvePort(port);
    }
  });

  contextBridge.exposeInMainWorld('electronTRPCPort', {
    getPort: () => portPromise,
  });
}
