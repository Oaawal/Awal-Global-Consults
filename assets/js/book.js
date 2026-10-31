/* Booking page: loads free times for the chosen consultation type and submits the booking. */
(function () {
  const form = document.getElementById('book-form');
  if (!form) return;
  const daysEl = document.getElementById('book-days');
  const timesEl = document.getElementById('book-times');
  const slotInput = document.getElementById('book-slot');
  const msg = document.getElementById('book-msg');
  const summary = document.getElementById('book-summary');
  const submit = document.getElementById('book-submit');
  let data = null, activeDay = null;

  // ?type=paid-advisory preselects a consultation (used by links from service pages)
  const pre = new URLSearchParams(location.search).get('type');
  if (pre) { const r = form.querySelector('input[name="type"][value="' + pre + '"]'); if (r) r.checked = true; }

  const fmtDay = d => new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { timeZone: 'Africa/Lagos', weekday: 'short', day: 'numeric', month: 'short' });
  const fmtTime = iso => new Date(iso).toLocaleTimeString('en-GB', { timeZone: 'Africa/Lagos', hour: 'numeric', minute: '2-digit', hour12: true });
  const fmtFull = iso => new Date(iso).toLocaleString('en-GB', { timeZone: 'Africa/Lagos', weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit', hour12: true });
  const type = () => (form.querySelector('input[name="type"]:checked') || {}).value;

  function setMsg(text, kind) { msg.textContent = text || ''; msg.className = 'book-msg' + (kind ? ' ' + kind : ''); }

  function chip(label, sub, selected, onClick) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'book-chip'; b.setAttribute('role', 'option');
    b.setAttribute('aria-selected', selected ? 'true' : 'false');
    b.innerHTML = label + (sub ? '<small>' + sub + '</small>' : '');
    b.addEventListener('click', onClick);
    return b;
  }

  function renderDays() {
    daysEl.innerHTML = ''; timesEl.innerHTML = '';
    const days = Object.keys(data.days || {});
    if (!days.length) { daysEl.innerHTML = '<p class="book-muted">No times are free in the next three weeks. Please message us on WhatsApp.</p>'; return; }
    if (!activeDay || !data.days[activeDay]) activeDay = days[0];
    days.forEach(d => {
      const parts = fmtDay(d).split(' ');
      daysEl.appendChild(chip(parts.slice(1).join(' '), parts[0].replace(',', ''), d === activeDay, () => { activeDay = d; slotInput.value = ''; renderDays(); updateSummary(); }));
    });
    data.days[activeDay].forEach(iso => {
      timesEl.appendChild(chip(fmtTime(iso), '', slotInput.value === iso, () => { slotInput.value = iso; renderDays(); updateSummary(); }));
    });
  }

  function updateSummary() {
    if (!slotInput.value || !data) { summary.hidden = true; return; }
    summary.hidden = false;
    summary.textContent = fmtFull(slotInput.value) + ' (Lagos time) · ' + data.minutes + ' minutes · ' + data.fee;
  }

  function load() {
    slotInput.value = ''; updateSummary();
    daysEl.innerHTML = '<p class="book-muted">Loading available times…</p>'; timesEl.innerHTML = '';
    fetch('/book-slots?type=' + encodeURIComponent(type()))
      .then(r => r.json())
      .then(d => {
        if (d.error) throw new Error(d.error);
        data = d; renderDays();
        const fee = document.querySelector('[data-fee-for="' + d.type + '"]');
        if (fee) fee.textContent = d.fee;
      })
      .catch(() => { daysEl.innerHTML = '<p class="book-muted">We couldn’t load the calendar. Please refresh, or message us on WhatsApp.</p>'; });
  }

  form.querySelectorAll('input[name="type"]').forEach(r => r.addEventListener('change', () => { activeDay = null; load(); }));

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    setMsg('');
    if (!slotInput.value) { setMsg('Please pick a day and time.', 'err'); return; }
    if (!form.reportValidity()) return;
    submit.disabled = true; submit.textContent = 'Booking…';
    fetch('/book-consultation', { method: 'POST', body: new FormData(form) })
      .then(r => r.json().then(j => ({ status: r.status, j })))
      .then(({ status, j }) => {
        if (!j.ok) {
          // A Turnstile token works once; get a fresh one for the retry
          if (window.turnstile) { try { window.turnstile.reset(); } catch (e) { /* widget not ready */ } }
          setMsg(j.error || 'Something went wrong. Please try again.', 'err');
          if (j.refresh) load();
          return;
        }
        if (typeof gtag === 'function') gtag('event', 'generate_lead', { form: 'booking', consultation: type() });
        const payText = j.paid
          ? 'We\u2019ve reserved this time. We\u2019ll email you the exact fee for your matter (from \u20a620,000). Once confirmed, pay by bank transfer to <strong>' +
            (j.bank ? j.bank.bank + ', ' + j.bank.accountName + ', ' + j.bank.accountNumber : 'the account in your email') + '</strong>' +
            (j.reference ? ', using ' + j.reference + ' as the payment description' : '') + '. Your session is confirmed once payment is received.'
          : 'We\u2019ve emailed your confirmation, with a link to cancel if your plans change. We\u2019ll call you at the time you chose.';
        form.innerHTML = '<div class="book-step book-done"><h2>' + (j.paid ? 'Request received' : 'You\u2019re booked') + '</h2>' +
          '<p><strong>' + j.when + '</strong> (Lagos time)' + (j.reference ? ' · Reference ' + j.reference : '') + '</p>' +
          '<p>' + payText + '</p>' +
          '<p><a class="btn btn-secondary" href="/blog/">Read our guides while you wait</a></p></div>';
        window.scrollTo({ top: form.getBoundingClientRect().top + window.scrollY - 100, behavior: 'smooth' });
      })
      .catch(() => { if (window.turnstile) { try { window.turnstile.reset(); } catch (e) { /* widget not ready */ } } setMsg('We couldn’t reach the server. Please check your connection and try again.', 'err'); })
      .finally(() => { submit.disabled = false; submit.textContent = 'Book consultation'; });
  });

  load();
})();
