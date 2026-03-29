/**
 * Mock for the standard Web MessagePort API (renderer process side).
 * Uses addEventListener/removeEventListener like the real browser MessagePort.
 */
export class MockRendererPort extends EventTarget {
  #other: MockRendererPort | null = null;
  #started = false;
  #closed = false;

  static createPair(): [MockRendererPort, MockRendererPort] {
    const p1 = new MockRendererPort();
    const p2 = new MockRendererPort();
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
        other.dispatchEvent(new MessageEvent('message', { data: cloned }));
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
      queueMicrotask(() => other.dispatchEvent(new Event('close')));
    }
  }
}
