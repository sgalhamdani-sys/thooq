// Server-written text for plans, agent steps and errors, in Arabic and English.
export const LANGUAGES = ['ar', 'en'];
export const languageOf = value => LANGUAGES.includes(value) ? value : 'ar';

// Arabic counted nouns: 1, 2, 3–10 and 11+ take different forms.
export function arabicCount(n, { zero, one, two, few, many }) {
  if (n === 0) return zero;
  if (n === 1) return one;
  if (n === 2) return two;
  return n % 100 >= 3 && n % 100 <= 10 ? `${n} ${few}` : `${n} ${many}`;
}
const englishCount = (n, singular, plural = `${singular}s`) => n === 0 ? `no ${plural}` : `${n} ${n === 1 ? singular : plural}`;
const AR_PLACES = { zero: 'لا أماكن', one: 'مكان واحد', two: 'مكانان', few: 'أماكن', many: 'مكانًا' };
const AR_PLACES_GENITIVE = { ...AR_PLACES, two: 'مكانين' };
const AR_RESULTS = { zero: 'لا نتائج', one: 'نتيجة واحدة', two: 'نتيجتان', few: 'نتائج', many: 'نتيجة' };
const AR_STOPS = { zero: 'دون محطات', one: 'محطة واحدة', two: 'محطتين', few: 'محطات', many: 'محطة' };

// An Error that carries its English wording for English-speaking visitors.
export function bilingualError(ar, en, extra = {}) {
  return Object.assign(new Error(ar), { en }, extra);
}

const AR = {
  separator: '، ',
  modelLanguage: 'Write warm, clear Arabic suitable for Saudi users and address the group in the plural.',
  languageName: 'Arabic',
  roleExample: '"الغداء" or "قهوة بعدها"',
  purposeExample: '"فطور يناسب الأطفال"',
  review: {
    title: 'اختاري المقصود بالمفضلات',
    summary: n => `بقي ${n} من المفضلات يحتاج اختيارًا أو تصحيحًا قبل البحث عن الأماكن.`,
    reason: 'اختاري الاسم المقصود من نتائج Qloo. إن لم تجدي المقصود، تجاهلي هذه المفضلة. الاسم الذي لا توجد له نتائج يمكنك تصحيحه أو مسحه، مع إبقاء مفضلة واحدة على الأقل.'
  },
  empty: {
    title: 'لا توجد أماكن مطابقة الآن',
    summary: city => `لم يُرجع Qloo أماكن قابلة للعرض ضمن ${city}.`,
    reason: 'تم البحث بالمفضلات المحددة، لكن لم نجد أماكن مطابقة في هذه المدينة.'
  },
  steps: {
    read: (guests, known) => `قرأ ذَوق مفضلات الضيوف (${guests})، وتعرّف Qloo على ${known} منها.`,
    search: (city, pool) => `بحث في Qloo عن أماكن في ${city} لذوق كل ضيف ولذوق المجموعة معًا، فوجد ${arabicCount(pool, AR_PLACES)}.`,
    fit: (n, scored, guests) => `رتّب أقرب الخيارات (${n}) حسب ذوق كل ضيف على حدة${scored < guests ? `، لـ${scored} من ${guests} ضيوف لديهم مفضلات معروفة` : ''}.`,
    tags: found => `حوّل الوكيل المزاج والقيود إلى وسوم Qloo: ${found.length ? found.join('، ') : 'لم تُعثر على وسوم مطابقة'}.`,
    searchFailed: purpose => `تعذّر بحث «${purpose}» في Qloo، فاستمر الوكيل بالأماكن المتاحة.`,
    agentSearch: (city, purpose, tags, count) => `بحث الوكيل في ${city} عن «${purpose}»${tags.length ? ` بوسوم ${tags.join('، ')}` : ''}: ${arabicCount(count, AR_RESULTS)}.`,
    agentFit: n => `قارن الوكيل ${arabicCount(n, AR_PLACES_GENITIVE)} بذوق كل ضيف على حدة، بينها ما اقترحه للتو.`,
    plan: (count, names) => `كتب الوكيل خطة من ${arabicCount(count, AR_STOPS)}: ${names.join(' ← ')}.`,
    fallback: 'لم يكتمل عمل الوكيل هذه المرة، فعُرض الترتيب الحسابي لملاءمة المجموعة بدلًا منه.'
  },
  plan: {
    privateTaste: 'إحدى مفضلات الضيوف',
    defaultTitle: city => `لمّة في ${city}`,
    defaultSummary: (occasion, city) => `خطة لمناسبة «${occasion}» في ${city}.`,
    reason: (labels, feedback, kept = 0) => `${labels.length ? `استخدم ذَوق مفضلات كل ضيف كإشارات ذوق في Qloo: ${labels.join('، ')}${kept ? `، و${new Intl.NumberFormat('ar-SA').format(kept)} من المفضلات الأخرى بقيت خاصة بأصحابها` : ''}.` : 'استخدم ذَوق مفضلات كل ضيف كإشارات ذوق في Qloo، وتبقى المفضلات خاصة بأصحابها.'} ثم رتّب كل مكان حسب ذوق كل ضيف على حدة، وفضّل ما يناسب أكبر عدد دون إهمال أحد${feedback ? ' وأخذ في الحسبان تقييمات التوصيات السابقة ذات المفضلات المتشابهة' : ''}. ملاءمة العمر والميزانية والطعام وساعات العمل تحتاج تأكيدًا من المكان.`,
    fallbackTitle: city => `لمّة على ذوق الجميع في ${city}`,
    fallbackConcept: city => `رتّبنا أماكن ${city} حسب قربها من ذوق كل ضيف على حدة، وقدّمنا ما يناسب أكبر عدد منهم دون أن نُهمل أحدًا.`,
    fallbackFirst: 'الخيار الأقرب لذوق المجموعة',
    fallbackSecond: 'خيار ثانٍ قريب',
    fallbackWhy: 'اختيار حسابي من ترتيب Qloo لذوق كل ضيف على حدة.',
    fallbackMoods: 'المزاج والملاحظات لم تُراجع آليًا هذه المرة؛ تأكدي من ملاءمة المكان للأعمار والميزانية.',
    fallbackHours: 'تأكدي من ساعات العمل والأسعار قبل الحجز.'
  }
};

