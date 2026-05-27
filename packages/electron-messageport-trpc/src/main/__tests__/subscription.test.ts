import { createTRPCClient } from '@trpc/client';
import { initTRPC, tracked } from '@trpc/server';
import { describe, expect, it } from 'vitest';
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
    resumeFrom: t.procedure
      .input((v: unknown) => v as { lastEventId?: string } | undefined)
      .subscription(async function* ({ input }) {
        yield { lastEventId: input?.lastEventId ?? null };
      }),
    trackedEvents: t.procedure.subscription(async function* () {
      yield tracked('event-1', { value: 1 });
      yield tracked('event-2', { value: 2 });
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
    nonCloneableSub: t.procedure.subscription(async function* () {
      yield new Proxy({ value: 'not cloneable' }, {});
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

    it('should send v11 subscription started and stopped envelopes', async () => {
      // Arrange
      const router = setupRouter();
      const { serverPort, clientPort } = createBridgedPair();
      createPortHandler({ port: serverPort, router });

      const received: string[] = [];

      // Act
      await new Promise<void>((resolve) => {
        clientPort.addEventListener('message', ((event: MessageEvent) => {
          const msg = event.data;
          if (msg.kind === 'result') {
            received.push(msg.type);
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
          input: { from: 1 },
        });
      });

      // Assert
      expect(received).toEqual(['started', 'data', 'data', 'stopped']);
    });

    it('should merge lastEventId into subscription input', async () => {
      // Arrange
      const router = setupRouter();
      const { serverPort, clientPort } = createBridgedPair();
      createPortHandler({ port: serverPort, router });

      // Act
      const received = await new Promise<unknown>((resolve) => {
        clientPort.addEventListener('message', ((event: MessageEvent) => {
          const msg = event.data;
          if (msg.kind === 'result' && msg.type === 'data') {
            resolve(msg.data);
          }
        }) as EventListener);

        clientPort.postMessage({
          kind: 'request',
          id: 1,
          method: 'subscription',
          path: 'resumeFrom',
          input: undefined,
          lastEventId: 'event-1',
        });
      });

      // Assert
      expect(received).toEqual({ lastEventId: 'event-1' });
    });

    it('should unwrap tracked envelopes for the port protocol', async () => {
      // Arrange
      const router = setupRouter();
      const { serverPort, clientPort } = createBridgedPair();
      createPortHandler({ port: serverPort, router });

      const received: unknown[] = [];
      const eventIds: unknown[] = [];

      // Act
      await new Promise<void>((resolve) => {
        clientPort.addEventListener('message', ((event: MessageEvent) => {
          const msg = event.data;
          if (msg.kind === 'result' && msg.type === 'data') {
            received.push(msg.data);
            eventIds.push(msg.eventId);
          }
          if (msg.kind === 'result' && msg.type === 'stopped') {
            resolve();
          }
        }) as EventListener);

        clientPort.postMessage({
          kind: 'request',
          id: 1,
          method: 'subscription',
          path: 'trackedEvents',
          input: undefined,
        });
      });

      // Assert
      expect(received).toEqual([
        { id: 'event-1', data: { value: 1 } },
        { id: 'event-2', data: { value: 2 } },
      ]);
      expect(eventIds).toEqual(['event-1', 'event-2']);
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

    it('should send error when a subscription value cannot be cloned', async () => {
      // Arrange
      const router = setupRouter();
      const { serverPort, clientPort } = createBridgedPair();
      createPortHandler({ port: serverPort, router });

      // Act
      const error = await new Promise<unknown>((resolve) => {
        clientPort.addEventListener('message', ((event: MessageEvent) => {
          const msg = event.data;
          if (msg.kind === 'error') {
            resolve(msg.error);
          }
        }) as EventListener);

        clientPort.postMessage({
          kind: 'request',
          id: 1,
          method: 'subscription',
          path: 'nonCloneableSub',
          input: undefined,
        });
      });

      // Assert
      expect(error).toBeTruthy();
      expect((error as { message: string }).message).toContain(
        'could not be cloned',
      );
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
      const events: string[] = [];

      // Act
      await new Promise<void>((resolve, reject) => {
        const _sub = client.countdown.subscribe(
          { from: 2 },
          {
            onStarted() {
              events.push('started');
            },
            onData(data) {
              events.push('data');
              received.push(data);
            },
            onStopped() {
              events.push('stopped');
            },
            onComplete() {
              events.push('complete');
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
      expect(events).toEqual([
        'started',
        'data',
        'data',
        'data',
        'stopped',
        'complete',
      ]);
    });

    it('should receive tracked subscription values via tRPC client', async () => {
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
        const _sub = client.trackedEvents.subscribe(undefined, {
          onData(data) {
            received.push(data);
          },
          onComplete() {
            resolve();
          },
          onError(err) {
            reject(err);
          },
        });
      });

      // Assert
      expect(received).toEqual([
        { id: 'event-1', data: { value: 1 } },
        { id: 'event-2', data: { value: 2 } },
      ]);
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
