// The demo gathering: a Riyadh family lunch with a grandmother and small children,
// so the agent has real constraints to work with. Every "Try the demo" click gets
// a private copy. Favourites are resolved to Qloo IDs once (demo/demo-resolved.json
// when present, otherwise live on first use) so the demo never stops for ambiguity.
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { languageOf } from './copy.js';

const fav = (name, type) => ({ name, type });
export const DEMO_TEMPLATE = {
  occasion: { ar: 'غداء عائلي نهاية الأسبوع', en: 'Family weekend lunch' },
  city: { ar: 'الرياض', en: 'Riyadh' },
  guestRange: '5–8',
  ageGroups: ['بالغون', 'أطفال', 'كبار سن'],
  note: {
    ar: 'الجدة معنا وتحتاج جلسة هادئة ومريحة، ومعنا طفلان أقل من 6 سنوات، والميزانية متوسطة.',
    en: 'Grandma is joining and needs calm, comfortable seating; two children under 6 are coming; mid-range budget.'
  },
  guests: [
    { name: { ar: 'نورة', en: 'Noura' }, favourites: [[fav('Friends', 'tv_show'), fav('Adele', 'artist'), fav('Coldplay', 'artist')], [fav('Starbucks', 'brand'), fav('The Cheesecake Factory', 'brand'), fav('IKEA', 'brand')]], moods: { ar: ['جلسة هادئة', 'مكان ألعاب للأطفال', 'قهوة مختصة'], en: ['calm seating', 'kids play area', 'specialty coffee'] } },
    { name: { ar: 'فيصل', en: 'Faisal' }, favourites: [[fav('Breaking Bad', 'tv_show'), fav('The Dark Knight', 'movie'), fav('Mohammed Abdu', 'artist')], [fav('Five Guys', 'brand'), fav('Tim Hortons', 'brand'), fav('Nike', 'brand')]], moods: { ar: ['أكل لذيذ', 'خدمة سريعة', 'مواقف قريبة'], en: ['great food', 'quick service', 'easy parking'] } },
    { name: { ar: 'ريم', en: 'Reem' }, favourites: [[fav('Spirited Away', 'movie'), fav('BTS', 'artist'), fav('Stranger Things', 'tv_show')], [fav('Shake Shack', 'brand'), fav('Sephora', 'brand'), fav('Magnolia Bakery', 'brand')]], moods: { ar: ['حلويات', 'مكان جميل للتصوير', 'ضحك'], en: ['desserts', 'photogenic spot', 'laughter'] } },
    { name: { ar: 'الجدة حصة', en: 'Grandma Hessa' }, favourites: [[fav('Umm Kulthum', 'artist'), fav('Fairuz', 'artist'), fav('Abdel Halim Hafez', 'artist')], [fav('Al Baik', 'brand'), fav('Bateel', 'brand'), fav('Kudu', 'brand')]], moods: { ar: ['هدوء', 'كراسي مريحة', 'أكل شعبي'], en: ['quiet', 'comfortable chairs', 'traditional food'] } }
  ]
};

const uniqueFavourites = () => {
  const seen = new Map();
  for (const guest of DEMO_TEMPLATE.guests) for (const item of guest.favourites.flat()) seen.set(item.name, item);
  return [...seen.values()];
};

// Resolve each demo favourite within its Qloo type. Lookups run a few at a time and
// retry errors, so a burst of requests does not leave favourites out. When a name is
// ambiguous, only a candidate whose name matches is accepted (never an unrelated one).
const plainName = text => String(text || '').toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]/gu, '');
function matchingCandidate(candidates, name) {
  const wanted = plainName(name);
  const usable = candidates.map((candidate, index) => ({ candidate, index, plain: plainName(candidate?.name) })).filter(entry => entry.candidate?.id && entry.plain);
  return usable.find(entry => entry.plain === wanted) || usable.find(entry => entry.plain.includes(wanted) || wanted.includes(entry.plain));
}

async function describeWithRetry(qloo, input, { attempts = 3, wait = attempt => new Promise(done => setTimeout(done, 1500 * attempt)) } = {}) {
  let result;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try { result = await qloo('describe', input); } catch (error) { result = { status: 'error', error: { code: error?.code || error?.message || 'exception' } }; }
    if (result?.status !== 'error') return result;
    if (attempt < attempts) await wait(attempt);
  }
  return result;
}

