import test from 'node:test';
import assert from 'node:assert/strict';
import { createDirectQlooWorkflowExecutor } from '../node_modules/@qloo/qloo-harness/dist/qloo-tools.js';
import { buildTasteRecommendation, remapSignalOwners } from '../qloo-service.js';
import { buildFitMatrix, groupSignalInputs, scoreGroupFit } from '../group-fit.js';

// Synthetic Qloo world. Only the HTTP client is replaced; resolution,
// validation and normalization run through the installed Qloo Harness.
const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const favourites = ['Naruto', 'Fairuz', 'Friends', 'Starbucks', 'Five Guys', 'IKEA', 'Coldplay', 'Spirited Away', 'Barnes & Noble', 'Shake Shack', 'Lego', 'Disney'];
const entities = favourites.map((name, index) => ({ entity_id: uuid(index + 1), name, type: 'urn:entity:brand' }));
const places = Array.from({ length: 9 }, (_, index) => ({ entity_id: uuid(100 + index), name: `Riyadh Place ${index + 1}`, type: 'urn:entity:place', properties: { address: `District ${index + 1}, Riyadh` } }));
const kidsTag = 'urn:tag:amenity:place:family_friendly';
const KIDS_PLACE = places[8];

function qlooWorld() {
  const calls = { insights: [], tags: [] };
  const known = [...entities, ...places];
  const executor = createDirectQlooWorkflowExecutor({
    async searchEntities({ query }) { return { results: entities.filter(item => item.name === query) }; },
    async entities(ids) { return { results: known.filter(item => ids.includes(item.entity_id)) }; },
    async tags(query) {
      calls.tags.push(query['filter.query']);
      return { results: { tags: /family|kid/i.test(query['filter.query']) ? [{ id: kidsTag, name: 'Family Friendly', type: 'urn:tag:amenity:place' }] : [] } };
    },
    async insights(query) {
      calls.insights.push(query);
      const signals = query['signal.interests.entities'] || [];
      // Guest one (first six favourites) prefers low-numbered places; guest two the reverse.
      const guestOne = signals.some(id => entities.slice(0, 6).some(item => item.entity_id === id));
      const ordered = guestOne ? places.slice(0, 8) : [...places.slice(0, 8)].reverse();
      if (query['filter.results.entities']) {
        const options = query['filter.results.entities'];
        const ranked = [...ordered, KIDS_PLACE].filter(place => options.includes(place.entity_id));
        return { results: { entities: ranked.map((place, index) => ({ ...place, query: { affinity: 0.9 - index * 0.05 } })) } };
      }
      if (query['filter.tags']?.includes(kidsTag)) return { results: { entities: [KIDS_PLACE] } };
      return { results: { entities: ordered.slice(0, 6) } };
    }
  });
  return { qloo: async (operation, input) => (await executor.execute(operation, input)).result, calls };
}

const event = {
  city: 'الرياض', occasion: 'طلعة صديقات', guestRange: '2–4', ageGroups: ['بالغون', 'أطفال'], note: 'أطفال أقل من 5 سنوات',
  answers: [
    { name: 'نورة', answers: [['ناروتو', 'فيروز', 'فريندز'], ['ستاربكس', 'فايف قايز', 'ايكيا'], ['هدوء', 'ألعاب أطفال', 'جلسة طويلة']] },
    { name: 'لبنى', answers: [['كولدبلاي', 'المخطوفة', 'بارنز'], ['شيك شاك', 'ليغو', 'ديزني'], ['ضحك', 'أكل صحي', 'مكان واسع']] }
  ]
};
const translate = async values => values.map(value => favourites[event.answers.flatMap(answer => answer.answers.slice(0, 2).flat()).indexOf(value)]);

function scriptedGemini(turns) {
  const bodies = [];
  return {
    bodies,
    generate: async body => {
      bodies.push(structuredClone(body));
      const next = turns.shift();
      if (next instanceof Error) throw next;
      return { candidates: [{ content: { role: 'model', parts: next } }] };
    }
  };
}
const call = (name, args) => ({ functionCall: { name, args } });

test('fit matrix prefers a place everyone likes over one loved by a single guest', () => {
  const guests = [{ index: 0 }, { index: 1 }, { index: 2 }];
  const matrix = buildFitMatrix(['loved-by-one', 'liked-by-all', 'x', 'y', 'z'], [
    { guest: guests[0], order: ['loved-by-one', 'liked-by-all', 'x', 'y', 'z'] },
    { guest: guests[1], order: ['x', 'liked-by-all', 'y', 'z', 'loved-by-one'] },
    { guest: guests[2], order: ['y', 'liked-by-all', 'x', 'z', 'loved-by-one'] }
  ]);
  assert.ok(matrix.places['liked-by-all'].score > matrix.places['loved-by-one'].score);
  assert.deepEqual(matrix.places['liked-by-all'].fits, [0, 1, 2]);
  assert.deepEqual(matrix.places['loved-by-one'].fits, [0]);
  assert.equal(matrix.total, 3);
});

