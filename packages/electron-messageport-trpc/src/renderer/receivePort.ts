import { PORT_INIT_CHANNEL } from '../shared/constants';

declare global {
  interface Window {
    electronTRPCPort?: {
      requestPort(): void;
    };
  }
}

let portPromise: Promise<MessagePort> | null = null;

export function getPort(): Promise<MessagePort> {
  const bridge = window.electronTRPCPort;
  if (!bridge) {
    throw new Error(
      'electronTRPCPort not found. Did you call exposePortReceiver() in your preload script?',
    );
  }

  if (portPromise) {
    return portPromise;
  }

  portPromise = new Promise<MessagePort>((resolve) => {
    function handleMessage(event: MessageEvent): void {
      const channel = (event.data as { channel?: string } | null)?.channel;
      if (channel !== PORT_INIT_CHANNEL) {
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
    bridge.requestPort();
  });

  return portPromise;
}
