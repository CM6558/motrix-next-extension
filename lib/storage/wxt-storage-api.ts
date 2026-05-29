import type { StorageApi } from './storage-service';

const STORAGE_KEYS = ['connection', 'settings', 'siteRules', 'uiPrefs', 'diagnosticLog'] as const;

type LocalStorageKey = `local:${string}`;

export interface WxtStorageArea {
  getItem: (key: LocalStorageKey) => Promise<unknown | null>;
  setItem: (key: LocalStorageKey, value: unknown) => Promise<void>;
}

function toLocalKey(key: string): LocalStorageKey {
  return `local:${key}`;
}

/**
 * Adapt WXT's key-oriented storage API to the chrome.storage.local shape used
 * by StorageService.
 */
export function createWxtStorageApi(storage: WxtStorageArea): StorageApi {
  return {
    async get(keys: string[] | null): Promise<Record<string, unknown>> {
      const selectedKeys: readonly string[] = keys ?? STORAGE_KEYS;
      const entries = await Promise.all(
        selectedKeys.map(async (key) => [key, await storage.getItem(toLocalKey(key))] as const),
      );

      const snapshot: Record<string, unknown> = {};
      for (const [key, value] of entries) {
        if (value !== null) {
          snapshot[key] = value;
        }
      }
      return snapshot;
    },

    async set(items: Record<string, unknown>): Promise<void> {
      await Promise.all(
        Object.entries(items).map(([key, value]) => storage.setItem(toLocalKey(key), value)),
      );
    },
  };
}
