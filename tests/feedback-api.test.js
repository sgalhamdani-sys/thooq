import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { once } from 'node:events';
import { createThooqServer } from '../server.js';
import { buildTasteRecommendation } from '../qloo-service.js';

const candidates = Array.from({ length: 15 }, (_, index) => ({ entity_id: `place-${index}`, name: `Synthetic Riyadh Place ${index}`, properties: { address: 'Riyadh, Saudi Arabia' } }));
const testRoot = fileURLToPath(new URL('../work/', import.meta.url));
async function testDirectory(prefix) { await mkdir(testRoot, { recursive: true }); return mkdtemp(join(testRoot, prefix)); }
// Synthetic Qloo workflows: per-guest and group recommend, then per-guest rank.
const fakeQloo = async (operation, input) => {
  if (operation === 'rank') return { status: 'ok', results: candidates.filter(place => input.options.includes(place.entity_id)) };
  assert.equal(operation, 'recommend');
  assert.equal(input.filter_location, 'Riyadh, Saudi Arabia');
  assert.ok(input.signals.length <= 10);
  return { status: 'ok', interpretation: { signals: input.signals.map(signal => ({ input: signal, entityId: `id-${signal}`, name: signal })) }, results: candidates };
};
const fakeRecommend = event => buildTasteRecommendation(event, { qloo: fakeQloo, translate: async () => ['Dune', 'Coffee'], generate: null });

async function listen(server) {
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  return `http://127.0.0.1:${server.address().port}`;
}
async function close(server) { if (server.listening) await new Promise(resolve => server.close(resolve)); }

test('share, vote, change vote, rerank, preserve old link and restart with durable data', async () => {
  const directory = await testDirectory('thooq-feedback-test-');
  let server = createThooqServer({ dataDirectory: directory, recommend: fakeRecommend });
  let base = await listen(server);
  const request = async (path, { method = 'GET', body, cookie, origin } = {}) => {
    const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...(origin ? { Origin: origin } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, cookie: response.headers.get('set-cookie')?.split(';')[0], data: await response.json() };
  };
  try {
    const created = await request('/api/events', { method: 'POST', body: { occasion: 'طلعة صديقات', city: 'الرياض' } });
    const id = created.data.event.id;
    await request(`/api/events/${id}/answers`, { method: 'POST', body: { name: 'Synthetic Guest Private Name', answers: [['a', 'b', 'c'], ['d', 'e', 'f'], ['g', 'h', 'i']] } });
    const first = await request(`/api/events/${id}/recommendation`, { method: 'POST', body: {} });
    assert.equal(first.status, 200);
    const token = first.data.recommendation.shareToken;
    assert.match(token, /^[a-f0-9]{48}$/);
    const path = `/api/shared/${token}`;
    const shown = await request(path);
    assert.equal(shown.status, 200);
    assert.ok(shown.cookie);
    assert.ok(!JSON.stringify(shown.data).includes('Synthetic Guest Private Name'));
    assert.equal(shown.data.recommendation.querySignals, undefined);
    assert.equal(shown.data.recommendation.votes, undefined);
    assert.equal((await request(path + '/feedback', { method: 'POST', body: { rating: 'good' } })).status, 400);
    assert.equal((await request(path + '/feedback', { method: 'POST', cookie: shown.cookie, body: { rating: 'wrong' } })).status, 400);
    assert.equal((await request(path + '/feedback', { method: 'POST', cookie: shown.cookie, origin: 'https://another-site.example', body: { rating: 'good' } })).status, 403);
    assert.equal((await request('/api/shared/invalid')).status, 404);
    assert.equal((await request('/feedback-service.js')).status, 404);
    assert.equal((await request('/data/events.json')).status, 404);

    const browsers = await Promise.all(Array.from({ length: 8 }, () => request(path)));
    const votes = await Promise.all(browsers.map(browser => request(path + '/feedback', { method: 'POST', cookie: browser.cookie, body: { rating: 'bad' } })));
    assert.ok(votes.every(vote => vote.status === 200));
    const cookie = browsers[0].cookie;
    for (let index = 0; index < 3; index++) await request(path + '/feedback', { method: 'POST', cookie, body: { rating: 'bad' } });
    assert.deepEqual((await request(path)).data.recommendation.feedback, { good: 0, bad: 8, total: 8 });
    const changed = await request(path + '/feedback', { method: 'POST', cookie, body: { rating: 'good' } });
    assert.deepEqual(changed.data.recommendation.feedback, { good: 1, bad: 7, total: 8 });
    await request(path + '/feedback', { method: 'POST', cookie, body: { rating: 'bad' } });
    assert.equal((await request(path, { cookie })).data.recommendation.myRating, 'bad');
    assert.deepEqual((await request(`/api/events/${id}`)).data.event.feedback, { good: 0, bad: 8, total: 8 });

    const next = await request(`/api/events/${id}/recommendation`, { method: 'POST', body: {} });
    assert.equal(next.status, 200);
    assert.equal(next.data.recommendation.learning.ratingsUsed, 8);
    assert.notDeepEqual(next.data.recommendation.places, first.data.recommendation.places);
    assert.notEqual(next.data.recommendation.shareToken, token);
    const sharedPlaces = (await request(path)).data.recommendation.places;
    assert.deepEqual(sharedPlaces.map(place => place.id), first.data.recommendation.places.map(place => place.id));
    assert.ok(sharedPlaces.every(place => place.fit === undefined && Number.isInteger(place.fitTotal)), 'shared fit has counts, not guest positions');

    await close(server);
    server = createThooqServer({ dataDirectory: directory, recommend: fakeRecommend });
    base = await listen(server);
    assert.deepEqual((await request(path, { cookie })).data.recommendation.feedback, { good: 0, bad: 8, total: 8 });
    const stored = JSON.parse(await readFile(join(directory, 'events.json'), 'utf8'));
    assert.equal(stored[id].answers.length, 1);
    assert.equal(stored[id].recommendationHistory.length, 2);
  } finally { await close(server); await rm(directory, { recursive: true, force: true }); }
});

test('a feedback vote arriving while Qloo runs is not overwritten by recommendation save', async () => {
  const directory = await testDirectory('thooq-feedback-race-');
  let release, entered;
  let pause = false;
  const started = new Promise(resolve => { entered = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  const server = createThooqServer({ dataDirectory: directory, recommend: async event => {
    if (pause) { entered(); await gate; }
    return fakeRecommend(event);
  } });
  const base = await listen(server);
  const post = async (path, body, cookie) => {
    const response = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body) });
    return { status: response.status, ...await response.json() };
  };
  try {
    const { event } = await post('/api/events', { city: 'الرياض' });
    await post(`/api/events/${event.id}/answers`, { name: 'Test', answers: [['a', 'b', 'c'], ['d', 'e', 'f'], ['g', 'h', 'i']] });
    const first = await post(`/api/events/${event.id}/recommendation`, {});
    const path = `/api/shared/${first.recommendation.shareToken}`;
    const page = await fetch(base + path);
    const cookie = page.headers.get('set-cookie').split(';')[0];
    pause = true;
    const pending = post(`/api/events/${event.id}/recommendation`, {});
    await started;
    await post(path + '/feedback', { rating: 'good' }, cookie);
    release();
    assert.equal((await pending).status, 200);
    const shared = await (await fetch(base + path)).json();
    assert.equal(shared.recommendation.feedback.good, 1);
  } finally { release(); await close(server); await rm(directory, { recursive: true, force: true }); }
});