test('a failed per-guest ranking is left out of the fit and its reason is kept', async () => {
  const guests = [0, 1, 2].map(index => ({ index, resolved: [{ input: `fav-${index}` }] }));
  const matrix = await scoreGroupFit({
    placeIds: ['a', 'b', 'c'], guests,
    qloo: async (operation, input) => input.signals[0] === 'fav-1'
      ? { status: 'error', error: { code: 'QLOO_RATE_LIMITED' } }
      : { status: 'ok', results: input.options.map(id => ({ entity_id: id })) }
  });
  assert.equal(matrix.total, 2);
  assert.deepEqual(matrix.failures, [{ status: 'error', code: 'QLOO_RATE_LIMITED' }]);
  assert.deepEqual(matrix.places.a.fits, [0, 2]);
});

test('a place Qloo cannot rank is dropped once, remembered, and shown without a fit', async () => {
  const guests = [0, 1, 2].map(index => ({ index, resolved: [{ input: `taste-${index}` }] }));
  const calls = [];
  const qloo = async (operation, input) => {
    calls.push(input.options);
    if (input.options.includes('lost-place')) return { status: 'needs_input', resolution: { issues: [{ kind: 'not_found', field: 'options', input: 'lost-place' }] } };
    return { status: 'ok', results: input.options.map(id => ({ entity_id: id })) };
  };
  const matrix = await scoreGroupFit({ placeIds: ['p1', 'lost-place', 'p2', 'p3'], guests, qloo });
  assert.equal(matrix.total, 3, 'every guest is ranked');
  assert.equal(matrix.failures, undefined);
  assert.deepEqual(matrix.places.p1.fits, [0, 1, 2]);
  assert.equal(matrix.places['lost-place'].total, 0, 'no misleading "0 of 3"');
  assert.deepEqual(matrix.options, ['p1', 'lost-place', 'p2', 'p3']);
  assert.equal(calls.length, 4, 'one retry for the first guest, then clean calls');
  calls.length = 0;
  await scoreGroupFit({ placeIds: ['lost-place', 'p4', 'p5'], guests, qloo });
  assert.ok(calls.every(options => !options.includes('lost-place')), 'the unrankable place is remembered');
});

test('group signals put shared favourites first and represent every guest', () => {
  const guests = [
    { resolved: ['A', 'B', 'C', 'D', 'E', 'F'].map(input => ({ input })) },
    { resolved: ['B', 'G', 'H', 'I', 'J', 'K'].map(input => ({ input })) },
    { resolved: ['L', 'M'].map(input => ({ input })) }
  ];
  const inputs = groupSignalInputs(guests);
  assert.equal(inputs.length, 10);
  assert.equal(inputs[0], 'B');
  for (const input of ['A', 'G', 'L', 'M']) assert.ok(inputs.includes(input), `${input} represents a guest`);
});

test('confirmed choices keep their guest owners', () => {
  const previous = {
    querySignals: ['Naruto', 'Unknown One', 'Unknown Two', 'Fairuz'],
    signalOwners: { Naruto: [0], 'Unknown One': [1], 'Unknown Two': [0, 1], Fairuz: [1] },
    clarifications: [{ input: 'Naruto', candidates: [{ id: 'tv-id' }] }, { input: 'Unknown One', candidates: [] }, { input: 'Unknown Two', candidates: [] }]
  };
  // Candidate choice, a same-length positional correction and a kept name.
  assert.deepEqual(remapSignalOwners(previous, ['tv-id', 'Corrected One', 'Corrected Two', 'Fairuz']), { 'tv-id': [0], 'Corrected One': [1], 'Corrected Two': [0, 1], Fairuz: [1] });
  // One name removed, one corrected: corrections replace open issues in order.
  assert.deepEqual(remapSignalOwners(previous, ['tv-id', 'Corrected One', 'Fairuz']), { 'tv-id': [0], 'Corrected One': [1], Fairuz: [1] });
});

