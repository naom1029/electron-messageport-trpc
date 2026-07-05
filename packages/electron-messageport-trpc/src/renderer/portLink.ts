import type { TRPCLink } from '@trpc/client';
import { TRPCClientError } from '@trpc/client';
import type { AnyRouter } from '@trpc/server';
import { observable } from '@trpc/server/observable';
import {
  type AsyncIterableQueue,
  createAsyncIterableQueue,
} from '../shared/asyncIterableQueue';
import { decodeCloneSafe, encodeCloneSafe } from '../shared/cloneSafe';
import type { ClientMessage, ServerMessage } from '../shared/protocol';
import { isServerMessage } from '../shared/protocol';
import { nextRequestId } from '../shared/requestId';
import type { DataTransformerOptions } from '../shared/transformer';
import { getTransformer } from '../shared/transformer';
import { getPort } from './receivePort';

interface RendererPortLike {
  addEventListener(
    event: 'message',
    listener: (event: MessageEvent) => void,
  ): void;
  removeEventListener(
    event: 'message',
    listener: (event: MessageEvent) => void,
  ): void;
  postMessage(data: unknown): void;
  start(): void;
  close(): void;
}

export interface PortLinkOptions {
  port?: RendererPortLike | Promise<RendererPortLike>;
  channel?: string;
  transformer?: DataTransformerOptions;
}

interface ResultData {
  type: 'data';
  data: unknown;
  id?: string;
}

interface PendingRequest {
  onData(value: ResultData): void;
  onStarted(): void;
  onError(error: unknown): void;
  onComplete(): void;
  onStopped(): void;
  type: 'query' | 'mutation' | 'subscription';
  streaming: boolean;
  handedOff: boolean;
  stream?: AsyncIterableQueue<unknown>;
  abort(): void;
}

function createAbortError(): Error {
  if (typeof DOMException !== 'undefined') {
    return new DOMException('AbortError', 'AbortError');
  }
  const error = new Error('AbortError');
  error.name = 'AbortError';
  return error;
}

export function portLink<TRouter extends AnyRouter>(
  opts: PortLinkOptions = {},
): TRPCLink<TRouter> {
  return () => {
    const portPromise = Promise.resolve(
      opts.port ?? getPort({ channel: opts.channel }),
    );
    const transformer = getTransformer(opts.transformer);
    const pending = new Map<number, PendingRequest>();
    let resolvedPort: RendererPortLike | null = null;
    let initialized = false;

    function handleMessage(event: MessageEvent): void {
      const message = decodeCloneSafe(event.data);
      if (!isServerMessage(message)) {
        return;
      }

      const msg: ServerMessage = message;
      const req = pending.get(msg.id);
      if (!req) return;

      if (msg.kind === 'error') {
        pending.delete(msg.id);
        req.stream?.error(transformer.output.deserialize(msg.error));
        req.onError(
          TRPCClientError.from({
            error: transformer.output.deserialize(msg.error),
          }),
        );
      } else if (msg.kind === 'result' && msg.type === 'data') {
        const data = transformer.output.deserialize(msg.data);
        if (req.streaming && req.type !== 'subscription') {
          req.stream?.push(msg.eventId ? { id: msg.eventId, data } : data);
        } else {
          req.onData(
            msg.eventId
              ? { type: 'data', id: msg.eventId, data }
              : { type: 'data', data },
          );
        }
        if (req.type !== 'subscription' && !req.streaming) {
          pending.delete(msg.id);
          req.onComplete();
        }
      } else if (msg.kind === 'result' && msg.type === 'started') {
        req.streaming = true;
        if (req.type === 'subscription') {
          req.onStarted();
        } else {
          const stream = createAsyncIterableQueue<unknown>(() => {
            if (pending.delete(msg.id)) {
              req.abort();
            }
          });
          req.stream = stream;
          req.handedOff = true;
          req.onData({ type: 'data', data: stream.iterable });
        }
      } else if (msg.kind === 'result' && msg.type === 'stopped') {
        pending.delete(msg.id);
        req.stream?.complete();
        if (req.type === 'subscription') {
          req.onStopped();
        }
        req.onComplete();
      }
    }

    async function ensurePort(): Promise<RendererPortLike> {
      if (resolvedPort) return resolvedPort;
      resolvedPort = await portPromise;
      if (!initialized) {
        resolvedPort.addEventListener('message', handleMessage);
        resolvedPort.start();
        initialized = true;
      }
      return resolvedPort;
    }

    return ({ op }) => {
      return observable((observer) => {
        const id = nextRequestId();
        let abortListener: (() => void) | null = null;

        function cleanupPending(): boolean {
          const hadPending = pending.delete(id);
          if (abortListener) {
            op.signal?.removeEventListener('abort', abortListener);
            abortListener = null;
          }
          return hadPending;
        }

        function sendAbort(kind: 'request.abort' | 'subscription.stop'): void {
          const message: ClientMessage = { kind, id };
          if (resolvedPort) {
            try {
              resolvedPort.postMessage(message);
            } catch {
              // The operation is already being torn down.
            }
            return;
          }

          ensurePort()
            .then((port) => {
              try {
                port.postMessage(message);
              } catch {
                // The operation is already being torn down.
              }
            })
            .catch(() => {
              // The operation is already being torn down.
            });
        }

        abortListener = () => {
          if (!cleanupPending()) {
            return;
          }
          sendAbort(
            op.type === 'subscription' ? 'subscription.stop' : 'request.abort',
          );
          observer.error(TRPCClientError.from(createAbortError()));
        };

        if (op.signal?.aborted) {
          observer.error(TRPCClientError.from(createAbortError()));
          return () => {};
        }

        op.signal?.addEventListener('abort', abortListener, { once: true });

        pending.set(id, {
          type: op.type,
          streaming: false,
          handedOff: false,
          abort() {
            sendAbort(
              op.type === 'subscription'
                ? 'subscription.stop'
                : 'request.abort',
            );
          },
          onData(data) {
            observer.next({ result: data });
          },
          onStarted() {
            observer.next({ result: { type: 'started' } });
          },
          onComplete() {
            cleanupPending();
            observer.complete();
          },
          onStopped() {
            observer.next({ result: { type: 'stopped' } });
          },
          onError(error) {
            cleanupPending();
            observer.error(
              error instanceof TRPCClientError
                ? error
                : error instanceof Error
                  ? TRPCClientError.from(error)
                  : TRPCClientError.from(error as object),
            );
          },
        });

        ensurePort()
          .then(async (port) => {
            if (op.signal?.aborted) {
              throw createAbortError();
            }
            const message: ClientMessage = {
              kind: 'request',
              id,
              method: op.type,
              path: op.path,
              input: transformer.input.serialize(op.input),
            };
            port.postMessage(await encodeCloneSafe(message));
          })
          .catch((error) => {
            cleanupPending();
            observer.error(TRPCClientError.from(error));
          });

        return () => {
          const request = pending.get(id);
          if (request?.handedOff) {
            return;
          }
          if (!cleanupPending()) {
            return;
          }
          sendAbort(
            op.type === 'subscription' ? 'subscription.stop' : 'request.abort',
          );
        };
      });
    };
  };
}
