/**
 * Intercepts the site's contact forms (class="form-grid") and submits them
 * to the /submit-contact Cloudflare Pages Function instead of a third-party
 * form service. Redirects to /thank-you.html on success.
 */
(function () {
  const form = document.querySelector('form.form-grid');
  if (!form) return;

  let msg = document.getElementById('agc-form-msg');
  if (!msg) {
    msg = document.createElement('div');
    msg.id = 'agc-form-msg';
    msg.style.display = 'none';
    const actions = form.querySelector('.form-actions');
    if (actions) actions.insertAdjacentElement('beforebegin', msg);
    else form.appendChild(msg);
  }

  form.addEventListener('submit', async function (e) {
    e.preventDefault();

    const btn = form.querySelector('button[type="submit"]');
    const originalText = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
    msg.style.display = 'none';

    try {
      const fd = new FormData(form);
      const res = await fetch('/submit-contact', { method: 'POST', body: fd });
      if (!res.ok) throw new Error('Request failed');
      window.location.href = '/thank-you.html';
    } catch (err) {
      msg.textContent = 'Something went wrong sending your message. Please try again, or reach us directly on WhatsApp.';
      msg.style.cssText = 'display:block;color:#c0392b;background:#fdf0f0;border:1px solid #e8c0c0;border-radius:6px;padding:10px 14px;margin:12px 0;font-size:13px;';
      if (btn) { btn.disabled = false; btn.textContent = originalText; }
    }
  });
})();
