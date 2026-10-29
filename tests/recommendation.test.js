import test from 'node:test';
import assert from 'node:assert/strict';
import { createDirectQlooWorkflowExecutor } from '../node_modules/@qloo/qloo-harness/dist/qloo-tools.js';
import { buildTasteRecommendation } from '../qloo-service.js';

const tvId = '11111111-1111-4111-8111-111111111111';
const bookId = '22222222-2222-4222-8222-222222222222';
const cafeId = '33333333-3333-4333-8333-333333333333';
const placeId = '44444444-4444-4444-8444-444444444444';
const place = { entity_id: placeId, name: 'Test Riyadh Place', type: 'urn:entity:place', properties: { address: 'Riyadh, Saudi Arabia' } };
const matches = [
  { entity_id: tvId, name: 'Naruto', type: 'urn:entity:tv_show', properties: { release_year: 2002 } },
  { entity_id: bookId, name: 'Naruto', type: 'urn:entity:book', properties: { release_year: 1999 } },
  { entity_id: cafeId, name: 'Known Cafe', type: 'urn:entity:place' }
];
const event = { city: 'الرياض', occasion: 'طلعة صديقات', answers: [{ answers: [['ناروتو', 'اسم غير معروف'], ['مقهى معروف'], ['هدوء']] }] };

// Exercise the installed Qloo workflow/resolver, replacing only the HTTP client.
function harness() {
  const searches = [], lookups = [], insights = [];
  const executor = createDirectQlooWorkflowExecutor({
    async searchEntities({ query }) {
      searches.push(query);
      return { results: matches.filter(item => item.name === query) };
    },
    async entities(ids) { lookups.push(...ids); return { results: [...matches, place].filter(item => ids.includes(item.entity_id)) }; },
    async insights(query) {
      insights.push(query);
      return { results: { entities: [{ ...place, query: { affinity: 0.8 } }] } };
    }
  });
  return { generate: null, qloo: async (operation, input) => (await executor.execute(operation, input)).result, searches, lookups, insights };
}
const recommends = live => live.insights.filter(query => !query['filter.results.entities']);

test('real harness ambiguity is displayed; confirming a candidate ID reaches Riyadh places', async () => {
  const live = harness();
  let translations = 0;
  const translate = async values => { translations++; assert.deepEqual(values, ['ناروتو', 'اسم غير معروف', 'مقهى معروف']); return ['Naruto', 'Unknown Favorite', 'Known Cafe']; };
  const review = await buildTasteRecommendation(event, { generate: null, qloo: live.qloo, translate });
  assert.equal(review.source, 'qloo-needs-input');
  assert.equal(review.reviewVersion, 2);
  assert.equal(review.clarifications.length, 2);
  assert.equal(review.clarifications[0].kind, 'ambiguous');
  assert.deepEqual(review.clarifications[0].candidates.map(item => item.id), [tvId, bookId]);
  assert.equal(review.clarifications[0].candidates[0].releaseYear, 2002);
  assert.equal(review.clarifications[1].kind, 'not_found');
  assert.deepEqual(review.signalOwners, { Naruto: [0], 'Unknown Favorite': [0], 'Known Cafe': [0] });
  assert.equal(live.insights.length, 0);

  const result = await buildTasteRecommendation({ ...event, recommendation: review, confirmedSignals: [tvId, 'Known Cafe'] }, { generate: null, qloo: live.qloo, translate });
  assert.equal(result.source, 'qloo');
  assert.equal(result.places[0].id, placeId);
  assert.deepEqual(result.places[0].fit, { count: 1, total: 1, guests: [0], tastes: [{ guest: 0, favourites: ['Naruto', 'Known Cafe'] }] });
  const [guestQuery, groupQuery] = recommends(live);
  assert.deepEqual(guestQuery['signal.interests.entities'], [tvId, cafeId]);
  assert.deepEqual(groupQuery['signal.interests.entities'], [tvId, cafeId]);
  assert.equal(guestQuery['filter.location.query'], 'Riyadh, Saudi Arabia');
  assert.equal(guestQuery['filter.type'], 'urn:entity:place');
  assert.equal(result.signalLabels[tvId], 'Naruto');
  assert.ok(result.reason.includes('Naruto'));
  assert.ok(!result.reason.includes(tvId));
  assert.equal(result.signals, undefined, 'successful results must not render another confirmation form');

  const before = recommends(live).length;
  await buildTasteRecommendation({ ...event, recommendation: result }, { generate: null, qloo: live.qloo, translate });
  assert.equal(translations, 1, 'refresh reuses confirmed selections instead of translating again');
  assert.deepEqual(recommends(live)[before]['signal.interests.entities'], [tvId, cafeId]);
});

test('unchanged or entirely removed preferences cannot silently repeat a request', async () => {
  const live = harness();
  const review = await buildTasteRecommendation({ ...event, confirmedSignals: ['Naruto'] }, { generate: null, qloo: live.qloo });
  const searchCount = live.searches.length;
  await assert.rejects(buildTasteRecommendation({ ...event, recommendation: review, confirmedSignals: ['Naruto'] }, { generate: null, qloo: live.qloo }), /ما زال يحتاج/);
  await assert.rejects(buildTasteRecommendation({ ...event, recommendation: review, confirmedSignals: [] }, { generate: null, qloo: live.qloo }), /مفضلة واحدة/);
  assert.equal(live.searches.length, searchCount);
});

test('old saved review without candidates is rebuilt without another Gemini request', async () => {
  const live = harness();
  const review = await buildTasteRecommendation({ ...event, recommendation: { source: 'qloo-error', signals: ['Naruto'], clarifications: [] }, confirmedSignals: ['Naruto'] }, { generate: null, qloo: live.qloo, translate: () => assert.fail('must not translate again') });
  assert.equal(review.clarifications[0].candidates.length, 2);
});

test('corrected missing name works and provider errors do not erase the existing review', async () => {
  const live = harness();
  const review = await buildTasteRecommendation({ ...event, confirmedSignals: ['Unknown Favorite'] }, { generate: null, qloo: live.qloo });
  const result = await buildTasteRecommendation({ ...event, recommendation: review, confirmedSignals: ['Known Cafe'] }, { generate: null, qloo: live.qloo });
  assert.equal(result.source, 'qloo');
  await assert.rejects(buildTasteRecommendation({ ...event, recommendation: review, confirmedSignals: ['Known Cafe'] }, { generate: null, qloo: async () => ({ status: 'error' }) }), /لم تكتمل/);
  assert.equal(review.clarifications[0].input, 'Unknown Favorite');
});

test('empty results and unexpected needs_input are explicit, never fabricated places', async () => {
  const input = { ...event, confirmedSignals: ['Known Cafe'] };
  const result = await buildTasteRecommendation(input, { generate: null, qloo: async () => ({ status: 'empty', results: [] }) });
  assert.equal(result.source, 'qloo-empty');
  assert.deepEqual(result.places, []);
  await assert.rejects(buildTasteRecommendation(input, { generate: null, qloo: async () => ({ status: 'needs_input', resolution: { issues: [] } }) }), /لم نتمكن من عرضه/);
});
