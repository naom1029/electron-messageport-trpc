import { contextBridge, ipcRenderer } from 'electron';
import { PORT_INIT_CHANNEL } from '../shared/constants';

export interface ExposePortReceiverOptions {
  channels?: readonly string[];
}

const DEFAULT_CHANNEL = 'default';

function normalizeChannel(channel: string | undefined): string {
  return channel ?? DEFAULT_CHANNEL;
}

export function exposePortReceiver(_opts: ExposePortReceiverOptions = {}): void {
  const pendingPorts = new Map<string, MessagePort>();
  const requestedChannels = new Set<string>();

  function transferPort(channel: string): void {
    if (!requestedChannels.has(channel)) {
      return;
    }

    const port = pendingPorts.get(channel);
    if (!port) {
      return;
    }

    window.postMessage(
      { channel: PORT_INIT_CHANNEL, trpcChannel: channel },
      '*',
      [port],
    );
    pendingPorts.delete(channel);
    requestedChannels.delete(channel);
  }

  ipcRenderer.on(PORT_INIT_CHANNEL, (event, message: unknown) => {
    const port = event.ports[0];
    if (port) {
      const channel = normalizeChannel(
        (message as { channel?: string } | null)?.channel,
      );
      pendingPorts.set(channel, port);
      transferPort(channel);
    }
  });

  contextBridge.exposeInMainWorld('electronTRPCPort', {
    requestPort: (channel?: string) => {
      const normalized = normalizeChannel(channel);
      requestedChannels.add(normalized);
      transferPort(normalized);
    },
  });
}

export function exposeElectronTRPC(opts?: ExposePortReceiverOptions): void {
  exposePortReceiver(opts);
}