const EN = {
  separator: ', ',
  modelLanguage: 'Write warm, clear English for an international audience and address the group in the plural. Keep place names exactly as given.',
  languageName: 'English',
  roleExample: '"Lunch" or "Coffee after"',
  purposeExample: '"kid-friendly brunch"',
  review: {
    title: 'Choose what each favourite means',
    summary: n => `${englishCount(n, 'favourite')} ${n === 1 ? 'needs' : 'need'} a choice or a correction before the search.`,
    reason: 'Pick the intended name from Qloo\'s results. If it isn\'t listed, skip that favourite. A name with no results can be corrected or cleared; keep at least one favourite.'
  },
  empty: {
    title: 'No matching places right now',
    summary: city => `Qloo returned no places to show in ${city}.`,
    reason: 'We searched with the selected favourites but found no matching places in this city.'
  },
  steps: {
    read: (guests, known) => `Thooq read the favourites of ${englishCount(guests, 'guest')}; Qloo recognised ${known} of them.`,
    search: (city, pool) => `It searched Qloo for places in ${city} for each guest's taste and for the group as a whole, and found ${englishCount(pool, 'place')}.`,
    fit: (n, scored, guests) => `It ranked the ${n} closest options against each guest's taste separately${scored < guests ? ` (${scored} of ${guests} guests had recognised favourites)` : ''}.`,
    tags: found => `The agent turned moods and constraints into Qloo tags: ${found.length ? found.join(', ') : 'no matching tags found'}.`,
    searchFailed: purpose => `The Qloo search for "${purpose}" didn't complete, so the agent continued with the places it had.`,
    agentSearch: (city, purpose, tags, count) => `The agent searched ${city} for "${purpose}"${tags.length ? ` with the tags ${tags.join(', ')}` : ''}: ${englishCount(count, 'result')}.`,
    agentFit: n => `The agent compared ${englishCount(n, 'place')} with each guest's taste, including the ones it just found.`,
    plan: (count, names) => `The agent wrote a plan with ${englishCount(count, 'stop')}: ${names.join(' → ')}.`,
    fallback: 'The agent didn\'t finish this time, so the places are shown in Qloo group-fit order instead.'
  },
  plan: {
    privateTaste: 'a guest favourite',
    defaultTitle: city => `A gathering in ${city}`,
    defaultSummary: (occasion, city) => `A plan for "${occasion}" in ${city}.`,
    reason: (labels, feedback, kept = 0) => `${labels.length ? `Thooq used every guest's favourites as Qloo taste signals: ${labels.join(', ')}${kept ? `, and ${kept} more that guests kept private` : ''}.` : "Thooq used every guest's favourites as Qloo taste signals; guests keep their favourites private."} It then ranked each place against each guest's taste separately and preferred places that suit the most guests without leaving anyone out${feedback ? ', taking earlier votes on plans with similar tastes into account' : ''}. Age suitability, budget, food and opening hours should be confirmed with the place.`,
    fallbackTitle: city => `A gathering for every taste in ${city}`,
    fallbackConcept: city => `We ranked places in ${city} by how close they are to each guest's taste and put first the ones that suit the most guests without leaving anyone out.`,
    fallbackFirst: 'Closest to the group\'s taste',
    fallbackSecond: 'A close second option',
    fallbackWhy: 'Chosen from Qloo\'s ranking for each guest\'s taste.',
    fallbackMoods: 'Moods and notes were not reviewed automatically this time; check that the place suits the ages and budget.',
    fallbackHours: 'Check opening hours and prices before booking.'
  }
};

