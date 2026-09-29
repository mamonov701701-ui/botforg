import test from 'node:test';
import assert from 'node:assert/strict';

process.env.BOTFORG_RUNNER_TEST_MODE = 'true';
const { execute } = await import('./server.mjs');

const profile = { wall_clock_ms: 40, memory_mb: 16 };
const envelope = { input: {}, settings: {}, context: { executionMode: 'simulator', blockVersionId: 1 } };
function run(source) {
  return execute({ artifact_hash: 'test', spec: { language: 'javascript', runtime_profile: 'quickjs-wasm-v1', source, resource_profile: profile }, envelope });
}

test('executes only the explicit JSON contract', () => {
  assert.deepEqual(run('function run(e) { return { outputs: { value: e.context.blockVersionId }, route: "success", logs: [] }; }').result.outputs, { value: 1 });
});

test('does not inject node, filesystem, environment or dependency globals', () => {
  const value = run('function run() { return { outputs: { globals: [typeof process, typeof require, typeof fetch, typeof Deno] }, route: "success", logs: [] }; }');
  assert.deepEqual(value.result.outputs.globals, ['undefined', 'undefined', 'undefined', 'undefined']);
});

test('interrupts an infinite loop', () => {
  assert.equal(run('function run() { while (true) {} }').error, 'timeout');
});
