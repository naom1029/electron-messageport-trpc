# electron-messageport-trpc

Type-safe IPC for Electron using MessagePort and tRPC v11.

## Installation

```bash
pnpm add electron-messageport-trpc @trpc/server @trpc/client
```

## Entry Points

```typescript
import { createWindowMessagePortHandler } from 'electron-messageport-trpc/main';
import { exposePortReceiver } from 'electron-messageport-trpc/preload';
import { getPort, portLink } from 'electron-messageport-trpc/renderer';
import { createParentPortHandler } from 'electron-messageport-trpc/utility';
```

## Documentation

See the [documentation site](https://naom1029.github.io/electron-messageport-trpc/) for full API reference and guides.

## License

[MIT](./LICENSE)
