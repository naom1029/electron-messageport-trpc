# electron-messageport-trpc

MessagePort transport for tRPC v11 in Electron.

This package connects Electron `MessagePort` channels to normal tRPC v11
clients and routers. It keeps application code close to standard tRPC while
using MessagePort connections that can be handed to different Electron
processes.

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

const t = initTRPC.create();

export const appRouter = t.router({
  greet: t.procedure.query(() => {
    return { message: 'Hello from main' };
  }),

  sendMessage: t.procedure.mutation(() => {
    return { ok: true };
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

let trpcHandler: { destroy(): void } | undefined;

async function createWindow() {
  const win = new BrowserWindow({
    width: 900,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  trpcHandler = createElectronTRPCMain({
    router: appRouter,
    windows: [win],
    createContext: async ({ window }) => ({ window }),
  });

  await win.loadFile('index.html');
}

app.whenReady().then(createWindow);

app.on('before-quit', () => {
  trpcHandler?.destroy();
});
```

`createElectronTRPCMain()` creates a fresh MessagePort for each window load,
transfers one side to the renderer, and attaches the other side to your router.
Pass every window that should use this router, or create one handler per window
when windows are created dynamically.

### 3. Expose the port receiver from preload

```typescript
// preload/index.ts
import { exposeElectronTRPC } from 'electron-messageport-trpc/preload';

exposeElectronTRPC();
```

The preload script receives the transferred port from Electron and forwards it to
the renderer main world. This is the Electron-specific handoff this package
wraps so the renderer can use a normal tRPC client link.

### 4. Create the tRPC client in the renderer

```typescript
// src/trpc.ts
import { createElectronTRPCClient } from 'electron-messageport-trpc/renderer';
import type { AppRouter } from '../electron/router';

export const trpc = createElectronTRPCClient<AppRouter>();
```

```typescript
const greeting = await trpc.greet.query();
console.log(greeting.message);

await trpc.sendMessage.mutate();
```

## Entry Points

| Entry point | Use it from | Purpose |
|---|---|---|
| `electron-messageport-trpc/main` | Electron main process | Attach routers, create main-side clients, broker ports |
| `electron-messageport-trpc/preload` | Preload script | Receive and forward transferred renderer ports |
| `electron-messageport-trpc/renderer` | Renderer process | Create a tRPC client over the received port |
| `electron-messageport-trpc/utility` | Electron utility process | Attach a router to `process.parentPort` |

Common imports:

```typescript
import {
  createElectronTRPCMain,
  createElectronTRPCRendererUtilityBridge,
  createElectronTRPCUtilityClient,
  createElectronTRPCUtilityPool,
  createPortBroker,
  createPortHandler,
  createWindowMessagePortHandler,
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
| `createElectronTRPCUtilityClient` / `createElectronTRPCUtilityPool` | Main calls one or more utility-process routers. |
| `createElectronTRPCRendererUtilityBridge` | Main brokers renderer-to-utility ports while staying out of the request path. |
| `createWindowMessagePortHandler` | Low-level single-router window wiring. |
| `portLink` | The renderer creates a tRPC client from the port received by `getPort()`. |
| `mainPortLink` | The main process creates a tRPC client over a `MessagePortMain`, usually to call a utility process. |
| `createElectronTRPCUtility` | A utility process exposes a typed registry channel on `process.parentPort`. |
| `createParentPortHandler` | Low-level utility-process handler. |
| `createPortBroker` | Main only brokers a port between renderer and utility, keeping main out of the request path. |
| `createPortHandler` | Low-level helper for attaching a router to an existing protocol-dedicated port manually. |

## Lifecycle

- Call `handler.destroy()` when tearing down a custom handler or before app quit if you keep a long-lived handler reference.
- Destroying a handler closes the port and aborts active subscriptions.
- `createWindowMessagePortHandler()` also cleans up a window's active port when that window closes.

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
