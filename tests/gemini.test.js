import test from 'node:test';
import assert from 'node:assert/strict';
import { callGemini } from '../gemini-service.js';

process.env.GEMINI_MODEL = 'gemini-3.1-flash-lite';
const ok = payload => new Response(JSON.stringify(payload), { status: 200 });
const failure = (status, message = '') => new Response(JSON.stringify({ error: { message } }), { status });
const timeout = () => Promise.reject(new DOMException('The operation was aborted due to timeout', 'TimeoutError'));

test('a timeout is retried once, then reported in Arabic instead of a raw DOMException', async () => {
  let calls = 0;
  await assert.rejects(callGemini({ contents: [] }, { apiKey: 'test', fetcher: () => { calls++; return timeout(); }, timeoutMs: 10 }), error => {
    assert.match(error.message, /لم يرد Gemini \(gemini-3\.1-flash-lite\)/);
    assert.equal(error.cause.name, 'TimeoutError');
    return true;
  });
  assert.equal(calls, 2);
  let second = 0;
  const payload = await callGemini({ contents: [] }, { apiKey: 'test', fetcher: () => (++second === 1 ? timeout() : Promise.resolve(ok({ candidates: [] }))) });
  assert.deepEqual(payload, { candidates: [] });
});

test('Gemini 3 calls ask for low thinking, and a model that rejects it is retried without', async () => {
  const bodies = [];
  const fetcher = async (url, options) => {
    const body = JSON.parse(options.body);
    bodies.push(body);
    return body.generationConfig?.thinkingConfig ? failure(400, 'thinking level not supported') : ok({ candidates: [] });
  };
  await callGemini({ contents: [], generationConfig: { temperature: 0 } }, { apiKey: 'test', fetcher });
  assert.equal(bodies[0].generationConfig.thinkingConfig.thinkingLevel, 'low');
  assert.equal(bodies[0].generationConfig.temperature, 0);
  assert.equal(bodies[1].generationConfig.thinkingConfig, undefined);
  await callGemini({ contents: [] }, { apiKey: 'test', fetcher });
  assert.equal(bodies[2].generationConfig, undefined, 'the rejection is remembered for this model');
});

test('rate limits are retried once; a persistent one is explained', async () => {
  let calls = 0;
  await assert.rejects(callGemini({ contents: [] }, { apiKey: 'test', fetcher: async () => { calls++; return failure(429); } }), /حد الطلبات/);
  assert.equal(calls, 2);
  calls = 0;
  await assert.rejects(callGemini({ contents: [] }, { apiKey: 'test', retries: 0, fetcher: async () => { calls++; return failure(503); } }), /غير متاحة مؤقتًا/);
  assert.equal(calls, 1);
});
