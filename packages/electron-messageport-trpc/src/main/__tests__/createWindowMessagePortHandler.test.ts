import { EventEmitter } from 'node:events';
import { initTRPC } from '@trpc/server';
import { describe, expect, it, vi } from 'vitest';
import { MockMessagePortMain } from '../../shared/__tests__/mockPort';

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

import { createWindowMessagePortHandler } from '../createWindowMessagePortHandler';

class MockWebContents extends EventEmitter {
  readonly postMessage = vi.fn();
  isLoadingMainFrame = vi.fn(() => true);
}

class MockBrowserWindow extends EventEmitter {
  readonly webContents = new MockWebContents();
}

function waitForPortMessage(window: MockBrowserWindow) {
  const call = window.webContents.postMessage.mock.calls.at(-1);
  if (!call) {
    throw new Error('Expected postMessage to be called');
  }

  return call[2][0] as MockMessagePortMain;
}

const t = initTRPC.create();
const router = t.router({
  greet: t.procedure.query(() => 'hello'),
});

describe('createWindowMessagePortHandler', () => {
  it('sends a renderer port when the window finishes loading', () => {
    const window = new MockBrowserWindow();

    createWindowMessagePortHandler({
      router,
      windows: [window],
    });

    window.webContents.emit('did-finish-load');

    expect(window.webContents.postMessage).toHaveBeenCalledOnce();
  });

  it('reconnects the window after a renderer reload', async () => {
    const window = new MockBrowserWindow();

    createWindowMessagePortHandler({
      router,
      windows: [window],
    });

    window.webContents.emit('did-finish-load');
    const firstPort = waitForPortMessage(window);
    const handleClose = vi.fn();
    firstPort.on('close', handleClose);

    window.webContents.emit('did-finish-load');
    const secondPort = waitForPortMessage(window);
    await Promise.resolve();

    expect(window.webContents.postMessage).toHaveBeenCalledTimes(2);
    expect(handleClose).toHaveBeenCalledOnce();
    expect(secondPort.closed).toBe(false);
  });

  it('creates request context from the matching window', async () => {
    const window = new MockBrowserWindow();
    const createContext = vi.fn(async () => ({ source: 'window-1' }));
    const contextRouter = t.router({
      contextSource: t.procedure.query(
        ({ ctx }) => (ctx as { source: string }).source,
      ),
    });

    createWindowMessagePortHandler({
      router: contextRouter,
      windows: [window],
      createContext: ({ window: currentWindow }) => {
        expect(currentWindow).toBe(window);
        return createContext();
      },
    });

    window.webContents.emit('did-finish-load');
    const rendererPort = waitForPortMessage(window);

    rendererPort.start();

    const responsePromise = new Promise<unknown>((resolve) => {
      rendererPort.on('message', (event) => resolve(event.data));
    });

    rendererPort.postMessage({
      kind: 'request',
      id: 1,
      method: 'query',
      path: 'contextSource',
      input: undefined,
    });

    const response = await responsePromise;

    expect(createContext).toHaveBeenCalledOnce();
    expect(response).toEqual({
      kind: 'result',
      id: 1,
      type: 'data',
      data: 'window-1',
    });
  });

  it('stops reconnecting after the handler is destroyed', () => {
    const window = new MockBrowserWindow();
    const handler = createWindowMessagePortHandler({
      router,
      windows: [window],
    });

    handler.destroy();
    window.webContents.emit('did-finish-load');

    expect(window.webContents.postMessage).not.toHaveBeenCalled();
  });

  it('allows destroy() to be called more than once', () => {
    const window = new MockBrowserWindow();
    const handler = createWindowMessagePortHandler({
      router,
      windows: [window],
    });

    handler.destroy();
    handler.destroy();
    window.webContents.emit('did-finish-load');

    expect(window.webContents.postMessage).not.toHaveBeenCalled();
  });
});
