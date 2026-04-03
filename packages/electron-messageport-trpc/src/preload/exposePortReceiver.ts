import { contextBridge, ipcRenderer } from 'electron';
import { PORT_INIT_CHANNEL } from '../shared/constants';

export function exposePortReceiver(): void {
  let pendingPort: MessagePort | null = null;
  let rendererRequestedPort = false;

  function transferPort(): void {
    if (!rendererRequestedPort || !pendingPort) {
      return;
    }

    window.postMessage({ channel: PORT_INIT_CHANNEL }, '*', [pendingPort]);
    pendingPort = null;
    rendererRequestedPort = false;
  }

  ipcRenderer.on(PORT_INIT_CHANNEL, (event) => {
    const port = event.ports[0];
    if (port) {
      pendingPort = port;
      transferPort();
    }
  });

  contextBridge.exposeInMainWorld('electronTRPCPort', {
    requestPort: () => {
      rendererRequestedPort = true;
      transferPort();
    },
  });
}
