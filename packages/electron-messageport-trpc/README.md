# electron-messageport-trpc

Type-safe IPC for Electron using MessagePort and tRPC v11.

This package gives Electron apps a tRPC transport over `MessagePort`, so renderer,
main, and utility processes can call typed `query`, `mutation`, and
`subscription` procedures without JSON IPC wrappers.

## Features

- MessagePort-based transport instead of `ipcMain.handle()` / `ipcRenderer.invoke()`
- tRPC v11 client link support for queries, mutations, and async-iterable subscriptions
- Renderer-to-main, main-to-utility, and renderer-to-utility topologies
- TypeScript types for all entry points

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
import { createWindowMessagePortHandler } from 'electron-messageport-trpc/main';
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

  trpcHandler = createWindowMessagePortHandler({
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

`createWindowMessagePortHandler()` creates a fresh MessagePort for each window
load, transfers one side to the renderer, and attaches the other side to your
router. Pass every window that should use this router, or create one handler per
window when windows are created dynamically.

### 3. Expose the port receiver from preload

```typescript
// preload/index.ts
import { exposePortReceiver } from 'electron-messageport-trpc/preload';

exposePortReceiver();
```

The preload script receives the transferred port from Electron and forwards it to
the renderer main world. This transfer is why plain `send` / `invoke` IPC is not
used; Electron MessagePorts must be posted with a transfer list.

### 4. Create the tRPC client in the renderer

```typescript
// src/trpc.ts
import { createTRPCClient } from '@trpc/client';
import { getPort, portLink } from 'electron-messageport-trpc/renderer';
import type { AppRouter } from '../electron/router';

export const trpc = createTRPCClient<AppRouter>({
  links: [portLink({ port: getPort() })],
});
```

```typescript
const greeting = await trpc.greet.query();
console.log(greeting.message);

await trpc.sendMessage.mutate();
```

## Data Transformers

Use the same tRPC data transformer on both sides when your router is configured
with one.

```typescript
// electron/router.ts
import superjson from 'superjson';
import { initTRPC } from '@trpc/server';

const t = initTRPC.create({
  transformer: superjson,
});
```

```typescript
// src/trpc.ts
import superjson from 'superjson';
import { createTRPCClient } from '@trpc/client';
import { getPort, portLink } from 'electron-messageport-trpc/renderer';
import type { AppRouter } from '../electron/router';

export const trpc = createTRPCClient<AppRouter>({
  links: [
    portLink({
      port: getPort(),
      transformer: superjson,
    }),
  ],
});
```

For main-process clients, pass the same transformer to `mainPortLink()`. Server
handlers use the router's configured transformer by default; pass
`transformer` to `createPortHandler()` or `createWindowMessagePortHandler()` only
when you need to override that behavior.

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
  createPortBroker,
  createPortHandler,
  createWindowMessagePortHandler,
  mainPortLink,
} from 'electron-messageport-trpc/main';
import { exposePortReceiver } from 'electron-messageport-trpc/preload';
import { getPort, portLink } from 'electron-messageport-trpc/renderer';
import { createParentPortHandler } from 'electron-messageport-trpc/utility';
```

## Which API Should I Use?

| API | Use when |
|---|---|
| `createWindowMessagePortHandler` | A renderer window calls procedures on a main-process router. This is the default choice. |
| `portLink` | The renderer creates a tRPC client from the port received by `getPort()`. |
| `mainPortLink` | The main process creates a tRPC client over a `MessagePortMain`, usually to call a utility process. |
| `createParentPortHandler` | A utility process exposes a tRPC router on `process.parentPort`. |
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
- Blob support is not provided by the transformer path. Use `ArrayBuffer` or `Uint8Array` for binary payloads.

## Examples and Docs

- Basic renderer-to-main example: [`examples/basic`](https://github.com/naom1029/electron-messageport-trpc/tree/main/examples/basic)
- Main-to-utility example: [`examples/main-utility`](https://github.com/naom1029/electron-messageport-trpc/tree/main/examples/main-utility)
- Renderer-to-utility example: [`examples/renderer-utility`](https://github.com/naom1029/electron-messageport-trpc/tree/main/examples/renderer-utility)
- Full documentation: <https://naom1029.github.io/electron-messageport-trpc/>

## License

[MIT](./LICENSE)
