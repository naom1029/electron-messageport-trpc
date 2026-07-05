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
import type { MainPortLike } from './mainPortLink';
import { mainPortLink } from './mainPortLink';
import { createPortBroker } from './portBroker';

type MaybePromise<T> = T | Promise<T>;

export interface RendererWebContentsLike {
  postMessage(channel: string, message: unknown, transfer?: unknown[]): void;
  on(event: 'did-finish-load', listener: () => void): void;
  off(event: 'did-finish-load', listener: () => void): void;
  isLoadingMainFrame?(): boolean;
  getURL?(): string;
}

/**
 * Whether the frame has ALREADY finished loading a document, so we should wire
 * a port immediately instead of waiting for the next `did-finish-load`.
 *
 * A fresh, never-loaded window also reports `isLoadingMainFrame() === false`,
 * but its URL is empty — connecting it immediately would post a port before the
 * renderer exists and race the upcoming `did-finish-load`, leaving the renderer
 * holding a port whose server handler was already torn down. Requiring a
 * non-empty URL restricts the immediate connect to the genuine
 * "constructed after the window already loaded" case.
 */
function hasFinishedLoading(webContents: RendererWebContentsLike): boolean {
  return webContents.isLoadingMainFrame?.() === false && !!webContents.getURL?.();
}

export interface BrowserWindowLike {
  webContents: RendererWebContentsLike;
  on(event: 'closed', listener: () => void): void;
  off(event: 'closed', listener: () => void): void;
}

// Partial on purpose: a single createElectronTRPCMain serves only the channels
// THIS (main) process hosts. Other declared channels can be served by utility
// processes (createElectronTRPCUtility) or brokered (createElectronTRPCRendererUtilityBridge),
// so requiring every declared channel here would break multi-process topologies.
type RouterMap<TRegistry extends ElectronTRPCRegistry> = Partial<{
  [TKey in keyof TRegistry & string]: TRegistry[TKey];
}>;

export interface UtilityProcessLike {
  postMessage(message: unknown, transfer?: unknown[]): void;
  on?(event: 'exit', listener: () => void): void;
  on?(event: 'message', listener: (message: unknown) => void): void;
  off?(event: 'exit', listener: () => void): void;
  off?(event: 'message', listener: (message: unknown) => void): void;
}

export interface ElectronTRPCDestroyable {
  destroy(): void;
}

export interface ElectronTRPCMainHandler<
  TWindow extends BrowserWindowLike = BrowserWindowLike,
> extends ElectronTRPCDestroyable {
  addWindow(window: TWindow): void;
  removeWindow(window: TWindow): void;
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
): ElectronTRPCMainHandler<TWindow>;
export function createElectronTRPCMain<
  TRegistry extends ElectronTRPCRegistry,
  TWindow extends BrowserWindowLike = BrowserWindowLike,
>(
  opts: CreateElectronTRPCMainOptions<TRegistry, TWindow>,
): ElectronTRPCMainHandler<TWindow>;
export function createElectronTRPCMain<
  TRegistry extends ElectronTRPCRegistry,
  TWindow extends BrowserWindowLike = BrowserWindowLike,
>(
  opts:
    | CreateElectronTRPCMainSingleOptions<AnyRouter, TWindow>
    | CreateElectronTRPCMainOptions<TRegistry, TWindow>,
): ElectronTRPCMainHandler<TWindow> {
  const broker = createPortBroker();
  let destroyed = false;
  const registrations = new Map<TWindow, () => void>();

  function buildHandlers(window: TWindow): Map<string, PortHandler> {
    const handlers = new Map<string, PortHandler>();

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
      return handlers;
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

    return handlers;
  }

  function registerWindow(window: TWindow): void {
    if (registrations.has(window)) {
      return;
    }

    const handlers = new Map<string, PortHandler>();

    function destroyWindowHandlers(): void {
      for (const handler of handlers.values()) {
        handler.destroy();
      }
      handlers.clear();
    }

    function connectWindow(): void {
      if (destroyed) {
        return;
      }

      destroyWindowHandlers();
      for (const [key, handler] of buildHandlers(window)) {
        handlers.set(key, handler);
      }
    }

    window.webContents.on('did-finish-load', connectWindow);
    window.on('closed', destroyWindowHandlers);
    registrations.set(window, () => {
      window.webContents.off('did-finish-load', connectWindow);
      window.off('closed', destroyWindowHandlers);
      destroyWindowHandlers();
    });

    if (hasFinishedLoading(window.webContents)) {
      connectWindow();
    }
  }

  function unregisterWindow(window: TWindow): void {
    const cleanup = registrations.get(window);
    if (!cleanup) {
      return;
    }
    registrations.delete(window);
    cleanup();
  }

  for (const window of opts.windows) {
    registerWindow(window);
  }

  return {
    addWindow(window) {
      if (destroyed) {
        return;
      }
      registerWindow(window);
    },
    removeWindow(window) {
      unregisterWindow(window);
    },
    destroy() {
      if (destroyed) {
        return;
      }
      destroyed = true;
      for (const window of [...registrations.keys()]) {
        unregisterWindow(window);
      }
    },
  };
}

