// Arabic-first, with a full English mode for international guests and judges.
// Language: ?lang= in the URL, then the saved choice, then the browser language.
(function () {
  const dictionary = {
    // Shared
    'brand': ['ذَوق', 'Thooq'],
    'lang.switch': ['English', 'العربية'],
    'lang.switchLabel': ['Switch to English', 'التبديل إلى العربية'],
    'error.generic': ['حصل خطأ غير متوقع.', 'Something unexpected happened.'],
    'toast.copied': ['تم نسخ الرابط', 'Link copied'],

    // Landing
    'index.docTitle': ['ذَوق — عزيمة على ذوقكم', 'Thooq — plan a gathering that fits everyone\'s taste'],
    'index.host': ['لدي عزيمة', 'I\'m hosting'],
    'index.eyebrow': ['لَـمّة على ذوق الكل', 'A gathering everyone enjoys'],
    'index.title': ['مو كل عزيمة<br /><em>لها نفس الذَوق.</em>', 'Not every gathering<br /><em>shares one taste.</em>'],
    'index.lede': ['ذَوق يفهم ما يجمع ضيوفك، ويقترح تجربة تليق بهم — من غير تصويت محيّر أو اقتراحات عامة.', 'Thooq learns what each guest loves, finds what the group shares, and plans an outing that suits everyone. No endless group-chat polls, no generic top-ten lists.'],
    'index.demo': ['جرّبي العرض التجريبي', 'Try the live demo'],
    'index.start': ['ابدئي عزيمتك', 'Plan your own'],
    'index.guest': ['شاهدي تجربة الضيف', 'See the guest experience'],
    'index.card': ['تجمعنا الأشياء التي نحبها', 'Brought together by what we love'],
    'index.cardLabel': ['ذَوق', 'Thooq'],
    'index.cardTitle': ['لَمّة<br />الويكند', 'Weekend<br />gathering'],
    'index.how': ['كيف يعمل؟', 'How it works'],
    'index.step1.title': ['صاحبة العزيمة تحدد المناسبة', 'The host sets the occasion'],
    'index.step1.text': ['المدينة، عدد الضيوف وأعمارهم، الميزانية، والجو الذي تتخيله.', 'City, group size, ages, budget and the mood you have in mind.'],
    'index.step2.title': ['الضيوف يشاركون ذوقهم', 'Guests share their taste'],
    'index.step2.text': ['ثلاثة أسئلة قصيرة: ما يتابعونه، الأماكن التي يحبونها، ومزاجهم للَمّة.', 'Three quick questions: what they watch and hear, places they love, and their ideal mood.'],
    'index.step3.title': ['ذَوق يجد نقطة الالتقاء', 'Thooq finds the common ground'],
    'index.step3.text': ['وكيل ذكي يرتّب الأماكن حسب ذوق كل ضيف عبر Qloo، ويقترح خطة تناسب الجميع مع تفسير واضح.', 'An agent ranks real places against every guest\'s taste with Qloo and plans stops that suit the whole group, with clear reasons.'],

    // Host dashboard
    'admin.docTitle': ['لوحة العزيمة — ذَوق', 'Host dashboard — Thooq'],
    'admin.home': ['الرئيسية ←', '← Home'],
    'admin.eyebrow': ['عزيمتي الجديدة', 'My gathering'],
    'admin.title': ['نرتّب اللَمّة', 'Let\'s plan it'],
    'admin.sub': ['أعطينا تفاصيل بسيطة، ثم أرسلي الرابط لضيوفك.', 'Add a few details, then send the link to your guests.'],
    'admin.saved': ['تُحفظ تلقائيًا', 'Saved automatically'],
    'admin.form.title': ['تفاصيل العزيمة', 'Gathering details'],
    'admin.form.occasion': ['وش هدف العزيمة؟', 'What\'s the occasion?'],
    'occasion.weekend': ['لَمّة نهاية الأسبوع', 'Weekend get-together'],
    'occasion.celebration': ['احتفال بسيط', 'Small celebration'],
    'occasion.family': ['لقاء عائلي', 'Family gathering'],
    'occasion.colleagues': ['تعارف زملاء', 'Colleagues meetup'],
    'occasion.friends': ['طلعة صديقات', 'Friends\' outing'],
    'admin.form.city': ['المدينة', 'City'],
    'admin.form.cityDefault': ['الرياض', 'Riyadh'],
    'admin.form.size': ['كم شخص تقريبًا؟', 'How many people?'],
    'size.small': ['٢–٤', '2–4'],
    'size.medium': ['٥–٨', '5–8'],
    'size.large': ['٩+', '9+'],
    'admin.form.ages': ['فئات الضيوف', 'Who\'s coming?'],
    'age.youth': ['شباب', 'Young adults'],
    'age.adults': ['بالغون', 'Adults'],
    'age.children': ['أطفال', 'Children'],
    'age.seniors': ['كبار سن', 'Seniors'],
    'admin.form.note': ['أي شيء مهم نراعيه؟', 'Anything we should consider?'],
    'admin.form.optional': ['(اختياري)', '(optional)'],
    'admin.form.notePlaceholder': ['مثل: هدوء، ميزانية متوسطة، خيارات نباتية…', 'e.g. quiet, mid-range budget, vegetarian options…'],
    'admin.form.save': ['حفظ التفاصيل', 'Save details'],
    'admin.share.title': ['أرسلي أسئلة الذَوق لضيوفك', 'Send the taste questions to your guests'],
    'admin.share.text': ['ثلاثة أسئلة سريعة تساعدنا نفهم ما يجمعكم.', 'Three quick questions help us understand what you share.'],
    'admin.share.copy': ['نسخ الرابط', 'Copy link'],
    'admin.answers': ['إجابات الضيوف', 'Guest replies'],
    'admin.answersCount': ['إجابات الضيوف · {n}', 'Guest replies · {n}'],
    'admin.answer.shared': ['شارك ذوقه', 'Shared their taste'],
    'admin.answer.done': ['مكتمل', 'Done'],
    'admin.answer.avatar': ['ض', 'G'],
    'admin.answers.empty': ['أرسلي الرابط حتى تبدأ الإجابات بالوصول.', 'Send the link and replies will appear here.'],
    'admin.answer.private': ['مفضلاته خاصة', 'Favourites kept private'],
    'admin.answer.sharing': ['شارك مفضلاته معك', 'Shared their favourites with you'],
    'admin.answer.confirmed': ['مفضلات مؤكدة: {n}', 'Confirmed favourites: {n}'],
    'admin.hostLink': ['رابط هذه الصفحة هو رابطك الخاص كصاحبة عزيمة. لا تشاركيه مع الضيوف.', 'This page\'s address is your private host link. Don\'t share it with guests.'],
    'admin.needKey': ['هذه العزيمة تحتاج رابطك الخاص كصاحبة عزيمة. افتحيها من الجهاز أو الرابط الذي أنشأتِها منه.', 'This gathering needs your private host link. Open it from the device or link you created it with.'],
    'admin.rec.kicker': ['توصية ذَوق', 'Thooq plan'],
    'admin.rec.waiting': ['بانتظار إجابات الضيوف', 'Waiting for guest replies'],
    'admin.rec.waitingText': ['عندما تصل إجابة واحدة على الأقل، استخدمي الزر أدناه لبناء التوصية.', 'Once at least one guest has replied, use the button below to build the plan.'],
    'admin.rec.ready': ['جاهزين نكتشف ذوقكم؟', 'Ready to find your common taste?'],
    'admin.rec.readyText': ['بعد وصول إجابات الضيوف، ابني توصية بأماكن تناسب المفضلات.', 'Once guests have replied, build a plan of places that fit everyone\'s favourites.'],
    'admin.rec.build': ['ابني التوصية', 'Build the plan'],
    'admin.rec.update': ['حدّثي التوصية', 'Update the plan'],
    'admin.rec.source.plan': ['خطة ذَوق · أماكن من Qloo', 'Thooq plan · places from Qloo'],
    'admin.rec.source.empty': ['اكتمل البحث', 'Search complete'],
    'admin.rec.source.review': ['تحتاج التوصية إلى مراجعة', 'Needs your review'],
    'admin.rec.why': ['ليش هذه التوصية؟', 'Why this plan?'],
    'admin.rec.legacy': ['تتوفر الآن قوائم لاختيار الأسماء. اضغطي أدناه لتحميلها.', 'Name choices are now available. Press below to load them.'],
    'admin.rec.loadChoices': ['تحميل خيارات المفضلات', 'Load favourite choices'],
    'admin.rec.choose': ['اختاري المقصود — {signal}', 'Choose the right one — {signal}'],
    'admin.rec.skip': ['تجاهل هذه المفضلة', 'Skip this favourite'],
    'admin.rec.recognised': ['تم التعرف على هذه المفضلة ✓', 'Recognised ✓'],
    'admin.rec.pick': ['اختاري النتيجة المطابقة، أو «تجاهل هذه المفضلة» إذا لم تجدي المقصود.', 'Pick the matching result, or "Skip this favourite" if it isn\'t listed.'],
    'admin.rec.notFound': ['لم نجد اسمًا مطابقًا. صححيه إلى اسم محدد، أو امسحي الحقل لتجاهله.', 'No match found. Correct it to a specific name, or clear the field to skip it.'],
    'admin.rec.confirm': ['تأكيد المفضلات والبحث', 'Confirm and search'],
    'admin.rec.unresolved': ['«{name}» يحتاج اختيارًا أو تصحيحًا أو تجاهلًا قبل البحث.', '"{name}" needs a choice, a correction or skipping before the search.'],
    'admin.rec.keepOne': ['أبقي مفضلة واحدة على الأقل للبحث.', 'Keep at least one favourite to search.'],
    'admin.rec.searching': ['وكيل ذَوق يبحث ويقارن الأماكن بذوق كل ضيف…', 'The Thooq agent is searching and comparing places with each guest\'s taste…'],
    'admin.rec.translating': ['نقرأ المفضلات ونبحث عن أماكن…', 'Reading favourites and searching for places…'],
    'admin.rec.progress': ['يقرأ ذوق كل ضيف، ويبحث في Qloo، ويحوّل المزاج والقيود إلى وسوم، ثم يقارن الأماكن بذوق كل ضيف على حدة. قد يستغرق ذلك حتى دقيقة.', 'Reading each guest\'s taste, searching Qloo, turning moods and constraints into Qloo tags, then ranking places for each guest. This can take up to a minute.'],
    'admin.rec.done': ['خطة اللمّة جاهزة', 'Your plan is ready'],
    'admin.rec.needsInput': ['ظهرت خيارات تحتاج تحديدًا قبل البحث', 'Some favourites need a quick choice first'],
    'admin.recShare.title': ['شاركي التوصية وخذي رأي الضيوف', 'Share the plan and get your guests\' votes'],
    'admin.recShare.text': ['هذا رابط مستقل عن الأسئلة. يعرض هذه التوصية ويتيح تقييمها، ويبقى مرتبطًا بها بعد إنشاء توصية جديدة.', 'This link is separate from the questions. It shows this plan and lets guests rate it, and keeps pointing to it after a new plan is built.'],
    'admin.recShare.copy': ['نسخ رابط التوصية', 'Copy plan link'],
    'admin.recShare.urlLabel': ['رابط التوصية والتقييم', 'Plan and voting link'],
    'admin.recShare.refresh': ['تحديث التقييمات', 'Refresh votes'],
    'admin.recShare.hint': ['التقييمات تدخل في ترتيب التوصية التالية عند الضغط على «حدّثي التوصية».', 'Votes feed into the ranking of the next plan when you press "Update the plan".'],
    'admin.recShare.copied': ['تم نسخ رابط التوصية والتقييم', 'Plan link copied'],
    'admin.feedback.summary': ['تقييمات هذه التوصية: {good} جيدة · {bad} سيئة · المجموع {total}', 'Votes on this plan: {good} good · {bad} not for us · {total} total'],
    'admin.feedback.none': ['لم تصل تقييمات بعد. أرسلي رابط التوصية لضيوفك.', 'No votes yet. Send the plan link to your guests.'],
    'admin.created': ['تم إنشاء عزيمتك وحفظ التفاصيل', 'Your gathering is saved'],
    'admin.demo.banner': ['عزيمة تجريبية: أربعة ضيوف أجابوا مسبقًا ومعهم أطفال وجدّة. اضغطي «ابني التوصية»، أو أضيفي نفسك ضيفًا من رابط الأسئلة.', 'Demo gathering: four family members have already answered, with small children and a grandmother joining. Press "Build the plan", or add yourself as a guest with the questions link.'],
    'admin.demo.creating': ['نجهّز العزيمة التجريبية…', 'Preparing the demo gathering…'],
    'type.tv_show': ['مسلسل', 'TV show'],
    'type.movie': ['فيلم', 'film'],
    'type.artist': ['فنان', 'artist'],
    'type.book': ['كتاب', 'book'],
    'type.person': ['شخصية', 'person'],
    'type.place': ['مكان', 'place'],
    'type.brand': ['علامة تجارية', 'brand'],
    'type.podcast': ['بودكاست', 'podcast'],

    // Guest
    'guest.docTitle': ['شاركينا ذوقك — ذَوق', 'Share your taste — Thooq'],
    'guest.pill': ['٣ دقائق فقط', 'Just 3 minutes'],
    'guest.note.title': ['دعوة إلى عزيمة', 'You\'re invited'],
    'guest.note.text': ['نحاول نلقى التجربة التي تناسب الجميع. ما فيه إجابة صح أو غلط.', 'We\'re looking for something everyone will enjoy. There are no right or wrong answers.'],
    'guest.invite': ['دعوة إلى {occasion} في {city}', 'Invitation: {occasion} in {city}'],
    'guest.eyebrow': ['شاركينا ذوقك', 'Share your taste'],
    'guest.title': ['وش الأشياء<br /><em>اللي تشبهك؟</em>', 'What feels<br /><em>like you?</em>'],
    'guest.intro': ['جاوبي على ثلاثة أسئلة بسيطة، ثم تأكدي من مفضلاتك. إجاباتك خاصة: لا يراها الضيوف الآخرون، ولا تراها صاحبة العزيمة إلا إذا سمحتِ بذلك.', 'Answer three short questions, then confirm your favourites. Your answers are private: other guests never see them, and the host only sees them if you allow it.'],
    'guest.name': ['اسمك الأول', 'Your first name'],
    'guest.namePlaceholder': ['مثال: نورة', 'e.g. Noura'],
    'guest.q1.title': ['وش تسمعين أو تتابعين؟', 'What do you watch or listen to?'],
    'guest.q1.text': ['أضيفي ٣ فنانين، مسلسلات، أفلام، أو بودكاست تحبينها الآن.', 'Add 3 artists, shows, films or podcasts you love right now.'],
    'guest.q1.example': ['مثال: فنانة، مسلسل، أو بودكاست', 'e.g. an artist, a series or a podcast'],
    'guest.q2.title': ['وين تحسين بالراحة؟', 'Where do you feel at home?'],
    'guest.q2.text': ['أضيفي ٣ أماكن أو تجارب ترجعين لها دائمًا.', 'Add 3 places, brands or experiences you keep going back to.'],
    'guest.q2.example': ['مثال: مقهى، مطعم، مدينة', 'e.g. a café, a restaurant, a city'],
    'guest.q3.title': ['وش مزاجك للَمّة؟', 'What\'s your mood for this gathering?'],
    'guest.q3.text': ['أضيفي ٣ كلمات، أشياء، أو أنماط تتمنينها في أي طلعة.', 'Add 3 words or things you\'d love on any outing.'],
    'guest.q3.example': ['مثال: جلسة طويلة، ضحك، هدوء', 'e.g. long chats, laughter, calm'],
    'guest.second': ['إضافة مفضلة ثانية', 'A second favourite'],
    'guest.third': ['إضافة مفضلة ثالثة', 'A third favourite'],
    'guest.previous': ['→ السابق', '← Back'],
    'guest.next': ['التالي <span>←</span>', 'Next <span>←</span>'],
    'guest.submit': ['إرسال إجاباتي <span>←</span>', 'Send my answers <span>←</span>'],
    'guest.sending': ['جارٍ الإرسال…', 'Sending…'],
    'guest.needThree': ['أضيفي ثلاث مفضلات حتى نفهم ذوقك أكثر.', 'Add three favourites so we can understand your taste.'],
    'guest.needName': ['اكتبي اسمك الأول حتى تظهر إجابتك لصاحبة العزيمة.', 'Add your first name so the host can see your reply.'],
    'guest.success.title': ['وصل ذَوقك ✦', 'Your taste is in ✦'],
    'guest.success.text': ['شكرًا لمشاركتك. وصلت إجابتك، وذَوق يبدأ يجمع الخيوط.', 'Thank you! Your reply is in, and Thooq is connecting the dots.'],
    'guest.success.private': ['شكرًا لمشاركتك. مفضلاتك خاصة: صاحبة العزيمة ترى أنك أجبتِ فقط، وذَوق يبدأ يجمع الخيوط.', 'Thank you! Your favourites stay private: the host only sees that you replied, and Thooq is connecting the dots.'],
    'guest.success.shared': ['شكرًا لمشاركتك. ستظهر مفضلاتك لصاحبة العزيمة، وذَوق يبدأ يجمع الخيوط.', 'Thank you! The host can see your favourites, and Thooq is connecting the dots.'],
    'guest.checking': ['نبحث عن مفضلاتك في Qloo…', 'Looking up your favourites in Qloo…'],
    'guest.confirm.eyebrow': ['الخطوة الأخيرة', 'Last step'],
    'guest.confirm.title': ['تأكدي من مفضلاتك', 'Confirm your favourites'],
    'guest.confirm.text': ['هذا ما وجده Qloo لكل مفضلة. اختاري المقصود، أو صححي الاسم، أو اتركيها.', 'This is what Qloo found for each favourite. Pick the one you meant, correct the name, or leave it out.'],
    'guest.confirm.found': ['وجدناها في Qloo', 'Found in Qloo'],
    'guest.confirm.pick': ['أي واحدة تقصدين؟', 'Which one do you mean?'],
    'guest.confirm.missing': ['لم نجدها في Qloo. صححي الاسم وابحثي مجددًا، أو اتركيها.', 'Not found in Qloo. Correct the name and search again, or leave it out.'],
    'guest.confirm.failed': ['تعذر البحث الآن. ابحثي مجددًا أو اتركيها.', 'The search didn\'t work just now. Search again or leave it out.'],
    'guest.confirm.notThis': ['ليست هذه، اتركيها', 'Not this one, leave it out'],
    'guest.confirm.none': ['ليست أيًّا منها، اتركيها', 'None of these, leave it out'],
    'guest.confirm.leave': ['اتركيها', 'Leave it out'],
    'guest.confirm.retry': ['ابحثي مجددًا', 'Search again'],
    'guest.confirm.searching': ['جارٍ البحث…', 'Searching…'],
    'guest.confirm.back': ['→ تعديل الإجابات', '← Edit my answers'],
    'guest.confirm.send': ['تأكيد وإرسال <span>←</span>', 'Confirm and send <span>←</span>'],
    'guest.confirm.choose': ['اختاري المقصود لكل مفضلة قبل الإرسال.', 'Pick what you meant for each favourite before sending.'],
    'guest.confirm.needOne': ['أبقي مفضلة واحدة على الأقل حتى يفهم ذَوق ذوقك.', 'Keep at least one favourite so Thooq can understand your taste.'],
    'guest.share.label': ['أسمح لصاحبة العزيمة برؤية مفضلاتي', 'Let the host see my favourites'],
    'guest.share.help': ['بدون ذلك، ترى صاحبة العزيمة أنك أجبتِ فقط. مفضلاتك تُستخدم للبحث ولا تظهر لأحد.', 'If you leave this off, the host only sees that you replied. Your favourites are used for the search and shown to no one.'],

    // Shared plan page
    'shared.docTitle': ['توصيتكم ورأيكم — ذَوق', 'Your plan — Thooq'],
    'shared.pill': ['رأيكم يصنع الفرق', 'Your vote counts'],
    'shared.eyebrow': ['توصيتكم جاهزة', 'Your plan is ready'],
    'shared.title': ['وش رأيكم<br />بهاللَمّة؟', 'What do you think<br />of this plan?'],
    'shared.loading': ['نحمّل تفاصيل التوصية…', 'Loading the plan…'],
    'shared.kicker': ['خطة ذَوق · أماكن من Qloo', 'Thooq plan · places from Qloo'],
    'shared.why': ['ليش هذه التوصية؟', 'Why this plan?'],
    'shared.feedback.eyebrow': ['ساعدونا نضبط الذَوق', 'Help us tune the taste'],
    'shared.feedback.title': ['هل التوصية مناسبة لكم؟', 'Does this plan suit you?'],
    'shared.feedback.text': ['قيّموا التوصية كاملة. رأيكم يساعدنا في ترتيب الاقتراحات القادمة للمفضلات المتشابهة في المدينة نفسها.', 'Rate the whole plan. Your vote helps rank future suggestions for similar tastes in the same city.'],
    'shared.rate': ['تقييم التوصية', 'Rate the plan'],
    'shared.good': ['جيدة', 'Good'],
    'shared.bad': ['سيئة', 'Not for us'],
    'shared.privacy': ['نحفظ تقييمًا واحدًا لكل متصفح لهذه التوصية، ويمكنك تغييره. نستخدم ملف ارتباط للتعرّف على تقييمك دون طلب اسمك.', 'We keep one vote per browser for this plan, and you can change it. A cookie recognises your vote without asking your name.'],
    'shared.noscript': ['فعّلي JavaScript لعرض التوصية وإرسال تقييمك.', 'Enable JavaScript to see the plan and vote.'],
    'shared.totals': ['آراء الضيوف: {good} جيدة · {bad} سيئة', 'Guest votes: {good} good · {bad} not for us'],
    'shared.first': ['كوني أول من يشارك رأيه.', 'Be the first to vote.'],
    'shared.current': ['تقييمك الحالي: {rating}. يمكنك تغييره.', 'Your vote: {rating}. You can change it.'],
    'shared.pick': ['اختاري التقييم الأقرب لرأيك.', 'Pick the option closest to your view.'],
    'shared.saving': ['نحفظ رأيك…', 'Saving your vote…'],
    'shared.saved': ['حفظنا تقييمك: {rating}. شكرًا لمساعدتنا؛ سيُؤخذ رأيك في التوصيات القادمة. يمكنك تغييره.', 'Saved: {rating}. Thank you, your vote will shape future plans. You can change it.'],
    'shared.loadError': ['تعذر عرض التوصية.', 'We couldn\'t show this plan.'],
    'shared.incomplete': ['الرابط غير مكتمل. اطلبي رابط التوصية من صاحبة العزيمة.', 'This link is incomplete. Ask the host for the plan link.'],
    'shared.requestError': ['تعذر إكمال الطلب. حاولي مجددًا.', 'Something went wrong. Please try again.'],

    // Plan view
    'plan.badge.agent': ['خطة من وكيل ذَوق · Gemini + Qloo', 'Planned by the Thooq agent · Gemini + Qloo'],
    'plan.badge.fallback': ['ترتيب حسابي من Qloo', 'Ranked by Qloo group fit'],
    'plan.fit.all': ['يناسب ذوق الجميع ({total})', 'Fits everyone\'s taste ({total})'],
    'plan.fit.some': ['يناسب ذوق {count} من {total}', 'Fits {count} of {total} guests'],
    'plan.fit.short': ['{count} من {total}', '{count} of {total}'],
    'plan.guest': ['ضيف {n}', 'Guest {n}'],
    'plan.connected': ['يجمعه: {tastes}', 'Connected by: {tastes}'],
    'plan.map': ['الموقع على الخريطة ↗', 'Map ↗'],
    'plan.beforeBooking': ['قبل الحجز', 'Before you book'],
    'plan.alternatives': ['بدائل قريبة من ذوقكم ({n})', 'Close alternatives ({n})'],
    'plan.steps': ['كيف وصل ذَوق لهذه الخطة؟', 'How did Thooq reach this plan?'],
    'plan.otherLanguage': ['كُتبت هذه الخطة بالإنجليزية. اضغطي «حدّثي التوصية» لكتابتها بالعربية.', 'This plan was written in Arabic. Press "Update the plan" to rewrite it in English.'],
    'plan.otherLanguageShared': ['كتبت صاحبة العزيمة هذه الخطة بالإنجليزية.', 'The host created this plan in Arabic.']
  };

  const supported = ['ar', 'en'];
  const pick = value => supported.includes(value) ? value : undefined;
  let saved;
  try { saved = localStorage.getItem('thooq-lang'); } catch { saved = undefined; }
  const fromUrl = pick(new URLSearchParams(window.location.search).get('lang'));
  const lang = fromUrl || pick(saved) || (/^ar\b/i.test(navigator.language || '') ? 'ar' : 'en');
  if (fromUrl) { try { localStorage.setItem('thooq-lang', fromUrl); } catch { /* private mode */ } }
  const index = lang === 'ar' ? 0 : 1;
  const locale = lang === 'ar' ? 'ar-SA' : 'en-US';

  function t(key, vars = {}) {
    const entry = dictionary[key];
    const text = entry ? entry[index] : key;
    return text.replace(/\{(\w+)\}/g, (match, name) => vars[name] === undefined ? match : String(vars[name]));
  }
  const number = value => Number(value).toLocaleString(locale);

  function apply(root = document) {
    root.querySelectorAll('[data-i18n]').forEach(element => { element.textContent = t(element.dataset.i18n); });
    root.querySelectorAll('[data-i18n-html]').forEach(element => { element.innerHTML = t(element.dataset.i18nHtml); });
    root.querySelectorAll('[data-i18n-placeholder]').forEach(element => { element.placeholder = t(element.dataset.i18nPlaceholder); });
    root.querySelectorAll('[data-i18n-aria]').forEach(element => { element.setAttribute('aria-label', t(element.dataset.i18nAria)); });
    root.querySelectorAll('[data-i18n-value]').forEach(element => { element.value = t(element.dataset.i18nValue); });
    root.querySelectorAll('[data-num]').forEach(element => { element.textContent = lang === 'ar' ? element.dataset.num.replace(/\d/g, digit => '٠١٢٣٤٥٦٧٨٩'[digit]) : element.dataset.num; });
    const title = document.body?.dataset.title;
    if (title) document.title = t(title);
  }

  function addToggle() {
    const nav = document.querySelector('.nav, .app-nav, .guest-nav');
    if (!nav || nav.querySelector('.lang-toggle')) return;
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'lang-toggle';
    button.textContent = t('lang.switch');
    button.lang = lang === 'ar' ? 'en' : 'ar';
    button.setAttribute('aria-label', t('lang.switchLabel'));
    button.addEventListener('click', () => {
      const next = lang === 'ar' ? 'en' : 'ar';
      try { localStorage.setItem('thooq-lang', next); } catch { /* private mode */ }
      const url = new URL(window.location.href);
      url.searchParams.set('lang', next);
      window.location.replace(url.href);
    });
    const slot = nav.querySelector('[data-lang-slot]');
    if (slot) slot.prepend(button); else nav.append(button);
  }

  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  window.Thooq = { lang, locale, t, number, apply };
  apply();
  addToggle();
})();
