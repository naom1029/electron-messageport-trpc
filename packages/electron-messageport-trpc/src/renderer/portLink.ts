import type { TRPCLink } from '@trpc/client';
import { TRPCClientError } from '@trpc/client';
import type { AnyRouter } from '@trpc/server';
import { observable } from '@trpc/server/observable';
import type { ClientMessage, ServerMessage } from '../shared/protocol';

export interface RendererPortLike {
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
  port: RendererPortLike | Promise<RendererPortLike>;
}

interface PendingRequest {
  onData(value: unknown): void;
  onError(error: unknown): void;
  onComplete(): void;
  type: 'query' | 'mutation' | 'subscription';
}

export function portLink<TRouter extends AnyRouter>(
  opts: PortLinkOptions,
): TRPCLink<TRouter> {
  return () => {
    const portPromise = Promise.resolve(opts.port);
    const pending = new Map<number, PendingRequest>();
    let idCounter = 0;
    let resolvedPort: RendererPortLike | null = null;
    let initialized = false;

    function handleMessage(event: MessageEvent): void {
      const msg = event.data as ServerMessage;
      const req = pending.get(msg.id);
      if (!req) return;

      if (msg.kind === 'error') {
        pending.delete(msg.id);
        req.onError(TRPCClientError.from({ error: msg.error }));
      } else if (msg.kind === 'result' && msg.type === 'data') {
        req.onData(msg.data);
        if (req.type !== 'subscription') {
          pending.delete(msg.id);
          req.onComplete();
        }
      } else if (msg.kind === 'result' && msg.type === 'stopped') {
        pending.delete(msg.id);
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
        const id = ++idCounter;

        pending.set(id, {
          type: op.type,
          onData(data) {
            observer.next({ result: { type: 'data', data } });
          },
          onComplete() {
            observer.complete();
          },
          onError(error) {
            observer.error(
              error instanceof TRPCClientError
                ? error
                : error instanceof Error
                  ? TRPCClientError.from(error)
                  : TRPCClientError.from(error as object),
            );
          },
        });

        ensurePort().then((port) => {
          const message: ClientMessage = {
            kind: 'request',
            id,
            method: op.type,
            path: op.path,
            input: op.input,
          };
          port.postMessage(message);
        });

        return () => {
          pending.delete(id);
          if (op.type === 'subscription' && resolvedPort) {
            const stopMsg: ClientMessage = {
              kind: 'subscription.stop',
              id,
            };
            resolvedPort.postMessage(stopMsg);
          }
        };
      });
    };
  };
}
