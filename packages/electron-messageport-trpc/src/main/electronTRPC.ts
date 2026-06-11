import { createTRPCClient, type TRPCClient } from '@trpc/client';
import type { AnyRouter } from '@trpc/server';
import { MessageChannelMain } from 'electron';
import type {
  ElectronTRPCChannel,
  ElectronTRPCChannels,
  ElectronTRPCRegistry,
  RouterForChannel,
} from '../core/index';
import type { DataTransformerOptions } from '../shared/transformer';
import type { PortHandler } from './createPortHandler';
import { createPortHandler } from './createPortHandler';
import type { BrowserWindowLike } from './createWindowMessagePortHandler';
import { mainPortLink } from './mainPortLink';
import { createPortBroker } from './portBroker';

type MaybePromise<T> = T | Promise<T>;

type RouterMap<TRegistry extends ElectronTRPCRegistry> = Partial<{
  [TKey in keyof TRegistry & string]: TRegistry[TKey];
}>;

export interface UtilityProcessLike {
  postMessage(message: unknown, transfer?: unknown[]): void;
  on?(event: 'exit', listener: () => void): void;
  off?(event: 'exit', listener: () => void): void;
}

export interface ElectronTRPCMainHandler {
  destroy(): void;
}

export interface CreateElectronTRPCMainSingleOptions<
  TRouter extends AnyRouter,
  TWindow extends BrowserWindowLike = BrowserWindowLike,
> {
  windows: readonly TWindow[];
  router: TRouter;
  createContext?: (opts: { window: TWindow }) => MaybePromise<unknown>;
  transformer?: DataTransformerOptions;
}

export interface CreateElectronTRPCMainOptions<
  TRegistry extends ElectronTRPCRegistry,
  TWindow extends BrowserWindowLike = BrowserWindowLike,
> {
  channels: ElectronTRPCChannels<TRegistry>;
  windows: readonly TWindow[];
  routers: RouterMap<TRegistry>;
  createContext?: (opts: {
    window: TWindow;
    channel: keyof TRegistry & string;
  }) => MaybePromise<unknown>;
  transformer?: DataTransformerOptions;
  channelOptions?: Partial<
    Record<keyof TRegistry & string, { transformer?: DataTransformerOptions }>
  >;
}

export function createElectronTRPCMain<
  TRouter extends AnyRouter,
  TWindow extends BrowserWindowLike = BrowserWindowLike,
>(
  opts: CreateElectronTRPCMainSingleOptions<TRouter, TWindow>,
): ElectronTRPCMainHandler;
export function createElectronTRPCMain<
  TRegistry extends ElectronTRPCRegistry,
  TWindow extends BrowserWindowLike = BrowserWindowLike,
>(
  opts: CreateElectronTRPCMainOptions<TRegistry, TWindow>,
): ElectronTRPCMainHandler;
export function createElectronTRPCMain<
  TRegistry extends ElectronTRPCRegistry,
  TWindow extends BrowserWindowLike = BrowserWindowLike,
