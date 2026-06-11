import { initTRPC } from '@trpc/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defineElectronTRPC, isElectronTRPCChannels } from '../../core/index';
import { createPortHandler } from '../../main/createPortHandler';
import { createBridgedPair } from '../../shared/__tests__/mockBridge';
import { PORT_INIT_CHANNEL } from '../../shared/constants';
import { createElectronTRPCClient } from '../createElectronTRPCClient';

const t = initTRPC.create();
const workerRouter = t.router({
  ping: t.procedure.query(() => 'worker'),
});

type WorkerRouter = typeof workerRouter;

function createWindowWithBridge() {
  const target = new EventTarget();

  return Object.assign(target, {
    electronTRPCPort: {
      requestPort: vi.fn(),
    },
  });
}

describe('createElectronTRPCClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('creates a typed client on the default channel without a registry', async () => {
    // Arrange
    const router = t.router({
      ping: t.procedure.query(() => ({ ok: true })),
    });
    const { serverPort, clientPort } = createBridgedPair();
    createPortHandler({ port: serverPort, router });

    const windowMock = createWindowWithBridge();
    vi.stubGlobal('window', windowMock);

    // Act
    const client = createElectronTRPCClient<typeof router>();
    const resultPromise = client.ping.query();
    const event = new Event('message') as MessageEvent;
    Object.defineProperties(event, {
      data: { value: { channel: PORT_INIT_CHANNEL } },
      ports: { value: [clientPort] },
    });
    windowMock.dispatchEvent(event);

    // Assert
    await expect(resultPromise).resolves.toEqual({ ok: true });
    expect(windowMock.electronTRPCPort.requestPort).toHaveBeenCalledWith(
      'default',
    );
  });

  it('treats registries without a main key as multi-channel clients', () => {
    // Arrange
    const channels = defineElectronTRPC<{
      worker: WorkerRouter;
    }>();
    vi.stubGlobal('window', {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      electronTRPCPort: {
        requestPort: vi.fn(),
      },
    });

    // Act
    const client = createElectronTRPCClient(channels);

    // Assert
    expect(isElectronTRPCChannels(channels)).toBe(true);
    expect(client.worker).toBe(client.worker);
  });
});
