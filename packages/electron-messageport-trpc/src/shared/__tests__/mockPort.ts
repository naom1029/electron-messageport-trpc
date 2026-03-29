import { EventEmitter } from 'node:events';

/**
 * Mock for Electron's MessagePortMain (main process side).
 * Uses Node EventEmitter API (on/off/emit) like the real MessagePortMain.
 */
export class MockMessagePortMain extends EventEmitter {
  #other: MockMessagePortMain | null = null;
  #started = false;
  #closed = false;

  static createPair(): [MockMessagePortMain, MockMessagePortMain] {
    const p1 = new MockMessagePortMain();
    const p2 = new MockMessagePortMain();
    p1.#other = p2;
    p2.#other = p1;
    return [p1, p2];
  }

  postMessage(data: unknown): void {
    if (this.#closed || !this.#other) {
      throw new Error('Port is closed');
    }
    const cloned = structuredClone(data);
    const other = this.#other;
    queueMicrotask(() => {
      if (other.#started) {
        other.emit('message', { data: cloned, ports: [] });
      }
    });
  }

  start(): void {
    this.#started = true;
  }

  close(): void {
    this.#closed = true;
    if (this.#other) {
      const other = this.#other;
      this.#other = null;
      queueMicrotask(() => other.emit('close'));
    }
  }

  get closed(): boolean {
    return this.#closed;
  }
}
