import type { TRPCLink } from '@trpc/client';
import { TRPCClientError } from '@trpc/client';
import type { AnyRouter } from '@trpc/server';
import { observable } from '@trpc/server/observable';
import type { ClientMessage, ServerMessage } from '../shared/protocol';
import { isServerMessage } from '../shared/protocol';
import { nextRequestId } from '../shared/requestId';

interface MainPortMessageEvent {
  data: unknown;
}

export interface MainPortLike {
  on(event: 'message', listener: (event: MainPortMessageEvent) => void): void;
  off(event: 'message', listener: (event: MainPortMessageEvent) => void): void;
  postMessage(data: unknown): void;
  start(): void;
  close(): void;
}

export interface MainPortLinkOptions {
  port: MainPortLike | Promise<MainPortLike>;
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
}

export function mainPortLink<TRouter extends AnyRouter>(
  opts: MainPortLinkOptions,
): TRPCLink<TRouter> {
  return () => {
    const portPromise = Promise.resolve(opts.port);
    const pending = new Map<number, PendingRequest>();
    let resolvedPort: MainPortLike | null = null;
    let initialized = false;

    function handleMessage(event: MainPortMessageEvent): void {
      if (!isServerMessage(event.data)) {
        return;
      }

      const msg: ServerMessage = event.data;
      const req = pending.get(msg.id);
      if (!req) return;

      if (msg.kind === 'error') {
        pending.delete(msg.id);
        req.onError(TRPCClientError.from({ error: msg.error }));
      } else if (msg.kind === 'result' && msg.type === 'data') {
        req.onData(
          msg.eventId
            ? { type: 'data', id: msg.eventId, data: msg.data }
            : { type: 'data', data: msg.data },
        );
        if (req.type !== 'subscription') {
          pending.delete(msg.id);
          req.onComplete();
        }
      } else if (msg.kind === 'result' && msg.type === 'started') {
        req.onStarted();
      } else if (msg.kind === 'result' && msg.type === 'stopped') {
        pending.delete(msg.id);
        req.onStopped();
        req.onComplete();
      }
    }

    async function ensurePort(): Promise<MainPortLike> {
      if (resolvedPort) return resolvedPort;
      resolvedPort = await portPromise;
      if (!initialized) {
        resolvedPort.on('message', handleMessage);
        resolvedPort.start();
        initialized = true;
      }
      return resolvedPort;
    }

    return ({ op }) => {
      return observable((observer) => {
        const id = nextRequestId();

        pending.set(id, {
          type: op.type,
          onData(data) {
            observer.next({ result: data });
          },
          onStarted() {
            observer.next({ result: { type: 'started' } });
          },
          onComplete() {
            observer.complete();
          },
          onStopped() {
            observer.next({ result: { type: 'stopped' } });
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
