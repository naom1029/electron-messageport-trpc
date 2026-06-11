import { EventEmitter } from 'node:events';
import { createTRPCClient } from '@trpc/client';
import { initTRPC } from '@trpc/server';
import { describe, expect, it, vi } from 'vitest';
import { defineElectronTRPC } from '../../core/index';
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
}

class MockBrowserWindow extends EventEmitter {
  readonly webContents = new MockWebContents();
}

class MockUtilityProcess {
  readonly postMessage = vi.fn();
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

const channels = defineElectronTRPC<{
  main: AppRouter;
  worker: WorkerRouter;
}>();

function getTransferredPort(window: MockBrowserWindow, index: number) {
  return window.webContents.postMessage.mock.calls[index][2][0] as
    | MockMessagePortMain
    | undefined;
}

describe('electronTRPC main API', () => {
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
    await expect(
      workerClient.render.mutate({ name: 'frame' }),
    ).resolves.toBe('rendered:frame');
  });

  it('creates a typed main-to-utility client over MessageChannelMain', async () => {
    // Arrange
    const utility = new MockUtilityProcess();
    const client = createElectronTRPCUtilityClient({
      channel: channels.worker,
      utility,
    });

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

    // Assert
    expect(window.webContents.postMessage.mock.calls[0][1]).toEqual({
      channel: 'worker',
    });
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
