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

/**
 * Phantom token used as the value in the {@link defineElectronTRPC} input map.
 *
 * IMPORTANT: the type argument is REQUIRED. Always write `channel<MyRouter>()`.
 * Because TypeScript cannot make a type parameter mandatory, a bare `channel()`
 * silently degrades to `ElectronTRPCChannel<{}>` (the empty object type, NOT
 * `unknown`/`any`), weakening type safety for that one channel. A required
 * runtime router argument is intentionally NOT used because it would pull
 * server router code into the preload bundle (router types here are type-only,
 * so importing this into preload is type-erased and safe).
 *
 * Returns a small branded marker object; carries no server runtime.
 */
export function channel<
  TRouter extends AnyRouter,
>(): ElectronTRPCChannel<TRouter> {
  return {} as ElectronTRPCChannel<TRouter>;
}

export function isElectronTRPCChannels(
  value: unknown,
): value is ElectronTRPCChannels<ElectronTRPCRegistry> {
  return (
    !!value &&
    typeof value === 'object' &&
    Array.isArray(
      (value as Record<symbol, unknown>)[electronTRPCRegistryMarker],
    )
  );
}

export function getElectronTRPCChannelNames(
  channels: ElectronTRPCChannels<ElectronTRPCRegistry>,
): string[] {
  const names = (channels as unknown as Record<symbol, unknown>)[
    electronTRPCRegistryMarker
  ];
  return Array.isArray(names) ? [...(names as string[])] : [];
}

export function defineElectronTRPC<
  TChannels extends Record<string, ElectronTRPCChannel<AnyRouter>>,
>(
  channels: TChannels,
): ElectronTRPCChannels<{
  [K in keyof TChannels & string]: RouterForChannel<TChannels[K]>;
}> {
  const channelNames = Object.keys(channels);
  const declared = new Set<string>(channelNames);

  const target = {};
  Object.defineProperty(target, electronTRPCRegistryMarker, {
    value: channelNames,
  });

  return new Proxy(target, {
    get(_target, property) {
      if (typeof property === 'symbol') {
        return Reflect.get(_target, property);
      }
      if (property === 'then') {
        return undefined;
      }
      // Declared channels win over Object.prototype members, so a channel may
      // legitimately be named e.g. "toString" or "valueOf".
      if (declared.has(property)) {
        return { name: property };
      }
      if (Object.hasOwn(Object.prototype, property)) {
        return Reflect.get(_target, property);
      }
      throw new Error(
        `Unknown electron-messageport-trpc channel "${property}". Declared: ${channelNames.join(
          ', ',
        )}`,
      );
    },
  }) as ElectronTRPCChannels<{
    [K in keyof TChannels & string]: RouterForChannel<TChannels[K]>;
  }>;
}