test('agent turns constraints into Qloo tags, checks group fit and returns a validated plan', async () => {
  const world = qlooWorld();
  const placeId = n => places[n].entity_id;
  const gemini = scriptedGemini([
    [call('find_tags', { queries: ['family friendly'] })],
    [call('search_places', { purpose: 'kid-friendly outing', include_tags: [kidsTag, 'urn:tag:invented:by_model'] })],
    [call('score_group_fit', { place_ids: [KIDS_PLACE.entity_id] })],
    [call('finalize_plan', {
      title: 'صباح عائلي هادئ', concept: 'خطة تناسب الأمهات والأطفال.',
      stops: [
        { place_id: KIDS_PLACE.entity_id, role: 'الفطور', why: 'مكان مناسب للعائلات.' },
        { place_id: '99999999-9999-4999-8999-999999999999', role: 'مكان مخترع', why: 'لا يجب قبوله' },
        { place_id: placeId(3), role: 'قهوة بعدها', why: 'يجمع ذوق الجميع.' }
      ],
      considerations: ['تأكدي من وجود منطقة ألعاب للأطفال.']
    })]
  ]);
  const result = await buildTasteRecommendation(event, { qloo: world.qloo, translate, generate: gemini.generate });

  assert.equal(result.source, 'qloo');
  assert.equal(result.agent.mode, 'agent');
  assert.equal(result.title, 'صباح عائلي هادئ');
  const stops = result.places.filter(place => place.stop);
  assert.deepEqual(stops.map(place => place.id), [KIDS_PLACE.entity_id, placeId(3)], 'invented place IDs are dropped');
  assert.equal(stops[0].role, 'الفطور');
  for (const place of result.places) {
    assert.equal(place.fit.total, 2);
    assert.equal(place.fit.count, place.fit.guests.length);
  }
  assert.ok(result.places.some(place => place.alternative));
  assert.deepEqual(result.considerations, ['تأكدي من وجود منطقة ألعاب للأطفال.']);

  // Every Qloo call stays within harness limits and the event city.
  const recommends = world.calls.insights.filter(query => !query['filter.results.entities']);
  for (const query of recommends) {
    assert.equal(query['filter.location.query'], 'Riyadh, Saudi Arabia');
    assert.ok(query['signal.interests.entities'].length <= 10);
  }
  const tagged = recommends.find(query => query['filter.tags']);
  assert.deepEqual(tagged['filter.tags'], [kidsTag], 'only tag URNs returned by Qloo are used');
  const ranks = world.calls.insights.filter(query => query['filter.results.entities']);
  assert.ok(ranks.length >= 4, 'each guest ranks the shortlist, and again after the agent adds places');
  assert.ok(ranks.every(query => query['filter.results.entities'].length <= 10));

  // The model sees anonymous labels, never guest names.
  const sent = JSON.stringify(gemini.bodies);
  assert.ok(!sent.includes('نورة') && !sent.includes('لبنى'));
  assert.ok(sent.includes('أطفال أقل من 5 سنوات'), 'host constraints reach the agent');
  assert.ok(sent.includes('ألعاب أطفال'), 'guest moods reach the agent');
  assert.ok(result.agentSteps.some(step => step.kind === 'tags' && step.text.includes('Family Friendly')));
  assert.ok(result.agentSteps.some(step => step.kind === 'plan'));
});

test('a model that only invents places is forced to finalize, then falls back to computed fit', async () => {
  const world = qlooWorld();
  const invented = [call('finalize_plan', { title: 'x', concept: 'y', stops: [{ place_id: 'made-up', role: 'a', why: 'b' }] })];
  const gemini = scriptedGemini([invented, invented, invented, invented, invented, invented, invented]);
  const result = await buildTasteRecommendation(event, { qloo: world.qloo, translate, generate: gemini.generate });
  assert.equal(result.agent.mode, 'fallback');
  assert.ok(result.places.filter(place => place.stop).length >= 1);
  assert.ok(result.places.every(place => places.some(item => item.entity_id === place.id)));
  assert.ok(result.agentSteps.some(step => step.kind === 'fallback'));
  const last = gemini.bodies.at(-1);
  assert.equal(last.toolConfig.functionCallingConfig.mode, 'ANY');
});

test('a Gemini outage still returns a real, fit-ranked recommendation', async () => {
  const world = qlooWorld();
  const gemini = scriptedGemini([new Error('Gemini HTTP 429')]);
  const result = await buildTasteRecommendation(event, { qloo: world.qloo, translate, generate: gemini.generate });
  assert.equal(result.source, 'qloo');
  assert.equal(result.agent.mode, 'fallback');
  const [first] = result.places;
  assert.ok(first.stop && first.fit.total === 2);
});

test('twelve distinct favourites no longer exceed the ten-signal Qloo limit', async () => {
  const world = qlooWorld();
  const result = await buildTasteRecommendation(event, { qloo: world.qloo, translate, generate: null });
  assert.equal(result.source, 'qloo');
  assert.equal(new Set(favourites).size, 12);
  assert.ok(world.calls.insights.every(query => (query['signal.interests.entities'] || []).length <= 10));
  assert.deepEqual(result.signalOwners.Naruto, [0]);
  assert.deepEqual(result.signalOwners.Coldplay, [1]);
});
