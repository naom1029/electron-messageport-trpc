import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PORT_INIT_CHANNEL } from '../../shared/constants';

const electronMocks = vi.hoisted(() => {
  const on = vi.fn();
  const exposeInMainWorld = vi.fn();

  return {
    ipcRenderer: { on },
    contextBridge: { exposeInMainWorld },
  };
});

vi.mock('electron', () => electronMocks);

describe('exposePortReceiver', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    electronMocks.ipcRenderer.on.mockReset();
    electronMocks.contextBridge.exposeInMainWorld.mockReset();
  });

  it('forwards a pending port once the renderer asks for it', async () => {
    const postMessage = vi.fn();
    vi.stubGlobal('window', { postMessage });
    const { exposePortReceiver } = await import('../exposePortReceiver');
    const { port1, port2 } = new MessageChannel();

    exposePortReceiver();
    const handler = electronMocks.ipcRenderer.on.mock.calls[0][1] as (event: {
      ports: MessagePort[];
    }) => void;
    const bridge = electronMocks.contextBridge.exposeInMainWorld.mock
      .calls[0][1] as { requestPort(channel?: string): void } | undefined;

    handler({ ports: [port1] });
    expect(postMessage).not.toHaveBeenCalled();

    bridge?.requestPort();

    expect(postMessage).toHaveBeenCalledOnce();
    expect(postMessage.mock.calls[0][0]).toEqual({
      channel: PORT_INIT_CHANNEL,
      trpcChannel: 'default',
    });
    expect(postMessage.mock.calls[0][1]).toBe('*');
    expect(postMessage.mock.calls[0][2][0]).toBe(port1);
    port1.close();
    port2.close();
  });

  it('forwards a port immediately when the renderer already requested one', async () => {
    const postMessage = vi.fn();
    vi.stubGlobal('window', { postMessage });
    const { exposePortReceiver } = await import('../exposePortReceiver');
    const { port1, port2 } = new MessageChannel();

    exposePortReceiver();
    const handler = electronMocks.ipcRenderer.on.mock.calls[0][1] as (event: {
      ports: MessagePort[];
    }) => void;
    const bridge = electronMocks.contextBridge.exposeInMainWorld.mock
      .calls[0][1] as { requestPort(channel?: string): void } | undefined;

    bridge?.requestPort();
    handler({ ports: [port1] });

    expect(postMessage).toHaveBeenCalledOnce();
    expect(postMessage.mock.calls[0][0]).toEqual({
      channel: PORT_INIT_CHANNEL,
      trpcChannel: 'default',
    });
    expect(postMessage.mock.calls[0][1]).toBe('*');
    expect(postMessage.mock.calls[0][2][0]).toBe(port1);
    port1.close();
    port2.close();
  });

  it('keeps pending ports separate by channel', async () => {
    const postMessage = vi.fn();
    vi.stubGlobal('window', { postMessage });
    const { exposePortReceiver } = await import('../exposePortReceiver');
    const { port1: mainPort, port2: mainPeer } = new MessageChannel();
    const { port1: utilityPort, port2: utilityPeer } = new MessageChannel();

    exposePortReceiver();
    const handler = electronMocks.ipcRenderer.on.mock.calls[0][1] as (
      event: { ports: MessagePort[] },
      message?: { channel?: string },
    ) => void;
    const bridge = electronMocks.contextBridge.exposeInMainWorld.mock
      .calls[0][1] as { requestPort(channel?: string): void } | undefined;

    handler({ ports: [mainPort] }, { channel: 'main' });
    handler({ ports: [utilityPort] }, { channel: 'utility' });

    bridge?.requestPort('utility');

    expect(postMessage).toHaveBeenCalledOnce();
    expect(postMessage.mock.calls[0][0]).toEqual({
      channel: PORT_INIT_CHANNEL,
      trpcChannel: 'utility',
    });
    expect(postMessage.mock.calls[0][1]).toBe('*');
    expect(postMessage.mock.calls[0][2][0]).toBe(utilityPort);

    bridge?.requestPort('main');

    expect(postMessage).toHaveBeenCalledTimes(2);
    expect(postMessage.mock.calls[1][0]).toEqual({
      channel: PORT_INIT_CHANNEL,
      trpcChannel: 'main',
    });
    expect(postMessage.mock.calls[1][1]).toBe('*');
    expect(postMessage.mock.calls[1][2][0]).toBe(mainPort);

    mainPort.close();
    mainPeer.close();
    utilityPort.close();
    utilityPeer.close();
  });

  it('services every channel when no allowlist is configured', async () => {
    const postMessage = vi.fn();
    vi.stubGlobal('window', { postMessage });
    const { exposePortReceiver } = await import('../exposePortReceiver');
    const { port1, port2 } = new MessageChannel();

    exposePortReceiver();
    const handler = electronMocks.ipcRenderer.on.mock.calls[0][1] as (
      event: { ports: MessagePort[] },
      message?: { channel?: string },
    ) => void;
    const bridge = electronMocks.contextBridge.exposeInMainWorld.mock
      .calls[0][1] as { requestPort(channel?: string): void } | undefined;

    handler({ ports: [port1] }, { channel: 'arbitrary' });
    bridge?.requestPort('arbitrary');

    expect(postMessage).toHaveBeenCalledOnce();
    expect(postMessage.mock.calls[0][0]).toEqual({
      channel: PORT_INIT_CHANNEL,
      trpcChannel: 'arbitrary',
    });
    expect(postMessage.mock.calls[0][2][0]).toBe(port1);
    port1.close();
    port2.close();
  });

  it('treats an empty allowlist the same as omitting it (services every channel)', async () => {
    const postMessage = vi.fn();
    vi.stubGlobal('window', { postMessage });
    const { exposePortReceiver } = await import('../exposePortReceiver');
    const { port1, port2 } = new MessageChannel();

    exposePortReceiver({ channels: [] });
    const handler = electronMocks.ipcRenderer.on.mock.calls[0][1] as (
      event: { ports: MessagePort[] },
      message?: { channel?: string },
    ) => void;
    const bridge = electronMocks.contextBridge.exposeInMainWorld.mock
      .calls[0][1] as { requestPort(channel?: string): void } | undefined;

    handler({ ports: [port1] }, { channel: 'arbitrary' });
    bridge?.requestPort('arbitrary');

    expect(postMessage).toHaveBeenCalledOnce();
    expect(postMessage.mock.calls[0][0]).toEqual({
      channel: PORT_INIT_CHANNEL,
      trpcChannel: 'arbitrary',
    });
    expect(postMessage.mock.calls[0][2][0]).toBe(port1);
    port1.close();
    port2.close();
  });

  it('restricts to the declared channels when handed a defineElectronTRPC registry', async () => {
    const postMessage = vi.fn();
    vi.stubGlobal('window', { postMessage });
    const { exposeElectronTRPC } = await import('../exposePortReceiver');
    const { channel, defineElectronTRPC } = await import('../../core/index');
    const { port1, port2 } = new MessageChannel();
    const registry = defineElectronTRPC({
      main: channel(),
      utility: channel(),
    });

    // A registry now carries its declared channel names at runtime, so passing
    // one restricts the preload to exactly those names.
    exposeElectronTRPC(registry);
    const handler = electronMocks.ipcRenderer.on.mock.calls[0][1] as (
      event: { ports: MessagePort[] },
      message?: { channel?: string },
    ) => void;
    const bridge = electronMocks.contextBridge.exposeInMainWorld.mock
      .calls[0][1] as { requestPort(channel?: string): void } | undefined;

    handler({ ports: [port1] }, { channel: 'utility' });
    bridge?.requestPort('utility');

    expect(postMessage).toHaveBeenCalledOnce();
    expect(postMessage.mock.calls[0][0]).toEqual({
      channel: PORT_INIT_CHANNEL,
      trpcChannel: 'utility',
    });
    expect(postMessage.mock.calls[0][2][0]).toBe(port1);
    port1.close();
    port2.close();
  });

  it('ignores undeclared channels when handed a defineElectronTRPC registry', async () => {
    const postMessage = vi.fn();
    vi.stubGlobal('window', { postMessage });
    const { exposeElectronTRPC } = await import('../exposePortReceiver');
    const { channel, defineElectronTRPC } = await import('../../core/index');
    const { port1, port2 } = new MessageChannel();
    const registry = defineElectronTRPC({
      main: channel(),
    });

    exposeElectronTRPC(registry);
    const handler = electronMocks.ipcRenderer.on.mock.calls[0][1] as (
      event: { ports: MessagePort[] },
      message?: { channel?: string },
    ) => void;
    const bridge = electronMocks.contextBridge.exposeInMainWorld.mock
      .calls[0][1] as { requestPort(channel?: string): void } | undefined;

    handler({ ports: [port1] }, { channel: 'utility' });
    bridge?.requestPort('utility');

    expect(postMessage).not.toHaveBeenCalled();
    port1.close();
    port2.close();
  });

  it('ignores out-of-list channels but services allowlisted ones', async () => {
    const postMessage = vi.fn();
    vi.stubGlobal('window', { postMessage });
    const { exposePortReceiver } = await import('../exposePortReceiver');
    const { port1: allowedPort, port2: allowedPeer } = new MessageChannel();
    const { port1: blockedPort, port2: blockedPeer } = new MessageChannel();

    exposePortReceiver({ channels: ['allowed'] });
    const handler = electronMocks.ipcRenderer.on.mock.calls[0][1] as (
      event: { ports: MessagePort[] },
      message?: { channel?: string },
    ) => void;
    const bridge = electronMocks.contextBridge.exposeInMainWorld.mock
      .calls[0][1] as { requestPort(channel?: string): void } | undefined;

    handler({ ports: [blockedPort] }, { channel: 'blocked' });
    handler({ ports: [allowedPort] }, { channel: 'allowed' });
    bridge?.requestPort('blocked');
    bridge?.requestPort('allowed');

    expect(postMessage).toHaveBeenCalledOnce();
    expect(postMessage.mock.calls[0][0]).toEqual({
      channel: PORT_INIT_CHANNEL,
      trpcChannel: 'allowed',
    });
    expect(postMessage.mock.calls[0][2][0]).toBe(allowedPort);
    allowedPort.close();
    allowedPeer.close();
    blockedPort.close();
    blockedPeer.close();
  });

  it('drops a request for an out-of-list channel even when its port later arrives', async () => {
    const postMessage = vi.fn();
    vi.stubGlobal('window', { postMessage });
    const { exposePortReceiver } = await import('../exposePortReceiver');
    const { port1, port2 } = new MessageChannel();

    exposePortReceiver({ channels: ['allowed'] });
    const handler = electronMocks.ipcRenderer.on.mock.calls[0][1] as (
      event: { ports: MessagePort[] },
      message?: { channel?: string },
    ) => void;
    const bridge = electronMocks.contextBridge.exposeInMainWorld.mock
      .calls[0][1] as { requestPort(channel?: string): void } | undefined;

    // Request first (guarded by requestPort), then deliver the port: the
    // request must have been dropped, so the arriving port is never forwarded.
    bridge?.requestPort('blocked');
    handler({ ports: [port1] }, { channel: 'blocked' });

    expect(postMessage).not.toHaveBeenCalled();
    port1.close();
    port2.close();
  });
});
