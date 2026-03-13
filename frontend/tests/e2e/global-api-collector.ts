/**
 * Collects API request/response data during E2E for UI vs API reconciliation.
 * Written to qa_artifacts/<run>/ui_api_calls.json in globalTeardown.
 */
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

export interface ApiCallRecord {
  method: string;
  path: string;
  status: number;
  url: string;
}

const apiCalls: ApiCallRecord[] = [];
const backendPort = process.env.QA_BACKEND_PORT || '8001';

function getArtifactsDir(): string {
  const dir = process.env.QA_ARTIFACTS_DIR;
  if (dir) return dir;
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const projectRoot = path.resolve(__dirname, '../..');
  return path.join(projectRoot, '..', 'qa_artifacts');
}

export function addApiCall(method: string, url: string, status: number): void {
  try {
    const u = new URL(url);
    const pathname = u.pathname;
    const fullUrl = u.origin + u.pathname + (u.search || '');
    apiCalls.push({ method, path: pathname, status, url: fullUrl });
  } catch {
    apiCalls.push({ method, path: url, status, url });
  }
}

export function isBackendRequest(url: string): boolean {
  return (
    url.includes(`:${backendPort}`) ||
    url.includes('/api/') ||
    url.includes('/auth/') ||
    url.includes('/me') ||
    url.includes('/bots') ||
    url.includes('/scenarios') ||
    url.includes('/analytics') ||
    url.includes('/blocks') ||
    url.includes('/chat') ||
    url.includes('/legal') ||
    url.includes('/privacy') ||
    url.includes('/templates') ||
    url.includes('/editor') ||
    url.includes('/billing') ||
    url.includes('/messages') ||
    url.includes('/media')
  );
}

export function getApiCalls(): ApiCallRecord[] {
  return [...apiCalls];
}

export function flushToFile(): void {
  const art = getArtifactsDir();
  const aggregated: Record<string, { total_calls: number; statuses: Record<string, number> }> = {};
  for (const c of apiCalls) {
    const key = `${c.method} ${c.path}`;
    if (!aggregated[key]) aggregated[key] = { total_calls: 0, statuses: {} };
    aggregated[key].total_calls++;
    const s = String(c.status);
    aggregated[key].statuses[s] = (aggregated[key].statuses[s] || 0) + 1;
  }
  const outPath = path.join(art, 'ui_api_calls.json');
  fs.mkdirSync(art, { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(aggregated, null, 2), 'utf8');
}

export function getConsoleLogPath(): string {
  return path.join(getArtifactsDir(), 'console_log.txt');
}

export function getScreensDir(): string {
  return path.join(getArtifactsDir(), 'screens');
}
