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
});
