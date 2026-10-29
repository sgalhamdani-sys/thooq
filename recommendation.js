(function () {
  const { t, lang, number } = window.Thooq;
  const token = new URLSearchParams(window.location.search).get('share');
  const buttons = [...document.querySelectorAll('[data-rating]')];
  const status = document.getElementById('rating-status');
  const ratingError = document.getElementById('rating-error');
  let submitting = false;
  const ratingLabel = rating => t(rating === 'good' ? 'shared.good' : 'shared.bad');
  const api = async (suffix = '', options = {}) => {
    const response = await fetch(`/api/shared/${encodeURIComponent(token)}${suffix}`, { credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-Thooq-Lang': lang }, ...options });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || t('shared.requestError'));
    return payload.recommendation;
  };
  const renderRating = recommendation => {
    buttons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.rating === recommendation.myRating)));
    const { good, bad, total } = recommendation.feedback;
    document.getElementById('rating-totals').textContent = total ? t('shared.totals', { good: number(good), bad: number(bad) }) : t('shared.first');
    status.textContent = recommendation.myRating ? t('shared.current', { rating: ratingLabel(recommendation.myRating) }) : t('shared.pick');
  };
  const load = async () => {
    if (!/^[a-f0-9]{48}$/.test(token || '')) throw new Error(t('shared.incomplete'));
    const recommendation = await api();
    document.getElementById('shared-event').textContent = `${recommendation.occasion} · ${recommendation.city}`;
    document.getElementById('shared-title').textContent = recommendation.title;
    document.getElementById('shared-summary').textContent = recommendation.summary;
    document.getElementById('shared-reason').textContent = recommendation.reason;
    // Plan text keeps the direction of the language it was written in.
    const textDir = recommendation.language === 'en' ? 'ltr' : recommendation.language === 'ar' ? 'rtl' : 'auto';
    ['shared-title', 'shared-summary', 'shared-reason'].forEach(id => { document.getElementById(id).dir = textDir; });
    // Shared view: fit counts and connecting favourites, never guest names.
    document.getElementById('shared-places').innerHTML = window.ThooqPlan.renderPlan(recommendation);
    renderRating(recommendation);
    document.getElementById('shared-recommendation').hidden = false;
    document.getElementById('feedback-card').hidden = false;
  };
  buttons.forEach(button => button.addEventListener('click', async () => {
    if (submitting) return;
    submitting = true; buttons.forEach(item => { item.disabled = true; });
    ratingError.hidden = true; status.textContent = t('shared.saving');
    try {
      const recommendation = await api('/feedback', { method: 'POST', body: JSON.stringify({ rating: button.dataset.rating }) });
      renderRating(recommendation);
      status.textContent = t('shared.saved', { rating: ratingLabel(recommendation.myRating) });
    } catch (error) { status.textContent = ''; ratingError.textContent = error.message; ratingError.hidden = false; }
    finally { submitting = false; buttons.forEach(item => { item.disabled = false; }); }
  }));
  load().catch(error => {
    document.getElementById('shared-event').textContent = t('shared.loadError');
    const message = document.getElementById('shared-error'); message.textContent = error.message; message.hidden = false;
  });
})();