export const copy = lang => (languageOf(lang) === 'en' ? EN : AR);

// English wording for the fixed Arabic messages the server can return.
const ENGLISH_MESSAGES = new Map([
  ['لم نجد هذه العزيمة.', 'We could not find this gathering.'],
  ['الطلب كبير جدًا', 'The request is too large.'],
  ['صيغة الطلب غير صالحة.', 'The request format is invalid.'],
  ['رابط التوصية غير صالح أو لم يعد متاحًا.', 'This plan link is invalid or no longer available.'],
  ['فعّلي ملفات الارتباط وحدّثي الصفحة ثم أرسلي تقييمك.', 'Enable cookies, refresh the page, then send your vote.'],
  ['أرسلي التقييم من صفحة التوصية نفسها.', 'Send your vote from the plan page itself.'],
  ['اختاري «جيدة» أو «سيئة».', 'Choose "Good" or "Not for us".'],
  ['رابط التوصية غير متاح.', 'This plan link is not available.'],
  ['المسار غير موجود.', 'Not found.'],
  ['تفاصيل العزيمة غير صالحة.', 'The gathering details are invalid.'],
  ['أضيفي اسمك وثلاث مفضلات في كل سؤال.', 'Add your name and three favourites for each question.'],
  ['نحتاج إجابة ضيف واحد على الأقل قبل بناء التوصية.', 'At least one guest needs to reply before building a plan.'],
  ['راجعي المفضلات المحددة وأبقي مفضلة واحدة على الأقل.', 'Check the selected favourites and keep at least one.'],
  ['يجري إنشاء توصية لهذه العزيمة. انتظري اكتمالها.', 'A plan is already being built for this gathering. Please wait for it to finish.'],
  ['وصلت إجابات جديدة أثناء البحث. حدّثي التوصية لتشملها.', 'New replies arrived during the search. Update the plan to include them.'],
  ['الملف غير موجود.', 'File not found.'],
  ['غير مسموح.', 'Not allowed.'],
  ['حصل خطأ غير متوقع.', 'Something unexpected happened.'],
  ['اختاري تقييمًا جيدًا أو سيئًا.', 'Choose a good or a bad rating.'],
  ['أرسلي من مفضلة إلى ست مفضلات للتحقق.', 'Send one to six favourites to check.'],
  ['هذه الصفحة لصاحبة العزيمة فقط. افتحيها من رابطك الخاص.', 'Only the host can do this. Open the gathering from your private host link.']
]);

export function messageFor(error, lang) {
  const message = typeof error === 'string' ? error : error?.message;
  if (languageOf(lang) !== 'en') return message;
  return (typeof error === 'object' && error?.en) || ENGLISH_MESSAGES.get(message) || message;
}
