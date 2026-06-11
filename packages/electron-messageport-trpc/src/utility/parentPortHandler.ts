import type { AnyRouter } from '@trpc/server';
import type { MessagePortLike, PortHandler } from '../main/createPortHandler';
import { createPortHandler } from '../main/createPortHandler';
import type { DataTransformerOptions } from '../shared/transformer';

type MaybePromise<T> = T | Promise<T>;

export interface ParentPortLike {
  on(
    event: 'message',
    listener: (event: { data: unknown; ports: MessagePortLike[] }) => void,
  ): void;
}

export interface CreateParentPortHandlerOptions<TRouter extends AnyRouter> {
  router: TRouter;
  parentPort: ParentPortLike;
  channel?: string;
  createContext?: () => MaybePromise<unknown>;
  transformer?: DataTransformerOptions;
}

export interface ParentPortHandler {
  handlers: PortHandler[];
  destroy(): void;
}

export function createParentPortHandler<TRouter extends AnyRouter>(
  opts: CreateParentPortHandlerOptions<TRouter>,
): ParentPortHandler {
  const { router, parentPort, createContext, transformer } = opts;
  const handlers: PortHandler[] = [];
  let destroyed = false;

  parentPort.on('message', (event) => {
    if (destroyed) {
      return;
    }

    const channel = (event.data as { channel?: string } | null)?.channel;
    if (opts.channel && channel !== opts.channel) {
      return;
    }

    const ports = event.ports;
    if (!ports || ports.length === 0) return;

    for (const port of ports) {
      const handler = createPortHandler({
        port,
        router,
        createContext: createContext ? async () => createContext() : undefined,
        transformer,
      });
      handlers.push(handler);
    }
  });

  return {
    handlers,
    destroy() {
      if (destroyed) {
        return;
      }
      destroyed = true;
      for (const handler of handlers) {
        handler.destroy();
      }
      handlers.length = 0;
    },
  };
}
