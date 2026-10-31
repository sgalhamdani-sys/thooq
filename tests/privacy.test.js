import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { once } from 'node:events';
import { createThooqServer } from '../server.js';
import { buildTasteRecommendation, hidePrivate } from '../qloo-service.js';
import { checkFavourites } from '../guest-check.js';

const testRoot = fileURLToPath(new URL('../work/', import.meta.url));
const NAMES = { 'qa-secret-1': 'Secret Band', 'qb-open-1': 'Open Cafe' };
const places = Array.from({ length: 6 }, (_, index) => ({ entity_id: `place-${index}`, name: `Riyadh Place ${index}`, properties: { address: 'Riyadh' } }));
const seen = [];
const qloo = async (operation, input) => {
  seen.push({ operation, input });
  if (operation === 'rank') return { status: 'ok', results: places.filter(place => input.options.includes(place.entity_id)) };
  return { status: 'ok', interpretation: { signals: input.signals.map(signal => ({ input: signal, entityId: signal, name: NAMES[signal] || signal })) }, results: places };
};
const noTranslation = async () => { throw new Error('confirmed favourites must not be translated again'); };

test('guests check their own favourites: a match, a choice, a miss and an outage', async () => {
  const results = {
    Coldplay: { status: 'ok', interpretation: { entity: { entityId: 'id-coldplay', name: 'Coldplay', type: 'urn:entity:artist' } } },
    Friends: { status: 'needs_input', resolution: { issues: [{ kind: 'ambiguous', candidates: [{ id: 'tv', name: 'Friends', type: 'urn:entity:tv_show', release_year: 1994 }, { id: 'film', name: 'Friends', type: 'urn:entity:movie' }] }] } },
    Nowhere: { status: 'needs_input', resolution: { issues: [{ kind: 'not_found' }] } },
    Broken: { status: 'error', error: { code: 'down' } }
  };
  const items = await checkFavourites(['كولدبلاي', 'Friends', 'Nowhere', 'Broken'], {
    translate: async values => values.map(value => value === 'كولدبلاي' ? 'Coldplay' : value),
    qloo: async (operation, input) => { assert.equal(operation, 'describe'); return results[input.entity]; }
  });
  assert.deepEqual(items.map(item => item.status), ['ok', 'choose', 'missing', 'error']);
  assert.equal(items[0].text, 'كولدبلاي', "the guest's own words are kept");
  assert.equal(items[0].match.id, 'id-coldplay');
  assert.deepEqual(items[1].candidates.map(item => [item.id, item.releaseYear]), [['tv', 1994], ['film', undefined]]);
  const fallback = await checkFavourites(['فيروز'], { translate: async () => { throw new Error('no Gemini'); }, qloo: async (operation, input) => ({ status: 'ok', interpretation: { entity: { entityId: 'x', name: input.entity } } }) });
  assert.equal(fallback[0].query, 'فيروز', 'without translation the words are searched as typed');
});

