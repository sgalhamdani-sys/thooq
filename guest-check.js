// Guests confirm their own favourites before sending: each one is matched to a
// Qloo entity here, the guest picks the right match (or corrects or skips it),
// and only the confirmed Qloo IDs are saved. The host never reviews anyone's
// favourites, and never sees them unless the guest chooses to share.
import { translatePreferences } from './gemini-service.js';
import { runQloo } from './qloo-workflows.js';

export const MAX_CHECK_ITEMS = 6;
const clip = (value, max) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

const candidateOf = candidate => ({
  id: candidate.id, name: clip(candidate.name, 120), type: typeof candidate.type === 'string' ? candidate.type : '',
  ...(candidate.release_year ? { releaseYear: candidate.release_year } : {}),
  detail: clip(typeof candidate.description === 'string' ? candidate.description : typeof candidate.address === 'string' ? candidate.address : '', 140)
});

export async function checkFavourites(texts, { qloo = runQloo, translate = translatePreferences } = {}) {
  const originals = texts.map(text => clip(text, 100));
  // Arabic or misspelt names are normalised to English first; if that fails the
  // guest's own words are searched as typed.
  let queries = originals;
  try {
    const translated = await translate(originals);
    if (Array.isArray(translated) && translated.length === originals.length) queries = translated.map((value, index) => clip(value, 100) || originals[index]);
  } catch { /* search the original words */ }
  return Promise.all(originals.map(async (text, index) => {
    const query = queries[index];
    let result;
    try { result = await qloo('describe', { entity: query }); } catch { result = { status: 'error' }; }
    if (result?.status === 'ok') {
      const entity = result.interpretation?.entity;
      const first = Array.isArray(result.results) ? result.results[0] : undefined;
      const id = entity?.entityId || first?.entity_id;
      if (typeof id === 'string') return { text, query, status: 'ok', match: { id, name: clip(entity?.name || first?.name || query, 120), type: entity?.type || first?.type || '' } };
    }
    const candidates = result?.status === 'needs_input'
      ? (result.resolution?.issues?.[0]?.candidates || []).filter(candidate => typeof candidate?.id === 'string' && typeof candidate?.name === 'string').slice(0, 6).map(candidateOf)
      : [];
    if (candidates.length) return { text, query, status: 'choose', candidates };
    return { text, query, status: result?.status === 'error' ? 'error' : 'missing' };
  }));
}

// A confirmed favourite as the guest's browser sends it back.
export function validResolved(list) {
  return Array.isArray(list) && list.length <= MAX_CHECK_ITEMS && list.every(item =>
    item && typeof item === 'object' && typeof item.id === 'string' && /^[A-Za-z0-9:_-]{6,80}$/.test(item.id) &&
    typeof item.name === 'string' && item.name.trim().length > 0 && item.name.length <= 120 &&
    (item.type === undefined || (typeof item.type === 'string' && item.type.length <= 60)) &&
    (item.text === undefined || (typeof item.text === 'string' && item.text.length <= 100)));
}
export const cleanResolved = list => list.map(item => ({ id: item.id, name: clip(item.name, 120), ...(item.type ? { type: clip(item.type, 60) } : {}), ...(item.text ? { text: clip(item.text, 100) } : {}) }));
