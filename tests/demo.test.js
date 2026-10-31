import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { once } from 'node:events';
import { createThooqServer } from '../server.js';
import { buildTasteRecommendation } from '../qloo-service.js';
import { createDemoEvent, DEMO_TEMPLATE, pruneDemoEvents, resolveDemoFavourites } from '../demo.js';

const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const allFavourites = [...new Set(DEMO_TEMPLATE.guests.flatMap(guest => guest.favourites.flat().map(item => item.name)))];
const resolved = Object.fromEntries(allFavourites.map((name, index) => [name, index === 0 ? null : { id: uuid(index + 1), name, type: 'brand' }]));
const places = Array.from({ length: 6 }, (_, index) => ({ entity_id: uuid(500 + index), name: `Riyadh Place ${index}`, properties: { address: 'Riyadh' } }));

// Synthetic Qloo: every signal set returns the same places; rank keeps option order.
const qloo = async (operation, input) => {
  if (operation === 'rank') return { status: 'ok', results: places.filter(place => input.options.includes(place.entity_id)) };
  if (operation === 'recommend') return { status: 'ok', interpretation: { signals: input.signals.map(signal => ({ input: signal, entityId: /^0{8}/.test(signal) ? signal : `id-${signal}`, name: signal })) }, results: places };
  throw new Error(`unexpected ${operation}`);
};

test('demo favourites resolve within their Qloo type; ambiguity takes the first candidate', async () => {
  const calls = [];
  const result = await resolveDemoFavourites(async (operation, input) => {
    calls.push(input);
    if (input.entity === 'Friends') return { status: 'needs_input', resolution: { issues: [{ candidates: [{ id: 'friends-tv', name: 'Friends' }] }] } };
    if (input.entity === 'Kudu') return { status: 'needs_input', resolution: { issues: [{ kind: 'not_found' }] } };
    return { status: 'ok', interpretation: { entity: { entityId: `id-${input.entity}`, name: input.entity } }, results: [] };
  });
  assert.equal(calls.find(input => input.entity === 'Friends').type, 'tv_show');
  assert.equal(calls.length, allFavourites.length);
  assert.deepEqual(result.Friends, { id: 'friends-tv', name: 'Friends', type: 'tv_show', picked: 'first-candidate' });
  assert.equal(result.Kudu, null);
  assert.equal(result.Coldplay.id, 'id-Coldplay');
});

test('demo resolution rejects unrelated candidates, prefers a matching one, and retries errors', async () => {
  const attempts = {};
  const seen = [];
  const result = await resolveDemoFavourites(async (operation, input) => {
    attempts[input.entity] = (attempts[input.entity] || 0) + 1;
    if (input.entity === 'Umm Kulthum') return { status: 'needs_input', resolution: { issues: [{ candidates: [{ id: 'dj', name: 'Ummet Ozcan' }] }] } };
    if (input.entity === 'Fairuz') return { status: 'needs_input', resolution: { issues: [{ candidates: [{ id: 'other', name: 'Fairuza Balk' }, { id: 'fairuz', name: 'Fairuz' }] }] } };
    if (input.entity === 'Al Baik') return { status: 'needs_input', resolution: { issues: [{ candidates: [{ id: 'albaik', name: 'AlBaik' }] }] } };
    if (input.entity === 'Adele' && attempts.Adele < 3) return { status: 'error', error: { code: 'rate_limited' } };
    if (input.entity === 'Coldplay') return { status: 'error', error: { code: 'rate_limited' } };
    return { status: 'ok', interpretation: { entity: { entityId: `id-${input.entity}`, name: input.entity } }, results: [] };
  }, { wait: async () => {}, onResult: (name, outcome) => seen.push([name, outcome]) });
  assert.equal(result['Umm Kulthum'], null, 'an unrelated first candidate is not used');
  assert.match(seen.find(([name]) => name === 'Umm Kulthum')[1].reason, /Ummet Ozcan/);
  assert.deepEqual(result.Fairuz, { id: 'fairuz', name: 'Fairuz', type: 'artist', picked: 'matching-candidate' });
  assert.equal(result['Al Baik'].id, 'albaik');
  assert.equal(result.Adele.id, 'id-Adele', 'a temporary error is retried');
  assert.equal(attempts.Adele, 3);
  assert.equal(result.Coldplay, null);
  assert.match(seen.find(([name]) => name === 'Coldplay')[1].reason, /rate_limited/);
  assert.equal(seen.length, allFavourites.length);
});

