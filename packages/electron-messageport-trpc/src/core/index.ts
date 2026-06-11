import type { AnyRouter } from '@trpc/server';

export type ElectronTRPCRegistry = Record<string, AnyRouter>;

declare const channelRouterType: unique symbol;

export interface ElectronTRPCChannel<TRouter extends AnyRouter = AnyRouter> {
  readonly name: string;
  readonly [channelRouterType]?: TRouter;
}

export type RouterForChannel<TChannel> =
  TChannel extends ElectronTRPCChannel<infer TRouter> ? TRouter : never;

export type ElectronTRPCChannels<TRegistry extends ElectronTRPCRegistry> = {
  readonly [TKey in keyof TRegistry & string]: ElectronTRPCChannel<
    TRegistry[TKey]
  >;
};

export function defineElectronTRPC<
  TRegistry extends ElectronTRPCRegistry,
>(): ElectronTRPCChannels<TRegistry> {
  return new Proxy(
    {},
    {
      get(_target, property) {
        if (typeof property !== 'string') {
          return undefined;
        }
        return { name: property };
      },
    },
  ) as ElectronTRPCChannels<TRegistry>;
}
