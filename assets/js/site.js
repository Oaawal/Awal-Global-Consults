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
      'background:#0A2C48;color:#F4F8FC;border-radius:14px;padding:16px 18px;box-shadow:0 20px 50px rgba(10,44,72,.35);' +
      'font:14px/1.5 "DM Sans",Arial,sans-serif;}' +
      '#agc-consent p{margin:0 0 12px;}' +
      '#agc-consent a{color:#B7D9FA;text-decoration:underline;}' +
      '#agc-consent .agc-consent-actions{display:flex;gap:10px;flex-wrap:wrap;}' +
      '#agc-consent button{flex:1 1 120px;min-height:44px;border-radius:10px;font:600 14px "DM Sans",Arial,sans-serif;cursor:pointer;}' +
      '#agc-consent .agc-accept{background:#2F80ED;color:#fff;border:0;}' +
      '#agc-consent .agc-decline{background:transparent;color:#F4F8FC;border:1px solid rgba(255,255,255,.4);}';
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

    box.querySelector('.agc-accept').addEventListener('click', function () { saveConsent('granted'); box.remove(); });
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
            say(j.already ? 'You\u2019re already subscribed. Thank you!' : 'Almost done: check your inbox and tap the link to confirm.', 'ok');
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

  // ── 3. Cloudflare Turnstile (off until a site key is set) ───────
  if (TURNSTILE_SITE_KEY) {
    const forms = document.querySelectorAll('form.form-grid, form#kyc-form, form[data-turnstile]');
    if (forms.length) {
      forms.forEach(function (form) {
        if (form.querySelector('.cf-turnstile')) return;
        const widget = document.createElement('div');
        widget.className = 'cf-turnstile';
        widget.setAttribute('data-sitekey', TURNSTILE_SITE_KEY);
        widget.style.margin = '12px 0';
        const anchor = form.querySelector('#decl-error') || form.querySelector('.form-actions') || form.querySelector('button[type="submit"]');
        if (anchor) anchor.insertAdjacentElement('beforebegin', widget);
        else form.appendChild(widget);
      });
      const s = document.createElement('script');
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
      s.async = true;
      s.defer = true;
      document.head.appendChild(s);
    }
  }
})();
