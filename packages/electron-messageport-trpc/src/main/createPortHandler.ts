import type { AnyRouter } from '@trpc/server';
import {
  callProcedure,
  getErrorShape,
  getTRPCErrorFromUnknown,
  isAsyncIterable,
} from '@trpc/server/unstable-core-do-not-import';
import type {
  ClientMessage,
  ServerMessage,
  TRPCPortRequest,
} from '../shared/protocol';

export interface MessagePortLike {
  on(event: 'message', listener: (event: { data: unknown }) => void): void;
  on(event: 'close', listener: () => void): void;
  off(event: string, listener: (...args: unknown[]) => void): void;
  postMessage(data: unknown): void;
  start(): void;
  close(): void;
}

export interface CreatePortHandlerOptions<TRouter extends AnyRouter> {
  port: MessagePortLike;
  router: TRouter;
  createContext?: () => Promise<unknown>;
}

export interface PortHandler {
  destroy(): void;
}

export function createPortHandler<TRouter extends AnyRouter>(
  opts: CreatePortHandlerOptions<TRouter>,
): PortHandler {
  const { port, router } = opts;
  const subscriptions = new Map<number, AbortController>();

  function send(msg: ServerMessage): void {
    port.postMessage(msg);
  }

  function sendError(
    id: number,
    cause: unknown,
    method: TRPCPortRequest['method'],
    path: string,
    input: unknown,
  ): void {
    const error = getTRPCErrorFromUnknown(cause);
    const shape = getErrorShape({
      config: router._def._config,
      error,
      type: method,
      path,
      input,
      ctx: undefined,
    });

    send({
      kind: 'error',
      id,
      error: {
        code: shape.data.code,
        message: shape.message,
        data: shape.data,
      },
    });
  }

  async function iterateSubscription(
    id: number,
    iterable: AsyncIterable<unknown>,
    signal: AbortSignal,
    method: TRPCPortRequest['method'],
    path: string,
    input: unknown,
  ): Promise<void> {
    try {
      for await (const value of iterable) {
        if (signal.aborted) break;
        send({ kind: 'result', id, type: 'data', data: value });
      }
      if (!signal.aborted) {
        send({ kind: 'result', id, type: 'stopped' });
      }
    } catch (cause) {
      if (!signal.aborted) {
        sendError(id, cause, method, path, input);
      }
    } finally {
      subscriptions.delete(id);
    }
  }

  async function handleRequest(msg: TRPCPortRequest): Promise<void> {
    const { id, method, path, input } = msg;

    try {
      const ctx = (await opts.createContext?.()) ?? {};

      const ac = method === 'subscription' ? new AbortController() : undefined;
      if (ac) {
        subscriptions.set(id, ac);
      }

      const result = await callProcedure({
        router,
        path,
        type: method,
        getRawInput: async () => input,
        ctx,
        signal: ac?.signal,
        batchIndex: 0,
      });

      if (method === 'subscription' && isAsyncIterable(result)) {
        const signal = ac?.signal;
        if (!signal) {
          throw new Error('Subscription request is missing an abort signal');
        }

        iterateSubscription(id, result, signal, method, path, input);
        return;
      }

      send({ kind: 'result', id, type: 'data', data: result });
    } catch (cause) {
      sendError(id, cause, method, path, input);
    }
  }

  function handleMessage(event: { data: unknown }): void {
    const msg = event.data as ClientMessage;

    if (msg.kind === 'subscription.stop') {
      const ac = subscriptions.get(msg.id);
      if (ac) {
        ac.abort();
        subscriptions.delete(msg.id);
      }
      return;
    }

    if (msg.kind === 'request') {
      handleRequest(msg);
    }
  }

  function cleanup(): void {
    for (const [, ac] of subscriptions) {
      ac.abort();
    }
    subscriptions.clear();
  }

  port.on('message', handleMessage);
  port.on('close', cleanup);
  port.start();

  return {
    destroy() {
      cleanup();
      port.close();
    },
  };
}
