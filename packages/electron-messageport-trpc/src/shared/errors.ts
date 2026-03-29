import { TRPCError } from '@trpc/server';

export function getTRPCErrorFromUnknown(cause: unknown): TRPCError {
  if (cause instanceof TRPCError) {
    return cause;
  }

  if (cause instanceof Error) {
    return new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: cause.message,
      cause,
    });
  }

  return new TRPCError({
    code: 'INTERNAL_SERVER_ERROR',
    message: String(cause),
  });
}
