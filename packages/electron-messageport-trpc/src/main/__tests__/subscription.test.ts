import { createTRPCClient } from '@trpc/client';
import { initTRPC } from '@trpc/server';
import { describe, expect, it, vi } from 'vitest';
import { portLink } from '../../renderer/portLink';
import { createBridgedPair } from '../../shared/__tests__/mockBridge';
import { createPortHandler } from '../createPortHandler';

function setupRouter() {
  const t = initTRPC.create();
  return t.router({
    countdown: t.procedure
      .input((v: unknown) => v as { from: number })
      .subscription(async function* ({ input }) {
        for (let i = input.from; i >= 0; i--) {
          yield { count: i };
        }
      }),
    infinite: t.procedure.subscription(async function* (opts) {
      let i = 0;
      while (!opts.signal?.aborted) {
        yield { tick: i++ };
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    }),
    failingSub: t.procedure.subscription(async function* () {
      yield { ok: true };
      throw new Error('Subscription exploded');
    }),
  });
}

type AppRouter = ReturnType<typeof setupRouter>;

describe('subscription', () => {
  describe('server-side (createPortHandler)', () => {
    it('should iterate async generator and send each value', async () => {
      // Arrange
      const router = setupRouter();
      const { serverPort, clientPort } = createBridgedPair();
      createPortHandler({ port: serverPort, router });

      const received: unknown[] = [];

      // Act
      await new Promise<void>((resolve) => {
        clientPort.addEventListener('message', ((event: MessageEvent) => {
          const msg = event.data;
          if (msg.kind === 'result' && msg.type === 'data') {
            received.push(msg.data);
          }
          if (msg.kind === 'result' && msg.type === 'stopped') {
            resolve();
          }
        }) as EventListener);

        clientPort.postMessage({
          kind: 'request',
          id: 1,
          method: 'subscription',
          path: 'countdown',
          input: { from: 3 },
        });
      });

      // Assert
      expect(received).toEqual([
        { count: 3 },
        { count: 2 },
        { count: 1 },
        { count: 0 },
      ]);
    });

    it('should stop subscription when subscription.stop is received', async () => {
      // Arrange
      const router = setupRouter();
      const { serverPort, clientPort } = createBridgedPair();
      createPortHandler({ port: serverPort, router });

      const received: unknown[] = [];

      // Act
      await new Promise<void>((resolve) => {
        clientPort.addEventListener('message', ((event: MessageEvent) => {
          const msg = event.data;
          if (msg.kind === 'result' && msg.type === 'data') {
            received.push(msg.data);
            // Stop after receiving first value
            if (received.length === 1) {
              clientPort.postMessage({
                kind: 'subscription.stop',
                id: 1,
              });
              // Give time for abort to propagate
              setTimeout(resolve, 50);
            }
          }
        }) as EventListener);

        clientPort.postMessage({
          kind: 'request',
          id: 1,
          method: 'subscription',
          path: 'infinite',
          input: undefined,
        });
      });

      // Assert - should have stopped early (not infinite)
      expect(received.length).toBeGreaterThanOrEqual(1);
      expect(received.length).toBeLessThan(10);
    });

    it('should send error when subscription throws', async () => {
      // Arrange
      const router = setupRouter();
      const { serverPort, clientPort } = createBridgedPair();
      createPortHandler({ port: serverPort, router });

      // Act
      const result = await new Promise<{ data: unknown[]; error: unknown }>(
        (resolve) => {
          const data: unknown[] = [];
          let error: unknown = null;

          clientPort.addEventListener('message', ((event: MessageEvent) => {
            const msg = event.data;
            if (msg.kind === 'result' && msg.type === 'data') {
              data.push(msg.data);
            }
            if (msg.kind === 'error') {
              error = msg.error;
              resolve({ data, error });
            }
          }) as EventListener);

          clientPort.postMessage({
            kind: 'request',
            id: 1,
            method: 'subscription',
            path: 'failingSub',
            input: undefined,
          });
        },
      );

      // Assert
      expect(result.data).toEqual([{ ok: true }]);
      expect(result.error).toBeTruthy();
    });
  });

  describe('full round trip via portLink', () => {
    it('should receive all subscription values via tRPC client', async () => {
      // Arrange
      const router = setupRouter();
      const { serverPort, clientPort } = createBridgedPair();
      createPortHandler({ port: serverPort, router });

      const client = createTRPCClient<AppRouter>({
        links: [portLink({ port: clientPort })],
      });

      const received: unknown[] = [];

      // Act
      await new Promise<void>((resolve, reject) => {
        const sub = client.countdown.subscribe(
          { from: 2 },
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
      expect(received).toEqual([{ count: 2 }, { count: 1 }, { count: 0 }]);
    });

    it('should be able to unsubscribe from the client side', async () => {
      // Arrange
      const router = setupRouter();
      const { serverPort, clientPort } = createBridgedPair();
      createPortHandler({ port: serverPort, router });

      const client = createTRPCClient<AppRouter>({
        links: [portLink({ port: clientPort })],
      });

      const received: unknown[] = [];

      // Act
      await new Promise<void>((resolve) => {
        const sub = client.infinite.subscribe(undefined, {
          onData(data) {
            received.push(data);
            if (received.length >= 2) {
              sub.unsubscribe();
              setTimeout(resolve, 50);
            }
          },
          onError() {},
        });
      });

      // Assert
      expect(received.length).toBeGreaterThanOrEqual(2);
      expect(received.length).toBeLessThan(10);
    });
  });
});
