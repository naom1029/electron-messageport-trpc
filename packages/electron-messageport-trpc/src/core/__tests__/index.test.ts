import type { AnyRouter } from '@trpc/server';
import { describe, expect, expectTypeOf, it } from 'vitest';
import type { ElectronTRPCChannel } from '../index';
import {
  channel,
  defineElectronTRPC,
  getElectronTRPCChannelNames,
  isElectronTRPCChannels,
} from '../index';

// Stand-in router types: only their identity matters for the type-level checks.
type AppRouter = AnyRouter & { __brand: 'app' };
type WorkerRouter = AnyRouter & { __brand: 'worker' };

describe('defineElectronTRPC', () => {
  it('exposes each declared channel as a name-bearing marker', () => {
    // Arrange
    const electronTRPC = defineElectronTRPC({
      main: channel<AppRouter>(),
      worker: channel<WorkerRouter>(),
    });

    // Act
    const main = electronTRPC.main;
    const worker = electronTRPC.worker;

    // Assert
    expect(main).toEqual({ name: 'main' });
    expect(worker).toEqual({ name: 'worker' });
  });

  it('reports its declared channel names through getElectronTRPCChannelNames', () => {
    // Arrange
    const electronTRPC = defineElectronTRPC({
      main: channel<AppRouter>(),
      worker: channel<WorkerRouter>(),
    });

    // Act
    const names = getElectronTRPCChannelNames(electronTRPC);

    // Assert
    expect(names).toEqual(['main', 'worker']);
  });

  it('is recognized as a channels registry', () => {
    // Arrange
    const electronTRPC = defineElectronTRPC({ main: channel<AppRouter>() });

    // Act
    const recognized = isElectronTRPCChannels(electronTRPC);

    // Assert
    expect(recognized).toBe(true);
  });

  it('throws when accessing an undeclared channel name', () => {
    // Arrange
    const electronTRPC = defineElectronTRPC({
      main: channel<AppRouter>(),
      worker: channel<WorkerRouter>(),
    });

    // Act / Assert
    expect(() => (electronTRPC as Record<string, unknown>).typo).toThrow(
      'Unknown electron-messageport-trpc channel "typo". Declared: main, worker',
    );
  });

  it('is not thenable (so it is never awaited as a promise)', () => {
    // Arrange
    const electronTRPC = defineElectronTRPC({ main: channel<AppRouter>() });

    // Act
    const thenProp = (electronTRPC as { then?: unknown }).then;

    // Assert
    expect(thenProp).toBeUndefined();
  });
});

describe('isElectronTRPCChannels', () => {
  it('rejects a plain options object', () => {
    // Arrange
    const optionsLike = { channels: ['main'] };

    // Act
    const recognized = isElectronTRPCChannels(optionsLike);

    // Assert
    expect(recognized).toBe(false);
  });

  it('rejects nullish values', () => {
    // Act / Assert
    expect(isElectronTRPCChannels(undefined)).toBe(false);
    expect(isElectronTRPCChannels(null)).toBe(false);
  });
});

describe('channel (type-level contract)', () => {
  it('yields ElectronTRPCChannel<TRouter> for an explicit type argument', () => {
    expectTypeOf(channel<AppRouter>()).toEqualTypeOf<
      ElectronTRPCChannel<AppRouter>
    >();
  });

  it('documents the known tradeoff: a bare channel() degrades to the empty object type', () => {
    // KNOWN TRADEOFF (same as ts-rest c.type<T>()): without an explicit type
    // argument the router type cannot be inferred and falls back to `{}`.
    // This is unavoidable given preload-safety (no router runtime imported).
    expectTypeOf(channel()).toEqualTypeOf<
      // biome-ignore lint/complexity/noBannedTypes: documenting the {} fallback
      ElectronTRPCChannel<{}>
    >();
  });
});
