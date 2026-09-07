// Coalesce the existing page/companion polls within this Worker instance.
// Durable job and refresh leases coordinate separate Worker instances.
export function createBackgroundWakeup(intervalMs = 15_000) {
  let pending: Promise<void> | undefined;
  let lastStarted = -Infinity;
  return (work: () => Promise<void>, now = Date.now()) => {
    if (pending) return pending;
    if (now - lastStarted < intervalMs) return;
    lastStarted = now;
    pending = Promise.resolve()
      .then(work)
      .finally(() => {
        pending = undefined;
      });
    return pending;
  };
}
