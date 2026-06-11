# TODO

## electron-messageport-trpc follow-ups

- [x] `0.5.0` high-level API
  - Added main-only default channel API for the quickstart path.
  - Added `defineElectronTRPC()` as the opt-in channel/router type contract for multi-topology apps.
  - Added renderer `createElectronTRPCClient()`.
  - Added preload `exposeElectronTRPC()`.
  - Added main `createElectronTRPCMain()`.
  - Added main-to-utility `createElectronTRPCUtilityClient()`.
  - Added utility pools with `createElectronTRPCUtilityPool()`.
  - Added renderer-to-utility broker helper.
  - Added utility-side `createElectronTRPCUtility()`.
  - Changed renderer port storage from one singleton promise to a channel-keyed map.
  - Kept `portLink`, `mainPortLink`, `createPortHandler`, and `createPortBroker` as low-level escape hatches.

- [x] Utility handler correctness
  - Added `transformer` passthrough to `createParentPortHandler()`.
  - Added optional channel filtering.
  - Added `destroy()` while preserving the `handlers` array.

- [x] Quickstart ergonomics
  - `createElectronTRPCMain({ router, windows })` covers renderer-to-main without a registry.
  - `createElectronTRPCClient<AppRouter>()` covers renderer-to-main without a registry.
  - `portLink()` can now use the default renderer channel without an explicit `getPort()`.
  - Docs use the registry API only for multiple typed channels.

- [ ] Remaining API design follow-ups
  - Consider dynamic window registration:
    - possible shape: returned main handler gains `addWindow(window)` / `removeWindow(window)`
    - `windows` remains the initial set
  - Consider explicit lifecycle for `createElectronTRPCUtilityClient()`.
    - It currently returns a normal tRPC client.
    - A separate handle may be useful if users need to close the underlying `MessagePortMain`.
  - Confirm whether `createWindowMessagePortHandler()` and `createParentPortHandler()` should be documented as legacy or only low-level.
  - Keep `initTRPC` as the owner of routers, procedures, context, middleware, transformer, and inference.
  - Keep this library focused on MessagePort setup, preload exposure, window/utility routing, lifecycle, and typed channel topology.

- [x] `Blob` input support
  - Implemented transport-level Blob encoding before `postMessage()`.
  - Confirmed with the test project: `Blob non-JSON input` passes.
  - Raw Electron MessagePort observation remains useful context:
    - `ArrayBuffer` payload reaches main as `ArrayBuffer`.
    - wrapped `Blob` payload reaches main as `null`.
    - bare `Blob` payload reaches main as `null`.
  - The support belongs in this package's transport layer, not in tRPC transformer documentation.

- [x] query/mutation async iterable streaming support
  - Implemented queue-backed `AsyncIterable` handoff for non-subscription streaming results.
  - Confirmed with the test project: `query async iterable streaming` passes.

- [ ] performance test and tuning
  - Add performance checks in the test app separately from the v11 compatibility checks.
  - Measure at least:
    - raw structured-clone transport without transformer
    - transformer-enabled transport, especially `superjson`
    - small request bursts
    - large plain object / JSON-like payloads
    - deeply nested object payloads
    - large arrays of records
    - large `Uint8Array` / `ArrayBuffer` payloads
    - mixed payloads that include `Date`, `Map`, `Set`, `BigInt`, and typed arrays
    - concurrent requests across one `portLink`
    - concurrent requests across multiple link instances sharing one port
    - subscription throughput and teardown cost
  - Compare:
    - latency p50 / p95 / p99
    - throughput in bytes/sec
    - CPU-heavy mixed workload impact
    - serialization/deserialization time for large object graphs
    - memory growth during large payload or long subscription runs
  - Things likely worth tuning:
    - avoid unnecessary serialization when transformer is not configured
    - avoid repeated transformer lookup per operation
    - avoid extra object allocation in hot message paths
    - avoid copying large binary payloads more than MessagePort requires
    - check whether `superjson` significantly slows binary-heavy paths
    - investigate opt-in transfer lists for large structured-clone payloads
      - keep the default behavior as clone-based to avoid detaching user-owned buffers
      - consider an explicit option such as `getTransferables(message)` or `transfer: 'auto'`
      - compare `ArrayBuffer` clone vs transfer throughput and latency
      - document that transferred `ArrayBuffer`s are detached on the sender side
      - start with `ArrayBuffer` only; treat `SharedArrayBuffer`, typed-array views, `Blob`, and transformer-enabled payloads separately
  - Keep this as benchmark/diagnostic work first; only optimize after measuring a real bottleneck.

- [ ] React Query integration smoke test
  - Verify `@trpc/react-query` works with `portLink` as the terminating link.
  - Add a small Electron renderer test app view or route that uses:
    - `createTRPCReact<AppRouter>()`
    - `QueryClientProvider`
    - `trpc.Provider`
    - `useQuery`
    - `useMutation`
    - `useSubscription`
    - invalidation / refetch
  - Confirm React Query cancellation behavior:
    - unmounting a component cancels an in-flight query
    - the generated tRPC operation carries `op.signal`
    - the server procedure receives an aborted `AbortSignal`
  - This should be a smoke/integration check, not a new API surface.

- [x] utility process transformer option
  - `createParentPortHandler()` exposes `transformer?: DataTransformerOptions`.
  - `createElectronTRPCUtility()` passes the transformer through to the utility handler.
  - The test project confirmed renderer-to-main and renderer-to-utility channels can be used simultaneously.

- [ ] utility process smoke coverage follow-up
  - Keep expanding the Electron test project coverage for:
    - main-to-utility query/mutation/subscription
    - explicit transformer option
    - query abort propagation
    - renderer-to-utility broker path
  - Unit tests cover `mainPortLink` with `MessagePortMain`-compatible ports, but recurring Electron runtime smoke coverage should remain part of release validation.
