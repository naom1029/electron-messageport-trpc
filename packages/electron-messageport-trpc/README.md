# electron-messageport-trpc

MessagePort transport for tRPC v11 in Electron.

This package connects Electron `MessagePort` channels to normal tRPC v11
clients and routers. It keeps application code close to standard tRPC while
using MessagePort connections that can be handed to different Electron
processes.

The same transport works for renderer-to-main, main-to-utility, and
renderer-to-utility -- and a renderer can talk directly to a utility process
without the main process in the request path.

## Features

- tRPC v11 over MessagePort: queries, mutations, subscriptions, inference, middleware, and errors across Electron processes
- Main-to-utility and renderer-to-utility topologies for offloading work

## Installation

```bash
pnpm add electron-messageport-trpc @trpc/server @trpc/client
```

```bash
npm install electron-messageport-trpc @trpc/server @trpc/client
```

## Requirements

| Dependency | Version |
|---|---|
| Electron | >= 22 |
| Node.js | >= 20 |
| @trpc/server | ^11.17.0 |
| @trpc/client | ^11.17.0 |

## Quick Start: Renderer to Main

This is the standard setup: the renderer creates a tRPC client and calls a router
running in the Electron main process.

### 1. Define a router in the main process

```typescript
// electron/router.ts
import { initTRPC } from '@trpc/server';
import { z } from 'zod';

const t = initTRPC.create();

export const appRouter = t.router({
  // Query: get greeting
  greet: t.procedure
    .input(z.object({ name: z.string() }))
    .query(({ input }) => {
      return { message: `Hello, ${input.name}!` };
    }),

  // Subscription: server time tick
  timeTick: t.procedure.subscription(async function* (opts) {
    while (!opts.signal?.aborted) {
      yield { time: new Date().toISOString() };
      await new Promise((r) => setTimeout(r, 1000));
    }
  }),
});

export type AppRouter = typeof appRouter;
```

### 2. Attach the router to a BrowserWindow

```typescript
// electron/main.ts
import path from 'node:path';
import { app, BrowserWindow } from 'electron';
import { createElectronTRPCMain } from 'electron-messageport-trpc/main';
import { appRouter } from './router';

async function createWindow() {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  createElectronTRPCMain({
    router: appRouter,
    windows: [win],
  });

  await win.loadFile(path.join(__dirname, '../dist/index.html'));
}

app.whenReady().then(createWindow);
```

`createElectronTRPCMain()` connects each window's renderer to your router and
re-establishes the connection on every reload. Pass every window that should use
this router, or create one handler per window when windows are created
dynamically.

### 3. Expose the client connection from preload

```typescript
// preload/index.ts
import { exposeElectronTRPC } from 'electron-messageport-trpc/preload';

exposeElectronTRPC();
```

`exposeElectronTRPC()` runs in the preload script and makes the connection
available to the renderer, so the renderer can use a normal tRPC client. With
`contextIsolation: true`, this is the one line of preload setup the package
needs.

### 4. Create the tRPC client in the renderer

```typescript
// src/trpc.ts
import { createElectronTRPCClient } from 'electron-messageport-trpc/renderer';
import type { AppRouter } from '../electron/router';

export const trpc = createElectronTRPCClient<AppRouter>();
```

Procedures are called as flat, fully typed methods on the client:

```typescript
const greeting = await trpc.greet.query({ name: 'World' });
console.log(greeting.message); // "Hello, World!"

const subscription = trpc.timeTick.subscribe(undefined, {
  onData(data) {
    console.log('Server time:', data.time);
  },
});

// Later, when you no longer need updates:
subscription.unsubscribe();
```

## Beyond Renderer to Main

The setup above is all you need for a single renderer-to-main channel. For
multiple typed channels or utility-process routers, define a channel registry
**contract-first** with `defineElectronTRPC()` and `channel<Router>()` tokens —
one object is the single source of truth, and both channel names and router types
are inferred from it:

```typescript
// electron/trpc.ts
import { channel, defineElectronTRPC } from 'electron-messageport-trpc';
import type { AppRouter } from './router';
import type { WorkerRouter } from '../utility/router';

export const electronTRPC = defineElectronTRPC({
  main: channel<AppRouter>(),
  worker: channel<WorkerRouter>(),
});
```

