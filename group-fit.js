// Group fit: how well each candidate place suits EACH guest, not just the
// pooled group. Every guest's own Qloo favourites rank the same shortlist
// (one qloo rank call per guest, so scores stay comparable within a guest).
// Positions are turned into a 0–1 utility per guest and combined with a
// hybrid of the classic "average" and "least misery" group strategies, so a
// place loved by one guest and disliked by the others does not win.
export const FIT_SHARE = 0.4;      // top 40% of a guest's ranking counts as a fit
export const MAX_OPTIONS = 10;     // Qloo rank accepts at most ten options

const unique = values => [...new Set(values.filter(Boolean))];

// Up to ten signal inputs that represent the whole group in one Qloo call:
// favourites shared by several guests first, then one per guest in turn.
export function groupSignalInputs(guests, max = 10) {
  const counts = new Map();
  for (const guest of guests) for (const input of unique(guest.resolved.map(item => item.input))) counts.set(input, (counts.get(input) || 0) + 1);
  const picked = [...counts].filter(([, count]) => count > 1).sort((a, b) => b[1] - a[1]).map(([input]) => input).slice(0, max);
  const queues = guests.map(guest => unique(guest.resolved.map(item => item.input)));
  for (let round = 0; picked.length < max && queues.some(queue => round < queue.length); round++) {
    for (const queue of queues) {
      const input = queue[round];
      if (input && !picked.includes(input) && picked.length < max) picked.push(input);
    }
  }
  return picked;
}

export function compactPlace(entity, source) {
  if (!entity || typeof entity !== 'object') return;
  const id = entity.entity_id || entity.id;
  if (typeof id !== 'string' || typeof entity.name !== 'string') return;
  const properties = entity.properties && typeof entity.properties === 'object' ? entity.properties : {};
  const address = typeof properties.address === 'string' ? properties.address : typeof entity.address === 'string' ? entity.address : '';
  return {
    id, name: entity.name.slice(0, 120), address: address.slice(0, 200),
    ...(typeof properties.price_level === 'number' ? { priceLevel: properties.price_level } : {}),
    ...(typeof properties.business_rating === 'number' ? { rating: properties.business_rating } : {}),
    ...(typeof entity.affinity === 'number' ? { affinity: entity.affinity } : {}),
    sources: source ? [source] : []
  };
}

export function addToPool(pool, entities, source) {
  const added = [];
  for (const entity of Array.isArray(entities) ? entities : []) {
    const place = compactPlace(entity, source);
    if (!place) continue;
    const existing = pool.get(place.id);
    if (existing) { if (source && !existing.sources.includes(source)) existing.sources.push(source); }
    else { pool.set(place.id, place); added.push(place); }
  }
  return added;
}

export function buildFitMatrix(options, rankings, unranked = [], basis = 'affinity') {
  const valid = rankings.filter(item => Array.isArray(item.order) && item.order.length);
  const places = {};
  for (const id of options) {
    if (unranked.includes(id)) { places[id] = { fits: [], count: 0, total: 0, score: 0, unranked: true }; continue; }
    const utilities = [];
    const fits = [];
    for (const { guest, order } of valid) {
      const position = order.indexOf(id);
      utilities.push(position < 0 ? 0 : order.length === 1 ? 1 : 1 - position / (order.length - 1));
      if (position >= 0 && position < Math.ceil(order.length * FIT_SHARE)) fits.push(guest.index);
    }
    const mean = utilities.length ? utilities.reduce((sum, value) => sum + value, 0) / utilities.length : 0;
    const least = utilities.length ? Math.min(...utilities) : 0;
    places[id] = { fits, count: fits.length, total: valid.length, score: Number((0.5 * mean + 0.5 * least).toFixed(4)) };
  }
  const failures = rankings.filter(item => !(Array.isArray(item.order) && item.order.length) && item.failure).map(item => item.failure);
  return { method: basis === 'affinity' ? 'per-guest-qloo-rank-v1' : 'per-guest-qloo-lift-v2', basis, total: valid.length, options: [...options], places, ...(failures.length ? { failures } : {}) };
}

// Some places Qloo recommends cannot be looked up again as rank options; one such
// option makes the whole rank call ask for input (not_found on "options") for
// every guest. Those places are dropped from the call, remembered, and shown
// without a fit instead of breaking the group fit for everyone.
const unrankable = new Set();
const missingOptions = result => result?.status === 'needs_input'
  ? (result.resolution?.issues || []).filter(issue => issue?.field === 'options' && issue.kind === 'not_found' && typeof issue.input === 'string').map(issue => issue.input)
  : [];

