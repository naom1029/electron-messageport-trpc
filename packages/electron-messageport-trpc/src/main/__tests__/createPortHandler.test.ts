import { initTRPC } from '@trpc/server';
import { describe, expect, it, vi } from 'vitest';
import { MockMessagePortMain } from '../../shared/__tests__/mockPort';
import type { ClientMessage, ServerMessage } from '../../shared/protocol';
import { createPortHandler } from '../createPortHandler';

function waitForMessage(port: MockMessagePortMain): Promise<ServerMessage> {
  return new Promise((resolve) => {
    const handler = (event: { data: ServerMessage }) => {
      port.off('message', handler);
      resolve(event.data);
    };
    port.on('message', handler);
  });
}

function setupRouter() {
  const t = initTRPC.create();
  const router = t.router({
    greet: t.procedure
      .input((v: unknown) => {
        const input = v as { name: string };
        return input;
      })
      .query(({ input }) => {
        return { message: `Hello, ${input.name}!` };
      }),
    createUser: t.procedure
      .input((v: unknown) => {
        const input = v as { name: string };
        return input;
      })
      .mutation(({ input }) => {
        return { id: 1, name: input.name };
      }),
    failingQuery: t.procedure.query(() => {
      throw new Error('Something went wrong');
    }),
  });
  return router;
}

describe('createPortHandler', () => {
  describe('query', () => {
    it('should handle a query request and return result', async () => {
      // Arrange
      const router = setupRouter();
      const [clientPort, serverPort] = MockMessagePortMain.createPair();
      clientPort.start();

      createPortHandler({ port: serverPort, router });

      const responsePromise = waitForMessage(clientPort);

      // Act
      const request: ClientMessage = {
        kind: 'request',
        id: 1,
        method: 'query',
        path: 'greet',
        input: { name: 'World' },
      };
      clientPort.postMessage(request);

      // Assert
      const response = await responsePromise;
      expect(response).toEqual({
        kind: 'result',
        id: 1,
        type: 'data',
        data: { message: 'Hello, World!' },
      });
    });

    it('should return an error for a failing query', async () => {
      // Arrange
      const router = setupRouter();
      const [clientPort, serverPort] = MockMessagePortMain.createPair();
      clientPort.start();

      createPortHandler({ port: serverPort, router });

      const responsePromise = waitForMessage(clientPort);

      // Act
      const request: ClientMessage = {
        kind: 'request',
        id: 2,
        method: 'query',
        path: 'failingQuery',
        input: undefined,
      };
      clientPort.postMessage(request);

      // Assert
      const response = await responsePromise;
      expect(response.kind).toBe('error');
      expect(response.id).toBe(2);
      if (response.kind === 'error') {
        expect(response.error.code).toBe(-32603);
        expect(response.error.message).toContain('Something went wrong');
        expect((response.error.data as { code: string }).code).toBe(
          'INTERNAL_SERVER_ERROR',
        );
      }
    });

    it('should return an error for a non-existent procedure', async () => {
      // Arrange
      const router = setupRouter();
      const [clientPort, serverPort] = MockMessagePortMain.createPair();
      clientPort.start();

      createPortHandler({ port: serverPort, router });

      const responsePromise = waitForMessage(clientPort);

      // Act
      const request: ClientMessage = {
        kind: 'request',
        id: 3,
        method: 'query',
        path: 'nonExistent',
        input: undefined,
      };
      clientPort.postMessage(request);

      // Assert
      const response = await responsePromise;
      expect(response.kind).toBe('error');
      expect(response.id).toBe(3);
    });
  });

  describe('mutation', () => {
    it('should handle a mutation request and return result', async () => {
      // Arrange
      const router = setupRouter();
      const [clientPort, serverPort] = MockMessagePortMain.createPair();
      clientPort.start();

      createPortHandler({ port: serverPort, router });

      const responsePromise = waitForMessage(clientPort);

      // Act
      const request: ClientMessage = {
        kind: 'request',
        id: 4,
        method: 'mutation',
        path: 'createUser',
        input: { name: 'Alice' },
      };
      clientPort.postMessage(request);

      // Assert
      const response = await responsePromise;
      expect(response).toEqual({
        kind: 'result',
        id: 4,
        type: 'data',
        data: { id: 1, name: 'Alice' },
      });
    });
  });

  describe('lifecycle', () => {
    it('should ignore malformed messages and continue handling requests', async () => {
      // Arrange
      const router = setupRouter();
      const [clientPort, serverPort] = MockMessagePortMain.createPair();
      clientPort.start();

      createPortHandler({ port: serverPort, router });

      // Act - these should not throw or close the handler.
      clientPort.postMessage(null);
      clientPort.postMessage('not a protocol message');
      clientPort.postMessage({ kind: 'request', id: 'bad' });

      const responsePromise = waitForMessage(clientPort);
      clientPort.postMessage({
        kind: 'request',
        id: 10,
        method: 'query',
        path: 'greet',
        input: { name: 'AfterInvalid' },
      } satisfies ClientMessage);

      // Assert
      const response = await responsePromise;
      expect(response).toEqual({
        kind: 'result',
        id: 10,
        type: 'data',
        data: { message: 'Hello, AfterInvalid!' },
      });
    });

    it('should call port.start() during initialization', () => {
      // Arrange
      const router = setupRouter();
      const [_clientPort, serverPort] = MockMessagePortMain.createPair();
      const startSpy = vi.spyOn(serverPort, 'start');

      // Act
      createPortHandler({ port: serverPort, router });

      // Assert
      expect(startSpy).toHaveBeenCalledOnce();
    });

    it('should handle multiple sequential requests', async () => {
      // Arrange
      const router = setupRouter();
      const [clientPort, serverPort] = MockMessagePortMain.createPair();
      clientPort.start();

      createPortHandler({ port: serverPort, router });

      // Act & Assert - first request
      const response1Promise = waitForMessage(clientPort);
      clientPort.postMessage({
        kind: 'request',
        id: 1,
        method: 'query',
        path: 'greet',
        input: { name: 'Alice' },
      } satisfies ClientMessage);
      const response1 = await response1Promise;
      expect(response1).toEqual({
        kind: 'result',
        id: 1,
        type: 'data',
        data: { message: 'Hello, Alice!' },
      });

      // Act & Assert - second request
      const response2Promise = waitForMessage(clientPort);
      clientPort.postMessage({
        kind: 'request',
        id: 2,
        method: 'query',
        path: 'greet',
        input: { name: 'Bob' },
      } satisfies ClientMessage);
      const response2 = await response2Promise;
      expect(response2).toEqual({
        kind: 'result',
        id: 2,
        type: 'data',
        data: { message: 'Hello, Bob!' },
      });
    });

    it('should clean up when destroy() is called', () => {
      // Arrange
      const router = setupRouter();
      const [_clientPort, serverPort] = MockMessagePortMain.createPair();
      const closeSpy = vi.spyOn(serverPort, 'close');

      const handler = createPortHandler({ port: serverPort, router });

      // Act
      handler.destroy();

      // Assert
      expect(closeSpy).toHaveBeenCalledOnce();
    });
  });
});
