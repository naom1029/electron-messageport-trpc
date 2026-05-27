import type { AnyRouter } from '@trpc/server';
import type { PortHandler } from './createPortHandler';
import { createPortHandler } from './createPortHandler';
import { createPortBroker } from './portBroker';

export interface RendererWebContentsLike {
  postMessage(channel: string, message: unknown, transfer?: unknown[]): void;
  on(event: 'did-finish-load', listener: () => void): void;
  off(event: 'did-finish-load', listener: () => void): void;
  isLoadingMainFrame?(): boolean;
}

export interface BrowserWindowLike {
  webContents: RendererWebContentsLike;
  on(event: 'closed', listener: () => void): void;
  off(event: 'closed', listener: () => void): void;
}

export interface CreateWindowMessagePortHandlerOptions<
  TRouter extends AnyRouter,
  TWindow extends BrowserWindowLike = BrowserWindowLike,
> {
  router: TRouter;
  windows: readonly TWindow[];
  createContext?: (opts: { window: TWindow }) => Promise<unknown>;
}

export interface WindowMessagePortHandler {
  destroy(): void;
}

export function createWindowMessagePortHandler<
  TRouter extends AnyRouter,
  TWindow extends BrowserWindowLike = BrowserWindowLike,
>(
  opts: CreateWindowMessagePortHandlerOptions<TRouter, TWindow>,
): WindowMessagePortHandler {
  const broker = createPortBroker();
  const createContext = opts.createContext;
  let destroyed = false;
  const cleanups = opts.windows.map((window) => {
    let handler: PortHandler | null = null;

    function connectWindow(): void {
      if (destroyed) {
        return;
      }

      handler?.destroy();

      const { serverPort } = broker.createRendererPort(window.webContents);
      handler = createPortHandler({
        port: serverPort,
        router: opts.router,
        createContext: createContext
          ? async () => createContext({ window })
          : undefined,
      });
    }

    function destroyWindowHandler(): void {
      handler?.destroy();
      handler = null;
    }

    window.webContents.on('did-finish-load', connectWindow);
    window.on('closed', destroyWindowHandler);
    return () => {
      window.webContents.off('did-finish-load', connectWindow);
      window.off('closed', destroyWindowHandler);
      destroyWindowHandler();
    };
  });

  return {
    destroy() {
      if (destroyed) {
        return;
      }
      destroyed = true;
      for (const cleanup of cleanups) {
        cleanup();
      }
    },
  };
}
