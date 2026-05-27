import type {
  TRPCCombinedDataTransformer,
  TRPCDataTransformer,
} from '@trpc/server';

export type DataTransformerOptions =
  | TRPCCombinedDataTransformer
  | TRPCDataTransformer;

export function getTransformer(
  transformer?: DataTransformerOptions,
): TRPCCombinedDataTransformer {
  if (!transformer) {
    return {
      input: {
        serialize: (data) => data,
        deserialize: (data) => data,
      },
      output: {
        serialize: (data) => data,
        deserialize: (data) => data,
      },
    };
  }

  if ('input' in transformer) {
    return transformer;
  }

  return {
    input: transformer,
    output: transformer,
  };
}
