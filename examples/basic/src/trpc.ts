import { createTRPCClient } from '@trpc/client';
import { getPort, portLink } from 'electron-messageport-trpc/renderer';
import type { AppRouter } from '../electron/router';

export const trpc = createTRPCClient<AppRouter>({
  links: [portLink({ port: getPort() })],
});
