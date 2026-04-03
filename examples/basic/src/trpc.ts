import { createTRPCClient } from '@trpc/client';
import { portLink } from 'electron-messageport-trpc/renderer';
import { getPort } from 'electron-messageport-trpc/renderer';
import type { AppRouter } from '../electron/router';

export const trpc = createTRPCClient<AppRouter>({
  links: [portLink({ port: getPort() })],
});
