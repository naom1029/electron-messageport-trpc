import { EventEmitter } from 'node:events';
import { createTRPCClient } from '@trpc/client';
import { initTRPC } from '@trpc/server';
import { describe, expect, it, vi } from 'vitest';
import { channel, defineElectronTRPC } from '../../core/index';
import { MockMessagePortMain } from '../../shared/__tests__/mockPort';
import { createPortHandler } from '../createPortHandler';
import {
  createElectronTRPCMain,
  createElectronTRPCRendererUtilityBridge,
  createElectronTRPCUtilityClient,
  createElectronTRPCUtilityPool,
} from '../electronTRPC';
import { mainPortLink } from '../mainPortLink';

vi.mock('electron', () => ({
  MessageChannelMain: class {
    port1: MockMessagePortMain;
    port2: MockMessagePortMain;

    constructor() {
      const [port1, port2] = MockMessagePortMain.createPair();
      this.port1 = port1;
      this.port2 = port2;
    }
  },
}));

class MockWebContents extends EventEmitter {
  readonly postMessage = vi.fn();
  isLoadingMainFrame = vi.fn(() => true);
  getURL = vi.fn(() => '');
}

class MockBrowserWindow extends EventEmitter {
  readonly webContents = new MockWebContents();
}

class MockUtilityProcess extends EventEmitter {
  readonly postMessage = vi.fn();

  signalReady() {
    this.emit('message', { type: 'ready' });
  }
}

const t = initTRPC.create();
const appRouter = t.router({
  ping: t.procedure.query(() => 'main'),
});
const workerRouter = t.router({
  render: t.procedure
    .input((input: unknown) => input as { name: string })
    .mutation(({ input }) => `rendered:${input.name}`),
});

type AppRouter = typeof appRouter;
type WorkerRouter = typeof workerRouter;

const channels = defineElectronTRPC({
  main: channel<AppRouter>(),
  worker: channel<WorkerRouter>(),
});

function getTransferredPort(window: MockBrowserWindow, index: number) {
  return window.webContents.postMessage.mock.calls[index][2][0] as
    | MockMessagePortMain
    | undefined;
}

