import { readFile } from 'node:fs/promises';

import {
  configured,
  fetchJson,
  findZipByNamePart,
  isRecord,
  optionalEnv,
  requiredEnv,
  setOutput,
  stringField,
} from './workflow-utils';

export type EdgeVariableUpdateInput = {
  operationId: string;
  runId: string;
  submittedAt: string;
  version: string;
};

export function extractOperationIdFromLocation(location: string): string {
  if (!location) {
    throw new Error('Edge Add-ons response did not include a Location header');
  }
  const normalized = location.trim().replace(/\/+$/, '');
  const operationId = normalized.split('/').pop() || '';
  if (!operationId) {
    throw new Error(`Failed to extract Edge operation id from Location header: ${location}`);
  }
  return operationId;
}

export function buildEdgeVariableUpdates(input: EdgeVariableUpdateInput): Record<string, string> {
  return {
    EDGE_LAST_OPERATION_ID: input.operationId,
    EDGE_LAST_OPERATION_VERSION: input.version,
    EDGE_LAST_OPERATION_RUN_ID: input.runId,
    EDGE_LAST_OPERATION_SUBMITTED_AT: input.submittedAt,
  };
}

export async function publishEdgeFromEnv(): Promise<void> {
  const productId = requiredEnv('EDGE_PRODUCT_ID');
  const clientId = requiredEnv('EDGE_CLIENT_ID');
  const apiKey = requiredEnv('EDGE_API_KEY');
  const version = requiredEnv('VERSION');
  const zipPath = optionalEnv('ZIP_PATH') || findZipByNamePart('chromium-mv3');
  const authHeaders = {
    Authorization: `ApiKey ${apiKey}`,
    'X-ClientID': clientId,
  };

  const uploadOperationId = await uploadDraftPackage({ authHeaders, productId, zipPath });
  await waitForPackageValidation({ authHeaders, operationId: uploadOperationId, productId });
  const publishOperationId = await submitForReview({ authHeaders, productId });
  if (!publishOperationId) return;

  setOutput('outcome', 'published');
  setOutput('operation_id', publishOperationId);

  const updates = buildEdgeVariableUpdates({
    operationId: publishOperationId,
    runId: optionalEnv('GITHUB_RUN_ID') || '0',
    submittedAt: new Date().toISOString(),
    version,
  });

  const saved = await saveRepositoryVariables(updates);
  if (!saved) {
    setOutput('outcome', 'published-state-not-saved');
  }
}

async function uploadDraftPackage(input: {
  authHeaders: Record<string, string>;
  productId: string;
  zipPath: string;
}): Promise<string> {
  const response = await fetch(
    `https://api.addons.microsoftedge.microsoft.com/v1/products/${input.productId}/submissions/draft/package`,
    {
      method: 'POST',
      headers: {
        ...input.authHeaders,
        'Content-Type': 'application/zip',
      },
      body: await readFile(input.zipPath),
    },
  );
  const text = await response.text();
  console.log(`Upload HTTP status: ${response.status}`);
  if (response.status !== 202) {
    throw new Error(`Edge Add-ons upload failed: HTTP ${response.status} ${text.slice(0, 240)}`);
  }
  return extractOperationIdFromLocation(response.headers.get('location') || '');
}

async function waitForPackageValidation(input: {
  authHeaders: Record<string, string>;
  operationId: string;
  productId: string;
}): Promise<void> {
  let status: string;
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    await sleep(10_000);
    const response = await fetchJson(
      `https://api.addons.microsoftedge.microsoft.com/v1/products/${input.productId}/submissions/draft/package/operations/${input.operationId}`,
      { headers: input.authHeaders },
    );
    status = stringField(response, 'status') || stringField(response, 'Status');
    console.log(`Upload validation attempt ${attempt}: ${status || 'unknown'}`);
    if (status === 'Succeeded') return;
    if (status === 'Failed') {
      throw new Error(`Edge Add-ons package validation failed: ${JSON.stringify(response)}`);
    }
  }
  throw new Error('Edge Add-ons upload timed out after 5 minutes');
}

async function submitForReview(input: {
  authHeaders: Record<string, string>;
  productId: string;
}): Promise<string> {
  const response = await fetch(
    `https://api.addons.microsoftedge.microsoft.com/v1/products/${input.productId}/submissions`,
    {
      method: 'POST',
      headers: {
        ...input.authHeaders,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ notes: 'Automated submission via CI/CD pipeline.' }),
    },
  );
  const text = await response.text();
  console.log(`Publish HTTP status: ${response.status}`);

  if (response.status === 404) {
    console.log('::warning::Edge Add-ons: another submission is currently in review');
    setOutput('outcome', 'skipped-in-review');
    process.exitCode = 0;
    return '';
  }

  if (response.status !== 202 && response.status !== 200) {
    throw new Error(`Edge Add-ons publish failed: HTTP ${response.status} ${text.slice(0, 240)}`);
  }

  const locationOperationId = response.headers.get('location')
    ? extractOperationIdFromLocation(response.headers.get('location') || '')
    : '';
  if (locationOperationId) return locationOperationId;

  const body = text ? (JSON.parse(text) as unknown) : {};
  const bodyOperationId = isRecord(body)
    ? stringField(body, 'operationId') ||
      stringField(body, 'id') ||
      stringField(body, 'operationID')
    : '';
  if (!bodyOperationId) {
    throw new Error('Edge Add-ons publish response did not include an operation id');
  }
  return bodyOperationId;
}

async function saveRepositoryVariables(updates: Record<string, string>): Promise<boolean> {
  const repo = optionalEnv('GITHUB_REPOSITORY');
  const token = optionalEnv('REPO_VARIABLES_TOKEN') || optionalEnv('GITHUB_TOKEN');
  if (!repo || !configured(token)) {
    console.log(
      '::warning::Skipping Edge operation state save because repository or token is missing',
    );
    return false;
  }

  let ok = true;
  for (const [name, value] of Object.entries(updates)) {
    ok = (await upsertRepositoryVariable({ name, repo, token, value })) && ok;
  }
  return ok;
}

async function upsertRepositoryVariable(input: {
  name: string;
  repo: string;
  token: string;
  value: string;
}): Promise<boolean> {
  const baseUrl = `https://api.github.com/repos/${input.repo}/actions/variables`;
  const headers = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${input.token}`,
    'Content-Type': 'application/json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  const updateResponse = await fetch(`${baseUrl}/${input.name}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ name: input.name, value: input.value }),
  });
  if (updateResponse.ok) return true;

  if (updateResponse.status !== 404) {
    const text = await updateResponse.text();
    console.log(
      `::warning::Failed to update repository variable ${input.name}: HTTP ${updateResponse.status} ${text.slice(0, 160)}`,
    );
    return false;
  }

  const createResponse = await fetch(baseUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({ name: input.name, value: input.value }),
  });
  if (createResponse.ok) return true;

  const text = await createResponse.text();
  console.log(
    `::warning::Failed to create repository variable ${input.name}: HTTP ${createResponse.status} ${text.slice(0, 160)}`,
  );
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

if (process.argv[1]?.endsWith('/publish-edge.ts')) {
  publishEdgeFromEnv().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
