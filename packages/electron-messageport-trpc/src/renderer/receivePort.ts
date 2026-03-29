declare global {
  interface Window {
    electronTRPCPort?: {
      getPort(): Promise<MessagePort>;
    };
  }
}

export function getPort(): Promise<MessagePort> {
  if (!window.electronTRPCPort) {
    throw new Error(
      'electronTRPCPort not found. Did you call exposePortReceiver() in your preload script?',
    );
  }
  return window.electronTRPCPort.getPort();
}
