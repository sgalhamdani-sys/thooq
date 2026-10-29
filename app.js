(function () {
  const { t, lang } = window.Thooq;
  const toast = document.getElementById('toast');
  const showToast = (message) => {
    if (!toast) return;
    toast.textContent = message; toast.classList.add('show'); setTimeout(() => toast.classList.remove('show'), 2400);
  };
  const api = async (path, options = {}) => {
    const response = await fetch(path, { headers: { 'Content-Type': 'application/json', 'X-Thooq-Lang': lang }, ...options });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || t('error.generic'));
    return payload;
  };
  const escapeHtml = (value) => String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
  const storage = {
    get(key) { try { return localStorage.getItem(key); } catch { return null; } },
    set(key, value) { try { localStorage.setItem(key, value); } catch { /* private mode */ } }
  };

  const form = document.getElementById('event-form');
  if (form) {
    const params = new URLSearchParams(window.location.search);
    let eventId = storage.get('thooq-admin-event') || 'lamma-weekend';
    const urlInput = document.getElementById('share-url');
    const copyButton = document.getElementById('copy-button');
    const list = document.getElementById('answers-list');
    const kicker = document.getElementById('answers-kicker');
    const recommendationBox = document.getElementById('recommendation-box');
    const shareCard = document.getElementById('recommendation-share');
    const recommendationUrl = document.getElementById('recommendation-url');
    const demoBanner = document.getElementById('demo-banner');
    const updateSharing = (event) => {
      const token = event.recommendation?.source === 'qloo' && event.recommendation.shareToken;
      shareCard.hidden = !token;
      recommendationUrl.value = token ? new URL(`recommendation.html?share=${encodeURIComponent(token)}`, window.location.href).href : '';
      const feedback = event.feedback || { good: 0, bad: 0, total: 0 };
      document.getElementById('feedback-summary').textContent = feedback.total ? t('admin.feedback.summary', feedback) : t('admin.feedback.none');
    };
    let currentRecommendation;
    let generating = false;
    const showRecommendationError = (message) => {
      let status = document.getElementById('recommend-error');
      if (!status) { status = document.createElement('p'); status.id = 'recommend-error'; status.setAttribute('role', 'alert'); recommendationBox.append(status); }
      status.textContent = message;
    };
    // The agent can take up to a minute; say what it is doing instead of a silent button.
    const showRecommendationProgress = () => {
      let status = document.getElementById('recommend-progress');
      if (!status) { status = document.createElement('p'); status.id = 'recommend-progress'; status.setAttribute('role', 'status'); recommendationBox.append(status); }
      status.textContent = t('admin.rec.progress');
    };
    const typeLabel = type => {
      const key = `type.${type?.split(':').pop()}`;
      const label = t(key);
      return label === key ? type : label;
    };
    const render = (event) => {
      updateSharing(event);
      demoBanner.hidden = !event.demo;
      urlInput.value = new URL(`guest.html?event=${event.id}`, window.location.href).href;
      kicker.textContent = t('admin.answersCount', { n: event.answerCount });
      list.innerHTML = event.answers.length ? event.answers.map((answer) => `<div class="answer-card"><div class="person"><span class="avatar">${escapeHtml(answer.name[0] || t('admin.answer.avatar'))}</span><div><b>${escapeHtml(answer.name)}</b><small>${escapeHtml(t('admin.answer.shared'))}</small></div></div><span class="status">${escapeHtml(t('admin.answer.done'))}</span></div>`).join('') : `<p class="sub">${escapeHtml(t('admin.answers.empty'))}</p>`;
      const recommendation = event.recommendation;
      currentRecommendation = recommendation;
      // A prepared demo keeps its resolved favourites but has no plan yet.
      if (!recommendation || recommendation.source === 'prepared') {
        recommendationBox.innerHTML = `<p class="section-kicker">${escapeHtml(t('admin.rec.kicker'))}</p><h3>${escapeHtml(t('admin.rec.ready'))}</h3><p>${escapeHtml(t('admin.rec.readyText'))}</p><button class="button button-quiet" id="recommend-button" type="button">${escapeHtml(t('admin.rec.build'))}</button>`;
        document.getElementById('recommend-button').addEventListener('click', generate);
        return;
      }
      const source = recommendation.source === 'qloo' ? t('admin.rec.source.plan') : recommendation.source === 'qloo-empty' ? t('admin.rec.source.empty') : t('admin.rec.source.review');
      // The plan view shows each stop, its role and how many guests' tastes it fits.
      const plan = recommendation.places?.length ? window.ThooqPlan.renderPlan(recommendation, { guestNames: event.answers.map(answer => answer.name), host: true }) : '';
      // Plan text keeps the direction of the language it was written in.
      const textDir = recommendation.language === 'en' ? 'ltr' : recommendation.language === 'ar' ? 'rtl' : 'auto';
      recommendationBox.innerHTML = `<p class="section-kicker">${escapeHtml(source)}</p><h3 dir="${textDir}">${escapeHtml(recommendation.title)}</h3><p dir="${textDir}">${escapeHtml(recommendation.summary)}</p>${plan}<div class="reason"><strong>${escapeHtml(t('admin.rec.why'))}</strong><br /><span dir="${textDir}">${escapeHtml(recommendation.reason)}</span></div><button class="button button-quiet" id="recommend-button" type="button">${escapeHtml(t('admin.rec.update'))}</button>`;
      document.getElementById('recommend-button').addEventListener('click', generate);
      if (recommendation.signals && recommendation.reviewVersion !== 2) {
        const notice = document.createElement('p'); notice.textContent = t('admin.rec.legacy');
        recommendationBox.insertBefore(notice, document.getElementById('recommend-button'));
        document.getElementById('recommend-button').textContent = t('admin.rec.loadChoices');
      } else if (recommendation.signals) {
        const fields = document.createElement('div'); fields.id = 'signal-review';
        for (const signal of recommendation.signals) {
          const row = document.createElement('label'); row.className = 'signal-row';
          const caption = document.createElement('span'); caption.textContent = recommendation.signalLabels?.[signal] || signal; row.append(caption);
          const issue = (recommendation.clarifications || []).find(item => item.input === signal);
          const control = document.createElement(issue?.candidates?.length ? 'select' : 'input');
          control.dir = 'auto';
          if (control.tagName === 'SELECT') {
            const placeholder = document.createElement('option'); placeholder.value = signal; placeholder.textContent = t('admin.rec.choose', { signal }); placeholder.disabled = true; placeholder.selected = true; control.append(placeholder);
            for (const candidate of issue.candidates) {
              const option = document.createElement('option'); option.value = candidate.id;
              option.textContent = [candidate.name, typeLabel(candidate.type), candidate.releaseYear, candidate.address || candidate.description].filter(Boolean).join(' · ');
              control.append(option);
            }
            const skip = document.createElement('option'); skip.value = ''; skip.textContent = t('admin.rec.skip'); control.append(skip);
          } else control.value = signal;
          if (issue) {
            control.dataset.unresolved = signal;
          } else {
            control.type = 'hidden';
          }
          control.dataset.signal = 'true'; row.append(control); fields.append(row);
          const help = document.createElement('small');
          help.textContent = !issue ? t('admin.rec.recognised') : issue.candidates?.length ? t('admin.rec.pick') : t('admin.rec.notFound');
          row.append(help);
        }
        recommendationBox.insertBefore(fields, document.getElementById('recommend-button'));
        document.getElementById('recommend-button').textContent = t('admin.rec.confirm');
      }
    };
    const fillForm = (event) => {
      const occasion = document.getElementById('occasion');
      if (![...occasion.options].some(option => option.value === event.occasion)) {
        const option = document.createElement('option'); option.value = option.textContent = event.occasion; occasion.prepend(option);
      }
      occasion.value = event.occasion;
      document.getElementById('city').value = event.city;
      const range = document.querySelector(`input[name="guests"][value="${event.guestRange}"]`); if (range) range.checked = true;
      document.querySelectorAll('.event-form input[type="checkbox"]').forEach((input) => { input.checked = (event.ageGroups || []).includes(input.value); });
      document.getElementById('note').value = event.note || '';
    };
    const load = async () => {
      const { event } = await api(`/api/events/${eventId}`);
      fillForm(event);
      render(event);
    };
    // "Try the demo" gives every visitor a private copy of the demo gathering.
    const startDemo = async () => {
      recommendationBox.querySelector('h3').textContent = t('admin.demo.creating');
      const { event } = await api('/api/demo', { method: 'POST', body: JSON.stringify({ lang }) });
      eventId = event.id; storage.set('thooq-admin-event', eventId);
      const url = new URL(window.location.href); url.searchParams.delete('demo');
      window.history.replaceState(null, '', url.href);
      fillForm(event);
      render(event);
    };
    const generate = async () => {
      if (generating) return;
      const button = document.getElementById('recommend-button');
      const label = button.textContent;
      const review = document.getElementById('signal-review');
      const controls = review ? [...review.querySelectorAll('[data-signal]')] : [];
      const unresolved = controls.find(field => field.dataset.unresolved && field.value.trim() === field.dataset.unresolved);
      if (unresolved) {
        showRecommendationError(t('admin.rec.unresolved', { name: unresolved.dataset.unresolved }));
        unresolved.focus(); return;
      }
      const signals = review ? controls.map(field => field.value.trim()).filter(Boolean) : currentRecommendation?.signals;
      if (signals && !signals.length) { showRecommendationError(t('admin.rec.keepOne')); return; }
      document.getElementById('recommend-error')?.remove();
      generating = true; button.disabled = true;
      button.textContent = signals || currentRecommendation?.querySignals ? t('admin.rec.searching') : t('admin.rec.translating');
      showRecommendationProgress();
      recommendationBox.setAttribute('aria-busy', 'true');
      controls.forEach(field => { field.disabled = true; });
      try {
        const { recommendation } = await api(`/api/events/${eventId}/recommendation`, { method: 'POST', body: JSON.stringify({ signals, lang }) });
        currentRecommendation = recommendation;
        render({ ...(await api(`/api/events/${eventId}`)).event, recommendation });
        recommendationBox.scrollIntoView({ behavior: 'smooth', block: 'start' });
        const outcome = recommendation.source === 'qloo' ? t('admin.rec.done') : recommendation.source === 'qloo-needs-input' ? t('admin.rec.needsInput') : recommendation.title;
        showToast(outcome);
      } catch (error) {
        showRecommendationError(error.message); showToast(error.message);
      } finally {
        document.getElementById('recommend-progress')?.remove();
        generating = false; button.disabled = false; button.textContent = label;
        controls.forEach(field => { field.disabled = false; });
        recommendationBox.setAttribute('aria-busy', 'false');
      }
    };
    copyButton.addEventListener('click', async () => { try { await navigator.clipboard.writeText(urlInput.value); } catch { urlInput.select(); document.execCommand('copy'); } showToast(t('toast.copied')); });
    document.getElementById('copy-recommendation-button').addEventListener('click', async () => {
      if (!recommendationUrl.value) return;
      try { await navigator.clipboard.writeText(recommendationUrl.value); } catch { recommendationUrl.select(); document.execCommand('copy'); }
      showToast(t('admin.recShare.copied'));
    });
    document.getElementById('refresh-feedback-button').addEventListener('click', async (click) => {
      const button = click.currentTarget; button.disabled = true;
      try { updateSharing((await api(`/api/events/${eventId}`)).event); }
      catch (error) { document.getElementById('feedback-summary').textContent = error.message; }
      finally { button.disabled = false; }
    });
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const ageGroups = [...document.querySelectorAll('.event-form input[type="checkbox"]:checked')].map((input) => input.value);
      try {
        const { event: created } = await api('/api/events', { method: 'POST', body: JSON.stringify({ occasion: document.getElementById('occasion').value, city: document.getElementById('city').value, guestRange: document.querySelector('input[name="guests"]:checked').value, ageGroups, note: document.getElementById('note').value, language: lang }) });
        eventId = created.id; storage.set('thooq-admin-event', eventId); render(created); showToast(t('admin.created'));
      } catch (error) { showToast(error.message); }
    });
    document.getElementById('recommend-button').addEventListener('click', generate);
    (params.get('demo') === 'new' ? startDemo() : load()).catch((error) => { showRecommendationError(error.message); showToast(error.message); });
    return;
  }

  const quiz = document.getElementById('quiz');
  if (!quiz) return;
  let current = 1;
  const questions = [...document.querySelectorAll('.question')];
  const dots = [...document.querySelectorAll('.progress i')];
  const previous = document.getElementById('previous');
  const next = document.getElementById('next');
  const show = () => {
    questions.forEach(q => q.classList.toggle('active', Number(q.dataset.step) === current));
    dots.forEach((dot, index) => dot.classList.toggle('active', index < current));
    previous.style.visibility = current === 1 ? 'hidden' : 'visible';
    next.innerHTML = current === 3 ? t('guest.submit') : t('guest.next');
  };
  const valid = () => [...questions.find(q => Number(q.dataset.step) === current).querySelectorAll('input')].every(input => input.value.trim());
  const eventId = new URLSearchParams(window.location.search).get('event') || 'lamma-weekend';
  api(`/api/events/${eventId}`).then(({ event }) => {
    document.getElementById('event-note').innerHTML = `<b>${escapeHtml(t('guest.invite', { occasion: event.occasion, city: event.city }))}</b>${escapeHtml(t('guest.note.text'))}`;
  }).catch((error) => { document.getElementById('event-note').textContent = error.message; });
  next.addEventListener('click', async () => {
    if (!valid()) { alert(t('guest.needThree')); return; }
    if (current < 3) { current++; show(); return; }
    const name = document.getElementById('guest-name').value.trim();
    if (!name) { alert(t('guest.needName')); return; }
    const answers = questions.map(q => [...q.querySelectorAll('input')].map(i => i.value.trim()));
    next.disabled = true; next.textContent = t('guest.sending');
    try {
      await api(`/api/events/${eventId}/answers`, { method: 'POST', body: JSON.stringify({ name, answers }) });
      quiz.style.display = 'none'; document.getElementById('intro').style.display = 'none'; document.getElementById('success').style.display = 'block';
    } catch (error) { alert(error.message); next.disabled = false; show(); }
  });
  previous.addEventListener('click', () => { if (current > 1) { current--; show(); } });
  show();
})();
