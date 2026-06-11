import { createTRPCClient, TRPCClientError } from '@trpc/client';
import { initTRPC, tracked } from '@trpc/server';
import { describe, expect, it } from 'vitest';
import { createPortHandler } from '../../main/createPortHandler';
import { createBridgedPair } from '../../shared/__tests__/mockBridge';
import { portLink } from '../portLink';

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
      .input((v: unknown) => v as { name: string })
      .query(({ input }) => {
        return { message: `Hello, ${input.name}!` };
      }),
    createUser: t.procedure
      .input((v: unknown) => v as { name: string })
      .mutation(({ input }) => {
        return { id: 1, name: input.name };
      }),
    add: t.procedure
      .input((v: unknown) => v as { a: number; b: number })
      .query(({ input }) => {
        return input.a + input.b;
      }),
    failingQuery: t.procedure.query(() => {
      throw new Error('Boom');
    }),
    blobSize: t.procedure
      .input((value: unknown) => value as Blob)
      .mutation(async ({ input }) => ({
        size: input.size,
        text: await input.text(),
        type: input.type,
      })),
    circular: t.procedure
      .input((value: unknown) => value as { self?: unknown })
      .mutation(({ input }) => input.self === input),
    streamQuery: t.procedure.query(async function* () {
      yield { index: 0 };
      yield { index: 1 };
      yield { index: 2 };
    }),
    trackedEvents: t.procedure.subscription(async function* () {
      yield tracked('1', { label: 'first' });
      yield tracked('2', { label: 'second' });
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

describe('portLink', () => {
  describe('query - full round trip', () => {
    it('should send a query and receive the result', async () => {
      // Arrange
      const router = setupRouter();
      const { serverPort, clientPort } = createBridgedPair();
      createPortHandler({ port: serverPort, router });

      const client = createTRPCClient<AppRouter>({
        links: [portLink({ port: clientPort })],
      });

      // Act
      const result = await client.greet.query({ name: 'World' });

      // Assert
      expect(result).toEqual({ message: 'Hello, World!' });
    });

    it('should handle numeric return values', async () => {
      // Arrange
      const router = setupRouter();
      const { serverPort, clientPort } = createBridgedPair();
      createPortHandler({ port: serverPort, router });

      const client = createTRPCClient<AppRouter>({
        links: [portLink({ port: clientPort })],
      });

      // Act
      const result = await client.add.query({ a: 2, b: 3 });

      // Assert
      expect(result).toBe(5);
    });

    it('should propagate errors from the server', async () => {
      // Arrange
      const router = setupRouter();
      const { serverPort, clientPort } = createBridgedPair();
      createPortHandler({ port: serverPort, router });

      const client = createTRPCClient<AppRouter>({
        links: [portLink({ port: clientPort })],
      });

      // Act & Assert
      await expect(client.failingQuery.query()).rejects.toThrow();
    });
  });

  describe('mutation - full round trip', () => {
    it('should send a mutation and receive the result', async () => {
      // Arrange
      const router = setupRouter();
      const { serverPort, clientPort } = createBridgedPair();
      createPortHandler({ port: serverPort, router });

      const client = createTRPCClient<AppRouter>({
        links: [portLink({ port: clientPort })],
      });

      // Act
      const result = await client.createUser.mutate({ name: 'Alice' });

      // Assert
      expect(result).toEqual({ id: 1, name: 'Alice' });
    });

    it('should encode Blob input before MessagePort structured clone', async () => {
      // Arrange
      const router = setupRouter();
      const { serverPort, clientPort } = createBridgedPair();
      createPortHandler({ port: serverPort, router });

      const client = createTRPCClient<AppRouter>({
        links: [portLink({ port: clientPort })],
      });

      // Act
      const result = await client.blobSize.mutate(
        new Blob(['hello'], { type: 'text/plain' }),
      );

      // Assert
      expect(result).toEqual({ size: 5, text: 'hello', type: 'text/plain' });
    });

    it('should preserve circular structured-clone inputs without Blob decoding', async () => {
      // Arrange
      const router = setupRouter();
      const { serverPort, clientPort } = createBridgedPair();
      createPortHandler({ port: serverPort, router });

      const client = createTRPCClient<AppRouter>({
        links: [portLink({ port: clientPort })],
      });

      const input: { self?: unknown } = {};
      input.self = input;

      // Act
      const result = await client.circular.mutate(input);

      // Assert
      expect(result).toBe(true);
    });
  });

  describe('streaming query results', () => {
    it('should stream async iterable query results until stopped', async () => {
      // Arrange
      const router = setupRouter();
      const { serverPort, clientPort } = createBridgedPair();
      createPortHandler({ port: serverPort, router });

      const client = createTRPCClient<AppRouter>({
        links: [portLink({ port: clientPort })],
      });

      // Act
      const iterable = await client.streamQuery.query();
      const values: unknown[] = [];
      for await (const value of iterable) {
        values.push(value);
      }

      // Assert
      expect(values).toEqual([{ index: 0 }, { index: 1 }, { index: 2 }]);
    });

    it('should abort the server query when the streamed result is returned early', async () => {
      // Arrange
      const t = initTRPC.create();
      let markAborted: () => void = () => {};
      const aborted = new Promise<void>((resolve) => {
        markAborted = resolve;
      });
      const router = t.router({
        streamUntilAbort: t.procedure.query(async function* ({ signal }) {
          yield { index: 0 };
          await new Promise<void>((resolve) => {
            signal?.addEventListener(
              'abort',
              () => {
                markAborted();
                resolve();
              },
              { once: true },
            );
          });
        }),
      });
      const { serverPort, clientPort } = createBridgedPair();
      createPortHandler({ port: serverPort, router });

      const client = createTRPCClient<typeof router>({
        links: [portLink({ port: clientPort })],
      });

      // Act
      const iterable = await client.streamUntilAbort.query();
      const values: unknown[] = [];
      for await (const value of iterable) {
        values.push(value);
        break;
      }

      // Assert
      await aborted;
      expect(values).toEqual([{ index: 0 }]);
    });
  });

  describe('tracked subscription results', () => {
    it('should strip the non-cloneable tracked symbol and preserve event ids', async () => {
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
        client.trackedEvents.subscribe(undefined, {
          onData(value) {
            received.push(value);
          },
          onComplete() {
            resolve();
          },
          onError(error) {
            reject(error);
          },
        });
      });

      // Assert
      expect(received).toEqual([
        { id: '1', data: { label: 'first' } },
        { id: '2', data: { label: 'second' } },
      ]);
    });
  });

  describe('multiple requests', () => {
    it('should handle concurrent requests correctly', async () => {
      // Arrange
      const router = setupRouter();
      const { serverPort, clientPort } = createBridgedPair();
      createPortHandler({ port: serverPort, router });

      const client = createTRPCClient<AppRouter>({
        links: [portLink({ port: clientPort })],
      });

      // Act
      const [r1, r2, r3] = await Promise.all([
        client.greet.query({ name: 'Alice' }),
        client.greet.query({ name: 'Bob' }),
        client.add.query({ a: 10, b: 20 }),
      ]);

      // Assert
      expect(r1).toEqual({ message: 'Hello, Alice!' });
      expect(r2).toEqual({ message: 'Hello, Bob!' });
      expect(r3).toBe(30);
    });

    it('should avoid request id collisions across link instances sharing a port', async () => {
      // Arrange
      const router = setupRouter();
      const { serverPort, clientPort } = createBridgedPair();
      createPortHandler({ port: serverPort, router });

      const clientA = createTRPCClient<AppRouter>({
        links: [portLink({ port: clientPort })],
      });
      const clientB = createTRPCClient<AppRouter>({
        links: [portLink({ port: clientPort })],
      });

      // Act
      const [resultA, resultB] = await Promise.all([
        clientA.greet.query({ name: 'Alice' }),
        clientB.greet.query({ name: 'Bob' }),
      ]);

      // Assert
      expect(resultA).toEqual({ message: 'Hello, Alice!' });
      expect(resultB).toEqual({ message: 'Hello, Bob!' });
    });
  });

  describe('malformed messages', () => {
    it('should ignore malformed server messages and continue handling requests', async () => {
      // Arrange
      const router = setupRouter();
      const { serverPort, clientPort } = createBridgedPair();
      createPortHandler({ port: serverPort, router });

      const client = createTRPCClient<AppRouter>({
        links: [portLink({ port: clientPort })],
      });

      clientPort.dispatchEvent(new MessageEvent('message', { data: null }));
      clientPort.dispatchEvent(
        new MessageEvent('message', { data: { kind: 'result', id: 'bad' } }),
      );

      // Act
      const result = await client.greet.query({ name: 'AfterInvalid' });

      // Assert
      expect(result).toEqual({ message: 'Hello, AfterInvalid!' });
    });
  });

  describe('clone failures', () => {
    it('should reject when request input cannot be cloned', async () => {
      // Arrange
      const router = setupRouter();
      const { serverPort, clientPort } = createBridgedPair();
      createPortHandler({ port: serverPort, router });

      const client = createTRPCClient<AppRouter>({
        links: [portLink({ port: clientPort })],
      });

      const proxy = new Proxy({ name: 'Proxy' }, {});

      // Act & Assert
      await expect(client.greet.query(proxy)).rejects.toThrow(
        /could not be cloned/,
      );
    });
  });

  describe('abort', () => {
    it('should propagate query aborts to the server procedure', async () => {
      // Arrange
      const t = initTRPC.create();
      let started = 0;
      let aborted = 0;
      let completed = 0;
      let markStarted: () => void = () => {};
      const startedPromise = new Promise<void>((resolve) => {
        markStarted = resolve;
      });
      const router = t.router({
        slowQuery: t.procedure.query(async ({ signal }) => {
          started += 1;
          markStarted();
          await new Promise<void>((resolve) => {
            const timeout = setTimeout(() => {
              completed += 1;
              resolve();
            }, 1_000);
            signal?.addEventListener(
              'abort',
              () => {
                clearTimeout(timeout);
                aborted += 1;
                resolve();
              },
              { once: true },
            );
          });

          return { ok: true };
        }),
      });
      const { serverPort, clientPort } = createBridgedPair();
      createPortHandler({ port: serverPort, router });

      const client = createTRPCClient<typeof router>({
        links: [portLink({ port: clientPort })],
      });

      const controller = new AbortController();

      // Act
      const promise = client.slowQuery.query(undefined, {
        signal: controller.signal,
      });
      await startedPromise;
      controller.abort();

      // Assert
      await expect(promise).rejects.toBeInstanceOf(TRPCClientError);
      await expect(promise).rejects.toMatchObject({
        cause: { name: 'AbortError' },
      });
      expect(started).toBe(1);
      expect(aborted).toBe(1);
      expect(completed).toBe(0);
    });
  });

  describe('transformer', () => {
    it('should serialize input and deserialize output with the configured transformer', async () => {
      // Arrange
      const router = setupTransformerRouter();
      const { serverPort, clientPort } = createBridgedPair();
      createPortHandler({ port: serverPort, router });

      const client = createTRPCClient<TransformerRouter>({
        links: [portLink({ port: clientPort, transformer: customTransformer })],
      });

      // Act
      const result = await client.custom.query(new CustomValue('client'));

      // Assert
      expect(result).toBeInstanceOf(CustomValue);
      expect(result.value).toBe('client:server');
    });
  });

  describe('port as Promise', () => {
    it('should accept a Promise<MessagePort> and resolve it', async () => {
      // Arrange
      const router = setupRouter();
      const { serverPort, clientPort } = createBridgedPair();
      createPortHandler({ port: serverPort, router });

      const portPromise = Promise.resolve(clientPort);
      const client = createTRPCClient<AppRouter>({
        links: [portLink({ port: portPromise })],
      });

      // Act
      const result = await client.greet.query({ name: 'Deferred' });

      // Assert
      expect(result).toEqual({ message: 'Hello, Deferred!' });
    });
  });
});