test('the host never sees private favourites; shared ones appear; the invitation link is not the host', async () => {
  await mkdir(testRoot, { recursive: true });
  const directory = await mkdtemp(join(testRoot, 'thooq-privacy-'));
  const server = createThooqServer({
    dataDirectory: directory,
    recommend: event => buildTasteRecommendation(event, { qloo, translate: noTranslation, generate: null }),
    check: async texts => texts.map(text => ({ text, query: text, status: 'missing' }))
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (path, { method = 'GET', body, host } = {}) => {
    const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(host ? { 'X-Thooq-Host': host } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, data: await response.json() };
  };
  try {
    const created = await call('/api/events', { method: 'POST', body: { occasion: 'Family lunch', city: 'Riyadh' } });
    const { hostKey } = created.data;
    const id = created.data.event.id;

    const invitation = await call(`/api/events/${id}`);
    assert.deepEqual(Object.keys(invitation.data.event).sort(), ['city', 'demo', 'id', 'language', 'occasion']);
    assert.equal((await call(`/api/events/${id}`, { host: 'wrong-key-wrong-key-wrong-key-wrong1' })).data.event.answers, undefined);

    const checked = await call(`/api/events/${id}/check`, { method: 'POST', body: { items: ['one', 'two'] } });
    assert.deepEqual(checked.data.items.map(item => item.status), ['missing', 'missing']);
    assert.equal((await call(`/api/events/${id}/check`, { method: 'POST', body: { items: Array(7).fill('x') } })).status, 400);

    const reply = await call(`/api/events/${id}/answers`, { method: 'POST', body: { name: 'Amal', answers: [['secret band', 'b', 'c'], ['d', 'e', 'f'], ['quiet', 'h', 'i']], resolved: [{ id: 'qa-secret-1', name: 'Secret Band', type: 'urn:entity:artist', text: 'secret band' }], shareWithHost: false } });
    assert.equal(reply.status, 201);
    assert.equal(reply.data.event.answers, undefined, 'a guest never gets the other replies back');
    await call(`/api/events/${id}/answers`, { method: 'POST', body: { name: 'Badr', answers: [['open cafe', 'b', 'c'], ['d', 'e', 'f'], ['g', 'h', 'i']], resolved: [{ id: 'qb-open-1', name: 'Open Cafe', text: 'open cafe' }], shareWithHost: true } });
    assert.equal((await call(`/api/events/${id}/answers`, { method: 'POST', body: { name: 'Bad', answers: [['a', 'b', 'c'], ['d', 'e', 'f'], ['g', 'h', 'i']], resolved: [{ id: '<script>', name: 'x' }] } })).status, 400);

    assert.equal((await call(`/api/events/${id}/recommendation`, { method: 'POST', body: {} })).status, 403);
    const plan = await call(`/api/events/${id}/recommendation`, { method: 'POST', body: { lang: 'en' }, host: hostKey });
    assert.equal(plan.status, 200);
    const planText = JSON.stringify(plan.data);
    assert.ok(!/secret band/i.test(planText), 'a private favourite never reaches the host');
    assert.ok(planText.includes('Open Cafe'), 'a shared favourite can be shown');
    assert.equal(plan.data.recommendation.signalLabels, undefined);
    assert.equal(plan.data.recommendation.signalOwners, undefined);
    assert.match(plan.data.recommendation.reason, /1 more that guests kept private/);

    const recommends = seen.filter(item => item.operation === 'recommend');
    assert.ok(recommends.some(item => item.input.signals.includes('qa-secret-1')), "the private favourite still shapes the search");

    const dashboard = await call(`/api/events/${id}`, { host: hostKey });
    assert.deepEqual(dashboard.data.event.answers.map(({ name, shareWithHost, recognised, favourites }) => ({ name, shareWithHost, recognised, favourites })), [
      { name: 'Amal', shareWithHost: false, recognised: 1, favourites: undefined },
      { name: 'Badr', shareWithHost: true, recognised: 1, favourites: ['Open Cafe'] }
    ]);
    assert.ok(!/secret band/i.test(JSON.stringify(dashboard.data)));

    const shared = await call(`/api/shared/${plan.data.recommendation.shareToken}`);
    assert.equal(shared.status, 200);
    assert.ok(!/secret band/i.test(JSON.stringify(shared.data)), 'the shared plan page keeps it private too');
  } finally {
    await new Promise(resolve => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  }
});

test('plan text that names a private favourite is masked', () => {
  const names = ['Secret Band', 'فيروز'];
  assert.equal(hidePrivate('Great for Secret Band fans', names, 'a guest favourite'), 'Great for a guest favourite fans');
  assert.equal(hidePrivate('جلسة لعشاق فيروز', names, 'إحدى مفضلات الضيوف'), 'جلسة لعشاق إحدى مفضلات الضيوف');
  assert.equal(hidePrivate('Secret Bandits are not a match', names, 'x'), 'Secret Bandits are not a match');
});
