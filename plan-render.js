// Shared renderer for a ذَوق plan: used by the host dashboard and the shared recommendation page.
(function () {
  const { t, number, lang } = window.Thooq;
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
  const separator = lang === 'ar' ? '، ' : ', ';
  const mapUrl = place => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([place.name, place.address].filter(Boolean).join(' '))}`;

  // Host view has guest indices and names; the shared view only has counts and favourites.
  function fitOf(place, guestNames) {
    if (place.fit && Number.isInteger(place.fit.total)) {
      return {
        count: place.fit.count, total: place.fit.total,
        people: (place.fit.tastes || []).map(taste => ({ name: guestNames?.[taste.guest] || t('plan.guest', { n: number(taste.guest + 1) }), favourites: taste.favourites || [] }))
      };
    }
    if (Number.isInteger(place.fitTotal)) return { count: place.fitCount, total: place.fitTotal, favourites: place.fitTastes || [] };
    return null;
  }

  function fitBlock(fit) {
    if (!fit || !fit.total) return '';
    const share = Math.round((fit.count / fit.total) * 100);
    const label = fit.count === fit.total ? t('plan.fit.all', { total: number(fit.total) }) : t('plan.fit.some', { count: number(fit.count), total: number(fit.total) });
    const people = fit.people?.length
      ? `<ul class="fit-people">${fit.people.map(person => `<li><b>${escapeHtml(person.name)}</b>${person.favourites.length ? `<small>${person.favourites.map(escapeHtml).join(separator)}</small>` : ''}</li>`).join('')}</ul>`
      : fit.favourites?.length ? `<p class="fit-tastes">${escapeHtml(t('plan.connected', { tastes: fit.favourites.join(separator) }))}</p>` : '';
    return `<div class="fit" style="--fit:${share}%"><div class="fit-head"><span class="fit-label">${escapeHtml(label)}</span><span class="fit-meter" aria-hidden="true"><i></i></span></div>${people}</div>`;
  }

  function stopCard(place, index, guestNames) {
    return `<li class="plan-stop">
      <span class="stop-index" aria-hidden="true">${number(index + 1)}</span>
      <div class="stop-body">
        ${place.role ? `<p class="stop-role">${escapeHtml(place.role)}</p>` : ''}
        <h4>${escapeHtml(place.name)}</h4>
        <p class="stop-address">${place.address ? `${escapeHtml(place.address)} · ` : ''}<a href="${mapUrl(place)}" target="_blank" rel="noopener noreferrer">${escapeHtml(t('plan.map'))}</a></p>
        ${place.why ? `<p class="stop-why">${escapeHtml(place.why)}</p>` : ''}
        ${fitBlock(fitOf(place, guestNames))}
      </div>
    </li>`;
  }

  function alternativeRow(place, guestNames) {
    const fit = fitOf(place, guestNames);
    return `<li><a href="${mapUrl(place)}" target="_blank" rel="noopener noreferrer">${escapeHtml(place.name)}</a>${fit?.total ? `<span class="alt-fit">${escapeHtml(t('plan.fit.short', { count: number(fit.count), total: number(fit.total) }))}</span>` : ''}</li>`;
  }

  function renderPlan(recommendation, { guestNames = [], host = false } = {}) {
    const places = Array.isArray(recommendation?.places) ? recommendation.places : [];
    const stops = places.filter(place => place.stop || (!place.alternative && !places.some(item => item.stop)));
    const alternatives = places.filter(place => place.alternative);
    const considerations = Array.isArray(recommendation.considerations) ? recommendation.considerations : [];
    const steps = Array.isArray(recommendation.agentSteps) ? recommendation.agentSteps : [];
    const mode = recommendation.agent?.mode;
    const written = recommendation.language;
    const languageNote = written && written !== lang ? `<p class="plan-language">${escapeHtml(t(host ? 'plan.otherLanguage' : 'plan.otherLanguageShared'))}</p>` : '';
    const planDir = written === 'en' ? 'ltr' : written === 'ar' ? 'rtl' : 'auto';
    return `<div class="plan">
      ${languageNote}
      ${mode ? `<p class="agent-badge ${mode === 'agent' ? '' : 'is-fallback'}">${escapeHtml(t(mode === 'agent' ? 'plan.badge.agent' : 'plan.badge.fallback'))}</p>` : ''}
      <ol class="plan-stops" dir="${planDir}">${stops.map((place, index) => stopCard(place, index, guestNames)).join('')}</ol>
      ${considerations.length ? `<div class="considerations" dir="${planDir}"><p class="section-kicker">${escapeHtml(t('plan.beforeBooking'))}</p><ul>${considerations.map(note => `<li>${escapeHtml(note)}</li>`).join('')}</ul></div>` : ''}
      ${alternatives.length ? `<details class="plan-alternatives"><summary>${escapeHtml(t('plan.alternatives', { n: number(alternatives.length) }))}</summary><ul>${alternatives.map(place => alternativeRow(place, guestNames)).join('')}</ul></details>` : ''}
      ${steps.length ? `<details class="agent-steps"><summary>${escapeHtml(t('plan.steps'))}</summary><ol dir="${planDir}">${steps.map(step => `<li data-kind="${escapeHtml(step.kind)}">${escapeHtml(step.text)}</li>`).join('')}</ol></details>` : ''}
    </div>`;
  }

  window.ThooqPlan = { renderPlan, escapeHtml };
})();