>(
  opts:
    | CreateElectronTRPCMainSingleOptions<AnyRouter, TWindow>
    | CreateElectronTRPCMainOptions<TRegistry, TWindow>,
): ElectronTRPCMainHandler {
  const broker = createPortBroker();
  let destroyed = false;
  const cleanups: Array<() => void> = [];

  for (const window of opts.windows) {
    const handlers = new Map<string, PortHandler>();

    function connectWindow(): void {
      if (destroyed) {
        return;
      }

      for (const handler of handlers.values()) {
        handler.destroy();
      }
      handlers.clear();

      if ('router' in opts) {
        const { serverPort } = broker.createRendererPort(window.webContents, {
          channel: undefined,
        });
        handlers.set(
          'default',
          createPortHandler({
            port: serverPort,
            router: opts.router,
            transformer: opts.transformer,
            createContext: opts.createContext
              ? async () => opts.createContext?.({ window })
              : undefined,
          }),
        );
        return;
      }

      for (const key of Object.keys(opts.routers) as Array<
        keyof TRegistry & string
      >) {
        const router = opts.routers[key];
        if (!router) {
          continue;
        }

        const channel = opts.channels[key];
        const { serverPort } = broker.createRendererPort(window.webContents, {
          channel: channel.name,
        });
        const channelOptions = opts.channelOptions?.[key];
        handlers.set(
          key,
          createPortHandler({
            port: serverPort,
            router,
            transformer: channelOptions?.transformer ?? opts.transformer,
            createContext: opts.createContext
              ? async () => opts.createContext?.({ window, channel: key })
              : undefined,
          }),
        );
      }
    }

    function destroyWindowHandlers(): void {
      for (const handler of handlers.values()) {
        handler.destroy();
      }
      handlers.clear();
    }

    window.webContents.on('did-finish-load', connectWindow);
    window.on('closed', destroyWindowHandlers);
    cleanups.push(() => {
      window.webContents.off('did-finish-load', connectWindow);
      window.off('closed', destroyWindowHandlers);
      destroyWindowHandlers();
    });
  }

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

export interface CreateElectronTRPCUtilityClientOptions<
  TChannel extends ElectronTRPCChannel,
> {
  channel: TChannel;
  utility: UtilityProcessLike;
  transformer?: DataTransformerOptions;
}

export function createElectronTRPCUtilityClient<
  TChannel extends ElectronTRPCChannel,
>(
  opts: CreateElectronTRPCUtilityClientOptions<TChannel>,
): TRPCClient<RouterForChannel<TChannel>> {
  const { port1, port2 } = new MessageChannelMain();
  opts.utility.postMessage({ type: 'connect', channel: opts.channel.name }, [
    port1,
  ]);

  return createTRPCClient<RouterForChannel<TChannel>>({
    links: [mainPortLink({ port: port2, transformer: opts.transformer })],
  });
}

export interface ElectronTRPCUtilityPool<
  TInstance extends string,
  TChannel extends ElectronTRPCChannel,
> {
  get(instance: TInstance): TRPCClient<RouterForChannel<TChannel>>;
}

export interface CreateElectronTRPCUtilityPoolOptions<
  TInstance extends string,
  TChannel extends ElectronTRPCChannel,
> {
  channel: TChannel;
  utilities: Record<TInstance, UtilityProcessLike>;
  transformer?: DataTransformerOptions;
}

export function createElectronTRPCUtilityPool<
  TInstance extends string,
  TChannel extends ElectronTRPCChannel,
>(
  opts: CreateElectronTRPCUtilityPoolOptions<TInstance, TChannel>,
): ElectronTRPCUtilityPool<TInstance, TChannel> {
  const clients = new Map<TInstance, TRPCClient<RouterForChannel<TChannel>>>();

  for (const instance of Object.keys(opts.utilities) as TInstance[]) {
    clients.set(
      instance,
      createElectronTRPCUtilityClient({
        channel: opts.channel,
        utility: opts.utilities[instance],
        transformer: opts.transformer,
      }),
    );
  }

  return {
    get(instance) {
      const client = clients.get(instance);
      if (!client) {
        throw new Error(`Unknown utility instance: ${instance}`);
      }
      return client;
    },
  };
}

export interface CreateElectronTRPCRendererUtilityBridgeOptions<
  TChannel extends ElectronTRPCChannel,
  TWindow extends BrowserWindowLike = BrowserWindowLike,
> {
  window: TWindow;
  channel: TChannel;
  utility: UtilityProcessLike;
}

export function createElectronTRPCRendererUtilityBridge<
  TChannel extends ElectronTRPCChannel,
  TWindow extends BrowserWindowLike = BrowserWindowLike,
>(
  opts: CreateElectronTRPCRendererUtilityBridgeOptions<TChannel, TWindow>,
): ElectronTRPCMainHandler {
  const broker = createPortBroker();
  let destroyed = false;

  function connectWindow(): void {
    if (destroyed) {
      return;
    }

    const { serverPort } = broker.createRendererPort(opts.window.webContents, {
      channel: opts.channel.name,
    });
    opts.utility.postMessage({ type: 'connect', channel: opts.channel.name }, [
      serverPort,
    ]);
  }

  function destroy(): void {
    if (destroyed) {
      return;
    }
    destroyed = true;
    opts.window.webContents.off('did-finish-load', connectWindow);
    opts.window.off('closed', destroy);
  }

  opts.window.webContents.on('did-finish-load', connectWindow);
  opts.window.on('closed', destroy);

  return { destroy };
}