Pass the registry to `exposeElectronTRPC(electronTRPC)` in preload (which also
restricts the renderer to the declared channels) and to
`createElectronTRPCClient(electronTRPC)` in the renderer (namespace by channel,
e.g. `.worker`). The utility helpers (`createElectronTRPCUtility`,
`createElectronTRPCUtilityClient`, `createElectronTRPCRendererUtilityBridge`) take
a single channel such as `electronTRPC.worker`; the utility `ready` handshake is
automatic. See the
[documentation site](https://naom1029.github.io/electron-messageport-trpc/) and
the [`examples/main-utility`](https://github.com/naom1029/electron-messageport-trpc/tree/main/examples/main-utility)
and [`examples/renderer-utility`](https://github.com/naom1029/electron-messageport-trpc/tree/main/examples/renderer-utility)
projects.

## Entry Points

| Entry point | Use it from | Purpose |
|---|---|---|
| `electron-messageport-trpc/main` | Electron main process | Attach routers, create main-side clients, broker ports |
| `electron-messageport-trpc/preload` | Preload script | Expose the connection to the renderer |
| `electron-messageport-trpc/renderer` | Renderer process | Create a tRPC client over the received port |
| `electron-messageport-trpc/utility` | Electron utility process | Attach a router to `process.parentPort` |

Common imports:

```typescript
import { channel, defineElectronTRPC } from 'electron-messageport-trpc';
import {
  createElectronTRPCMain,
  createElectronTRPCRendererUtilityBridge,
  createElectronTRPCUtilityClient,
  createElectronTRPCUtilityPool,
  createPortBroker,
  createPortHandler,
  mainPortLink,
} from 'electron-messageport-trpc/main';
import { exposeElectronTRPC, exposePortReceiver } from 'electron-messageport-trpc/preload';
import { createElectronTRPCClient, getPort, portLink } from 'electron-messageport-trpc/renderer';
import { createElectronTRPCUtility, createParentPortHandler } from 'electron-messageport-trpc/utility';
```

## Which API Should I Use?

| API | Use when |
|---|---|
| `createElectronTRPCMain` | A renderer window calls procedures on a main-process router. This is the default choice. |
| `createElectronTRPCClient` | The renderer creates a typed tRPC client for the default main channel or a typed channel registry. |
| `createElectronTRPCUtilityClient` / `createElectronTRPCUtilityPool` | Main calls one or more utility-process routers. Both return a `destroy` handle (`{ client, destroy }` / `pool.destroy()`). |
| `createElectronTRPCRendererUtilityBridge` | Main brokers renderer-to-utility ports while staying out of the request path. |
| `defineElectronTRPC` / `channel` | Declare a typed channel registry (contract-first) for multi-channel or utility topologies. |
| `portLink` | The renderer creates a tRPC client from the port received by `getPort()`. |
| `mainPortLink` | The main process creates a tRPC client over a `MessagePortMain`, usually to call a utility process. |
| `createElectronTRPCUtility` | A utility process exposes a typed registry channel on `process.parentPort`. |
| `createParentPortHandler` | Low-level utility-process handler. |
| `createPortBroker` | Main only brokers a port between renderer and utility, keeping main out of the request path. |
| `createPortHandler` | Low-level helper for attaching a router to an existing protocol-dedicated port manually. |

## Lifecycle

- `createElectronTRPCMain()` returns a handler with `addWindow(window)` / `removeWindow(window)` (wire or tear down a single window) and `destroy()` (tear down every window).
- Call `handler.destroy()` when tearing down a handler or before app quit if you keep a long-lived handler reference.
- Destroying a handler closes the port and aborts active subscriptions.
- `createElectronTRPCUtilityClient()` / `createElectronTRPCUtilityPool()` return `destroy` handles; call them (or `pool.destroy()`) to close kept ports and detach listeners. They also tear down automatically when the utility process exits.

## Current Constraints

- Treat each MessagePort passed to this package as dedicated to the electron-messageport-trpc protocol.
- Do not use the same MessagePort for app-defined `postMessage()` traffic.
- Messages that do not match the electron-messageport-trpc protocol are discarded.
- Inputs and results are sent through `MessagePort.postMessage()` after any configured tRPC transformer runs. Values that still cannot be cloned by the platform Structured Clone algorithm reject on the client side.
- `Blob` values are encoded by the transport before `postMessage()` and restored on the receiving side. `ArrayBuffer`, typed arrays, and other Structured Clone values continue to use the platform transport directly.

## Examples and Docs

- Basic renderer-to-main example: [`examples/basic`](https://github.com/naom1029/electron-messageport-trpc/tree/main/examples/basic)
- Main-to-utility example: [`examples/main-utility`](https://github.com/naom1029/electron-messageport-trpc/tree/main/examples/main-utility)
- Renderer-to-utility example: [`examples/renderer-utility`](https://github.com/naom1029/electron-messageport-trpc/tree/main/examples/renderer-utility)
- Full documentation: <https://naom1029.github.io/electron-messageport-trpc/>

## License

[MIT](./LICENSE)
