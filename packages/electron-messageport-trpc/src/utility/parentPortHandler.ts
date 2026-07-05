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
  postMessage(message: unknown): void;
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

      // Remove the handler when its port closes so dead handlers do not
      // accumulate across renderer reloads / repeated connects. The
      // destroyed guard plus the indexOf check ensure we never double-destroy:
      // once destroy() ran, or once spliced out, a later close is a no-op.
      port.on('close', () => {
        if (destroyed) {
          return;
        }
        const index = handlers.indexOf(handler);
        if (index === -1) {
          return;
        }
        handlers.splice(index, 1);
        handler.destroy();
      });
    }
  });

  // The 'message' listener is now live: signal readiness to the parent so it
  // can post the connect message + port. This is emitted exactly once here so
  // consumers no longer hand-write process.parentPort.postMessage({type:'ready'}).
  parentPort.postMessage({ type: 'ready' });

  return {
    handlers,
    destroy() {
      if (destroyed) {
        return;
      }
      destroyed = true;
      // Iterate a snapshot so a synchronous 'close' during destroy() cannot
      // splice the array mid-loop and skip handlers.
      for (const handler of [...handlers]) {
        handler.destroy();
      }
      handlers.length = 0;
    },
  };
}
