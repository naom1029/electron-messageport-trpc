import { createTRPCClient, type TRPCClient } from '@trpc/client';
import type { AnyRouter } from '@trpc/server';
import type { ElectronTRPCChannels, ElectronTRPCRegistry } from '../core/index';
import {
  getElectronTRPCChannelNames,
  isElectronTRPCChannels,
} from '../core/index';
import type { DataTransformerOptions } from '../shared/transformer';
import { portLink } from './portLink';

export type ElectronTRPCRendererClient<TRegistry extends ElectronTRPCRegistry> =
  {
    readonly [TKey in keyof TRegistry & string]: TRPCClient<TRegistry[TKey]>;
  };

export interface CreateElectronTRPCSingleClientOptions {
  transformer?: DataTransformerOptions;
}

export interface CreateElectronTRPCClientOptions<
  TRegistry extends ElectronTRPCRegistry,
> {
  transformer?: DataTransformerOptions;
  channels?: Partial<
    Record<keyof TRegistry & string, { transformer?: DataTransformerOptions }>
  >;
}

export function createElectronTRPCClient<TRouter extends AnyRouter>(
  opts?: CreateElectronTRPCSingleClientOptions,
): TRPCClient<TRouter>;
export function createElectronTRPCClient<
  TRegistry extends ElectronTRPCRegistry,
>(
  channels: ElectronTRPCChannels<TRegistry>,
  opts?: CreateElectronTRPCClientOptions<TRegistry>,
): ElectronTRPCRendererClient<TRegistry>;
export function createElectronTRPCClient<
  TRegistry extends ElectronTRPCRegistry,
>(
  channelsOrOpts?:
    | ElectronTRPCChannels<TRegistry>
    | CreateElectronTRPCSingleClientOptions,
  opts: CreateElectronTRPCClientOptions<TRegistry> = {},
): TRPCClient<AnyRouter> | ElectronTRPCRendererClient<TRegistry> {
  if (!isElectronTRPCChannels(channelsOrOpts)) {
    const singleOpts = channelsOrOpts as CreateElectronTRPCSingleClientOptions;
    return createTRPCClient({
      links: [portLink({ transformer: singleOpts?.transformer })],
    });
  }

  const channels = channelsOrOpts;
  const declared = new Set(getElectronTRPCChannelNames(channels));
  const clients = new Map<
    string,
    TRPCClient<TRegistry[keyof TRegistry & string]>
  >();

  return new Proxy(
    {},
    {
      get(_target, property) {
        // Only declared channels resolve to a client. Anything else (symbols,
        // `then` so the proxy is not thenable even if a channel is pathologically
        // named "then", Object.prototype members, typos) returns undefined rather
        // than reaching the registry proxy's throw.
        if (
          typeof property !== 'string' ||
          property === 'then' ||
          !declared.has(property)
        ) {
          return undefined;
        }

        const channel = channels[property as keyof TRegistry & string];

        const client = clients.get(property);
        if (client) {
          return client;
        }

        const channelOptions =
          opts.channels?.[property as keyof TRegistry & string];
        const nextClient = createTRPCClient({
          links: [
            portLink({
              channel: channel.name,
              transformer: channelOptions?.transformer ?? opts.transformer,
            }),
          ],
        });
        clients.set(property, nextClient);
        return nextClient;
      },
    },
  ) as ElectronTRPCRendererClient<TRegistry>;
}
