import { runCommand, setOutput } from './workflow-utils';

export function classifyFirefoxSignOutput(exitCode: number, output: string): string {
  if (output.includes('already exists')) return 'skipped-version-exists';
  if (exitCode !== 0) {
    throw new Error(`Firefox AMO signing failed: ${output.slice(0, 500)}`);
  }
  return 'published';
}

export function publishFirefoxFromEnv(): void {
  const output = runCommand('npx', [
    '-y',
    'web-ext',
    'sign',
    '--source-dir',
    '.output/firefox-mv3',
    '--channel',
    'listed',
    '--api-key',
    process.env.FIREFOX_API_KEY || '',
    '--api-secret',
    process.env.FIREFOX_API_SECRET || '',
    '--upload-source-code',
    'source-code.zip',
  ]);
  console.log(output.output);
  const outcome = classifyFirefoxSignOutput(output.exitCode, output.output);
  if (outcome === 'skipped-version-exists') {
    console.log('::warning::Firefox AMO: version already submitted, skipping');
  }
  setOutput('outcome', outcome);
}

if (process.argv[1]?.endsWith('/publish-firefox.ts')) {
  try {
    publishFirefoxFromEnv();
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
