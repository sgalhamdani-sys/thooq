(function () {
  const toast = document.getElementById('toast');
  const copyButton = document.getElementById('copy-button');
  const urlInput = document.getElementById('share-url');
  if (urlInput) {
    urlInput.value = new URL('guest.html?event=lamma-weekend', window.location.href).href;
  }
  if (copyButton) copyButton.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(urlInput.value); } catch { urlInput.select(); document.execCommand('copy'); }
    toast.classList.add('show'); setTimeout(() => toast.classList.remove('show'), 2200);
  });
  const form = document.getElementById('event-form');
  if (form) form.addEventListener('submit', (event) => {
    event.preventDefault();
    localStorage.setItem('thooq-event', JSON.stringify({ city: document.getElementById('city').value, occasion: document.getElementById('occasion').value }));
    toast.textContent = 'تم حفظ تفاصيل عزيمتك'; toast.classList.add('show'); setTimeout(() => toast.classList.remove('show'), 2200);
  });
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
    next.innerHTML = current === 3 ? 'إرسال إجاباتي <span>←</span>' : 'التالي <span>←</span>';
  };
  const valid = () => [...questions.find(q => Number(q.dataset.step) === current).querySelectorAll('input')].every(input => input.value.trim());
  next.addEventListener('click', () => {
    if (!valid()) { alert('أضيفي ثلاث مفضلات حتى نفهم ذوقك أكثر.'); return; }
    if (current < 3) { current++; show(); return; }
    const answers = questions.map(q => [...q.querySelectorAll('input')].map(i => i.value.trim()));
    localStorage.setItem('thooq-guest-answer', JSON.stringify(answers));
    quiz.style.display = 'none'; document.getElementById('intro').style.display = 'none'; document.getElementById('success').style.display = 'block';
  });
  previous.addEventListener('click', () => { if (current > 1) { current--; show(); } });
  show();
})();
