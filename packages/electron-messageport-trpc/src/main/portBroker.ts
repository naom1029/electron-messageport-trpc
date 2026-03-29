import { MessageChannelMain } from 'electron';
import { PORT_INIT_CHANNEL } from '../shared/constants';

interface WebContentsLike {
  postMessage(channel: string, message: unknown, transfer?: unknown[]): void;
}

export interface PortBroker {
  createRendererPort(webContents: WebContentsLike): {
    serverPort: InstanceType<typeof MessageChannelMain>['port1'];
  };
}

export function createPortBroker(): PortBroker {
  return {
    createRendererPort(webContents: WebContentsLike) {
      const { port1, port2 } = new MessageChannelMain();
      webContents.postMessage(PORT_INIT_CHANNEL, null, [port1]);
      return { serverPort: port2 };
    },
  };
}
