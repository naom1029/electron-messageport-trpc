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

  it('keeps port promises separate by channel', async () => {
    const windowMock = createWindowWithBridge();
    vi.stubGlobal('window', windowMock);
    const { getPort } = await loadReceivePortModule();
    const { port1: mainPort, port2: mainPeer } = new MessageChannel();
    const { port1: utilityPort, port2: utilityPeer } = new MessageChannel();

    const mainPromise = getPort({ channel: 'main' });
    const utilityPromise = getPort({ channel: 'utility' });

    windowMock.dispatchEvent(
      new MessageEvent('message', {
        data: { channel: PORT_INIT_CHANNEL, trpcChannel: 'utility' },
        ports: [utilityPort],
      }),
    );
    windowMock.dispatchEvent(
      new MessageEvent('message', {
        data: { channel: PORT_INIT_CHANNEL, trpcChannel: 'main' },
        ports: [mainPort],
      }),
    );

    await expect(mainPromise).resolves.toBe(mainPort);
    await expect(utilityPromise).resolves.toBe(utilityPort);
    expect(windowMock.electronTRPCPort.requestPort).toHaveBeenCalledWith(
      'main',
    );
    expect(windowMock.electronTRPCPort.requestPort).toHaveBeenCalledWith(
      'utility',
    );

    mainPort.close();
    mainPeer.close();
    utilityPort.close();
    utilityPeer.close();
  });

  it('rejects when the preload bridge is unavailable', async () => {
    vi.stubGlobal('window', new EventTarget());
    const { getPort } = await loadReceivePortModule();

    const portPromise = getPort();

    await expect(portPromise).rejects.toThrow('electronTRPCPort not found');
  });

  it('rejects after the timeout elapses with an actionable message naming the channel', async () => {
    vi.useFakeTimers();
    const windowMock = createWindowWithBridge();
    vi.stubGlobal('window', windowMock);
    const { getPort } = await loadReceivePortModule();

    const portPromise = getPort({ channel: 'worker', timeoutMs: 5000 });
    const assertion = expect(portPromise).rejects.toThrow(
      'No port received for channel "worker" within 5000ms',
    );
    await vi.advanceTimersByTimeAsync(5000);
    await assertion;

    vi.useRealTimers();
  });

  it('drops the cached promise on rejection so a later getPort retries', async () => {
    vi.useFakeTimers();
    const windowMock = createWindowWithBridge();
    vi.stubGlobal('window', windowMock);
    const { getPort } = await loadReceivePortModule();
    const { port1, port2 } = new MessageChannel();

    const firstPromise = getPort({ channel: 'main', timeoutMs: 1000 });
    await vi.advanceTimersByTimeAsync(1000);
    await expect(firstPromise).rejects.toThrow('No port received');

    // Act: a fresh request must NOT return the rejected cached promise.
    const secondPromise = getPort({ channel: 'main', timeoutMs: 1000 });
    windowMock.dispatchEvent(
      new MessageEvent('message', {
        data: { channel: PORT_INIT_CHANNEL, trpcChannel: 'main' },
        ports: [port1],
      }),
    );

    // Assert
    expect(secondPromise).not.toBe(firstPromise);
    await expect(secondPromise).resolves.toBe(port1);
    expect(windowMock.electronTRPCPort.requestPort).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
    port1.close();
    port2.close();
  });
});
