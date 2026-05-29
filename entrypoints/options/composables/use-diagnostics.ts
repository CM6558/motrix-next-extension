/**
 * @fileoverview Composable for diagnostic event log operations.
 *
 * Encapsulates diagnostic events state, hydration from storage,
 * clipboard copy, export report, and clear with immediate
 * persistence via StorageService.
 */
import { ref } from 'vue';
import type { StorageService } from '@/lib/storage';
import type { DiagnosticEvent } from '@/shared/types';

export interface DiagnosticsRuntime {
  getManifest?: () => {
    version?: string;
    manifest_version?: number;
  };
}

export function useDiagnostics(storageService: StorageService, runtime: DiagnosticsRuntime = {}) {
  const diagnosticEvents = ref<DiagnosticEvent[]>([]);

  function hydrate(events: DiagnosticEvent[]): void {
    diagnosticEvents.value = events;
  }

  function clearDiagnosticLog(): void {
    diagnosticEvents.value = [];
    void storageService.saveDiagnosticLog([]);
  }

  /**
   * Export a complete diagnostic report as a downloadable JSON file.
   *
   * Includes extension version, browser info, all configuration
   * (except API secret), and the full diagnostic event log.
   */
  async function exportDiagnosticReport(): Promise<void> {
    const data = await storageService.load();

    const manifest = runtime.getManifest?.() ?? {};

    const report = {
      exportedAt: new Date().toISOString(),
      extension: {
        version: manifest.version ?? 'unknown',
        manifestVersion: manifest.manifest_version ?? 3,
      },
      browser: {
        userAgent: navigator.userAgent,
        language: navigator.language,
      },
      config: {
        connection: { port: data.connection.port },
        settings: data.settings,
        siteRules: data.siteRules,
        uiPrefs: data.uiPrefs,
      },
      diagnosticLog: data.diagnosticLog,
    };

    // Use a data URI instead of blob URL to bypass browser.downloads.
    // Blob URL downloads fire onCreated → wake Service Worker → SW logs
    // fresh startup entries → storage.onChanged replaces the UI log with
    // new timestamps, making the original entries disappear.
    const json = JSON.stringify(report, null, 2);
    const dataUri = `data:application/json;charset=utf-8,${encodeURIComponent(json)}`;
    const a = document.createElement('a');
    a.href = dataUri;
    a.download = `motrix-next-diagnostic-${Date.now()}.json`;
    a.click();
  }

  return {
    diagnosticEvents,
    hydrate,
    clearDiagnosticLog,
    exportDiagnosticReport,
  };
}
