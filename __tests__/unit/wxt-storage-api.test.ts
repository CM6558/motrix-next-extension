import { describe, expect, it, vi } from 'vitest';
import { createWxtStorageApi, type WxtStorageArea } from '@/lib/storage/wxt-storage-api';

function createMockWxtStorage(initial: Record<string, unknown> = {}): WxtStorageArea {
  const store = { ...initial };
  return {
    getItem: vi.fn(async (key: `local:${string}`) => store[key.replace(/^local:/, '')] ?? null),
    setItem: vi.fn(async (key: `local:${string}`, value: unknown) => {
      store[key.replace(/^local:/, '')] = value;
    }),
  };
}

describe('createWxtStorageApi', () => {
  it('reads a full chrome.storage.local-compatible snapshot from WXT storage', async () => {
    const storage = createMockWxtStorage({
      connection: { port: 18000, secret: 'token' },
      siteRules: [{ id: 'r1', pattern: '*.example.com', action: 'always-intercept' }],
    });
    const api = createWxtStorageApi(storage);

    await expect(api.get(null)).resolves.toEqual({
      connection: { port: 18000, secret: 'token' },
      siteRules: [{ id: 'r1', pattern: '*.example.com', action: 'always-intercept' }],
    });
  });

  it('reads only requested keys using the same shape as chrome.storage.local.get', async () => {
    const storage = createMockWxtStorage({
      connection: { port: 18000, secret: 'token' },
      settings: { enabled: false },
    });
    const api = createWxtStorageApi(storage);

    await expect(api.get(['settings'])).resolves.toEqual({
      settings: { enabled: false },
    });
    expect(storage.getItem).toHaveBeenCalledWith('local:settings');
    expect(storage.getItem).not.toHaveBeenCalledWith('local:connection');
  });

  it('writes each storage field through WXT local-prefixed keys', async () => {
    const storage = createMockWxtStorage();
    const api = createWxtStorageApi(storage);

    await api.set({
      connection: { port: 19000, secret: '' },
    });

    expect(storage.setItem).toHaveBeenCalledWith('local:connection', {
      port: 19000,
      secret: '',
    });
    expect(storage.setItem).toHaveBeenCalledTimes(1);
  });
});
