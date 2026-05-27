// --- Client → Server ---

export interface TRPCPortRequest {
  kind: 'request';
  id: number;
  method: 'query' | 'mutation' | 'subscription';
  path: string;
  input: unknown;
  lastEventId?: string;
}

export interface TRPCPortSubscriptionStop {
  kind: 'subscription.stop';
  id: number;
}

export type ClientMessage = TRPCPortRequest | TRPCPortSubscriptionStop;

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && !Array.isArray(value) && typeof value === 'object';
}

export function isClientMessage(value: unknown): value is ClientMessage {
  if (!isObject(value)) {
    return false;
  }

  if (value.kind === 'subscription.stop') {
    return typeof value.id === 'number';
  }

  return (
    value.kind === 'request' &&
    typeof value.id === 'number' &&
    typeof value.path === 'string' &&
    (value.method === 'query' ||
      value.method === 'mutation' ||
      value.method === 'subscription') &&
    (value.lastEventId === undefined || typeof value.lastEventId === 'string')
  );
}

// --- Server → Client ---

export interface TRPCPortResultData {
  kind: 'result';
  id: number;
  type: 'data';
  data: unknown;
  eventId?: string;
}

export interface TRPCPortResultStarted {
  kind: 'result';
  id: number;
  type: 'started';
}

export interface TRPCPortResultStopped {
  kind: 'result';
  id: number;
  type: 'stopped';
}

export interface TRPCPortError {
  kind: 'error';
  id: number;
  error: unknown;
}

export type ServerMessage =
  | TRPCPortResultData
  | TRPCPortResultStarted
  | TRPCPortResultStopped
  | TRPCPortError;

export function isServerMessage(value: unknown): value is ServerMessage {
  if (!isObject(value) || typeof value.id !== 'number') {
    return false;
  }

  if (value.kind === 'error') {
    return isObject(value.error);
  }

  return (
    value.kind === 'result' &&
    (value.type === 'data' ||
      value.type === 'started' ||
      value.type === 'stopped')
  );
}
