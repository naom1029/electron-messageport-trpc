import { describe, expect, it, vi } from 'vitest';
import { MockMessagePortMain } from '../../shared/__tests__/mockPort';

vi.mock('electron', () => ({
  MessageChannelMain: class {
    port1: MockMessagePortMain;
    port2: MockMessagePortMain;
    constructor() {
      const [p1, p2] = MockMessagePortMain.createPair();
      this.port1 = p1;
      this.port2 = p2;
    }
  },
}));

import type { WebContentsLike } from '../portBroker';
import { createPortBroker } from '../portBroker';

function createMockWebContents(): WebContentsLike & {
  postMessage: ReturnType<typeof vi.fn>;
} {
  return {
    postMessage: vi.fn(),
  };
}

describe('portBroker', () => {
  it('should create a port pair and send one to webContents', () => {
    // Arrange
    const broker = createPortBroker();
    const webContents = createMockWebContents();

    // Act
    const result = broker.createRendererPort(webContents);

    // Assert
    expect(webContents.postMessage).toHaveBeenCalledOnce();
    expect(webContents.postMessage).toHaveBeenCalledWith(
      expect.any(String),
      null,
      expect.arrayContaining([expect.any(Object)]),
    );
    expect(result.serverPort).toBeDefined();
  });

  it('should return a serverPort that can be used with createPortHandler', () => {
    // Arrange
    const broker = createPortBroker();
    const webContents = createMockWebContents();

    // Act
    const { serverPort } = broker.createRendererPort(webContents);

    // Assert
    expect(typeof serverPort.on).toBe('function');
    expect(typeof serverPort.postMessage).toBe('function');
    expect(typeof serverPort.start).toBe('function');
    expect(typeof serverPort.close).toBe('function');
  });

  it('should use the correct channel name', () => {
    // Arrange
    const broker = createPortBroker();
    const webContents = createMockWebContents();

    // Act
    broker.createRendererPort(webContents);

    // Assert
    const channel = webContents.postMessage.mock.calls[0][0];
    expect(channel).toBe('electron-messageport-trpc:init');
  });
});
