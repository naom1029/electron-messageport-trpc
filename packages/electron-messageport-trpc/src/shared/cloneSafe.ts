const BLOB_MARKER = '__electron_messageport_trpc_blob__';

interface EncodedBlob {
  [BLOB_MARKER]: true;
  type: string;
  data: ArrayBuffer;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object';
}

function isBlob(value: unknown): value is Blob {
  return typeof Blob !== 'undefined' && value instanceof Blob;
}

function isEncodedBlob(value: unknown): value is EncodedBlob {
  return (
    isObject(value) &&
    value[BLOB_MARKER] === true &&
    typeof value.type === 'string' &&
    value.data instanceof ArrayBuffer
  );
}

function shouldSkipObject(value: object): boolean {
  return (
    value instanceof ArrayBuffer ||
    ArrayBuffer.isView(value) ||
    value instanceof Date ||
    value instanceof Map ||
    value instanceof Set ||
    value instanceof RegExp ||
    value instanceof Error
  );
}

function containsBlob(value: unknown, seen = new WeakSet<object>()): boolean {
  if (isBlob(value)) {
    return true;
  }

  if (!isObject(value) || shouldSkipObject(value)) {
    return false;
  }

  if (seen.has(value)) {
    return false;
  }
  seen.add(value);

  if (Array.isArray(value)) {
    return value.some((item) => containsBlob(item, seen));
  }

  return Object.values(value).some((item) => containsBlob(item, seen));
}

function containsEncodedBlob(
  value: unknown,
  seen = new WeakSet<object>(),
): boolean {
  if (isEncodedBlob(value)) {
    return true;
  }

  if (!isObject(value) || shouldSkipObject(value)) {
    return false;
  }

  if (seen.has(value)) {
    return false;
  }
  seen.add(value);

  if (Array.isArray(value)) {
    return value.some((item) => containsEncodedBlob(item, seen));
  }

  return Object.values(value).some((item) => containsEncodedBlob(item, seen));
}

async function encodeBlobValues(
  value: unknown,
  seen: WeakMap<object, unknown>,
): Promise<unknown> {
  if (isBlob(value)) {
    return {
      [BLOB_MARKER]: true,
      type: value.type,
      data: await value.arrayBuffer(),
    };
  }

  if (Array.isArray(value)) {
    const cached = seen.get(value);
    if (cached) {
      return cached;
    }

    const items: unknown[] = [];
    seen.set(value, items);
    for (const item of value) {
      items.push(await encodeBlobValues(item, seen));
    }
    return items;
  }

  if (!isObject(value) || shouldSkipObject(value)) {
    return value;
  }

  const cached = seen.get(value);
  if (cached) {
    return cached;
  }

  const result: Record<string, unknown> = {};
  seen.set(value, result);
  for (const [key, item] of Object.entries(value)) {
    result[key] = await encodeBlobValues(item, seen);
  }
  return result;
}

export async function encodeCloneSafe(value: unknown): Promise<unknown> {
  if (!containsBlob(value)) {
    return value;
  }

  return encodeBlobValues(value, new WeakMap());
}

function decodeBlobValues(
  value: unknown,
  seen: WeakMap<object, unknown>,
): unknown {
  if (isEncodedBlob(value)) {
    return new Blob([value.data], { type: value.type });
  }

  if (Array.isArray(value)) {
    const cached = seen.get(value);
    if (cached) {
      return cached;
    }

    const items: unknown[] = [];
    seen.set(value, items);
    for (const item of value) {
      items.push(decodeBlobValues(item, seen));
    }
    return items;
  }

  if (!isObject(value) || shouldSkipObject(value)) {
    return value;
  }

  const cached = seen.get(value);
  if (cached) {
    return cached;
  }

  const result: Record<string, unknown> = {};
  seen.set(value, result);
  for (const [key, item] of Object.entries(value)) {
    result[key] = decodeBlobValues(item, seen);
  }
  return result;
}

export function decodeCloneSafe(value: unknown): unknown {
  if (!containsEncodedBlob(value)) {
    return value;
  }

  return decodeBlobValues(value, new WeakMap());
}