export async function resolveDemoFavourites(qloo, { concurrency = 3, onResult, wait } = {}) {
  const items = uniqueFavourites();
  const entries = new Array(items.length);
  let next = 0;
  const resolveOne = async ({ name, type }) => {
    const result = await describeWithRetry(qloo, { entity: name, type }, wait ? { wait } : {});
    if (result?.status === 'ok') {
      const entity = result.interpretation?.entity;
      const first = Array.isArray(result.results) ? result.results[0] : undefined;
      const id = entity?.entityId || first?.entity_id;
      return id ? { match: { id, name: entity?.name || first?.name || name, type } } : { match: null, reason: 'not found in Qloo' };
    }
    if (result?.status === 'needs_input') {
      const candidates = result.resolution?.issues?.[0]?.candidates || [];
      const found = matchingCandidate(candidates, name);
      if (found) return { match: { id: found.candidate.id, name: found.candidate.name || name, type, picked: found.index === 0 ? 'first-candidate' : 'matching-candidate' } };
      return { match: null, reason: candidates.length ? `no candidate named like it (Qloo offered: ${candidates.slice(0, 3).map(candidate => candidate?.name).filter(Boolean).join(', ')})` : 'not found in Qloo' };
    }
    return { match: null, reason: `Qloo error${result?.error?.code ? ` (${result.error.code})` : ''} after retries` };
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      const outcome = await resolveOne(items[index]);
      entries[index] = [items[index].name, outcome.match];
      onResult?.(items[index].name, outcome);
    }
  }));
  return Object.fromEntries(entries);
}

let resolvedPromise;
export function loadDemoResolution({ qloo, file = new URL('./demo/demo-resolved.json', import.meta.url) } = {}) {
  resolvedPromise ||= readFile(file, 'utf8').then(JSON.parse).catch(async () => {
    if (!qloo) return {};
    const resolved = await resolveDemoFavourites(qloo);
    // Only cache a useful result; a Qloo outage should be retried by the next visitor.
    if (!Object.values(resolved).some(Boolean)) resolvedPromise = undefined;
    return resolved;
  }).catch(() => { resolvedPromise = undefined; return {}; });
  return resolvedPromise;
}

function confirmedFavourites(guest, resolved) {
  const list = guest.favourites.flat().filter(item => resolved[item.name]?.id).map(item => ({ id: resolved[item.name].id, name: resolved[item.name].name, type: item.type, text: item.name }));
  return list.length ? { resolved: list } : {};
}

export function createDemoEvent(language, resolved = {}) {
  const lang = languageOf(language);
  const createdAt = new Date().toISOString();
  const answers = DEMO_TEMPLATE.guests.map(guest => ({
    id: randomUUID(), name: guest.name[lang], createdAt,
    answers: [guest.favourites[0].map(item => item.name), guest.favourites[1].map(item => item.name), [...guest.moods[lang]]],
    // Fictional guests: favourites confirmed and shared, so the demo can show why a place fits.
    ...confirmedFavourites(guest, resolved),
    shareWithHost: true
  }));
  const knownSignals = {};
  const signalOwners = {};
  const signalLabels = {};
  DEMO_TEMPLATE.guests.forEach((guest, index) => guest.favourites.flat().forEach(item => {
    const match = resolved[item.name];
    if (!match?.id) return;
    knownSignals[item.name.toLowerCase()] = { id: match.id, name: match.name };
    signalLabels[match.id] = match.name;
    signalOwners[match.id] = [...new Set([...(signalOwners[match.id] || []), index])];
  }));
  const querySignals = Object.keys(signalOwners);
  return {
    id: `demo-${randomUUID().slice(0, 8)}`, demo: true, language: lang, createdAt,
    occasion: DEMO_TEMPLATE.occasion[lang], city: DEMO_TEMPLATE.city[lang], guestRange: DEMO_TEMPLATE.guestRange,
    ageGroups: [...DEMO_TEMPLATE.ageGroups], note: DEMO_TEMPLATE.note[lang],
    answers, knownSignals,
    // Pre-resolved favourites let the first plan start straight away.
    recommendation: querySignals.length ? { source: 'prepared', querySignals, signalLabels, signalOwners, places: [] } : null
  };
}

// Keep the store small: demo copies expire after two days, and at most 300 are kept.
export function pruneDemoEvents(events, now = Date.now()) {
  const demos = Object.values(events).filter(event => event.demo).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  demos.forEach((event, index) => {
    if (index >= 300 || now - Date.parse(event.createdAt) > 2 * 24 * 60 * 60 * 1000) delete events[event.id];
  });
}
