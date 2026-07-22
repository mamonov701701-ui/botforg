import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const srcRoot = path.join(frontendRoot, 'src');

function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...listSourceFiles(full));
      continue;
    }
    if (/\.(ts|tsx|js|jsx)$/.test(name)) out.push(full);
  }
  return out;
}

describe('legacy plans client removed', () => {
  it('does not ship frontend/src/api/plans.ts', () => {
    expect(existsSync(path.join(srcRoot, 'api/plans.ts'))).toBe(false);
  });

  it('src does not import getPlans or api/plans', () => {
    const hits: string[] = [];
    for (const file of listSourceFiles(srcRoot)) {
      const text = readFileSync(file, 'utf8');
      if (
        text.includes("from '@/api/plans'") ||
        text.includes('from "@/api/plans"') ||
        text.includes("from '../api/plans'") ||
        text.includes('from "../api/plans"') ||
        text.includes("from './plans'") ||
        /\bgetPlans\b/.test(text)
      ) {
        hits.push(path.relative(frontendRoot, file));
      }
    }
    expect(hits).toEqual([]);
  });
});
