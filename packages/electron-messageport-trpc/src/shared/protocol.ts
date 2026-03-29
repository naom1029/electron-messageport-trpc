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

// --- Server → Client ---

export interface TRPCPortResultData {
  kind: 'result';
  id: number;
  type: 'data';
  data: unknown;
}

export interface TRPCPortResultStopped {
  kind: 'result';
  id: number;
  type: 'stopped';
}

export interface TRPCPortError {
  kind: 'error';
  id: number;
  error: {
    code: number;
    message: string;
    data: unknown;
  };
}

export type ServerMessage =
  | TRPCPortResultData
  | TRPCPortResultStopped
  | TRPCPortError;