export interface ElectronTRPCUtilityClient<
  TChannel extends ElectronTRPCChannel,
> {
  client: TRPCClient<RouterForChannel<TChannel>>;
  destroy(): void;
}

export interface CreateElectronTRPCUtilityClientOptions<
  TChannel extends ElectronTRPCChannel,
> {
  channel: TChannel;
  utility: UtilityProcessLike;
  transformer?: DataTransformerOptions;
}

function connectUtility<TChannel extends ElectronTRPCChannel>(opts: {
  channel: TChannel;
  utility: UtilityProcessLike;
  transformer?: DataTransformerOptions;
}): ElectronTRPCUtilityClient<TChannel> {
  const { port1, port2 } = new MessageChannelMain();
  const utility = opts.utility;
  let connected = false;
  let destroyed = false;

  function postConnect(): void {
    if (connected) {
      return;
    }
    connected = true;
    utility.postMessage({ type: 'connect', channel: opts.channel.name }, [
      port1,
    ]);
  }

  function onMessage(message: unknown): void {
    if (
      !!message &&
      typeof message === 'object' &&
      (message as { type?: unknown }).type === 'ready'
    ) {
      postConnect();
    }
  }

  function destroy(): void {
    if (destroyed) {
      return;
    }
    destroyed = true;
    utility.off?.('message', onMessage);
    utility.off?.('exit', destroy);
    (port2 as unknown as MainPortLike).close();
  }

  utility.on?.('message', onMessage);
  utility.on?.('exit', destroy);

  const client = createTRPCClient<RouterForChannel<TChannel>>({
    links: [mainPortLink({ port: port2, transformer: opts.transformer })],
  });

  return { client, destroy };
}

export function createElectronTRPCUtilityClient<
  TChannel extends ElectronTRPCChannel,
>(
  opts: CreateElectronTRPCUtilityClientOptions<TChannel>,
): ElectronTRPCUtilityClient<TChannel> {
  return connectUtility({
    channel: opts.channel,
    utility: opts.utility,
    transformer: opts.transformer,
  });
}

export interface ElectronTRPCUtilityPool<
  TInstance extends string,
  TChannel extends ElectronTRPCChannel,
> {
  get(instance: TInstance): TRPCClient<RouterForChannel<TChannel>>;
  destroy(): void;
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
  const entries = new Map<TInstance, ElectronTRPCUtilityClient<TChannel>>();

  for (const instance of Object.keys(opts.utilities) as TInstance[]) {
    entries.set(
      instance,
      connectUtility({
        channel: opts.channel,
        utility: opts.utilities[instance],
        transformer: opts.transformer,
      }),
    );
  }

  return {
    get(instance) {
      const entry = entries.get(instance);
      if (!entry) {
        throw new Error(`Unknown utility instance: ${instance}`);
      }
      return entry.client;
    },
    destroy() {
      for (const entry of entries.values()) {
        entry.destroy();
      }
      entries.clear();
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
): ElectronTRPCDestroyable {
  const broker = createPortBroker();
  let destroyed = false;
  let utilityReady = false;
  let pendingServerPort: { close(): void } | null = null;

  function postConnect(serverPort: { close(): void }): void {
    opts.utility.postMessage({ type: 'connect', channel: opts.channel.name }, [
      serverPort,
    ]);
  }

  function connectWindow(): void {
    if (destroyed) {
      return;
    }

    const { serverPort } = broker.createRendererPort(opts.window.webContents, {
      channel: opts.channel.name,
    });
    // Wait for the utility's 'ready' signal before posting the connect port so
    // a fast renderer load cannot race ahead of the utility's listener and drop
    // the port (mirrors createElectronTRPCUtilityClient's handshake).
    if (utilityReady) {
      postConnect(serverPort);
      return;
    }
    // Drop a previously-buffered port (e.g. an earlier reload) to avoid a leak.
    pendingServerPort?.close();
    pendingServerPort = serverPort;
  }

  function onMessage(message: unknown): void {
    if (
      !!message &&
      typeof message === 'object' &&
      (message as { type?: unknown }).type === 'ready'
    ) {
      utilityReady = true;
      if (pendingServerPort) {
        const serverPort = pendingServerPort;
        pendingServerPort = null;
        postConnect(serverPort);
      }
    }
  }

  function destroy(): void {
    if (destroyed) {
      return;
    }
    destroyed = true;
    opts.window.webContents.off('did-finish-load', connectWindow);
    opts.window.off('closed', destroy);
    opts.utility.off?.('message', onMessage);
    opts.utility.off?.('exit', destroy);
    pendingServerPort?.close();
    pendingServerPort = null;
  }

  opts.utility.on?.('message', onMessage);
  opts.utility.on?.('exit', destroy);
  opts.window.webContents.on('did-finish-load', connectWindow);
  opts.window.on('closed', destroy);

  if (hasFinishedLoading(opts.window.webContents)) {
    connectWindow();
  }

  return { destroy };
}
