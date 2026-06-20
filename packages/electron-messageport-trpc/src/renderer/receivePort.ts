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
  timeoutMs?: number;
}

const DEFAULT_CHANNEL = 'default';
const DEFAULT_TIMEOUT_MS = 10000;
const portPromises = new Map<string, Promise<MessagePort>>();

function normalizeChannel(channel: string | undefined): string {
  return channel ?? DEFAULT_CHANNEL;
}

export function getPort(opts: GetPortOptions = {}): Promise<MessagePort> {
  const channel = normalizeChannel(opts.channel);
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const portPromise = portPromises.get(channel);
  if (portPromise) {
    return portPromise;
  }

  const nextPortPromise = new Promise<MessagePort>((resolve, reject) => {
    const bridge = window.electronTRPCPort;
    if (!bridge) {
      reject(
        new Error(
          'electronTRPCPort not found. Did you call exposePortReceiver() in your preload script?',
        ),
      );
      return;
    }

    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    function cleanup(): void {
      window.removeEventListener('message', handleMessage);
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
    }

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

      cleanup();
      resolve(port);
    }

    timeoutId = setTimeout(() => {
      cleanup();
      reject(
        new Error(
          `No port received for channel "${channel}" within ${timeoutMs}ms; is createElectronTRPCMain wired and is "${channel}" in the preload allowlist?`,
        ),
      );
    }, timeoutMs);

    window.addEventListener('message', handleMessage);
    bridge.requestPort(channel);
  });

  // On rejection, drop the cached entry so a later getPort() can retry.
  nextPortPromise.catch(() => {
    if (portPromises.get(channel) === nextPortPromise) {
      portPromises.delete(channel);
    }
  });

  portPromises.set(channel, nextPortPromise);
  return nextPortPromise;
}
