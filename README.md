# electron-messageport-trpc

[![npm version](https://img.shields.io/npm/v/electron-messageport-trpc.svg)](https://www.npmjs.com/package/electron-messageport-trpc)
![CI](https://github.com/naom1029/electron-messageport-trpc/actions/workflows/ci.yml/badge.svg)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

MessagePort transport for tRPC v11 in Electron.

`electron-messageport-trpc` lets Electron renderers, the main process, and
utility processes talk through normal tRPC clients and routers. It keeps the
tRPC programming model while using MessagePort connections that can be handed
to different Electron processes.

## Features

- **tRPC v11 over MessagePort** -- use queries, mutations, subscriptions,
  inference, middleware, and errors across Electron processes.
- **Flexible Electron topologies** -- call utility-process routers from main, or
  broker renderer-to-utility ports while main stays out of the request path.

## Installation

```bash
# pnpm
pnpm add electron-messageport-trpc

# npm
npm install electron-messageport-trpc

# yarn
yarn add electron-messageport-trpc
```

Install the tRPC v11 peer dependencies as well:

```bash
pnpm add @trpc/server @trpc/client
```

## Quick Start

### Main Process

```typescript
import { defineElectronTRPC } from 'electron-messageport-trpc';
import { createElectronTRPCMain } from 'electron-messageport-trpc/main';
import { appRouter } from './router';
import type { AppRouter } from './router';

export const electronTRPC = defineElectronTRPC<{
  main: AppRouter;
}>();

const win = new BrowserWindow({ /* ... */ });
createElectronTRPCMain({
  channels: electronTRPC,
  routers: { main: appRouter },
  windows: [win],
});
```

### Preload

```typescript
import { exposeElectronTRPC } from 'electron-messageport-trpc/preload';
import { electronTRPC } from './trpc';

exposeElectronTRPC(electronTRPC);
```

### Renderer

```typescript
import { createElectronTRPCClient } from 'electron-messageport-trpc/renderer';
import { electronTRPC } from './trpc';

const client = createElectronTRPCClient(electronTRPC);

const result = await client.main.greeting.query({ name: 'World' });
```

### Subscriptions

```typescript
client.events.subscribe(undefined, {
  onData(data) {
    console.log('Received:', data);
  },
});
```

## Requirements

| Dependency | Version |
|---|---|
| Electron | >= 22 |
| @trpc/server | ^11.17.0 |
| @trpc/client | ^11.17.0 |
| Node.js | >= 20 |

## Documentation

See the [documentation site](https://naom1029.github.io/electron-messageport-trpc/) for full API reference and guides.

## License

[MIT](./LICENSE)
