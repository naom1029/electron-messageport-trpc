import { EventEmitter } from 'node:events';
import { createTRPCClient } from '@trpc/client';
import { initTRPC } from '@trpc/server';
import { describe, expect, it, vi } from 'vitest';
import { portLink } from '../../renderer/portLink';
import { MockMessagePortMain } from '../../shared/__tests__/mockPort';
import { MockRendererPort } from '../../shared/__tests__/mockRendererPort';
import type { ParentPortLike } from '../parentPortHandler';
import { createParentPortHandler } from '../parentPortHandler';

/**
 * Mock for Electron's parentPort in a utility process.
 * Implements the same EventEmitter interface as process.parentPort.
 */
class MockParentPort extends EventEmitter {
  postMessage = vi.fn();
}

function setupRouter() {
  const t = initTRPC.create();
  return t.router({
    ping: t.procedure.query(() => 'pong'),
    add: t.procedure
      .input((v: unknown) => v as { a: number; b: number })
      .query(({ input }) => input.a + input.b),
    count: t.procedure
      .input((v: unknown) => v as { to: number })
      .subscription(async function* ({ input }) {
        for (let i = 1; i <= input.to; i++) {
          yield { n: i };
        }
      }),
  });
}

type AppRouter = ReturnType<typeof setupRouter>;

const customTransformer = {
  input: {
    serialize: (value: unknown) => {
      if (
        value &&
        typeof value === 'object' &&
        'secret' in value &&
        typeof value.secret === 'string'
      ) {
        return { __secret: value.secret };
      }
      return value;
    },
    deserialize: (value: unknown) => {
      if (
        value &&
        typeof value === 'object' &&
        '__secret' in value &&
        typeof value.__secret === 'string'
      ) {
        return { secret: value.__secret };
      }
      return value;
    },
  },
  output: {
    serialize: (value: unknown) => value,
    deserialize: (value: unknown) => value,
  },
};

function createUtilityBridge() {
  // Simulate: main creates a channel, sends port1 to utility via parentPort
  const serverPort = new MockMessagePortMain();
  const clientPort = new MockRendererPort();

  // Bridge messages between MockMessagePortMain and MockRendererPort
  serverPort.on('__outgoing', (data: unknown) => {
    queueMicrotask(() => {
      clientPort.dispatchEvent(new MessageEvent('message', { data }));
    });
  });
  clientPort.addEventListener('__outgoing', ((event: CustomEvent) => {
    queueMicrotask(() => {
      serverPort.emit('message', { data: event.detail, ports: [] });
    });
  }) as EventListener);

  serverPort.postMessage = (data: unknown) => {
    const cloned = structuredClone(data);
    serverPort.emit('__outgoing', cloned);
  };
  clientPort.postMessage = (data: unknown) => {
    const cloned = structuredClone(data);
    clientPort.dispatchEvent(new CustomEvent('__outgoing', { detail: cloned }));
  };

  clientPort.start();

  return { serverPort, clientPort };
}

