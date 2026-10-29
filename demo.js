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

// Resolve each demo favourite within its Qloo type; ambiguous names take Qloo's first candidate.
export async function resolveDemoFavourites(qloo) {
  const entries = await Promise.all(uniqueFavourites().map(async ({ name, type }) => {
    const result = await qloo('describe', { entity: name, type });
    if (result?.status === 'ok') {
      const entity = result.interpretation?.entity;
      const first = Array.isArray(result.results) ? result.results[0] : undefined;
      const id = entity?.entityId || first?.entity_id;
      return id ? [name, { id, name: entity?.name || first?.name || name, type }] : [name, null];
    }
    const candidate = result?.status === 'needs_input' ? result.resolution?.issues?.[0]?.candidates?.[0] : undefined;
    return [name, candidate?.id ? { id: candidate.id, name: candidate.name || name, type, picked: 'first-candidate' } : null];
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

export function createDemoEvent(language, resolved = {}) {
  const lang = languageOf(language);
  const createdAt = new Date().toISOString();
  const answers = DEMO_TEMPLATE.guests.map(guest => ({
    id: randomUUID(), name: guest.name[lang], createdAt,
    answers: [guest.favourites[0].map(item => item.name), guest.favourites[1].map(item => item.name), [...guest.moods[lang]]]
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
