let nextId = 0;

export function nextRequestId(): number {
  nextId += 1;
  return nextId;
}
