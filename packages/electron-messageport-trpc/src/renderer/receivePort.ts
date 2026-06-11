import { PORT_INIT_CHANNEL } from '../shared/constants';

declare global {
  interface Window {
    electronTRPCPort?: {
      requestPort(channel?: string): void;
    };
  }
}

export interface GetPortOptions {
  channel?: string;
}

const DEFAULT_CHANNEL = 'default';
const portPromises = new Map<string, Promise<MessagePort>>();

function normalizeChannel(channel: string | undefined): string {
  return channel ?? DEFAULT_CHANNEL;
}

export function getPort(opts: GetPortOptions = {}): Promise<MessagePort> {
  const bridge = window.electronTRPCPort;
  if (!bridge) {
    throw new Error(
      'electronTRPCPort not found. Did you call exposePortReceiver() in your preload script?',
    );
  }

  const channel = normalizeChannel(opts.channel);
  const portPromise = portPromises.get(channel);
  if (portPromise) {
    return portPromise;
  }

  const nextPortPromise = new Promise<MessagePort>((resolve) => {
    function handleMessage(event: MessageEvent): void {
      const data = event.data as {
        channel?: string;
        trpcChannel?: string;
      } | null;
      if (data?.channel !== PORT_INIT_CHANNEL) {
        return;
      }

      if (normalizeChannel(data.trpcChannel) !== channel) {
        return;
      }

      const port = event.ports[0];
      if (!port) {
        return;
      }

      window.removeEventListener('message', handleMessage);
      resolve(port);
    }

    window.addEventListener('message', handleMessage);
    bridge.requestPort(channel);
  });

  portPromises.set(channel, nextPortPromise);
  return nextPortPromise;
}
