import type { TRPCClient } from '@trpc/client';
import { initTRPC } from '@trpc/server';
import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  channel,
  defineElectronTRPC,
  type ElectronTRPCChannel,
  type RouterForChannel,
} from '../core/index';
import { createElectronTRPCMain } from '../main/electronTRPC';
import { createElectronTRPCClient } from '../renderer/createElectronTRPCClient';

// Two distinct routers so per-channel router types are observable downstream.
const t = initTRPC.create();

const appRouter = t.router({
  app: t.procedure.query(() => 'app' as const),
});
type AppRouter = typeof appRouter;

const workerRouter = t.router({
  worker: t.procedure.query(() => 'worker' as const),
});
type WorkerRouter = typeof workerRouter;

// Canonical single source of truth for the registry-based topology.
const electronTRPC = defineElectronTRPC({
  main: channel<AppRouter>(),
  worker: channel<WorkerRouter>(),
});

describe('public inference contract', () => {
  it('createElectronTRPCClient<TRouter>() yields TRPCClient<TRouter>', () => {
    // Act
    const client = createElectronTRPCClient<AppRouter>();

    // Assert
    expectTypeOf(client).toEqualTypeOf<TRPCClient<AppRouter>>();
  });

  it('createElectronTRPCClient(registry) yields a per-channel client keyed by channel', () => {
    // Act
    const clients = createElectronTRPCClient(electronTRPC);

    // Assert: each declared channel carries its own router type.
    expectTypeOf(clients.main).toEqualTypeOf<TRPCClient<AppRouter>>();
    expectTypeOf(clients.worker).toEqualTypeOf<TRPCClient<WorkerRouter>>();
  });

  it('per-channel client keys are exactly the declared channel names', () => {
    // Act
    const clients = createElectronTRPCClient(electronTRPC);

    // Assert
    expectTypeOf(clients).toHaveProperty('main');
    expectTypeOf(clients).toHaveProperty('worker');
    expectTypeOf<keyof typeof clients>().toEqualTypeOf<'main' | 'worker'>();
  });

  it('defineElectronTRPC infers per-channel router types from the input object', () => {
    // Assert: each channel marker carries its declared router type.
    expectTypeOf(electronTRPC.main).toEqualTypeOf<
      ElectronTRPCChannel<AppRouter>
    >();
    expectTypeOf(electronTRPC.worker).toEqualTypeOf<
      ElectronTRPCChannel<WorkerRouter>
    >();
    expectTypeOf<
      RouterForChannel<typeof electronTRPC.main>
    >().toEqualTypeOf<AppRouter>();
    expectTypeOf<
      RouterForChannel<typeof electronTRPC.worker>
    >().toEqualTypeOf<WorkerRouter>();
  });

  it('accessing an undeclared channel on the registry is a type error (and throws at runtime)', () => {
    // Contract: an undeclared channel is BOTH a compile-time type error AND a
    // runtime throw. The @ts-expect-error locks the type-level guarantee; the
    // expect(...).toThrow locks the runtime guarantee.
    expect(() => {
      // @ts-expect-error - "typo" is not a declared channel name.
      electronTRPC.typo;
    }).toThrow(
      'Unknown electron-messageport-trpc channel "typo". Declared: main, worker',
    );
  });

  it('createElectronTRPCMain(registry) accepts routers for all declared channels', () => {
    // Act + Assert: a full RouterMap typechecks.
    createElectronTRPCMain({
      channels: electronTRPC,
      windows: [],
      routers: { main: appRouter, worker: workerRouter },
    });
  });

  it('createElectronTRPCMain(registry) accepts a subset (other channels may be served by other processes)', () => {
    // Act + Assert: main hosts only "main"; "worker" can be served by a utility
    // process or brokered, so a partial RouterMap must typecheck.
    createElectronTRPCMain({
      channels: electronTRPC,
      windows: [],
      routers: { main: appRouter },
    });
  });

  it('createElectronTRPCMain(registry) rejects a router for an undeclared channel', () => {
    createElectronTRPCMain({
      channels: electronTRPC,
      windows: [],
      // @ts-expect-error - "ghost" is not a declared channel in the registry.
      routers: { main: appRouter, ghost: workerRouter },
    });
  });
});
