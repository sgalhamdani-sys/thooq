import { translatePreferences, callGemini } from './gemini-service.js';
import { rankWithFeedback } from './feedback-service.js';
import { runQloo, qlooStatus } from './qloo-workflows.js';
import { addToPool, groupSignalInputs, liftOrder, MAX_OPTIONS, orderByFit, scoreGroupFit } from './group-fit.js';
import { planGathering } from './agent-service.js';
import { bilingualError, copy, languageOf } from './copy.js';

export { qlooStatus };

export const MAX_SIGNALS = 60;
// Qloo's "places" include hotels, serviced apartments and universities. Candidates
// are limited to places a group goes out to (tag URNs returned by Qloo's tag search).
export const OUTING_TAGS = Object.freeze([
  'urn:tag:genre:place:restaurant', 'urn:tag:product_service:qloo:restaurant_dining', 'urn:tag:category:place:cafe',
  'urn:tag:cuisine:qloo:dessert', 'urn:tag:category:place:park', 'urn:tag:category:place:shopping_mall'
]);
async function recommendOutings(qloo, input) {
  const filtered = await qloo('recommend', { ...input, include_tags: [...OUTING_TAGS], include_tags_operator: 'union' });
  const usable = ['ok', 'partial'].includes(filtered?.status) && Array.isArray(filtered.results) && filtered.results.length;
  return usable || filtered?.status === 'needs_input' && filtered.resolution?.issues?.some(issue => issue?.field === 'signals') ? filtered : qloo('recommend', input);
}
const unique = values => [...new Set(values.filter(Boolean))];
const clip = (value, max) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
// The agent is told never to name a guest's favourites; this is the safety net
// for plan text that does anyway: whole-word, case-sensitive replacement.
const escapeRegExp = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export function hidePrivate(text, names, replacement) {
  if (typeof text !== 'string' || !text || !names.length) return text;
  return [...names].sort((a, b) => b.length - a.length).reduce((value, name) =>
    value.replace(new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(name)}(?=$|[^\\p{L}\\p{N}])`, 'gu'), (_, before) => `${before}${replacement}`), text);
}
const guestLabel = index => `G${index + 1}`;

// Compatibility wrapper for callers that only need the recommend workflow.
export const executeRecommendation = input => runQloo('recommend', input);

function sortedUnion(...lists) {
  return [...new Set(lists.flat().filter(Number.isInteger))].sort((a, b) => a - b);
}

// Which guests own each signal after the host confirms or corrects names.
export function remapSignalOwners(previous, confirmed) {
  const before = previous?.querySignals ?? previous?.signals ?? [];
  const owners = previous?.signalOwners ?? {};
  const issues = previous?.clarifications ?? [];
  const next = {};
  const add = (signal, guests) => { if (guests?.length) next[signal] = sortedUnion(next[signal] || [], guests); };
  const issueOfCandidate = new Map(issues.flatMap(issue => (issue.candidates || []).map(candidate => [candidate.id, issue.input])));
  const handled = new Set();
  const corrections = [];
  confirmed.forEach((signal, position) => {
    if (before.includes(signal)) { add(signal, owners[signal]); handled.add(signal); }
    else if (issueOfCandidate.has(signal)) { add(signal, owners[issueOfCandidate.get(signal)]); handled.add(issueOfCandidate.get(signal)); }
    else if (confirmed.length === before.length && !confirmed.includes(before[position])) { add(signal, owners[before[position]]); handled.add(before[position]); }
    else corrections.push(signal);
  });
  // Remaining free-text corrections replace unresolved names in order.
  const open = issues.map(issue => issue.input).filter(input => !handled.has(input) && !confirmed.includes(input));
  corrections.forEach((signal, index) => add(signal, owners[open[index]]));
  return next;
}

async function resolveSignals(event, translate) {
  const previous = event.recommendation;
  if (event.confirmedSignals) {
    const signals = unique(event.confirmedSignals.map(value => String(value).trim()));
    return { signals, owners: remapSignalOwners(previous, signals) };
  }
  const saved = previous?.querySignals ?? previous?.signals;
  if (saved?.length) return { signals: unique(saved.map(value => String(value).trim())), owners: previous.signalOwners ?? {} };
  // Guests who confirmed their own favourites bring Qloo IDs; replies saved
  // before that bring words, which are translated (and may need a review).
  const confirmed = index => Array.isArray(event.answers[index].resolved);
  const perGuest = event.answers.map((answer, index) => confirmed(index)
    ? unique(answer.resolved.map(item => item.id))
    : unique(answer.answers.slice(0, 2).flat().map(value => String(value).trim())));
  const words = unique(perGuest.filter((_, index) => !confirmed(index)).flat()).slice(0, MAX_SIGNALS);
  // Favourites already resolved to Qloo IDs (the demo gathering) skip ambiguity.
  const known = event.knownSignals || {};
  const translated = words.length ? (await translate(words)).map(value => String(value).trim()).map(value => known[value.toLowerCase()]?.id || value) : [];
  const english = new Map(words.map((value, index) => [value, translated[index]]));
  const owners = {};
  const signals = [];
  perGuest.forEach((favourites, index) => favourites.forEach(value => {
    const signal = confirmed(index) ? value : english.get(value);
    if (!signal) return;
    if (!signals.includes(signal)) signals.push(signal);
    owners[signal] = sortedUnion(owners[signal] || [], [index]);
  }));
  return { signals: signals.slice(0, MAX_SIGNALS), owners };
}

function clarificationsFrom(results, signals) {
  const byInput = new Map();
  for (const result of results) {
    if (result?.status !== 'needs_input') continue;
    // The workflow envelope uses resolution.issues[].kind, NOT outcome.status.
    for (const issue of result.resolution?.issues || []) {
      if ((issue.field && issue.field !== 'signals') || !signals.includes(issue.input) || !['ambiguous', 'not_found'].includes(issue.kind) || byInput.has(issue.input)) continue;
      byInput.set(issue.input, {
        input: issue.input, kind: issue.kind,
        candidates: (issue.candidates || []).slice(0, 8).map(candidate => ({
          id: candidate.id, name: candidate.name, type: candidate.type,
          releaseYear: candidate.release_year,
          address: typeof candidate.address === 'string' ? candidate.address : '',
          description: typeof candidate.description === 'string' ? candidate.description.slice(0, 180) : ''
        })).filter(candidate => typeof candidate.id === 'string' && typeof candidate.name === 'string')
      });
    }
  }
  return [...byInput.values()];
}

// Each guest contributes their strongest places, so nobody's taste is missing from the shortlist.
function buildShortlist(groupIds, guestLists) {
  const shortlist = groupIds.slice(0, 4);
  for (let round = 0; shortlist.length < MAX_OPTIONS && guestLists.some(list => round < list.length); round++) {
    for (const list of guestLists) if (list[round] && !shortlist.includes(list[round]) && shortlist.length < MAX_OPTIONS) shortlist.push(list[round]);
  }
  for (const id of groupIds) if (!shortlist.includes(id) && shortlist.length < MAX_OPTIONS) shortlist.push(id);
  return shortlist;
}

const resultIds = (result, pool) => (Array.isArray(result?.results) ? result.results : []).map(entity => entity?.entity_id || entity?.id).filter(id => pool.has(id));
// Candidates in order of taste beyond popularity (see liftOrder in group-fit.js), so
// each guest's distinctive places reach the shortlist, not only the city's most popular.
const liftIds = (result, pool) => liftOrder((Array.isArray(result?.results) ? result.results : [])
  .map((entity, position) => ({ id: entity?.entity_id || entity?.id, affinity: typeof entity?.affinity === 'number' ? entity.affinity : null, popularity: typeof entity?.popularity === 'number' ? entity.popularity : null, position }))
  .filter(entry => pool.has(entry.id))).order;

export async function buildTasteRecommendation(event, {
  qloo = runQloo,
  translate = translatePreferences,
  generate = process.env.GEMINI_API_KEY ? body => callGemini(body, { timeoutMs: 30000, retries: 0 }) : undefined,
  plan = planGathering
} = {}) {
  const previous = event.recommendation;
  const lang = languageOf(event.language);
  const c = copy(lang);
  const { signals, owners } = await resolveSignals(event, translate);
  if (!signals.length) throw bilingualError('أبقي مفضلة واحدة على الأقل للبحث عن أماكن تناسب ذوقكم.', 'Keep at least one favourite to search for places that suit you.');
  // A confirmation must resolve or remove each issue, not resubmit the same names.
  if (event.confirmedSignals && previous?.reviewVersion === 2) {
    const unchanged = previous.clarifications?.find(issue => signals.includes(issue.input));
    if (unchanged) throw bilingualError(`«${unchanged.input}» ما زال يحتاج تحديدًا. اختاري نتيجة من القائمة، أو صححي الاسم، أو تجاهلي هذه المفضلة.`, `"${unchanged.input}" still needs a choice. Pick a result from the list, correct the name, or skip this favourite.`);
  }
  const knownNames = Object.fromEntries([
    ...Object.values(event.knownSignals || {}).map(item => [item.id, item.name]),
    ...event.answers.flatMap(answer => Array.isArray(answer.resolved) ? answer.resolved.map(item => [item.id, item.name]) : [])
  ]);
  const signalLabels = Object.fromEntries(signals.map(signal => {
    const candidate = previous?.clarifications?.flatMap(issue => issue.candidates || []).find(item => item.id === signal);
    return [signal, candidate?.name || previous?.signalLabels?.[signal] || knownNames[signal] || signal];
  }));
  const cityQuery = /رياض|riyadh/i.test(event.city) ? 'Riyadh, Saudi Arabia' : event.city;

  // 1) Resolve each guest's favourites and find places for each guest's own taste.
  const guests = event.answers.map((answer, index) => ({
    index,
    moods: (answer.answers?.[2] || []).map(mood => clip(mood, 100)).filter(Boolean),
    inputs: signals.filter(signal => owners[signal]?.includes(index)).slice(0, 10),
    resolved: []
  }));
  const orphans = signals.filter(signal => !owners[signal]?.length);
  const batches = [
    ...guests.filter(guest => guest.inputs.length).map(guest => ({ guest, inputs: guest.inputs, source: guestLabel(guest.index) })),
    ...Array.from({ length: Math.ceil(orphans.length / 10) }, (_, index) => ({ guest: null, inputs: orphans.slice(index * 10, index * 10 + 10), source: 'group' }))
  ];
  const results = await Promise.all(batches.map(batch => recommendOutings(qloo, { target_type: 'place', signals: batch.inputs, filter_location: cityQuery, explain: false, limit: 20 })));
  if (results.some(result => result?.status === 'needs_input')) {
    const clarifications = clarificationsFrom(results, signals);
    if (!clarifications.length) throw bilingualError('طلب Qloo توضيحًا لم نتمكن من عرضه. لم يتم إنشاء توصية؛ حاولي مجددًا لاحقًا.', 'Qloo asked for a clarification we could not display. No plan was created; please try again later.');
    return {
      source: 'qloo-needs-input', reviewVersion: 2,
      title: c.review.title,
      summary: c.review.summary(clarifications.length),
      reason: c.review.reason, language: lang,
      signals, querySignals: signals, signalLabels, signalOwners: owners, clarifications, places: []
    };
  }
  if (results.some(result => !['ok', 'partial', 'empty'].includes(result?.status))) throw bilingualError('لم تكتمل توصية Qloo. تحققي من اتصال الخدمة وإعداداتها ثم حاولي مجددًا.', 'The Qloo search did not complete. Check the service connection and settings, then try again.');

  const pool = new Map();
  const guestLists = [];
  const orphanGuest = { index: -1, resolved: [] };
  results.forEach((result, position) => {
    const batch = batches[position];
    const resolved = (result.interpretation?.signals || [])
      .filter(match => typeof match?.input === 'string' && batch.inputs.includes(match.input))
      .map(match => ({ input: match.input, id: match.entityId, name: typeof match.name === 'string' ? match.name : match.input }));
    resolved.forEach(item => { signalLabels[item.input] = item.name; });
    (batch.guest || orphanGuest).resolved.push(...resolved);
    addToPool(pool, result.results, batch.source);
    if (batch.guest) guestLists.push(liftIds(result, pool));
  });

  // 2) One combined call for the whole group's taste.
  const groupInputs = groupSignalInputs([...guests, orphanGuest]);
  const groupResult = groupInputs.length ? await recommendOutings(qloo, { target_type: 'place', signals: groupInputs, filter_location: cityQuery, explain: false, limit: 20 }) : undefined;
  if (groupResult && ['ok', 'partial'].includes(groupResult.status)) addToPool(pool, groupResult.results, 'group');
  const groupIds = liftIds(groupResult, pool);
  const selection = { querySignals: signals, signalLabels, signalOwners: owners };
  if (!pool.size) return { ...selection, source: 'qloo-empty', language: lang, title: c.empty.title, summary: c.empty.summary(event.city), reason: c.empty.reason, places: [] };

  // 3) Rank a balanced shortlist against every guest, then apply saved feedback.
  const shortlist = buildShortlist(groupIds, guestLists);
  const fit = await scoreGroupFit({ placeIds: shortlist, guests, qloo });
  const ranked = rankWithFeedback(orderByFit(shortlist, fit).map(id => pool.get(id)), { ...selection, city: event.city, occasion: event.occasion }, event.feedbackHistory);
  const ordered = ranked.places.map(place => place.id);
  fit.order = ordered;

  // 4) The agent turns tastes, moods and constraints into a plan.
  const scoredGuests = guests.filter(guest => guest.resolved.length).length;
  const steps = [
    { kind: 'read', text: c.steps.read(guests.length, new Set([...guests, orphanGuest].flatMap(guest => guest.resolved.map(item => item.id))).size) },
    { kind: 'search', text: c.steps.search(event.city, pool.size) },
    { kind: 'fit', text: c.steps.fit(ordered.length, scoredGuests, guests.length) }
  ];
  const outcome = await plan({ event, guests, pool, fit, shortlist: ordered, qloo, generate, cityQuery, lang });
  if (outcome.mode !== 'agent') console.warn(`Thooq agent fallback: ${outcome.failure}${outcome.error ? ` — ${outcome.error}` : ''}`);
  const finalFit = outcome.fit;
  // Privacy: a guest's favourites appear (to the host, or on the shared page)
  // only when that guest chose to share them.
  const shares = index => event.answers[index]?.shareWithHost === true;
  const sharedSignal = signal => (owners[signal] || []).some(shares);
  const privateNames = unique([
    ...signals.filter(signal => !sharedSignal(signal)).map(signal => signalLabels[signal]),
    ...event.answers.flatMap((answer, index) => shares(index) ? [] : [...(answer.resolved || []).flatMap(item => [item.name, item.text]), ...answer.answers.slice(0, 2).flat()])
  ].map(value => String(value ?? '').trim()).filter(value => value.length >= 3));
  const hide = text => hidePrivate(text, privateNames, c.plan.privateTaste);
  const fitOf = id => {
    const entry = finalFit.places[id];
    if (!entry) return undefined;
    return {
      count: entry.count, total: entry.total, guests: entry.fits,
      tastes: entry.fits.map(index => ({ guest: index, favourites: shares(index) ? guests[index].resolved.map(item => item.name).slice(0, 3) : [] }))
    };
  };
  const placeOut = id => {
    const place = pool.get(id);
    return { id, name: place.name, address: place.address || '', fit: fitOf(id) };
  };
  const places = [
    ...outcome.plan.stops.map(stop => ({ ...placeOut(stop.id), role: hide(stop.role), why: hide(stop.why), stop: true })),
    ...outcome.alternatives.map(id => ({ ...placeOut(id), alternative: true }))
  ];
  return {
    ...selection, source: 'qloo', learning: ranked.learning,
    title: hide(outcome.plan.title),
    summary: hide(outcome.plan.concept) || c.plan.defaultSummary(event.occasion, event.city),
    reason: c.plan.reason(unique(signals.filter(sharedSignal).map(signal => signalLabels[signal])), ranked.learning.ratingsUsed > 0, signals.filter(signal => !sharedSignal(signal)).length),
    language: lang,
    considerations: (outcome.plan.considerations || []).map(hide),
    agent: { mode: outcome.mode, ...(outcome.failure ? { failure: outcome.failure } : {}), ...(outcome.error ? { detail: clip(outcome.error, 200) } : {}) },
    agentSteps: [...steps, ...outcome.steps.map(step => ({ ...step, text: hide(step.text) }))],
    groupFit: { method: finalFit.method, basis: finalFit.basis, total: finalFit.total, guests: guests.length, ...(finalFit.failures?.length ? { failures: finalFit.failures.slice(0, 4) } : {}) },
    places
  };
}
