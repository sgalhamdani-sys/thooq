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

export function buildFitMatrix(options, rankings) {
  const valid = rankings.filter(item => Array.isArray(item.order) && item.order.length);
  const places = {};
  for (const id of options) {
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
  return { method: 'per-guest-qloo-rank-v1', total: valid.length, options: [...options], places, ...(failures.length ? { failures } : {}) };
}

export async function scoreGroupFit({ placeIds, guests, qloo }) {
  const options = unique(placeIds).slice(0, MAX_OPTIONS);
  const scored = guests.filter(guest => guest.resolved.length);
  if (!options.length || !scored.length) return buildFitMatrix(options, []);
  const rankOne = async guest => {
    const result = await qloo('rank', { options, option_type: 'place', signals: unique(guest.resolved.map(item => item.input)).slice(0, 10) });
    if (!['ok', 'partial'].includes(result?.status)) {
      const issues = (result?.resolution?.issues || []).slice(0, 3).map(issue => `${issue.kind || ''} ${issue.field || ''} ${String(issue.input || '').slice(0, 40)}`.trim());
      return { guest, order: null, failure: { status: result?.status || 'unknown', ...(result?.error?.code ? { code: String(result.error.code) } : {}), ...(issues.length ? { issues } : {}) } };
    }
    const entries = (Array.isArray(result.results) ? result.results : [])
      .map((entity, position) => ({ id: entity?.entity_id || entity?.id, affinity: typeof entity?.affinity === 'number' ? entity.affinity : null, position }))
      .filter(entry => options.includes(entry.id));
    entries.sort((a, b) => (b.affinity ?? -Infinity) - (a.affinity ?? -Infinity) || a.position - b.position);
    const order = unique(entries.map(entry => entry.id));
    // Kept for diagnosis: an "ok" ranking whose places did not match the options.
    return order.length ? { guest, order } : { guest, order, failure: { status: result.status, returned: Array.isArray(result.results) ? result.results.length : 0 } };
  };
  // The first call warms the harness's entity cache for the shared options.
  const first = await rankOne(scored[0]);
  const rest = await Promise.all(scored.slice(1).map(rankOne));
  return buildFitMatrix(options, [first, ...rest]);
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