test('a demo copy is ready to plan: English names, constraints and pre-resolved favourites', async () => {
  const event = createDemoEvent('en', resolved);
  assert.equal(event.demo, true);
  assert.equal(event.language, 'en');
  assert.equal(event.answers.length, 4);
  assert.equal(event.answers[3].name, 'Grandma Hessa');
  assert.ok(event.answers.every(answer => answer.answers.length === 3 && answer.answers.every(group => group.length === 3)));
  assert.match(event.note, /children under 6/);
  assert.equal(event.recommendation.source, 'prepared');
  assert.equal(event.recommendation.querySignals.length, allFavourites.length - 1, 'unresolved favourites are left out');
  assert.deepEqual(event.recommendation.signalOwners[resolved.Starbucks.id], [0]);
  assert.equal(createDemoEvent('ar', resolved).answers[0].name, 'نورة');
  assert.equal(createDemoEvent('en', {}).recommendation, null, 'without Qloo IDs the normal flow runs');

  // The prepared favourites skip translation, and the plan is written in English.
  const plan = await buildTasteRecommendation(event, { qloo, translate: () => assert.fail('must not translate'), generate: null });
  assert.equal(plan.source, 'qloo');
  assert.equal(plan.language, 'en');
  assert.equal(plan.places[0].fit.total, 4);
  assert.match(plan.title, /^A gathering for every taste in Riyadh/);
  assert.match(plan.reason, /^Thooq used every guest's favourites/);
  assert.ok(plan.agentSteps.every(step => !/[؀-ۿ]/.test(step.text)), 'English steps contain no Arabic');

  // A new guest resets the plan; demo favourites still map to their Qloo IDs.
  const joined = { ...event, recommendation: null, answers: [...event.answers, { name: 'Judge', answers: [['Dune', 'Coldplay', 'Adele'], ['Starbucks', 'IKEA', 'Nike'], ['quiet', 'coffee', 'friendly']] }] };
  const replanned = await buildTasteRecommendation(joined, { qloo, translate: async values => values, generate: null });
  assert.ok(replanned.querySignals.includes(resolved.Starbucks.id));
  assert.ok(replanned.querySignals.includes('Dune'));
  assert.deepEqual(replanned.signalOwners[resolved.Starbucks.id], [0, 4]);
});

test('Arabic remains the default plan language', async () => {
  const plan = await buildTasteRecommendation(createDemoEvent('ar', resolved), { qloo, generate: null });
  assert.equal(plan.language, 'ar');
  assert.match(plan.title, /لمّة على ذوق الجميع/);
});

test('old demo copies are pruned, real gatherings are kept', () => {
  const now = Date.parse('2026-10-30T00:00:00Z');
  const events = {
    real: { id: 'real', createdAt: '2026-01-01T00:00:00Z' },
    old: { id: 'old', demo: true, createdAt: '2026-10-27T00:00:00Z' },
    fresh: { id: 'fresh', demo: true, createdAt: '2026-10-29T12:00:00Z' }
  };
  pruneDemoEvents(events, now);
  assert.deepEqual(Object.keys(events).sort(), ['fresh', 'real']);
});

test('the demo endpoint creates private copies and errors follow the visitor language', async () => {
  const root = fileURLToPath(new URL('../work/', import.meta.url));
  await mkdir(root, { recursive: true });
  const directory = await mkdtemp(join(root, 'thooq-demo-test-'));
  const server = createThooqServer({ dataDirectory: directory, demoResolution: async () => resolved, recommend: event => buildTasteRecommendation(event, { qloo, generate: null }) });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (path, { method = 'GET', body, lang, host } = {}) => {
    const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(lang ? { 'X-Thooq-Lang': lang } : {}), ...(host ? { 'X-Thooq-Host': host } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, data: await response.json() };
  };
  try {
    const first = await call('/api/demo', { method: 'POST', body: { lang: 'en' } });
    const second = await call('/api/demo', { method: 'POST', body: { lang: 'en' } });
    assert.equal(first.status, 201);
    assert.notEqual(first.data.event.id, second.data.event.id);
    assert.equal(first.data.event.demo, true);
    assert.equal(first.data.event.answerCount, 4);
    assert.equal((await call(`/api/events/${first.data.event.id}/recommendation`, { method: 'POST', body: { lang: 'en' } })).status, 403);
    const plan = await call(`/api/events/${first.data.event.id}/recommendation`, { method: 'POST', body: { lang: 'en' }, host: first.data.hostKey });
    assert.equal(plan.status, 200);
    assert.equal(plan.data.recommendation.language, 'en');
    assert.equal((await call('/api/events/missing', { lang: 'en' })).data.error, 'We could not find this gathering.');
    assert.equal((await call('/api/events/missing')).data.error, 'لم نجد هذه العزيمة.');
    assert.equal((await fetch(`${base}/i18n.js`)).status, 200);
  } finally {
    await new Promise(resolve => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  }
});
