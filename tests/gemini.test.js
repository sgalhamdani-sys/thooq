import test from 'node:test';
import assert from 'node:assert/strict';
import { callGemini, geminiSession } from '../gemini-service.js';

process.env.GEMINI_MODEL = 'gemini-3.1-flash-lite';
const ok = payload => new Response(JSON.stringify(payload), { status: 200 });
const failure = (status, message = '') => new Response(JSON.stringify({ error: { message } }), { status });
const timeout = () => Promise.reject(new DOMException('The operation was aborted due to timeout', 'TimeoutError'));
const listing = names => ok({ models: names.map(name => ({ name: `models/${name}`, supportedGenerationMethods: ['generateContent'] })) });
const modelOf = url => decodeURIComponent(url.match(/models\/([^/:?]+):generateContent/)?.[1] || '');
const generating = url => url.includes(':generateContent');

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
  await assert.rejects(callGemini({ contents: [] }, { apiKey: 'test', fetcher: async url => { if (generating(url)) calls++; return failure(429); } }), /حد الطلبات/);
  assert.equal(calls, 2);
  calls = 0;
  await assert.rejects(callGemini({ contents: [] }, { apiKey: 'test', retries: 0, fetcher: async url => { if (generating(url)) calls++; return failure(503); } }), /غير متاحة مؤقتًا/);
  assert.equal(calls, 1, 'with no other model to ask, the failure is reported');
});

test('a busy model rests for ten minutes while another Flash model stands in', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: 1_000_000 });
  const used = [];
  const fetcher = async (url, options) => {
    if (!generating(url)) return listing(['gemini-2.5-flash-image', 'gemini-2.5-flash', 'gemini-3.1-flash-lite']);
    used.push({ model: modelOf(url), body: JSON.parse(options.body) });
    return modelOf(url) === 'gemini-3.1-flash-lite' ? failure(503) : ok({ candidates: [], model: modelOf(url) });
  };
  const call = () => callGemini({ contents: [] }, { apiKey: 'test', retries: 0, fetcher });
  assert.equal((await call()).model, 'gemini-2.5-flash');
  assert.deepEqual(used.map(entry => entry.model), ['gemini-3.1-flash-lite', 'gemini-2.5-flash']);
  assert.deepEqual(used[1].body.generationConfig.thinkingConfig, { thinkingBudget: 0 }, '2.5 Flash answers without thinking');
  await call();
  assert.deepEqual(used.slice(2).map(entry => entry.model), ['gemini-2.5-flash'], 'the resting model is skipped');
  t.mock.timers.tick(10 * 60 * 1000 + 1);
  await call();
  assert.deepEqual(used.slice(3).map(entry => entry.model), ['gemini-3.1-flash-lite', 'gemini-2.5-flash'], 'after its rest the model is asked again');
});

test('one planning run stays with the model that answered it', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: 1_000_000 });
  const used = [];
  let busy = true;
  const fetcher = async url => {
    if (!generating(url)) return listing(['gemini-3.1-flash-lite', 'gemini-2.5-flash']);
    used.push(modelOf(url));
    return busy && modelOf(url) === 'gemini-3.1-flash-lite' ? failure(503) : ok({ candidates: [] });
  };
  const turn = geminiSession({ apiKey: 'test', retries: 0, fetcher });
  await turn({ contents: [] });
  busy = false;
  t.mock.timers.tick(10 * 60 * 1000 + 1);
  await turn({ contents: [] });
  await callGemini({ contents: [] }, { apiKey: 'test', retries: 0, fetcher });
  assert.deepEqual(used, ['gemini-3.1-flash-lite', 'gemini-2.5-flash', 'gemini-2.5-flash', 'gemini-3.1-flash-lite']);
});

test('a retired model also hands over, but a bad request is reported as it is', async () => {
  const used = [];
  const fetcher = async url => {
    if (!generating(url)) return listing(['gemini-3.1-flash-lite', 'gemini-2.5-flash']);
    used.push(modelOf(url));
    return modelOf(url) === 'gemini-3.1-flash-lite' ? failure(404) : ok({ candidates: [] });
  };
  await callGemini({ contents: [] }, { apiKey: 'test', retries: 0, fetcher });
  assert.deepEqual(used, ['gemini-3.1-flash-lite', 'gemini-2.5-flash']);

  process.env.GEMINI_MODEL = 'gemini-3-flash';
  try {
    const bodies = [];
    const signature = async (url, options) => {
      if (!generating(url)) return listing(['gemini-3-flash', 'gemini-2.5-flash']);
      bodies.push(JSON.parse(options.body));
      return bodies.length === 1 ? failure(400, 'Function call is missing a thought_signature') : ok({ candidates: [] });
    };
    await assert.rejects(callGemini({ contents: [] }, { apiKey: 'test', fetcher: signature }), /غير صالح/);
    assert.equal(bodies.length, 1, 'a signature error is not retried as unsupported thinking');
    await callGemini({ contents: [] }, { apiKey: 'test', fetcher: signature });
    assert.equal(bodies[1].generationConfig.thinkingConfig.thinkingLevel, 'low', 'and the model keeps its low thinking');
  } finally {
    process.env.GEMINI_MODEL = 'gemini-3.1-flash-lite';
  }
});
