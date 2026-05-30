import {
  type AnyRouter,
  callTRPCProcedure,
  getErrorShape,
  getTRPCErrorFromUnknown,
  isTrackedEnvelope,
} from '@trpc/server';
import type {
  ClientMessage,
  ServerMessage,
  TRPCPortRequest,
} from '../shared/protocol';
import { isClientMessage } from '../shared/protocol';
import type { DataTransformerOptions } from '../shared/transformer';
import { getTransformer } from '../shared/transformer';

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
  transformer?: DataTransformerOptions;
}

export interface PortHandler {
  destroy(): void;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && !Array.isArray(value) && typeof value === 'object';
}

function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  return isObject(value) && Symbol.asyncIterator in value;
}

function inputWithLastEventId(input: unknown, lastEventId: string | undefined) {
  if (lastEventId === undefined) {
    return input;
  }

  if (isObject(input)) {
    return { ...input, lastEventId };
  }

  return input ?? { lastEventId };
}

export function createPortHandler<TRouter extends AnyRouter>(
  opts: CreatePortHandlerOptions<TRouter>,
): PortHandler {
  const { port, router } = opts;
  const transformer = getTransformer(
    opts.transformer ?? router._def._config.transformer,
  );
  const subscriptions = new Map<number, AbortController>();
  let destroyed = false;

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
      error: transformer.output.serialize({
        code: shape.code,
        message: shape.message,
        data: shape.data,
      }),
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
        if (isTrackedEnvelope(value)) {
          const [eventId, data] = value;
          send({
            kind: 'result',
            id,
            type: 'data',
            eventId,
            data: transformer.output.serialize({ id: eventId, data }),
          });
        } else {
          send({
            kind: 'result',
            id,
            type: 'data',
            data: transformer.output.serialize(value),
          });
        }
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
    const { id, method, path } = msg;
    const input = inputWithLastEventId(
      transformer.input.deserialize(msg.input),
      msg.lastEventId,
    );

    try {
      const ctx = (await opts.createContext?.()) ?? {};

      const ac = method === 'subscription' ? new AbortController() : undefined;
      if (ac) {
        subscriptions.set(id, ac);
      }

      const result = await callTRPCProcedure({
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

        send({ kind: 'result', id, type: 'started' });
        iterateSubscription(id, result, signal, method, path, input);
        return;
      }

      if (method === 'subscription') {
        throw new Error('Subscription procedure must return an async iterable');
      }

      send({
        kind: 'result',
        id,
        type: 'data',
        data: transformer.output.serialize(result),
      });
    } catch (cause) {
      sendError(id, cause, method, path, input);
    }
  }

  function handleMessage(event: { data: unknown }): void {
    if (!isClientMessage(event.data)) {
      return;
    }

    const msg: ClientMessage = event.data;

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
      if (destroyed) {
        return;
      }
      destroyed = true;
      cleanup();
      port.close();
    },
  };
}
