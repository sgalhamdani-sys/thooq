import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomBytes, randomUUID } from 'node:crypto';
import { buildTasteRecommendation, MAX_SIGNALS, qlooStatus } from './qloo-service.js';
import { createEventStore } from './event-store.js';
import { attachRecommendationShare, feedbackSummary, findSharedRecommendation, publicSharedRecommendation, recordFeedback } from './feedback-service.js';
import { languageOf, messageFor } from './copy.js';
import { createDemoEvent, loadDemoResolution, pruneDemoEvents } from './demo.js';
import { runQloo } from './qloo-workflows.js';

export function createThooqServer({ root = dirname(fileURLToPath(import.meta.url)), dataDirectory = process.env.DATA_DIRECTORY || join(root, 'data'), recommend = buildTasteRecommendation, demoResolution = () => loadDemoResolution({ qloo: runQloo }) } = {}) {
const mimeTypes = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml' };

const demoEvent = {
  id: 'lamma-weekend',
  occasion: 'لَمّة نهاية الأسبوع',
  city: 'الرياض',
  guestRange: '٥–٨',
  ageGroups: ['شباب', 'بالغون'],
  note: 'هدوء وميزانية متوسطة',
  createdAt: new Date().toISOString(),
  answers: [],
  recommendation: null
};

const store = createEventStore(dataDirectory, { [demoEvent.id]: demoEvent });
const generating = new Set();
const fail = (status, message) => Object.assign(new Error(message), { status });
const getEvent = (events, id) => {
  if (!Object.hasOwn(events, id)) throw fail(404, 'لم نجد هذه العزيمة.');
  return events[id];
};

async function requestBody(request) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > 80_000) throw fail(413, 'الطلب كبير جدًا');
    chunks.push(chunk);
  }
  const body = Buffer.concat(chunks).toString('utf8');
  try { return body ? JSON.parse(body) : {}; } catch { throw fail(400, 'صيغة الطلب غير صالحة.'); }
}

// Error messages follow the visitor's language (X-Thooq-Lang header).
function send(response, status, payload) {
  if (payload?.error) payload = { ...payload, error: messageFor(payload.error, response.thooqLang) };
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(payload));
}

function publicEvent(event) {
  return {
    id: event.id,
    occasion: event.occasion,
    city: event.city,
    guestRange: event.guestRange,
    ageGroups: event.ageGroups,
    note: event.note,
    language: languageOf(event.language),
    demo: Boolean(event.demo),
    answerCount: event.answers.length,
    answers: event.answers.map(({ name, createdAt }) => ({ name, createdAt })),
    recommendation: event.recommendation,
    feedback: feedbackSummary(event.recommendationHistory?.find(item => item.id === event.recommendation?.id))
  };
}

function validAnswer(answer) {
  return typeof answer?.name === 'string' && answer.name.trim().length > 0 && Array.isArray(answer.answers) && answer.answers.length === 3 && answer.answers.every((group) => Array.isArray(group) && group.length === 3 && group.every((item) => typeof item === 'string' && item.trim().length > 0));
}

