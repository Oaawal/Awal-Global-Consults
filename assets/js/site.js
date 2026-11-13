/**
 * Site-wide behaviour, loaded on every page:
 *  1. Cookie consent banner — Google Analytics stays in "denied" consent mode
 *     (no analytics cookies) until the visitor accepts. The choice is stored
 *     in localStorage under "agc_consent" and read by the gtag snippet in <head>.
 *  2. Lead tracking — sends GA4 events when someone taps WhatsApp, phone or email.
 *     Form submissions send "generate_lead" from contact-submit.js and the KYC page.
 *  3. Cloudflare Turnstile (optional bot check) on the contact and KYC forms.
 *     Off until TURNSTILE_SITE_KEY below is filled in. When you fill it in, also add
 *     TURNSTILE_SECRET_KEY in Cloudflare Pages → Settings → Environment variables.
 */
(function () {
  const CONSENT_KEY = 'agc_consent';
  const TURNSTILE_SITE_KEY = '0x4AAAAAAFuEnG2UvobeO6uN';
  // Site root, worked out from this script's own URL so links work at any page depth
  const SITE_ROOT = (document.currentScript && document.currentScript.src || '/assets/js/site.js').replace(/assets\/js\/site\.js.*$/, '');

  function track(name, params) {
    if (typeof window.gtag === 'function') window.gtag('event', name, params || {});
  }
  window.agcTrack = track;

  // Where this visit came from (shown on the case in the dashboard, so paying clients can be
  // traced to a channel). Kept for this browser session only, and only with analytics consent.
  function noteSource() {
    try {
      if (localStorage.getItem(CONSENT_KEY) !== 'granted' || sessionStorage.getItem('agc_src')) return;
      const q = new URLSearchParams(location.search);
      let ref = '';
      try { const h = document.referrer ? new URL(document.referrer).hostname.replace(/^www\./, '') : ''; if (h && h !== location.hostname.replace(/^www\./, '')) ref = h; } catch (e) {}
      const parts = [];
      if (q.get('utm_source')) parts.push('campaign: ' + [q.get('utm_source'), q.get('utm_medium'), q.get('utm_campaign')].filter(Boolean).join(' / '));
      if (q.get('gclid')) parts.push('Google Ads');
      if (q.get('fbclid')) parts.push('Facebook/Instagram link');
      if (ref) parts.push('from ' + ref);
      parts.push('landed on ' + location.pathname);
      sessionStorage.setItem('agc_src', parts.join('; ').slice(0, 200));
    } catch (e) { /* storage unavailable */ }
  }
  noteSource();

  // ── 1. Cookie consent ────────────────────────────────────────────
  function readConsent() {
    try { return localStorage.getItem(CONSENT_KEY); } catch (e) { return null; }
  }

  function saveConsent(value) {
    try { localStorage.setItem(CONSENT_KEY, value); } catch (e) {}
    if (typeof window.gtag === 'function') {
      window.gtag('consent', 'update', { analytics_storage: value === 'granted' ? 'granted' : 'denied' });
    }
  }

  function privacyHref() {
    return SITE_ROOT + 'privacy-policy.html#cookies-and-analytics';
  }

  function showBanner() {
    if (document.getElementById('agc-consent')) return;

    const style = document.createElement('style');
    style.textContent =
      '#agc-consent{position:fixed;left:16px;right:16px;bottom:16px;z-index:10000;max-width:560px;margin:0 auto;' +
      'background:#0A2C48;color:#F6F1E7;border-radius:14px;padding:16px 18px;box-shadow:0 20px 50px rgba(10,44,72,.35);' +
      'font:14px/1.5 "DM Sans",Arial,sans-serif;}' +
      '#agc-consent p{margin:0 0 12px;}' +
      '#agc-consent a{color:#E9DCBF;text-decoration:underline;}' +
      '#agc-consent .agc-consent-actions{display:flex;gap:10px;flex-wrap:wrap;}' +
      '#agc-consent button{flex:1 1 120px;min-height:44px;border-radius:10px;font:600 14px "DM Sans",Arial,sans-serif;cursor:pointer;}' +
      '#agc-consent .agc-accept{background:#D4A72C;color:#0A2C48;border:0;}' +
      '#agc-consent .agc-decline{background:transparent;color:#F6F1E7;border:1px solid rgba(255,255,255,.4);}';
    document.head.appendChild(style);

    const box = document.createElement('div');
    box.id = 'agc-consent';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', 'Cookie preferences');
    box.innerHTML =
      '<p>We use Google Analytics cookies to see which pages help visitors, so we can improve our services. ' +
      'No analytics cookies are set unless you accept. <a href="' + privacyHref() + '">Privacy policy</a></p>' +
      '<div class="agc-consent-actions">' +
      '<button type="button" class="agc-decline">Decline</button>' +
      '<button type="button" class="agc-accept">Accept</button>' +
      '</div>';
    document.body.appendChild(box);

    box.querySelector('.agc-accept').addEventListener('click', function () { saveConsent('granted'); box.remove(); noteSource(); });
    box.querySelector('.agc-decline').addEventListener('click', function () { saveConsent('denied'); box.remove(); });
  }

  // Any link or button with data-cookie-settings reopens the banner
  window.agcCookieSettings = showBanner;
  document.addEventListener('click', function (e) {
    const opener = e.target.closest && e.target.closest('[data-cookie-settings]');
    if (opener) { e.preventDefault(); showBanner(); }
  });

  if (!readConsent()) showBanner();

  // ── 2. Lead tracking for WhatsApp / phone / email taps ──────────
  document.addEventListener('click', function (e) {
    const link = e.target.closest && e.target.closest('a[href]');
    if (!link) return;
    const href = link.getAttribute('href') || '';
    let method = '';
    if (/wa\.me|whatsapp\.com/i.test(href)) method = 'whatsapp';
    else if (/^tel:/i.test(href)) method = 'phone';
    else if (/^mailto:/i.test(href)) method = 'email';
    if (!method) return;
    track('contact_click', { method: method, page_path: location.pathname, link_text: (link.textContent || '').trim().slice(0, 60) });
  });

  // ── 4. Newsletter sign-up (any form.subscribe-form) ─────────────
  document.querySelectorAll('form.subscribe-form').forEach(function (form) {
    const msg = form.querySelector('.subscribe-msg');
    const button = form.querySelector('button[type="submit"]');
    function say(text, kind) { if (msg) { msg.textContent = text; msg.className = 'subscribe-msg' + (kind ? ' ' + kind : ''); } }
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      const email = form.querySelector('input[name="email"]');
      const consent = form.querySelector('input[name="consent"]');
      if (!email.value || !email.checkValidity()) { say('Please enter a valid email address.', 'err'); email.focus(); return; }
      if (consent && !consent.checked) { say('Please tick the box to agree to receive updates.', 'err'); return; }
      const data = new FormData(form);
      data.append('source', location.pathname);
      button.disabled = true;
      fetch('/subscribe', { method: 'POST', body: data })
        .then(function (r) { return r.json(); })
        .then(function (j) {
          if (j.ok) {
            if (j.already && j.download) {
              msg.innerHTML = 'You\u2019re already subscribed. <a href="' + j.download + '">Download the PDF</a>';
              msg.className = 'subscribe-msg ok';
            } else {
              say(j.already ? 'You\u2019re already subscribed. Thank you!'
                : j.magnet ? 'Almost done: check your inbox and tap the link to confirm and download.'
                : 'Almost done: check your inbox and tap the link to confirm.', 'ok');
            }
            form.reset();
            track('newsletter_signup', { page_path: location.pathname });
          } else {
            say(j.error || 'Something went wrong. Please try again.', 'err');
          }
        })
        .catch(function () { say('We couldn\u2019t reach the server. Please try again.', 'err'); })
        .finally(function () { button.disabled = false; });
    });
  });

  // ── 4. Live email check on site forms (the application form has its own) ──
  document.querySelectorAll('form input[type="email"]').forEach(function (input) {
    if (input.closest('#kyc-form')) return;
    const note = document.createElement('span');
    note.className = 'email-check-note';
    note.setAttribute('role', 'status');
    input.insertAdjacentElement('afterend', note);
    let last = '';
    input.addEventListener('blur', function () {
      const v = input.value.trim();
      if (!v || v === last || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) { if (!v) note.textContent = ''; return; }
      last = v;
      fetch('/validate-email?email=' + encodeURIComponent(v)).then(function (r) { return r.json(); }).then(function (r) {
        if (input.value.trim() !== v) return;
        note.textContent = r.ok ? '' : (r.reason || 'Please check this email address.');
        if (r.suggestion) {
          const b = document.createElement('button');
          b.type = 'button'; b.textContent = 'Use ' + r.suggestion;
          b.addEventListener('click', function () { input.value = r.suggestion; note.textContent = ''; last = r.suggestion; });
          note.appendChild(document.createTextNode(' ')); note.appendChild(b);
        }
      }).catch(function () {});
    });
  });

  // ── 3. Cloudflare Turnstile (off until a site key is set) ───────
  // Rendered explicitly: widgets on visible forms render as soon as the script
  // loads; the application form's widget sits on its last step, so it renders
  // only when that step becomes visible (a widget rendered while hidden may never
  // produce a token).
  if (TURNSTILE_SITE_KEY) {
    const forms = document.querySelectorAll('form.form-grid, form#kyc-form, form[data-turnstile]');
    if (forms.length) {
      const pending = [];
      forms.forEach(function (form) {
        if (form.querySelector('.agc-turnstile')) return;
        const widget = document.createElement('div');
        widget.className = 'agc-turnstile';
        widget.style.margin = '12px 0';
        const anchor = form.querySelector('#decl-error') || form.querySelector('.form-actions') || form.querySelector('button[type="submit"]');
        if (anchor) anchor.insertAdjacentElement('beforebegin', widget);
        else form.appendChild(widget);
        pending.push(widget);
      });
      const isVisible = function (el) { return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length); };
      const render = function (el) {
        if (el.dataset.rendered || !window.turnstile || !isVisible(el)) return;
        el.dataset.rendered = '1';
        try {
          window.turnstile.render(el, { sitekey: TURNSTILE_SITE_KEY, 'refresh-expired': 'auto', 'retry': 'auto' });
        } catch (e) { delete el.dataset.rendered; }
      };
      window.agcRenderTurnstile = function () { pending.forEach(render); };
      window.agcTurnstileToken = function (form) {
        const el = form && form.querySelector('.agc-turnstile');
        if (!el || !window.turnstile || !el.dataset.rendered) return '';
        try { return window.turnstile.getResponse(el) || ''; } catch (e) { return ''; }
      };
      window.agcTurnstileOnload = function () {
        window.agcRenderTurnstile();
        // Render hidden widgets (the application form's last step) once they appear
        const obs = new MutationObserver(function () { window.agcRenderTurnstile(); });
        obs.observe(document.body, { attributes: true, subtree: true, attributeFilter: ['class', 'style'] });
      };
      const s = document.createElement('script');
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=agcTurnstileOnload';
      s.async = true;
      s.defer = true;
      document.head.appendChild(s);
    }
  }

  // Blog share buttons: the phone's own share sheet where available, plus copy link
  document.querySelectorAll('[data-share-native]').forEach(function (btn) {
    if (!navigator.share) return;
    btn.hidden = false;
    btn.addEventListener('click', function () {
      navigator.share({ title: btn.getAttribute('data-title') || document.title, url: btn.getAttribute('data-url') || location.href })
        .then(function () { track('share', { method: 'native', content_type: 'article' }); })
        .catch(function () {});
    });
  });
  document.querySelectorAll('[data-copy-link]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var url = btn.getAttribute('data-copy-link') || location.href;
      var label = btn.querySelector('span') || btn;
      var done = function () { label.textContent = 'Link copied'; setTimeout(function () { label.textContent = 'Copy link'; }, 2200); track('share', { method: 'copy_link', content_type: 'article' }); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, function () { window.prompt('Copy this link:', url); });
      else window.prompt('Copy this link:', url);
    });
  });
  document.querySelectorAll('.share-box a.share-btn').forEach(function (a) {
    a.addEventListener('click', function () { track('share', { method: (a.getAttribute('aria-label') || '').replace('Share on ', ''), content_type: 'article' }); });
  });
})();
