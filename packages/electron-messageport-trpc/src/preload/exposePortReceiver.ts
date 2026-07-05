import { contextBridge, ipcRenderer } from 'electron';
import type { ElectronTRPCChannels, ElectronTRPCRegistry } from '../core/index';
import {
  getElectronTRPCChannelNames,
  isElectronTRPCChannels,
} from '../core/index';
import { PORT_INIT_CHANNEL } from '../shared/constants';

export interface ExposePortReceiverOptions {
  /**
   * Restrict which tRPC channels this preload will service. Ports and requests
   * for channels outside the list are ignored. When omitted or empty, every
   * channel is serviced.
   */
  channels?: readonly string[];
}

/**
 * Accepts either an explicit options object or a `defineElectronTRPC()`
 * registry for ergonomic symmetry with the rest of the API. A registry now
 * carries its declared channel names at runtime, so passing one restricts the
 * preload to exactly those channels.
 */
type ExposePortReceiverInput =
  | ExposePortReceiverOptions
  | ElectronTRPCChannels<ElectronTRPCRegistry>;

const DEFAULT_CHANNEL = 'default';

function normalizeChannel(channel: string | undefined): string {
  return channel ?? DEFAULT_CHANNEL;
}

function resolveAllowlist(
  opts: ExposePortReceiverInput,
): Set<string> | undefined {
  if (isElectronTRPCChannels(opts)) {
    return new Set(getElectronTRPCChannelNames(opts));
  }
  const channels = (opts as ExposePortReceiverOptions).channels;
  if (Array.isArray(channels) && channels.length > 0) {
    return new Set(channels);
  }
  return undefined;
}

export function exposePortReceiver(opts: ExposePortReceiverInput = {}): void {
  const pendingPorts = new Map<string, MessagePort>();
  const requestedChannels = new Set<string>();
  const allowlist = resolveAllowlist(opts);

  function isAllowed(channel: string): boolean {
    return allowlist === undefined || allowlist.has(channel);
  }

  function transferPort(channel: string): void {
    if (!requestedChannels.has(channel)) {
      return;
    }

    const port = pendingPorts.get(channel);
    if (!port) {
      return;
    }

    window.postMessage(
      { channel: PORT_INIT_CHANNEL, trpcChannel: channel },
      '*',
      [port],
    );
    pendingPorts.delete(channel);
    requestedChannels.delete(channel);
  }

  ipcRenderer.on(PORT_INIT_CHANNEL, (event, message: unknown) => {
    const port = event.ports[0];
    if (port) {
      const channel = normalizeChannel(
        (message as { channel?: string } | null)?.channel,
      );
      if (!isAllowed(channel)) {
        return;
      }
      pendingPorts.set(channel, port);
      transferPort(channel);
    }
  });

  contextBridge.exposeInMainWorld('electronTRPCPort', {
    requestPort: (channel?: string) => {
      const normalized = normalizeChannel(channel);
      if (!isAllowed(normalized)) {
        return;
      }
      requestedChannels.add(normalized);
      transferPort(normalized);
    },
  });
}

export function exposeElectronTRPC(opts?: ExposePortReceiverInput): void {
  exposePortReceiver(opts);
}
