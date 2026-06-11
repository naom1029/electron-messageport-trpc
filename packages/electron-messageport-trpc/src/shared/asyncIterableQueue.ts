export interface AsyncIterableQueue<T> {
  iterable: AsyncIterable<T>;
  push(value: T): void;
  error(cause: unknown): void;
  complete(): void;
}

export function createAsyncIterableQueue<T>(
  onReturn?: () => void,
): AsyncIterableQueue<T> {
  const values: T[] = [];
  const waiters: Array<{
    resolve(value: IteratorResult<T>): void;
    reject(cause: unknown): void;
  }> = [];
  let completed = false;
  let error: unknown;

  function settle(): void {
    while (waiters.length > 0 && values.length > 0) {
      const waiter = waiters.shift();
      if (waiter) {
        const value = values.shift() as T;
        waiter.resolve({ done: false, value });
      }
    }

    if (error !== undefined) {
      while (waiters.length > 0) {
        waiters.shift()?.reject(error);
      }
      return;
    }

    if (completed) {
      while (waiters.length > 0) {
        waiters.shift()?.resolve({ done: true, value: undefined });
      }
    }
  }

  return {
    iterable: {
      [Symbol.asyncIterator]() {
        return {
          next() {
            if (values.length > 0) {
              return Promise.resolve({
                done: false,
                value: values.shift() as T,
              });
            }

            if (error !== undefined) {
              return Promise.reject(error);
            }

            if (completed) {
              return Promise.resolve({ done: true, value: undefined });
            }

            return new Promise<IteratorResult<T>>((resolve, reject) => {
              waiters.push({ resolve, reject });
            });
          },
          return() {
            onReturn?.();
            completed = true;
            settle();
            return Promise.resolve({ done: true, value: undefined });
          },
        };
      },
    },
    push(value) {
      if (completed || error !== undefined) {
        return;
      }
      values.push(value);
      settle();
    },
    error(cause) {
      error = cause;
      settle();
    },
    complete() {
      completed = true;
      settle();
    },
  };
}
