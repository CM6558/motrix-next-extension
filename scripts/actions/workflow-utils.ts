import { appendFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

export type JsonRecord = Record<string, unknown>;

export function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

export function optionalEnv(name: string): string {
  return process.env[name] || '';
}

export function configured(value: string): boolean {
  const normalized = value.trim();
  return normalized !== '' && normalized !== '0';
}

export function setOutput(name: string, value: string): void {
  const outputPath = requiredEnv('GITHUB_OUTPUT');
  appendFileSync(outputPath, `${name}=${value}\n`);
}

export function appendStepSummary(markdown: string): void {
  const summaryPath = requiredEnv('GITHUB_STEP_SUMMARY');
  appendFileSync(summaryPath, markdown);
}

export function runText(command: string, args: string[]): string {
  return execFileSync(command, args, { encoding: 'utf8' }).trim();
}

export function runCommand(command: string, args: string[]): { exitCode: number; output: string } {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    shell: false,
  });
  return {
    exitCode: result.status ?? 1,
    output: `${result.stdout || ''}${result.stderr || ''}`,
  };
}

export function findZipByNamePart(namePart: string): string {
  const files = walk('.output').filter((file) => file.endsWith('.zip') && file.includes(namePart));
  if (files.length !== 1) {
    throw new Error(`Expected one .output zip matching ${namePart}, found ${files.length}`);
  }
  const [file] = files;
  if (!file) {
    throw new Error(`No .output zip matching ${namePart}`);
  }
  return file;
}

export function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function stringField(value: unknown, key: string): string {
  if (!isRecord(value)) return '';
  const field = value[key];
  return typeof field === 'string' ? field : '';
}

export function numberField(value: unknown, key: string): number | undefined {
  if (!isRecord(value)) return undefined;
  const field = value[key];
  return typeof field === 'number' ? field : undefined;
}

export async function fetchJson(url: string, init: RequestInit = {}): Promise<unknown> {
  const response = await fetch(url, init);
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${url} failed: HTTP ${response.status} ${text.slice(0, 240)}`);
  }
  return text ? JSON.parse(text) : {};
}

export async function fetchText(url: string, init: RequestInit = {}): Promise<string> {
  const response = await fetch(url, init);
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${url} failed: HTTP ${response.status} ${text.slice(0, 240)}`);
  }
  return text;
}

export function md(value: string): string {
  return String(value || '-')
    .replaceAll('|', '\\|')
    .replaceAll('\n', ' ');
}

export function escapeCode(value: string): string {
  return String(value || '-')
    .replaceAll('`', '\\`')
    .replaceAll('\n', ' ');
}

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}
