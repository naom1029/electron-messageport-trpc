import { createTRPCClient } from '@trpc/client';
import { initTRPC } from '@trpc/server';
import { describe, expect, it } from 'vitest';
import { MockMessagePortMain } from '../../shared/__tests__/mockPort';
import { createPortHandler } from '../createPortHandler';
import { mainPortLink } from '../mainPortLink';

function setupRouter() {
  const t = initTRPC.create();

  return t.router({
    greet: t.procedure
      .input((value: unknown) => value as { name: string })
      .query(({ input }) => `hello ${input.name}`),
    increment: t.procedure
      .input((value: unknown) => value as { count: number })
      .mutation(({ input }) => ({ count: input.count + 1 })),
    countdown: t.procedure
      .input((value: unknown) => value as { from: number })
      .subscription(async function* ({ input }) {
        for (let current = input.from; current >= 0; current--) {
          yield { count: current };
        }
      }),
  });
}

type AppRouter = ReturnType<typeof setupRouter>;

describe('mainPortLink', () => {
  it('resolves queries through a MessagePortMain-compatible client', async () => {
    const router = setupRouter();
    const [clientPort, serverPort] = MockMessagePortMain.createPair();
    createPortHandler({ port: serverPort, router });

    const client = createTRPCClient<AppRouter>({
      links: [mainPortLink({ port: clientPort })],
    });

    const result = await client.greet.query({ name: 'utility' });

    expect(result).toBe('hello utility');
  });

  it('resolves mutations through a MessagePortMain-compatible client', async () => {
    const router = setupRouter();
    const [clientPort, serverPort] = MockMessagePortMain.createPair();
    createPortHandler({ port: serverPort, router });

    const client = createTRPCClient<AppRouter>({
      links: [mainPortLink({ port: clientPort })],
    });

    const result = await client.increment.mutate({ count: 2 });

    expect(result).toEqual({ count: 3 });
  });

  it('streams subscription values through a MessagePortMain-compatible client', async () => {
    const router = setupRouter();
    const [clientPort, serverPort] = MockMessagePortMain.createPair();
    createPortHandler({ port: serverPort, router });

    const client = createTRPCClient<AppRouter>({
      links: [mainPortLink({ port: clientPort })],
    });

    const received: Array<{ count: number }> = [];
    const events: string[] = [];

    await new Promise<void>((resolve, reject) => {
      client.countdown.subscribe(
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
          onError(error) {
            reject(error);
          },
        },
      );
    });

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
});