describe('parentPortHandler', () => {
  it('should listen for port on parentPort and handle queries', async () => {
    // Arrange
    const router = setupRouter();
    const mockParentPort = new MockParentPort();
    const { serverPort, clientPort } = createUtilityBridge();

    createParentPortHandler({
      router,
      parentPort: mockParentPort as ParentPortLike,
    });

    // Simulate main sending a port to the utility process
    mockParentPort.emit('message', {
      data: null,
      ports: [serverPort],
    });

    const client = createTRPCClient<AppRouter>({
      links: [portLink({ port: clientPort })],
    });

    // Act
    const result = await client.ping.query();

    // Assert
    expect(result).toBe('pong');
  });

  it('should handle mutations with input', async () => {
    // Arrange
    const router = setupRouter();
    const mockParentPort = new MockParentPort();
    const { serverPort, clientPort } = createUtilityBridge();

    createParentPortHandler({
      router,
      parentPort: mockParentPort as ParentPortLike,
    });

    mockParentPort.emit('message', {
      data: null,
      ports: [serverPort],
    });

    const client = createTRPCClient<AppRouter>({
      links: [portLink({ port: clientPort })],
    });

    // Act
    const result = await client.add.query({ a: 5, b: 7 });

    // Assert
    expect(result).toBe(12);
  });

  it('should handle subscriptions', async () => {
    // Arrange
    const router = setupRouter();
    const mockParentPort = new MockParentPort();
    const { serverPort, clientPort } = createUtilityBridge();

    createParentPortHandler({
      router,
      parentPort: mockParentPort as ParentPortLike,
    });

    mockParentPort.emit('message', {
      data: null,
      ports: [serverPort],
    });

    const client = createTRPCClient<AppRouter>({
      links: [portLink({ port: clientPort })],
    });

    const received: unknown[] = [];

    // Act
    await new Promise<void>((resolve, reject) => {
      client.count.subscribe(
        { to: 3 },
        {
          onData(data) {
            received.push(data);
          },
          onComplete() {
            resolve();
          },
          onError(err) {
            reject(err);
          },
        },
      );
    });

    // Assert
    expect(received).toEqual([{ n: 1 }, { n: 2 }, { n: 3 }]);
  });

  it('should handle multiple ports from parentPort', async () => {
    // Arrange
    const router = setupRouter();
    const mockParentPort = new MockParentPort();

    const bridge1 = createUtilityBridge();
    const bridge2 = createUtilityBridge();

    createParentPortHandler({
      router,
      parentPort: mockParentPort as ParentPortLike,
    });

    // Send two separate ports (e.g., from two different renderers)
    mockParentPort.emit('message', { data: null, ports: [bridge1.serverPort] });
    mockParentPort.emit('message', { data: null, ports: [bridge2.serverPort] });

    const client1 = createTRPCClient<AppRouter>({
      links: [portLink({ port: bridge1.clientPort })],
    });
    const client2 = createTRPCClient<AppRouter>({
      links: [portLink({ port: bridge2.clientPort })],
    });

    // Act
    const [r1, r2] = await Promise.all([
      client1.ping.query(),
      client2.add.query({ a: 1, b: 2 }),
    ]);

    // Assert
    expect(r1).toBe('pong');
    expect(r2).toBe(3);
  });

  it('should pass createContext to port handlers', async () => {
    // Arrange
    const t = initTRPC.context<{ source: string }>().create();
    const router = t.router({
      getSource: t.procedure.query(({ ctx }) => ctx.source),
    });

    const mockParentPort = new MockParentPort();
    const { serverPort, clientPort } = createUtilityBridge();

    createParentPortHandler({
      router,
      parentPort: mockParentPort as ParentPortLike,
      createContext: async () => ({ source: 'utility' }),
    });

    mockParentPort.emit('message', { data: null, ports: [serverPort] });

    const client = createTRPCClient<typeof router>({
      links: [portLink({ port: clientPort })],
    });

    // Act
    const result = await client.getSource.query();

    // Assert
    expect(result).toBe('utility');
  });

  it('should pass transformer to port handlers', async () => {
    // Arrange
    const t = initTRPC.create();
    const router = t.router({
      revealSecret: t.procedure
        .input((value: unknown) => value as { secret: string })
        .query(({ input }) => input.secret.toUpperCase()),
    });

    const mockParentPort = new MockParentPort();
    const { serverPort, clientPort } = createUtilityBridge();

    createParentPortHandler({
      router,
      parentPort: mockParentPort as ParentPortLike,
      transformer: customTransformer,
    });

    mockParentPort.emit('message', { data: null, ports: [serverPort] });

    const client = createTRPCClient<typeof router>({
      links: [portLink({ port: clientPort, transformer: customTransformer })],
    });

    // Act
    const result = await client.revealSecret.query({
      secret: 'from-transformer',
    });

    // Assert
    expect(result).toBe('FROM-TRANSFORMER');
  });
});
