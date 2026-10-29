// Live end-to-end check with the real Qloo and Gemini services.
// Usage: npm run smoke   (Windows: npm.cmd run smoke)
// Uses synthetic guests only; no stored data is read or written.
// Each stage reports its time, so a failure shows exactly which service is slow or unreachable.
import { buildTasteRecommendation } from '../qloo-service.js';
import { callGemini } from '../gemini-service.js';
import { runQloo } from '../qloo-workflows.js';

const event = {
  id: 'smoke', city: 'الرياض', occasion: 'طلعة صديقات', guestRange: '2–4',
  ageGroups: ['بالغون', 'أطفال'], note: 'أطفال أقل من 5 سنوات، ميزانية متوسطة',
  answers: [
    { name: 'ضيفة ١', answers: [['Friends', 'Coldplay', 'Harry Potter'], ['Starbucks', 'The Cheesecake Factory', 'IKEA'], ['هدوء', 'ألعاب أطفال', 'جلسة طويلة']] },
    { name: 'ضيفة ٢', answers: [['The Office', 'Adele', 'Spirited Away'], ['Five Guys', 'Tim Hortons', 'Lego'], ['ضحك', 'أكل صحي', 'مكان واسع']] }
  ]
};

const describe = error => {
  const cause = error?.cause ? ` [${[error.cause.name, error.cause.code, error.cause.cause?.code].filter(Boolean).join(' ')}]` : '';
  return `${error?.name && error.name !== 'Error' ? `${error.name}: ` : ''}${error?.message || error}${cause}`;
};
async function stage(name, run) {
  const started = Date.now();
  console.log(`… ${name}`);
  try {
    const value = await run();
    console.log(`✓ ${name} (${((Date.now() - started) / 1000).toFixed(1)}s)`);
    return { ok: true, value };
  } catch (error) {
    console.log(`✗ ${name} (${((Date.now() - started) / 1000).toFixed(1)}s): ${describe(error)}`);
    process.exitCode = 1;
    return { ok: false };
  }
}

console.log(`node ${process.version} · GEMINI_MODEL=${process.env.GEMINI_MODEL || 'auto'} · GEMINI_API_KEY ${process.env.GEMINI_API_KEY ? 'set' : 'MISSING'} · QLOO_API_KEY ${process.env.QLOO_API_KEY ? 'set' : 'from qloo setup config'}\n`);

const gemini = await stage('Gemini: one short reply', async () => {
  const payload = await callGemini({ contents: [{ role: 'user', parts: [{ text: 'Reply with the single word OK.' }] }] });
  const text = payload?.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('').trim();
  if (!text) throw new Error('Gemini replied without text.');
  return text;
});
const qloo = await stage('Qloo: tag search', async () => {
  const result = await runQloo('find_tags', { query: 'coffee', limit: 1 });
  if (result.status !== 'ok') throw new Error(`Qloo status ${result.status}${result.error ? ` (${result.error.code}, ${result.error.layer})` : ''}`);
  return result;
});
if (!gemini.ok || !qloo.ok) {
  console.log('\nStopped before the full plan: fix the failed service above first.');
  process.exit();
}

const started = Date.now();
const full = await stage('Full plan: translate, resolve, candidates, group fit, agent', async () => {
  let result = await buildTasteRecommendation(event);
  for (let attempt = 0; result.source === 'qloo-needs-input' && attempt < 3; attempt++) {
    // Act like the host: take Qloo's first candidate, or drop a name Qloo does not know.
    const choices = new Map(result.clarifications.map(issue => [issue.input, issue.candidates[0]?.id]));
    for (const issue of result.clarifications) console.log(`  clarified «${issue.input}» → ${issue.candidates[0] ? `${issue.candidates[0].name} (${issue.candidates[0].type || 'entity'})` : 'removed'}`);
    const signals = result.querySignals.flatMap(signal => choices.has(signal) ? (choices.get(signal) ? [choices.get(signal)] : []) : [signal]);
    result = await buildTasteRecommendation({ ...event, recommendation: result, confirmedSignals: signals });
  }
  return result;
});
if (!full.ok) process.exit();
const result = full.value;

console.log(`\nsource: ${result.source} · agent: ${result.agent?.mode}${result.agent?.failure ? ` (${result.agent.failure})` : ''}${result.agent?.detail ? ` — ${result.agent.detail}` : ''} · ${((Date.now() - started) / 1000).toFixed(1)}s`);
console.log(`title: ${result.title}\nconcept: ${result.summary}\n`);
for (const place of result.places || []) {
  const fit = place.fit ? `${place.fit.count}/${place.fit.total}` : '-';
  console.log(`${place.stop ? '★' : '·'} ${place.name} [fit ${fit}]${place.role ? ` — ${place.role}` : ''}`);
  if (place.why) console.log(`   ${place.why}`);
}
if (result.considerations?.length) console.log(`\nconsiderations:\n- ${result.considerations.join('\n- ')}`);
console.log(`\nsteps:\n- ${(result.agentSteps || []).map(step => step.text).join('\n- ')}`);
