import { createTRPCClient, type TRPCClient } from '@trpc/client';
import type {
  ElectronTRPCChannels,
  ElectronTRPCRegistry,
} from '../core/index';
import type { DataTransformerOptions } from '../shared/transformer';
import { portLink } from './portLink';

export type ElectronTRPCRendererClient<
  TRegistry extends ElectronTRPCRegistry,
> = {
  readonly [TKey in keyof TRegistry & string]: TRPCClient<TRegistry[TKey]>;
};

export interface CreateElectronTRPCClientOptions<
  TRegistry extends ElectronTRPCRegistry,
> {
  transformer?: DataTransformerOptions;
  channels?: Partial<
    Record<keyof TRegistry & string, { transformer?: DataTransformerOptions }>
  >;
}

export function createElectronTRPCClient<
  TRegistry extends ElectronTRPCRegistry,
>(
  channels: ElectronTRPCChannels<TRegistry>,
  opts: CreateElectronTRPCClientOptions<TRegistry> = {},
): ElectronTRPCRendererClient<TRegistry> {
  return new Proxy(
    {},
    {
      get(_target, property) {
        if (typeof property !== 'string') {
          return undefined;
        }

        const channel = channels[property as keyof TRegistry & string];
        if (!channel) {
          return undefined;
        }

        const channelOptions =
          opts.channels?.[property as keyof TRegistry & string];
        return createTRPCClient({
          links: [
            portLink({
              channel: channel.name,
              transformer: channelOptions?.transformer ?? opts.transformer,
            }),
          ],
        });
      },
    },
  ) as ElectronTRPCRendererClient<TRegistry>;
}
