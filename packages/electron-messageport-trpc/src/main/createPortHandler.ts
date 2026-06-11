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
import { decodeCloneSafe, encodeCloneSafe } from '../shared/cloneSafe';
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

function isTrackedEnvelopeLike(
  value: unknown,
): value is [string, unknown, symbol] {
  return (
    isTrackedEnvelope(value) ||
    (Array.isArray(value) &&
      value.length === 3 &&
      typeof value[0] === 'string' &&
      typeof value[2] === 'symbol')
  );
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
  const requests = new Map<number, AbortController>();
  let destroyed = false;

  async function send(msg: ServerMessage): Promise<void> {
    port.postMessage(await encodeCloneSafe(msg));
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

    void send({
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
        if (isTrackedEnvelopeLike(value)) {
          const [eventId, data] = value;
          await send({
            kind: 'result',
            id,
            type: 'data',
            eventId,
            data: transformer.output.serialize({ id: eventId, data }),
          });
        } else {
          await send({
            kind: 'result',
            id,
            type: 'data',
            data: transformer.output.serialize(value),
          });
        }
      }
      if (!signal.aborted) {
        await send({ kind: 'result', id, type: 'stopped' });
      }
    } catch (cause) {
      if (!signal.aborted) {
        sendError(id, cause, method, path, input);
      }
    } finally {
      requests.delete(id);
    }
  }

  async function handleRequest(msg: TRPCPortRequest): Promise<void> {
    const { id, method, path } = msg;
    const input = inputWithLastEventId(
      transformer.input.deserialize(decodeCloneSafe(msg.input)),
      msg.lastEventId,
    );
    const ac = new AbortController();
    requests.set(id, ac);
    let streaming = false;

    try {
      const ctx = (await opts.createContext?.()) ?? {};

      const result = await callTRPCProcedure({
        router,
        path,
        type: method,
        getRawInput: async () => input,
        ctx,
        signal: ac.signal,
        batchIndex: 0,
      });

      if (ac.signal.aborted) {
        return;
      }

      if (isAsyncIterable(result)) {
        streaming = true;
        await send({ kind: 'result', id, type: 'started' });
        iterateSubscription(id, result, ac.signal, method, path, input);
        return;
      }

      if (method === 'subscription') {
        throw new Error('Subscription procedure must return an async iterable');
      }

      await send({
        kind: 'result',
        id,
        type: 'data',
        data: transformer.output.serialize(result),
      });
    } catch (cause) {
      if (!ac.signal.aborted) {
        sendError(id, cause, method, path, input);
      }
    } finally {
      if (method !== 'subscription' && !streaming) {
        requests.delete(id);
      }
    }
  }

  function handleMessage(event: { data: unknown }): void {
    if (!isClientMessage(event.data)) {
      return;
    }

    const msg: ClientMessage = event.data;

    if (msg.kind === 'subscription.stop') {
      const ac = requests.get(msg.id);
      if (ac) {
        ac.abort();
        requests.delete(msg.id);
      }
      return;
    }

    if (msg.kind === 'request.abort') {
      const ac = requests.get(msg.id);
      if (ac) {
        ac.abort();
        requests.delete(msg.id);
      }
      return;
    }

    if (msg.kind === 'request') {
      handleRequest(msg);
    }
  }

  function cleanup(): void {
    for (const [, ac] of requests) {
      ac.abort();
    }
    requests.clear();
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
