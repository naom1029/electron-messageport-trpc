import { createTRPCClient } from '@trpc/client';
import { initTRPC } from '@trpc/server';
import { describe, expect, it } from 'vitest';
import { MockMessagePortMain } from '../../shared/__tests__/mockPort';
import { createPortHandler } from '../createPortHandler';
import { mainPortLink } from '../mainPortLink';

class CustomValue {
  constructor(readonly value: string) {}
}

const customTransformer = {
  serialize(value: unknown): unknown {
    if (value instanceof CustomValue) {
      return { __customValue: true, value: value.value };
    }
    return value;
  },
  deserialize(value: unknown): unknown {
    if (
      value &&
      typeof value === 'object' &&
      '__customValue' in value &&
      (value as { __customValue: unknown }).__customValue === true
    ) {
      return new CustomValue(String((value as { value: unknown }).value));
    }
    return value;
  },
};

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

function setupTransformerRouter() {
  const t = initTRPC.create({ transformer: customTransformer });

  return t.router({
    custom: t.procedure
      .input((value: unknown) => value as CustomValue)
      .query(({ input }) => new CustomValue(`${input.value}:server`)),
  });
}

type TransformerRouter = ReturnType<typeof setupTransformerRouter>;

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

  it('avoids request id collisions across link instances sharing a port', async () => {
    const router = setupRouter();
    const [clientPort, serverPort] = MockMessagePortMain.createPair();
    createPortHandler({ port: serverPort, router });

    const clientA = createTRPCClient<AppRouter>({
      links: [mainPortLink({ port: clientPort })],
    });
    const clientB = createTRPCClient<AppRouter>({
      links: [mainPortLink({ port: clientPort })],
    });

    const [resultA, resultB] = await Promise.all([
      clientA.greet.query({ name: 'main-a' }),
      clientB.greet.query({ name: 'main-b' }),
    ]);

    expect(resultA).toBe('hello main-a');
    expect(resultB).toBe('hello main-b');
  });

  it('ignores malformed server messages and continues handling requests', async () => {
    const router = setupRouter();
    const [clientPort, serverPort] = MockMessagePortMain.createPair();
    createPortHandler({ port: serverPort, router });

    const client = createTRPCClient<AppRouter>({
      links: [mainPortLink({ port: clientPort })],
    });

    clientPort.emit('message', { data: null });
    clientPort.emit('message', { data: { kind: 'result', id: 'bad' } });

    const result = await client.greet.query({ name: 'after-invalid' });

    expect(result).toBe('hello after-invalid');
  });

  it('rejects when request input cannot be cloned', async () => {
    const router = setupRouter();
    const [clientPort, serverPort] = MockMessagePortMain.createPair();
    createPortHandler({ port: serverPort, router });

    const client = createTRPCClient<AppRouter>({
      links: [mainPortLink({ port: clientPort })],
    });

    const proxy = new Proxy({ name: 'Proxy' }, {});

    await expect(client.greet.query(proxy)).rejects.toThrow(
      /could not be cloned/,
    );
  });

  it('serializes input and deserializes output with the configured transformer', async () => {
    const router = setupTransformerRouter();
    const [clientPort, serverPort] = MockMessagePortMain.createPair();
    createPortHandler({ port: serverPort, router });

    const client = createTRPCClient<TransformerRouter>({
      links: [mainPortLink({ port: clientPort, transformer: customTransformer })],
    });

    const result = await client.custom.query(new CustomValue('main'));

    expect(result).toBeInstanceOf(CustomValue);
    expect(result.value).toBe('main:server');
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