async function api(request, response, url) {
  const segments = url.pathname.split('/').filter(Boolean);
  if (request.method === 'GET' && url.pathname === '/api/health') return send(response, 200, { ok: true, qloo: qlooStatus() });

  if (segments[1] === 'shared') {
    const token = segments[2];
    const events = await store.read();
    const snapshot = findSharedRecommendation(events, token);
    if (!snapshot) throw fail(404, 'رابط التوصية غير صالح أو لم يعد متاحًا.');
    let browserToken = /(?:^|;\s*)thooq_feedback=([a-f0-9]{64})(?:;|$)/.exec(request.headers.cookie || '')?.[1];
    if (request.method === 'GET' && segments.length === 3) {
      if (!browserToken) {
        browserToken = randomBytes(32).toString('hex');
        const secure = request.socket.encrypted || request.headers['x-forwarded-proto'] === 'https';
        response.setHeader('Set-Cookie', `thooq_feedback=${browserToken}; HttpOnly; SameSite=Lax; Path=/api/shared; Max-Age=31536000${secure ? '; Secure' : ''}`);
      }
      return send(response, 200, { recommendation: publicSharedRecommendation(snapshot, browserToken) });
    }
    if (request.method === 'POST' && segments.length === 4 && segments[3] === 'feedback') {
      if (!browserToken) throw fail(400, 'فعّلي ملفات الارتباط وحدّثي الصفحة ثم أرسلي تقييمك.');
      if (request.headers['sec-fetch-site'] === 'cross-site' || (request.headers.origin && new URL(request.headers.origin).host !== request.headers.host)) throw fail(403, 'أرسلي التقييم من صفحة التوصية نفسها.');
      const input = await requestBody(request);
      if (!input || !['good', 'bad'].includes(input.rating)) throw fail(400, 'اختاري «جيدة» أو «سيئة».');
      const recommendation = await store.update(current => {
        const shared = findSharedRecommendation(current, token);
        if (!shared) throw fail(404, 'رابط التوصية غير متاح.');
        recordFeedback(shared, browserToken, input.rating);
        return publicSharedRecommendation(shared, browserToken);
      });
      return send(response, 200, { recommendation });
    }
    throw fail(404, 'المسار غير موجود.');
  }

  if (request.method === 'POST' && url.pathname === '/api/events') {
    const input = await requestBody(request);
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw fail(400, 'تفاصيل العزيمة غير صالحة.');
    const id = randomUUID().slice(0, 8);
    const event = await store.update(events => {
      events[id] = { id, occasion: String(input.occasion || 'لَمّة جديدة').slice(0, 80), city: String(input.city || 'الرياض').slice(0, 80), guestRange: String(input.guestRange || '٥–٨'), ageGroups: Array.isArray(input.ageGroups) ? input.ageGroups.filter(value => typeof value === 'string').slice(0, 4) : [], note: String(input.note || '').slice(0, 300), language: languageOf(input.language), createdAt: new Date().toISOString(), answers: [], recommendation: null };
      return publicEvent(events[id]);
    });
    return send(response, 201, { event });
  }

  // "Try the demo": a private copy of the demo gathering for each visitor.
  if (request.method === 'POST' && url.pathname === '/api/demo') {
    const input = await requestBody(request);
    const resolved = await demoResolution();
    const demo = createDemoEvent(input?.lang, resolved);
    const event = await store.update(events => {
      pruneDemoEvents(events);
      events[demo.id] = demo;
      return publicEvent(demo);
    });
    return send(response, 201, { event });
  }

  if (segments[1] !== 'events') throw fail(404, 'المسار غير موجود.');
  const events = await store.read();
  const eventId = segments[2];
  const event = getEvent(events, eventId);
  if (request.method === 'GET' && segments.length === 3) {
    // Give recommendations saved before this feature a share link on first load.
    const ready = event.recommendation?.source === 'qloo' && event.recommendation.places?.length;
    const publicValue = ready && !findSharedRecommendation(events, event.recommendation.shareToken)
      ? await store.update(current => { const latest = getEvent(current, eventId); attachRecommendationShare(latest); return publicEvent(latest); })
      : publicEvent(event);
    return send(response, 200, { event: publicValue, qloo: qlooStatus() });
  }
  if (request.method === 'POST' && segments.length === 4 && segments[3] === 'answers') {
    const answer = await requestBody(request);
    if (!validAnswer(answer)) return send(response, 400, { error: 'أضيفي اسمك وثلاث مفضلات في كل سؤال.' });
    const updated = await store.update(current => {
      const latest = getEvent(current, eventId);
      latest.answers.push({ id: randomUUID(), name: answer.name.trim().slice(0, 50), answers: answer.answers.map((group) => group.map((item) => item.trim().slice(0, 100))), createdAt: new Date().toISOString() });
      latest.recommendation = null;
      return publicEvent(latest);
    });
    return send(response, 201, { event: updated });
  }
  if (request.method === 'POST' && segments.length === 4 && segments[3] === 'recommendation') {
    if (!event.answers.length) return send(response, 400, { error: 'نحتاج إجابة ضيف واحد على الأقل قبل بناء التوصية.' });
    const input = await requestBody(request);
    if (!input || typeof input !== 'object' || Array.isArray(input) || (input.lang !== undefined && typeof input.lang !== 'string') || (input.signals !== undefined && (!Array.isArray(input.signals) || !input.signals.length || input.signals.length > MAX_SIGNALS || input.signals.some(value => typeof value !== 'string' || !value.trim() || value.length > 200)))) return send(response, 400, { error: 'راجعي المفضلات المحددة وأبقي مفضلة واحدة على الأقل.' });
    if (generating.has(eventId)) throw fail(409, 'يجري إنشاء توصية لهذه العزيمة. انتظري اكتمالها.');
    generating.add(eventId);
    try {
      const recommendation = await recommend({ ...event, language: languageOf(input.lang || event.language), confirmedSignals: input.signals, feedbackHistory: Object.values(events).flatMap(item => item.recommendationHistory || []) });
      const saved = await store.update(current => {
        const latest = getEvent(current, eventId);
        if (JSON.stringify(latest.answers) !== JSON.stringify(event.answers)) throw fail(409, 'وصلت إجابات جديدة أثناء البحث. حدّثي التوصية لتشملها.');
        latest.recommendation = recommendation;
        attachRecommendationShare(latest);
        return { recommendation: latest.recommendation, feedback: publicEvent(latest).feedback };
      });
      return send(response, 200, saved);
    } finally { generating.delete(eventId); }
  }
  return send(response, 404, { error: 'المسار غير موجود.' });
}

async function staticFile(request, response, url) {
  const requested = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
  if (!['/index.html', '/admin.html', '/guest.html', '/recommendation.html', '/recommendation.js', '/plan-render.js', '/i18n.js', '/styles.css', '/app.js'].includes(requested)) return send(response, 404, { error: 'الملف غير موجود.' });
  const filePath = normalize(join(root, requested));
  if (!filePath.startsWith(root) || requested.includes('..')) return send(response, 403, { error: 'غير مسموح.' });
  try {
    const contents = await readFile(filePath);
    response.writeHead(200, { 'Content-Type': mimeTypes[extname(filePath)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    response.end(contents);
  } catch { send(response, 404, { error: 'الملف غير موجود.' }); }
}

return createServer(async (request, response) => {
  try {
    response.thooqLang = languageOf(request.headers['x-thooq-lang']);
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
    if (url.pathname.startsWith('/api/')) return await api(request, response, url);
    return await staticFile(request, response, url);
  } catch (error) {
    if (!error.status) console.error(error);
    return send(response, error.status || 500, { error: error.message ? error : 'حصل خطأ غير متوقع.' });
  }
});
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const port = Number(process.env.PORT || 3000);
  createThooqServer().listen(port, '0.0.0.0', () => console.log(`Thooq is running on http://localhost:${port}`));
}
