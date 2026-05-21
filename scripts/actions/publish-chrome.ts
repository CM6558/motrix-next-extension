import { findZipByNamePart, requiredEnv, runCommand, setOutput } from './workflow-utils';

export function classifyChromeUploadOutput(exitCode: number, output: string): string {
  if (output.includes('ITEM_NOT_UPDATABLE')) return 'skipped-pending-review';
  if (exitCode !== 0 || /FAILURE|error/i.test(output)) {
    throw new Error(`Chrome Web Store upload failed: ${output.slice(0, 500)}`);
  }
  return 'published';
}

export function publishChromeFromEnv(): void {
  const zipPath = findZipByNamePart('chromium-mv3');
  const output = runCommand(
    'npx',
    [
      '-y',
      'chrome-webstore-upload-cli',
      '--source',
      zipPath,
      '--extension-id',
      requiredEnv('CHROME_EXTENSION_ID'),
    ],
    {
      env: {
        CLIENT_ID: requiredEnv('CHROME_CLIENT_ID'),
        CLIENT_SECRET: requiredEnv('CHROME_CLIENT_SECRET'),
        PUBLISHER_ID: requiredEnv('CHROME_PUBLISHER_ID'),
        REFRESH_TOKEN: requiredEnv('CHROME_REFRESH_TOKEN'),
      },
    },
  );
  console.log(output.output);
  const outcome = classifyChromeUploadOutput(output.exitCode, output.output);
  if (outcome === 'skipped-pending-review') {
    console.log('::warning::Chrome Web Store: item is pending review, skipping upload');
  }
  setOutput('outcome', outcome);
}

if (process.argv[1]?.endsWith('/publish-chrome.ts')) {
  try {
    publishChromeFromEnv();
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
