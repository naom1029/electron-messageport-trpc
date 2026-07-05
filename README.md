# electron-messageport-trpc

[![npm version](https://img.shields.io/npm/v/electron-messageport-trpc.svg)](https://www.npmjs.com/package/electron-messageport-trpc)
![CI](https://github.com/naom1029/electron-messageport-trpc/actions/workflows/ci.yml/badge.svg)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

MessagePort transport for tRPC v11 in Electron.

`electron-messageport-trpc` lets Electron renderers, the main process, and
utility processes talk through normal tRPC clients and routers. You write
ordinary tRPC routers and clients; the library gives the renderer a typed
client backed by a direct MessagePort link to your router. Preload exposes the
link with one call, so there is no manual port wiring to manage.

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
import { createElectronTRPCMain } from 'electron-messageport-trpc/main';
import { appRouter } from './router';

const win = new BrowserWindow({ /* ... */ });
createElectronTRPCMain({
  router: appRouter,
  windows: [win],
});
```

### Preload

```typescript
import { exposeElectronTRPC } from 'electron-messageport-trpc/preload';

exposeElectronTRPC();
```

### Renderer

```typescript
import { createElectronTRPCClient } from 'electron-messageport-trpc/renderer';
import type { AppRouter } from './router';

const client = createElectronTRPCClient<AppRouter>();

const result = await client.greet.query({ name: 'World' });
```

For multiple typed channels or utility processes, see the [multi-topology guide](https://naom1029.github.io/electron-messageport-trpc/guides/multi-topology/).

### Subscriptions

```typescript
client.timeTick.subscribe(undefined, {
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
