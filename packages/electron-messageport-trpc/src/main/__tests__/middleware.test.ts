import { createTRPCClient } from '@trpc/client';
import { initTRPC, TRPCError } from '@trpc/server';
import { describe, expect, it } from 'vitest';
import { portLink } from '../../renderer/portLink';
import { createBridgedPair } from '../../shared/__tests__/mockBridge';
import { createPortHandler } from '../createPortHandler';

describe('middleware and context', () => {
  describe('createContext', () => {
    it('should pass createContext result to procedures', async () => {
      // Arrange
      const t = initTRPC.context<{ userId: string }>().create();
      const router = t.router({
        whoAmI: t.procedure.query(({ ctx }) => {
          return { userId: ctx.userId };
        }),
      });

      const { serverPort, clientPort } = createBridgedPair();
      createPortHandler({
        port: serverPort,
        router,
        createContext: async () => ({ userId: 'user-123' }),
      });

      const client = createTRPCClient<typeof router>({
        links: [portLink({ port: clientPort })],
      });

      // Act
      const result = await client.whoAmI.query();

      // Assert
      expect(result).toEqual({ userId: 'user-123' });
    });

    it('should call createContext for each request', async () => {
      // Arrange
      let callCount = 0;
      const t = initTRPC.context<{ requestId: number }>().create();
      const router = t.router({
        getRequestId: t.procedure.query(({ ctx }) => ctx.requestId),
      });

      const { serverPort, clientPort } = createBridgedPair();
      createPortHandler({
        port: serverPort,
        router,
        createContext: async () => ({ requestId: ++callCount }),
      });

      const client = createTRPCClient<typeof router>({
        links: [portLink({ port: clientPort })],
      });

      // Act
      const r1 = await client.getRequestId.query();
      const r2 = await client.getRequestId.query();

      // Assert
      expect(r1).toBe(1);
      expect(r2).toBe(2);
    });
  });

  describe('middleware', () => {
    it('should propagate context modifications through middleware to client', async () => {
      // Arrange
      const t = initTRPC.context<{ role?: string }>().create();

      const authMiddleware = t.middleware(async ({ next }) => {
        return next({ ctx: { role: 'admin' } });
      });

      const router = t.router({
        getRole: t.procedure.use(authMiddleware).query(({ ctx }) => {
          return ctx.role;
        }),
      });

      const { serverPort, clientPort } = createBridgedPair();
      createPortHandler({
        port: serverPort,
        router,
        createContext: async () => ({}),
      });

      const client = createTRPCClient<typeof router>({
        links: [portLink({ port: clientPort })],
      });

      // Act
      const result = await client.getRole.query();

      // Assert
      expect(result).toBe('admin');
    });

    it('should propagate middleware errors to client', async () => {
      // Arrange
      const t = initTRPC.create();

      const authMiddleware = t.middleware(async () => {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Not allowed',
        });
      });

      const router = t.router({
        secret: t.procedure.use(authMiddleware).query(() => 'secret-data'),
      });

      const { serverPort, clientPort } = createBridgedPair();
      createPortHandler({ port: serverPort, router });

      const client = createTRPCClient<typeof router>({
        links: [portLink({ port: clientPort })],
      });

      // Act & Assert
      await expect(client.secret.query()).rejects.toThrow();
    });
  });

  describe('subscription with context', () => {
    it('should pass context to subscription procedures', async () => {
      // Arrange
      const t = initTRPC.context<{ userId: string }>().create();

      const router = t.router({
        events: t.procedure.subscription(async function* ({ ctx }) {
          yield { userId: ctx.userId, event: 'connected' };
        }),
      });

      const { serverPort, clientPort } = createBridgedPair();
      createPortHandler({
        port: serverPort,
        router,
        createContext: async () => ({ userId: 'sub-user' }),
      });

      const client = createTRPCClient<typeof router>({
        links: [portLink({ port: clientPort })],
      });

      const received: unknown[] = [];

      // Act
      await new Promise<void>((resolve, reject) => {
        client.events.subscribe(undefined, {
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
      expect(received).toEqual([{ userId: 'sub-user', event: 'connected' }]);
    });
  });
});
