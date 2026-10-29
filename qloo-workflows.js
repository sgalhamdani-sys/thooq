import { bilingualError } from './copy.js';
// In-process access to the official Qloo Harness workflow executor.
// One executor per server process: no CLI start-up per call, and the
// harness's bounded resolution cache is shared between workflow calls.
const baseUrl = 'https://hackathon.api.qloo.com';
let executorPromise;

async function loadExecutor() {
  const harness = await import(new URL('./node_modules/@qloo/qloo-harness/dist/qloo-tools.js', import.meta.url));
  const executor = harness.createDirectQlooWorkflowExecutorFromEnvironment({
    env: { ...process.env, QLOO_BASE_URL: baseUrl, QLOO_TRUSTED_BASE_URL: baseUrl }
  });
  if (!executor) throw bilingualError('لم نجد اعتماد Qloo. أضيفي QLOO_API_KEY إلى إعدادات الخادم أو شغّلي qloo setup.', 'No Qloo credential found. Add QLOO_API_KEY to the server settings or run qloo setup.');
  return executor;
}

export function qlooStatus() {
  return { transport: 'qloo-harness-direct', baseUrl, authentication: 'environment-or-private-harness-config' };
}

// Returns the harness's normalized result envelope. Expected execution
// failures (input validation, network, authentication) become status:error
// envelopes so callers never have to parse provider messages.
export async function runQloo(operation, input, { signal } = {}) {
  executorPromise ||= loadExecutor().catch(error => { executorPromise = undefined; throw error; });
  const executor = await executorPromise;
  try {
    return (await executor.execute(operation, input, signal ? { signal } : {})).result;
  } catch (error) {
    if (error?.name !== 'QlooWorkflowExecutionError') throw error;
    return { status: 'error', operation, results: [], error: { code: error.code, layer: error.layer, retryable: Boolean(error.retryable) } };
  }
}
