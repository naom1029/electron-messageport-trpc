# electron-messageport-trpc

[![npm version](https://img.shields.io/npm/v/electron-messageport-trpc.svg)](https://www.npmjs.com/package/electron-messageport-trpc)
![CI](https://github.com/naom1029/electron-messageport-trpc/actions/workflows/ci.yml/badge.svg)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

Type-safe IPC for Electron using MessagePort and tRPC v11.

## Features

- **MessagePort-based transport** -- uses MessagePort instead of ipcMain/ipcRenderer
- **tRPC v11 native** -- async iterables for subscriptions
- **Flexible topology** -- renderer-to-main, main-to-utility, renderer-to-utility, and brokered renderer-to-renderer
- **Structured Clone serialization** -- native Date, Map, Set, ArrayBuffer support
- **Full TypeScript support**
- **4 entry points** -- `/main`, `/renderer`, `/preload`, `/utility`

## Installation

```bash
# pnpm
pnpm add electron-messageport-trpc

# npm
npm install electron-messageport-trpc

# yarn
yarn add electron-messageport-trpc
```

You also need the tRPC v11 peer dependencies:

```bash
pnpm add @trpc/server @trpc/client
```

## Quick Start

### Main Process

```typescript
import { createWindowMessagePortHandler } from 'electron-messageport-trpc/main';
import { appRouter } from './router';

const win = new BrowserWindow({ /* ... */ });
createWindowMessagePortHandler({ router: appRouter, windows: [win] });
```

### Preload

```typescript
import { exposePortReceiver } from 'electron-messageport-trpc/preload';
exposePortReceiver();
```

### Renderer

```typescript
import { createTRPCClient } from '@trpc/client';
import { portLink } from 'electron-messageport-trpc/renderer';
import { getPort } from 'electron-messageport-trpc/renderer';

const client = createTRPCClient<AppRouter>({
  links: [portLink({ port: getPort() })],
});

const result = await client.greeting.query({ name: 'World' });
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
| @trpc/server | ^11.0.0 |
| @trpc/client | ^11.0.0 |
| Node.js | >= 20 |

## Documentation

See the [documentation site](https://naom1029.github.io/electron-messageport-trpc/) for full API reference and guides.

## License

[MIT](./LICENSE)
