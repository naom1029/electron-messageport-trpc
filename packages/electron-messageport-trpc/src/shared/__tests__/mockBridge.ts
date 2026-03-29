import { MockMessagePortMain } from './mockPort';
import { MockRendererPort } from './mockRendererPort';

/**
 * Creates a bridged pair: one MockMessagePortMain (for server/main)
 * and one MockRendererPort (for client/renderer).
 * Messages sent on one side are received on the other.
 */
export function createBridgedPair(): {
  serverPort: MockMessagePortMain;
  clientPort: MockRendererPort;
} {
  const serverPort = new MockMessagePortMain();
  const clientPort = new MockRendererPort();

  // server → client
  serverPort.on('__outgoing', (data: unknown) => {
    queueMicrotask(() => {
      clientPort.dispatchEvent(new MessageEvent('message', { data }));
    });
  });

  // client → server
  clientPort.addEventListener('__outgoing', ((event: CustomEvent) => {
    queueMicrotask(() => {
      serverPort.emit('message', { data: event.detail, ports: [] });
    });
  }) as EventListener);

  // Override postMessage to route through bridge
  const origServerPost = serverPort.postMessage.bind(serverPort);
  serverPort.postMessage = (data: unknown) => {
    const cloned = structuredClone(data);
    serverPort.emit('__outgoing', cloned);
  };

  const origClientPost = clientPort.postMessage.bind(clientPort);
  clientPort.postMessage = (data: unknown) => {
    const cloned = structuredClone(data);
    clientPort.dispatchEvent(new CustomEvent('__outgoing', { detail: cloned }));
  };

  // Auto-start both sides
  serverPort.start();
  clientPort.start();

  return { serverPort, clientPort };
}
