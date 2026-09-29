import http from 'node:http';
import { getQuickJS } from 'quickjs-emscripten';

const token = process.env.CUSTOM_BLOCK_RUNNER_SHARED_TOKEN || '';
const maxConcurrent = Number(process.env.CUSTOM_BLOCK_MAX_CONCURRENT || '2');
const port = Number(process.env.CUSTOM_BLOCK_RUNNER_PORT || '8090');
const host = process.env.CUSTOM_BLOCK_RUNNER_HOST || '127.0.0.1';
let active = 0;
const QuickJS = await getQuickJS();

function send(response, status, value) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(value));
}

export function execute(body) {
  const { spec, envelope, artifact_hash } = body || {};
  if (!spec || spec.language !== 'javascript' || spec.runtime_profile !== 'quickjs-wasm-v1') {
    return { error: 'policy_violation' };
  }
  if (!artifact_hash || typeof spec.source !== 'string') return { error: 'policy_violation' };
  const limits = spec.resource_profile || {};
  const started = Date.now();
  const runtime = QuickJS.newRuntime();
  runtime.setMemoryLimit(Number(limits.memory_mb || 32) * 1024 * 1024);
  runtime.setMaxStackSize(512 * 1024);
  let interrupted = false;
  runtime.setInterruptHandler(() => {
    interrupted = Date.now() - started > Number(limits.wall_clock_ms || 750);
    return interrupted;
  });
  const context = runtime.newContext();
  try {
    // No host functions, module loader, fetch, require, process, filesystem or network are injected.
    const program = `"use strict";\n${spec.source}\n;JSON.stringify(run(${JSON.stringify(envelope)}));`;
    const evaluated = context.evalCode(program, 'custom-block.js');
    if (evaluated.error) {
      const error = context.dump(evaluated.error);
      evaluated.error.dispose();
      return { error: interrupted ? 'timeout' : 'runtime_error' };
    }
    const raw = context.dump(evaluated.value);
    evaluated.value.dispose();
    let result;
    try { result = JSON.parse(raw); } catch { return { error: 'invalid_output' }; }
    return { result, duration_ms: Date.now() - started, runner_profile: 'quickjs-wasm-v1' };
  } finally {
    context.dispose();
    runtime.dispose();
  }
}

const server = http.createServer((request, response) => {
  if (request.method === 'GET' && request.url === '/healthz') {
    return send(response, 200, { status: 'ok', runner_profile: 'quickjs-wasm-v1' });
  }
  if (request.method !== 'POST' || request.url !== '/v1/execute') return send(response, 404, { error: 'not_found' });
  if (!token || request.headers['x-botforg-runner-token'] !== token) return send(response, 401, { error: 'unauthorized' });
  if (active >= maxConcurrent) return send(response, 429, { error: 'resource_limit' });
  let raw = '';
  request.setEncoding('utf8');
  request.on('data', chunk => { raw += chunk; if (raw.length > 100000) request.destroy(); });
  request.on('end', () => {
    active += 1;
    try {
      const value = execute(JSON.parse(raw));
      send(response, value.error ? 422 : 200, value);
    } catch { send(response, 422, { error: 'runtime_error' }); }
    finally { active -= 1; }
  });
});

if (process.env.BOTFORG_RUNNER_TEST_MODE !== 'true') server.listen(port, host);
