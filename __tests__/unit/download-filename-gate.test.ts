import { describe, expect, it, vi } from 'vitest';
import { DownloadFilenameGate } from '@/lib/download/filename-gate';

describe('DownloadFilenameGate', () => {
  it('holds filename determination until the matching download is released', () => {
    const gate = new DownloadFilenameGate({ timeoutMs: 1000 });
    const suggest = vi.fn();

    const held = gate.hold(42, suggest);

    expect(held).toBe(true);
    expect(suggest).not.toHaveBeenCalled();

    gate.release(42);

    expect(suggest).toHaveBeenCalledTimes(1);
    expect(suggest).toHaveBeenCalledWith();
  });

  it('releases each held download at most once', () => {
    const gate = new DownloadFilenameGate({ timeoutMs: 1000 });
    const suggest = vi.fn();

    gate.hold(42, suggest);
    gate.release(42);
    gate.release(42);

    expect(suggest).toHaveBeenCalledTimes(1);
  });

  it('does nothing when releasing a download that was never held', () => {
    const gate = new DownloadFilenameGate({ timeoutMs: 1000 });

    expect(() => gate.release(42)).not.toThrow();
  });

  it('releases a held download after the timeout as a browser safety fallback', () => {
    vi.useFakeTimers();
    try {
      const gate = new DownloadFilenameGate({ timeoutMs: 1000 });
      const suggest = vi.fn();

      gate.hold(42, suggest);
      vi.advanceTimersByTime(999);
      expect(suggest).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1);
      expect(suggest).toHaveBeenCalledTimes(1);
      expect(suggest).toHaveBeenCalledWith();
    } finally {
      vi.useRealTimers();
    }
  });

  it('replaces an existing hold for the same download id before storing the new one', () => {
    const gate = new DownloadFilenameGate({ timeoutMs: 1000 });
    const firstSuggest = vi.fn();
    const secondSuggest = vi.fn();

    gate.hold(42, firstSuggest);
    gate.hold(42, secondSuggest);

    expect(firstSuggest).toHaveBeenCalledTimes(1);
    expect(secondSuggest).not.toHaveBeenCalled();

    gate.release(42);

    expect(secondSuggest).toHaveBeenCalledTimes(1);
  });
});
