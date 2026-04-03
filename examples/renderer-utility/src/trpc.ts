import { createTRPCClient } from '@trpc/client';
import { getPort, portLink } from 'electron-messageport-trpc/renderer';
import type { UtilityRouter } from '../utility/router';

export const trpc = createTRPCClient<UtilityRouter>({
  links: [portLink({ port: getPort() })],
});
