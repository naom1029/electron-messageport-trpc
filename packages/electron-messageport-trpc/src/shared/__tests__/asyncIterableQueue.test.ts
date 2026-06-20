import { describe, expect, it } from 'vitest';

import { createAsyncIterableQueue } from '../asyncIterableQueue';

describe('createAsyncIterableQueue', () => {
  it('yields pushed values in order', async () => {
    // Arrange
    const queue = createAsyncIterableQueue<number>();
    const iterator = queue.iterable[Symbol.asyncIterator]();

    // Act
    queue.push(1);
    queue.push(2);

    // Assert
    await expect(iterator.next()).resolves.toEqual({ done: false, value: 1 });
    await expect(iterator.next()).resolves.toEqual({ done: false, value: 2 });
  });

  it('rejects a pending next() when error(undefined) is called', async () => {
    // Arrange
    const queue = createAsyncIterableQueue<number>();
    const iterator = queue.iterable[Symbol.asyncIterator]();
    const pending = iterator.next();

    // Act
    queue.error(undefined);

    // Assert
    await expect(pending).rejects.toBeUndefined();
  });

  it('drains buffered values before rejecting with error(undefined)', async () => {
    // Arrange
    const queue = createAsyncIterableQueue<number>();
    const iterator = queue.iterable[Symbol.asyncIterator]();
    queue.push(1);

    // Act
    queue.error(undefined);

    // Assert
    await expect(iterator.next()).resolves.toEqual({ done: false, value: 1 });
    await expect(iterator.next()).rejects.toBeUndefined();
  });

  it('rejects a pending next() with the provided error cause', async () => {
    // Arrange
    const queue = createAsyncIterableQueue<number>();
    const iterator = queue.iterable[Symbol.asyncIterator]();
    const pending = iterator.next();
    const cause = new Error('boom');

    // Act
    queue.error(cause);

    // Assert
    await expect(pending).rejects.toBe(cause);
  });

  it('marks the iterator done after complete() with no buffered values', async () => {
    // Arrange
    const queue = createAsyncIterableQueue<number>();
    const iterator = queue.iterable[Symbol.asyncIterator]();

    // Act
    queue.complete();

    // Assert
    await expect(iterator.next()).resolves.toEqual({
      done: true,
      value: undefined,
    });
  });
});
