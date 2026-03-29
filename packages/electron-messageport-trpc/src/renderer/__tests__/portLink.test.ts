import { describe, it, expect } from 'vitest';
import { initTRPC } from '@trpc/server';
import { createTRPCClient } from '@trpc/client';
import { createBridgedPair } from '../../shared/__tests__/mockBridge';
import { createPortHandler } from '../../main/createPortHandler';
import { portLink } from '../portLink';

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
  });
}

type AppRouter = ReturnType<typeof setupRouter>;

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