describe('electronTRPC main API', () => {
  it('connects a single main router on the default channel without a registry', async () => {
    // Arrange
    const window = new MockBrowserWindow();

    createElectronTRPCMain({
      windows: [window],
      router: appRouter,
    });

    // Act
    window.webContents.emit('did-finish-load');

    // Assert
    expect(window.webContents.postMessage).toHaveBeenCalledTimes(1);
    expect(window.webContents.postMessage.mock.calls[0][1]).toEqual({
      channel: 'default',
    });

    const mainPort = getTransferredPort(window, 0);
    if (!mainPort) {
      throw new Error('Expected transferred port');
    }

    const mainClient = createTRPCClient<AppRouter>({
      links: [mainPortLink({ port: mainPort })],
    });

    await expect(mainClient.ping.query()).resolves.toBe('main');
  });

  it('connects each registered renderer channel with its matching router', async () => {
    // Arrange
    const window = new MockBrowserWindow();

    createElectronTRPCMain({
      channels,
      windows: [window],
      routers: {
        main: appRouter,
        worker: workerRouter,
      },
    });

    // Act
    window.webContents.emit('did-finish-load');

    // Assert
    expect(window.webContents.postMessage).toHaveBeenCalledTimes(2);
    expect(window.webContents.postMessage.mock.calls[0][1]).toEqual({
      channel: 'main',
    });
    expect(window.webContents.postMessage.mock.calls[1][1]).toEqual({
      channel: 'worker',
    });

    const mainPort = getTransferredPort(window, 0);
    const workerPort = getTransferredPort(window, 1);
    if (!mainPort || !workerPort) {
      throw new Error('Expected transferred ports');
    }

    const mainClient = createTRPCClient<AppRouter>({
      links: [mainPortLink({ port: mainPort })],
    });
    const workerClient = createTRPCClient<WorkerRouter>({
      links: [mainPortLink({ port: workerPort })],
    });

    await expect(mainClient.ping.query()).resolves.toBe('main');
    await expect(workerClient.render.mutate({ name: 'frame' })).resolves.toBe(
      'rendered:frame',
    );
  });

  it('creates a typed main-to-utility client over MessageChannelMain', async () => {
    // Arrange
    const utility = new MockUtilityProcess();
    const { client } = createElectronTRPCUtilityClient({
      channel: channels.worker,
      utility,
    });

    utility.signalReady();

    const transferredPort = utility.postMessage.mock.calls[0][1][0] as
      | MockMessagePortMain
      | undefined;
    if (!transferredPort) {
      throw new Error('Expected transferred utility port');
    }
    createPortHandler({
      port: transferredPort,
      router: workerRouter,
    });

    // Act / Assert
    expect(utility.postMessage.mock.calls[0][0]).toEqual({
      type: 'connect',
      channel: 'worker',
    });
    await expect(client.render.mutate({ name: 'job' })).resolves.toBe(
      'rendered:job',
    );
  });

  it('creates utility pool clients by runtime instance id', async () => {
    // Arrange
    const utilityA = new MockUtilityProcess();
    const utilityB = new MockUtilityProcess();

    const pool = createElectronTRPCUtilityPool({
      channel: channels.worker,
      utilities: {
        a: utilityA,
        b: utilityB,
      },
    });

    for (const utility of [utilityA, utilityB]) {
      utility.signalReady();
      const transferredPort = utility.postMessage.mock.calls[0][1][0] as
        | MockMessagePortMain
        | undefined;
      if (!transferredPort) {
        throw new Error('Expected transferred utility port');
      }
      createPortHandler({
        port: transferredPort,
        router: workerRouter,
      });
    }

    // Act / Assert
    await expect(pool.get('a').render.mutate({ name: 'a' })).resolves.toBe(
      'rendered:a',
    );
    await expect(pool.get('b').render.mutate({ name: 'b' })).resolves.toBe(
      'rendered:b',
    );
  });

  it('connects immediately when the window has already finished loading', () => {
    // Arrange - not loading AND a document is already loaded (non-empty URL).
    const window = new MockBrowserWindow();
    window.webContents.isLoadingMainFrame = vi.fn(() => false);
    window.webContents.getURL = vi.fn(() => 'app://index.html');

    // Act
    createElectronTRPCMain({
      channels,
      windows: [window],
      routers: { main: appRouter, worker: workerRouter },
    });

    // Assert
    expect(window.webContents.postMessage).toHaveBeenCalledTimes(2);
    expect(window.webContents.postMessage.mock.calls[0][1]).toEqual({
      channel: 'main',
    });
  });

  it('does NOT connect immediately for a fresh, never-loaded window (waits for did-finish-load)', () => {
    // Arrange - a brand-new window reports isLoadingMainFrame() === false but has
    // an empty URL; connecting now would race the upcoming did-finish-load and
    // hand the renderer a port whose server handler is then torn down.
    const window = new MockBrowserWindow();
    window.webContents.isLoadingMainFrame = vi.fn(() => false);
    window.webContents.getURL = vi.fn(() => '');

    // Act
    createElectronTRPCMain({
      channels,
      windows: [window],
      routers: { main: appRouter, worker: workerRouter },
    });

    // Assert - no premature delivery; the single delivery happens on load.
    expect(window.webContents.postMessage).not.toHaveBeenCalled();

    window.webContents.emit('did-finish-load');

    expect(window.webContents.postMessage).toHaveBeenCalledTimes(2);
  });

  it('wires a window added after construction via addWindow', () => {
    // Arrange
    const initialWindow = new MockBrowserWindow();
    const handler = createElectronTRPCMain({
      windows: [initialWindow],
      router: appRouter,
    });
    const lateWindow = new MockBrowserWindow();

    // Act
    handler.addWindow(lateWindow);
    lateWindow.webContents.emit('did-finish-load');

    // Assert
    expect(lateWindow.webContents.postMessage).toHaveBeenCalledTimes(1);
    expect(lateWindow.webContents.postMessage.mock.calls[0][1]).toEqual({
      channel: 'default',
    });
  });

  it('stops servicing a window after removeWindow tears it down', () => {
    // Arrange
    const window = new MockBrowserWindow();
    const handler = createElectronTRPCMain({
      windows: [window],
      router: appRouter,
    });

    // Act
    handler.removeWindow(window);
    window.webContents.emit('did-finish-load');

    // Assert
    expect(window.webContents.postMessage).not.toHaveBeenCalled();
  });

  it('does not post connect to a utility before its ready signal', () => {
    // Arrange
    const utility = new MockUtilityProcess();

    // Act
    createElectronTRPCUtilityClient({
      channel: channels.worker,
      utility,
    });

    // Assert
    expect(utility.postMessage).not.toHaveBeenCalled();
  });

  it('closes the kept main port when the utility client is destroyed', async () => {
    // Arrange
    const utility = new MockUtilityProcess();
    const { destroy } = createElectronTRPCUtilityClient({
      channel: channels.worker,
      utility,
    });
    utility.signalReady();
    const transferredPort = utility.postMessage.mock.calls[0][1][0] as
      | MockMessagePortMain
      | undefined;
    if (!transferredPort) {
      throw new Error('Expected transferred utility port');
    }
    // The kept MainPortLike is port2; closing it emits 'close' on its peer
    // (the transferred port1), which is the observable lifecycle effect.
    const closed = new Promise<void>((resolve) => {
      transferredPort.on('close', () => resolve());
    });

    // Act
    destroy();

    // Assert: destroy removes the message/exit listeners and closes the port.
    expect(utility.listenerCount('message')).toBe(0);
    expect(utility.listenerCount('exit')).toBe(0);
    await expect(closed).resolves.toBeUndefined();
  });

  it('auto-destroys the utility client when the utility exits', () => {
    // Arrange
    const utility = new MockUtilityProcess();
    createElectronTRPCUtilityClient({
      channel: channels.worker,
      utility,
    });

    // Act
    utility.emit('exit');

    // Assert
    expect(utility.listenerCount('message')).toBe(0);
    expect(utility.listenerCount('exit')).toBe(0);
  });

  it('destroys every pooled utility instance via pool.destroy()', () => {
    // Arrange
    const utilityA = new MockUtilityProcess();
    const utilityB = new MockUtilityProcess();
    const pool = createElectronTRPCUtilityPool({
      channel: channels.worker,
      utilities: { a: utilityA, b: utilityB },
    });

    // Act
    pool.destroy();

    // Assert
    for (const utility of [utilityA, utilityB]) {
      expect(utility.listenerCount('message')).toBe(0);
      expect(utility.listenerCount('exit')).toBe(0);
    }
    expect(() => pool.get('a')).toThrow('Unknown utility instance: a');
  });

  it('brokers a renderer port to a utility process for renderer-to-utility', () => {
    // Arrange
    const window = new MockBrowserWindow();
    const utility = new MockUtilityProcess();

    createElectronTRPCRendererUtilityBridge({
      window,
      channel: channels.worker,
      utility,
    });

    // Act
    window.webContents.emit('did-finish-load');

    // Assert - the renderer port is posted immediately, but the utility connect
    // is buffered until the utility signals readiness (handshake parity).
    expect(window.webContents.postMessage.mock.calls[0][1]).toEqual({
      channel: 'worker',
    });
    expect(utility.postMessage).not.toHaveBeenCalled();

    utility.signalReady();

    expect(utility.postMessage.mock.calls[0][0]).toEqual({
      type: 'connect',
      channel: 'worker',
    });
    expect(utility.postMessage.mock.calls[0][1][0]).toBeDefined();
    expect(utility.postMessage.mock.calls[0][1][0]).not.toBe(
      getTransferredPort(window, 0),
    );
  });
});