// Taste lift. In Riyadh, Qloo's place affinity is led by popularity, so every
// guest's raw ranking came out nearly the same and the most popular places
// "fitted" everyone. A guest's order is now by taste beyond popularity:
// z(affinity) − POPULARITY_WEIGHT × z(popularity), both from Qloo, over the
// same options. (Qloo does not accept a no-taste "typical visitor" query, so
// its popularity score stands in for that baseline.)
export const POPULARITY_WEIGHT = 0.6;
function zScores(values) {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const sd = Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length) || 1;
  return values.map(value => (value - mean) / sd);
}
export function liftOrder(entries) {
  const scored = entries.filter(entry => typeof entry.affinity === 'number');
  const rest = entries.filter(entry => typeof entry.affinity !== 'number').sort((a, b) => a.position - b.position);
  const usePopularity = scored.length >= 3 && scored.every(entry => typeof entry.popularity === 'number');
  const taste = usePopularity ? zScores(scored.map(entry => entry.affinity)) : [];
  const base = usePopularity ? zScores(scored.map(entry => entry.popularity)) : [];
  const ranked = scored.map((entry, index) => ({ ...entry, lift: usePopularity ? taste[index] - POPULARITY_WEIGHT * base[index] : entry.affinity }))
    .sort((a, b) => b.lift - a.lift || b.affinity - a.affinity || a.position - b.position);
  return { order: unique([...ranked, ...rest].map(entry => entry.id)), basis: usePopularity ? 'popularity' : 'affinity' };
}

export async function scoreGroupFit({ placeIds, guests, qloo }) {
  const requested = unique(placeIds).slice(0, MAX_OPTIONS);
  let options = requested.filter(id => !unrankable.has(id));
  const scored = guests.filter(guest => guest.resolved.length);
  const unrankedNow = () => requested.filter(id => !options.includes(id));
  if (!options.length || !scored.length) return buildFitMatrix(requested, [], unrankedNow());
  // One rank call, dropping options Qloo cannot look up (at most two rounds).
  const rankCall = async extra => {
    let result = await qloo('rank', { options, option_type: 'place', ...extra });
    for (let round = 0; round < 2; round++) {
      const missing = missingOptions(result);
      if (!missing.length) break;
      if (unrankable.size > 2000) unrankable.clear();
      missing.forEach(id => unrankable.add(id));
      options = options.filter(id => !missing.includes(id));
      if (!options.length) break;
      result = await qloo('rank', { options, option_type: 'place', ...extra });
    }
    return result;
  };
  const entriesOf = result => (Array.isArray(result?.results) ? result.results : [])
    .map((entity, position) => ({ id: entity?.entity_id || entity?.id, affinity: typeof entity?.affinity === 'number' ? entity.affinity : null, popularity: typeof entity?.popularity === 'number' ? entity.popularity : null, position }))
    .filter(entry => options.includes(entry.id));
  const rankOne = async guest => {
    const result = await rankCall({ signals: unique(guest.resolved.map(item => item.input)).slice(0, 10) });
    if (!['ok', 'partial'].includes(result?.status)) {
      const issues = (result?.resolution?.issues || []).slice(0, 3).map(issue => `${issue.kind || ''} ${issue.field || ''} ${String(issue.input || '').slice(0, 40)}`.trim());
      return { guest, entries: null, failure: { status: result?.status || 'unknown', ...(result?.error?.code ? { code: String(result.error.code) } : {}), ...(issues.length ? { issues } : {}) } };
    }
    return { guest, entries: entriesOf(result), returned: Array.isArray(result.results) ? result.results.length : 0, status: result.status };
  };
  // The first call warms the harness's entity cache and drops unrankable options for the rest.
  const first = await rankOne(scored[0]);
  const rest = await Promise.all(scored.slice(1).map(rankOne));
  const bases = new Set();
  const rankings = [first, ...rest].map(item => {
    if (!item.entries) return item;
    const entries = item.entries.filter(entry => options.includes(entry.id));
    const { order, basis } = liftOrder(entries);
    bases.add(basis);
    // Kept for diagnosis: an "ok" ranking whose places did not match the options.
    return order.length ? { guest: item.guest, order } : { guest: item.guest, order, failure: { status: item.status, returned: item.returned } };
  });
  const basis = bases.has('popularity') ? 'popularity' : 'affinity';
  return buildFitMatrix(requested, rankings, unrankedNow(), basis);
}

// matrix.order (when set) is the canonical order after saved feedback was applied.
export function orderByFit(ids, matrix) {
  if (Array.isArray(matrix.order)) {
    const position = id => { const index = matrix.order.indexOf(id); return index < 0 ? Infinity : index; };
    return ids.map((id, index) => ({ id, index })).sort((a, b) => position(a.id) - position(b.id) || (matrix.places[b.id]?.score ?? -1) - (matrix.places[a.id]?.score ?? -1) || a.index - b.index).map(item => item.id);
  }
  return ids.map((id, index) => ({ id, index, fit: matrix.places[id] }))
    .sort((a, b) => (b.fit?.score ?? -1) - (a.fit?.score ?? -1) || (b.fit?.count ?? 0) - (a.fit?.count ?? 0) || a.index - b.index)
    .map(item => item.id);
}
