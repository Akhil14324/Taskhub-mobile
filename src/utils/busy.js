// How many user-visible requests are in flight. api/client.js counts them; BusyBar draws them.
// Background calls (`__skipOops: true`, e.g. silent refreshes) are not counted, so the bar only moves for
// something the person did.
let count = 0;
const listeners = new Set();

export function busyStart() {
  count += 1;
  listeners.forEach((l) => l(count));
}

export function busyEnd() {
  count = Math.max(0, count - 1);
  listeners.forEach((l) => l(count));
}

export function onBusy(listener) {
  listeners.add(listener);
  listener(count);
  return () => listeners.delete(listener);
}
