import type { AnyRouter } from '@trpc/server';
import { createPortHandler } from '../main/createPortHandler';
import type { PortHandler } from '../main/createPortHandler';

interface ParentPortLike {
  on(
    event: 'message',
    listener: (event: { data: unknown; ports: unknown[] }) => void,
  ): void;
}

export interface CreateParentPortHandlerOptions<TRouter extends AnyRouter> {
  router: TRouter;
  parentPort: ParentPortLike;
  createContext?: () => Promise<unknown>;
}

export function createParentPortHandler<TRouter extends AnyRouter>(
  opts: CreateParentPortHandlerOptions<TRouter>,
): { handlers: PortHandler[] } {
  const { router, parentPort, createContext } = opts;
  const handlers: PortHandler[] = [];

  parentPort.on('message', (event) => {
    const ports = event.ports;
    if (!ports || ports.length === 0) return;

    for (const port of ports) {
      const handler = createPortHandler({
        port: port as any,
        router,
        createContext,
      });
      handlers.push(handler);
    }
  });

  return { handlers };
}
