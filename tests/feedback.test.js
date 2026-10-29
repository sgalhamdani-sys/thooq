import test from 'node:test';
import assert from 'node:assert/strict';
import { attachRecommendationShare, recordFeedback, feedbackSummary, rankWithFeedback, publicSharedRecommendation } from '../feedback-service.js';

const places = Array.from({ length: 15 }, (_, index) => ({ id: `place-${index}`, name: `Place ${index}`, address: 'Riyadh' }));
const context = { city: 'الرياض', occasion: 'طلعة صديقات', querySignals: ['Dune'], signalLabels: { Dune: 'Dune' } };
function fixture() {
  const event = { ...context, id: 'synthetic', recommendation: { ...context, source: 'qloo', title: 'Test', summary: 'Test summary', reason: 'Test reason', places: places.slice(0, 5) } };
  return { event, snapshot: attachRecommendationShare(event) };
}

test('one browser can change a vote without duplicates; shared output excludes private state', () => {
  const { snapshot } = fixture();
  recordFeedback(snapshot, 'browser-one', 'good');
  recordFeedback(snapshot, 'browser-one', 'good');
  assert.deepEqual(feedbackSummary(snapshot), { good: 1, bad: 0, total: 1 });
  recordFeedback(snapshot, 'browser-one', 'bad');
  recordFeedback(snapshot, 'browser-two', 'good');
  assert.deepEqual(feedbackSummary(snapshot), { good: 1, bad: 1, total: 2 });
  const shared = publicSharedRecommendation(snapshot, 'browser-one');
  assert.equal(shared.myRating, 'bad');
  assert.equal(shared.votes, undefined);
  assert.equal(shared.querySignals, undefined);
  assert.equal(shared.eventId, undefined);
  assert.ok(!JSON.stringify(snapshot).includes('browser-one'));
  assert.throws(() => recordFeedback(snapshot, 'browser-one', 1));
});

test('unchanged place selection keeps its link and votes; new selection preserves old snapshot', () => {
  const { event, snapshot } = fixture();
  recordFeedback(snapshot, 'browser', 'good');
  event.recommendation.reason = 'Updated feedback explanation';
  assert.equal(attachRecommendationShare(event).shareToken, snapshot.shareToken);
  assert.equal(event.recommendationHistory.length, 1);
  event.recommendation.places = places.slice(5, 10);
  const next = attachRecommendationShare(event);
  assert.notEqual(next.shareToken, snapshot.shareToken);
  assert.deepEqual(snapshot.places, places.slice(0, 5));
  assert.equal(feedbackSummary(snapshot).good, 1);
  assert.equal(feedbackSummary(next).total, 0);
});

test('negative list feedback lowers matching places only within similar tastes and city', () => {
  const { snapshot } = fixture();
  for (let index = 0; index < 8; index++) recordFeedback(snapshot, `browser-${index}`, 'bad');
  const ranked = rankWithFeedback(places, context, [snapshot]);
  assert.equal(ranked.learning.ratingsUsed, 8);
  assert.equal(ranked.learning.orderChanged, true);
  assert.notDeepEqual(ranked.places.slice(0, 5), places.slice(0, 5));
  assert.deepEqual(new Set(ranked.places.map(place => place.id)), new Set(places.map(place => place.id)));
  for (const unrelated of [{ ...context, city: 'جدة' }, { ...context, querySignals: ['Jazz'] }]) {
    const result = rankWithFeedback(places, unrelated, [snapshot]);
    assert.deepEqual(result.places, places);
    assert.equal(result.learning.ratingsUsed, 0);
  }
});

test('positive feedback promotes places while no feedback keeps the Qloo order', () => {
  const { snapshot } = fixture();
  snapshot.places = places.slice(5, 10);
  for (let index = 0; index < 8; index++) recordFeedback(snapshot, `browser-${index}`, 'good');
  const ranked = rankWithFeedback(places, { ...context, city: 'Riyadh, Saudi Arabia' }, [snapshot]);
  assert.ok(ranked.places.findIndex(place => place.id === 'place-5') < 5);
  assert.deepEqual(rankWithFeedback(places, context).places, places);
});
