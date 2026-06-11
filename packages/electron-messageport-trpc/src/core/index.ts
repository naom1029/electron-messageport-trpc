import type { AnyRouter } from '@trpc/server';

export type ElectronTRPCRegistry = Record<string, AnyRouter>;

declare const channelRouterType: unique symbol;
const electronTRPCRegistryMarker = Symbol.for(
  'electron-messageport-trpc.registry',
);

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

export function isElectronTRPCChannels(
  value: unknown,
): value is ElectronTRPCChannels<ElectronTRPCRegistry> {
  return (
    !!value &&
    typeof value === 'object' &&
    (value as Record<symbol, unknown>)[electronTRPCRegistryMarker] === true
  );
}

export function defineElectronTRPC<
  TRegistry extends ElectronTRPCRegistry,
>(): ElectronTRPCChannels<TRegistry> {
  const target = {};
  Object.defineProperty(target, electronTRPCRegistryMarker, {
    value: true,
  });

  return new Proxy(target, {
    get(_target, property) {
      if (typeof property !== 'string') {
        return Reflect.get(_target, property);
      }
      return { name: property };
    },
  }) as ElectronTRPCChannels<TRegistry>;
}
