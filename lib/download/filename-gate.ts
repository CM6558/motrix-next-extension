export type SuggestedFilename = (suggestion?: {
  filename: string;
  conflictAction?: 'uniquify' | 'overwrite' | 'prompt';
}) => void;

interface FilenameGateOptions {
  timeoutMs?: number;
}

interface PendingSuggestion {
  suggest: SuggestedFilename;
  timeoutId: ReturnType<typeof setTimeout>;
}

const DEFAULT_TIMEOUT_MS = 3000;

/**
 * Holds Chrome/Chromium filename determination until the browser download has
 * either been cancelled by the interceptor or explicitly released as skipped.
 */
export class DownloadFilenameGate {
  private readonly pending = new Map<number, PendingSuggestion>();
  private readonly timeoutMs: number;

  constructor(options: FilenameGateOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  hold(downloadId: number, suggest: SuggestedFilename): true {
    this.release(downloadId);

    const timeoutId = setTimeout(() => {
      this.release(downloadId);
    }, this.timeoutMs);

    this.pending.set(downloadId, { suggest, timeoutId });
    return true;
  }

  release(downloadId: number): void {
    const pending = this.pending.get(downloadId);
    if (!pending) return;

    this.pending.delete(downloadId);
    clearTimeout(pending.timeoutId);
    pending.suggest();
  }
}
