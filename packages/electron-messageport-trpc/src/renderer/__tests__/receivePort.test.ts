import { afterEach, describe, expect, it, vi } from 'vitest';
import { PORT_INIT_CHANNEL } from '../../shared/constants';

function createWindowWithBridge() {
  const target = new EventTarget();

  return Object.assign(target, {
    electronTRPCPort: {
      requestPort: vi.fn(),
    },
  });
}

async function loadReceivePortModule() {
  vi.resetModules();
  return import('../receivePort');
}

describe('getPort', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('resolves with the transferred port after requesting it from the preload bridge', async () => {
    const windowMock = createWindowWithBridge();
    vi.stubGlobal('window', windowMock);
    const { getPort } = await loadReceivePortModule();
    const { port1, port2 } = new MessageChannel();

    const portPromise = getPort();
    windowMock.dispatchEvent(
      new MessageEvent('message', {
        data: { channel: PORT_INIT_CHANNEL },
        ports: [port1],
      }),
    );
    const receivedPort = await portPromise;

    expect(receivedPort).toBe(port1);
    expect(windowMock.electronTRPCPort.requestPort).toHaveBeenCalledOnce();
    port1.close();
    port2.close();
  });

  it('ignores unrelated window messages and keeps waiting for the transferred port', async () => {
    const windowMock = createWindowWithBridge();
    vi.stubGlobal('window', windowMock);
    const { getPort } = await loadReceivePortModule();
    const { port1, port2 } = new MessageChannel();

    const portPromise = getPort();
    let resolved = false;
    portPromise.then(() => {
      resolved = true;
    });

    windowMock.dispatchEvent(
      new MessageEvent('message', {
        data: { channel: 'different-channel' },
        ports: [port1],
      }),
    );
    await Promise.resolve();
    expect(resolved).toBe(false);

    windowMock.dispatchEvent(
      new MessageEvent('message', {
        data: { channel: PORT_INIT_CHANNEL },
        ports: [port1],
      }),
    );
    const receivedPort = await portPromise;

    expect(receivedPort).toBe(port1);
    expect(windowMock.electronTRPCPort.requestPort).toHaveBeenCalledOnce();
    port1.close();
    port2.close();
  });

  it('returns the same promise for repeated calls before the port arrives', async () => {
    const windowMock = createWindowWithBridge();
    vi.stubGlobal('window', windowMock);
    const { getPort } = await loadReceivePortModule();
    const { port1, port2 } = new MessageChannel();

    const firstPromise = getPort();
    const secondPromise = getPort();
    windowMock.dispatchEvent(
      new MessageEvent('message', {
        data: { channel: PORT_INIT_CHANNEL },
        ports: [port1],
      }),
    );
    const [firstPort, secondPort] = await Promise.all([
      firstPromise,
      secondPromise,
    ]);

    expect(firstPromise).toBe(secondPromise);
    expect(firstPort).toBe(port1);
    expect(secondPort).toBe(port1);
    expect(windowMock.electronTRPCPort.requestPort).toHaveBeenCalledOnce();
    port1.close();
    port2.close();
  });

  it('throws when the preload bridge is unavailable', async () => {
    vi.stubGlobal('window', new EventTarget());
    const { getPort } = await loadReceivePortModule();

    const act = () => getPort();

    expect(act).toThrow('electronTRPCPort not found');
  });
});
