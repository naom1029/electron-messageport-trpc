import { MessageChannelMain } from 'electron';
import { PORT_INIT_CHANNEL } from '../shared/constants';

export interface WebContentsLike {
  postMessage(channel: string, message: unknown, transfer?: unknown[]): void;
}

export interface PortBroker {
  createRendererPort(
    webContents: WebContentsLike,
    opts?: CreateRendererPortOptions,
  ): {
    serverPort: InstanceType<typeof MessageChannelMain>['port1'];
  };
}

export interface CreateRendererPortOptions {
  channel?: string;
}

export function createPortBroker(): PortBroker {
  return {
    createRendererPort(
      webContents: WebContentsLike,
      opts: CreateRendererPortOptions = {},
    ) {
      const { port1, port2 } = new MessageChannelMain();
      webContents.postMessage(
        PORT_INIT_CHANNEL,
        { channel: opts.channel ?? 'default' },
        [port1],
      );
      return { serverPort: port2 };
    },
  };
}
