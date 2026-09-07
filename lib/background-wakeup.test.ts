import { describe, expect, it, vi } from 'vitest';
import { createBackgroundWakeup } from './background-wakeup';

describe('hosted background wakeups', () => {
  it('coalesces overlapping polls and waits between completed runs', async () => {
    const wake = createBackgroundWakeup(100);
    let finish!: () => void;
    const work = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const first = wake(work, 0);
    await Promise.resolve();
    expect(wake(work, 200)).toBe(first);
    expect(work).toHaveBeenCalledTimes(1);
    finish();
    await first;
    expect(wake(work, 50)).toBeUndefined();
    const second = wake(work, 100);
    await Promise.resolve();
    expect(work).toHaveBeenCalledTimes(2);
    finish();
    await second;
  });

  it('allows a later poll to recover from failed background work', async () => {
    const wake = createBackgroundWakeup(100);
    const work = vi
      .fn()
      .mockRejectedValueOnce(new Error('temporary database error'))
      .mockResolvedValue(undefined);
    await expect(wake(work, 0)).rejects.toThrow('temporary database error');
    expect(wake(work, 50)).toBeUndefined();
    await wake(work, 100);
    expect(work).toHaveBeenCalledTimes(2);
  });
});
