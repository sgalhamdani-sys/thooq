import { createHash, randomBytes, randomUUID } from 'node:crypto';

const normalized = value => String(value || '').normalize('NFKC').trim().toLowerCase();
const cityKey = value => /^(الرياض|riyadh)(, saudi arabia)?$/i.test(normalized(value)) ? 'riyadh' : normalized(value);
const tasteKeys = recommendation => new Set((recommendation.querySignals || []).map(value => normalized(recommendation.signalLabels?.[value] || value)));

export function feedbackSummary(snapshot) {
  const ratings = Object.values(snapshot?.votes || {});
  const good = ratings.filter(vote => vote.rating === 'good').length;
  const bad = ratings.filter(vote => vote.rating === 'bad').length;
  return { good, bad, total: good + bad };
}

export function attachRecommendationShare(event) {
  const recommendation = event.recommendation;
  if (recommendation?.source !== 'qloo' || !recommendation.places?.length) return;
  event.recommendationHistory ||= [];
  const fingerprint = createHash('sha256').update(JSON.stringify({
    city: event.city, occasion: event.occasion,
    signals: [...(recommendation.querySignals || [])].sort(),
    places: recommendation.places.map(place => place.id)
  })).digest('hex');
  let snapshot = event.recommendationHistory.find(item => item.fingerprint === fingerprint);
  if (!snapshot) {
    snapshot = {
      id: randomUUID(), shareToken: randomBytes(24).toString('hex'), fingerprint,
      eventId: event.id, city: event.city, occasion: event.occasion, createdAt: new Date().toISOString(),
      title: recommendation.title, summary: recommendation.summary, reason: recommendation.reason,
      places: structuredClone(recommendation.places), querySignals: [...(recommendation.querySignals || [])],
      signalLabels: { ...recommendation.signalLabels }, votes: {},
      considerations: [...(recommendation.considerations || [])],
      agent: recommendation.agent ? { mode: recommendation.agent.mode } : undefined,
      agentSteps: (recommendation.agentSteps || []).map(({ kind, text }) => ({ kind, text })),
      language: recommendation.language
    };
    event.recommendationHistory.push(snapshot);
  }
  recommendation.id = snapshot.id;
  recommendation.shareToken = snapshot.shareToken;
  return snapshot;
}

export function findSharedRecommendation(events, token) {
  if (!/^[a-f0-9]{48}$/.test(token || '')) return;
  return Object.values(events).flatMap(event => event.recommendationHistory || []).find(item => item.shareToken === token);
}

export function voteKey(snapshot, browserToken) {
  return createHash('sha256').update(`${snapshot.id}:${browserToken}`).digest('hex');
}

export function recordFeedback(snapshot, browserToken, rating) {
  if (!['good', 'bad'].includes(rating)) throw new Error('اختاري تقييمًا جيدًا أو سيئًا.');
  snapshot.votes ||= {};
  snapshot.votes[voteKey(snapshot, browserToken)] = { rating, updatedAt: new Date().toISOString() };
  return feedbackSummary(snapshot);
}

export function publicSharedRecommendation(snapshot, browserToken) {
  return {
    id: snapshot.id, city: snapshot.city, occasion: snapshot.occasion, createdAt: snapshot.createdAt,
    title: snapshot.title, summary: snapshot.summary, reason: snapshot.reason,
    // Fit is shared as counts and favourites only: never guest names or positions.
    places: snapshot.places.map(({ id, name, address, role, why, stop, alternative, fit }) => ({
      id, name, address,
      ...(role ? { role } : {}), ...(why ? { why } : {}), ...(stop ? { stop: true } : {}), ...(alternative ? { alternative: true } : {}),
      ...(fit && Number.isInteger(fit.total) ? { fitCount: fit.count, fitTotal: fit.total, fitTastes: [...new Set((fit.tastes || []).flatMap(taste => taste.favourites || []))].slice(0, 4) } : {})
    })),
    considerations: snapshot.considerations || [], agent: snapshot.agent, agentSteps: snapshot.agentSteps || [], language: snapshot.language,
    feedback: feedbackSummary(snapshot), myRating: snapshot.votes?.[voteKey(snapshot, browserToken)]?.rating || null
  };
}

export function rankWithFeedback(places, context, history = []) {
  const currentTaste = tasteKeys(context);
  const scores = new Map();
  let ratingsUsed = 0;
  for (const snapshot of history) {
    if (cityKey(snapshot.city) !== cityKey(context.city)) continue;
    const oldTaste = tasteKeys(snapshot);
    const overlap = [...currentTaste].filter(key => oldTaste.has(key)).length;
    const similarity = overlap / (new Set([...currentTaste, ...oldTaste]).size || 1);
    if (similarity < 0.25) continue;
    const summary = feedbackSummary(snapshot);
    if (!summary.total) continue;
    // A whole-list rating is weak evidence about each place; smooth and cap it.
    const weight = similarity * (snapshot.occasion === context.occasion ? 1 : 0.5);
    const ids = new Set(snapshot.places.map(place => normalized(place.id)));
    let matched = false;
    for (const place of places) {
      if (!ids.has(normalized(place.id))) continue;
      matched = true;
      const score = scores.get(place.id) || { good: 0, bad: 0 };
      score.good += summary.good * weight;
      score.bad += summary.bad * weight;
      scores.set(place.id, score);
    }
    if (matched) ratingsUsed += summary.total;
  }
  const ranked = places.map((place, index) => {
    const score = scores.get(place.id) || { good: 0, bad: 0 };
    const adjustment = 0.2 * (score.good - score.bad) / (score.good + score.bad + 2);
    return { place, index, score: 1 - index / Math.max(places.length - 1, 1) + adjustment };
  }).sort((a, b) => b.score - a.score || a.index - b.index);
  return { places: ranked.map(item => item.place), learning: { method: 'local-feedback-rerank-v1', ratingsUsed, orderChanged: ranked.some((item, index) => item.index !== index) } };
}
