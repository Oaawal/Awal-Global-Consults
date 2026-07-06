/**
 * AWAL GLOBAL CONSULTS — VALIDATOR ENGINE
 * =========================================
 * Field-level and form-level validation helpers.
 * Each service module defines its own validation rules
 * using these primitives.
 */

window.AGC_Validator = (function () {

  // ── Mark a field as errored ──────────────────────────────────────────
  function setError(el, wrapEl, message) {
    el.classList.add('agc-err');
    if (wrapEl) {
      wrapEl.classList.add('has-err');
      const msg = wrapEl.querySelector('.agc-err-msg');
      if (msg && message) msg.textContent = message;
    }
  }

  function clearError(el, wrapEl) {
    el.classList.remove('agc-err');
    if (wrapEl) wrapEl.classList.remove('has-err');
  }

  // ── Required text/select/textarea ───────────────────────────────────
  function required(id, wrapId, message) {
    const el   = document.getElementById(id);
    const wrap = document.getElementById(wrapId || ('fw-' + id));
    if (!el) return true;
    const ok = el.value.trim() !== '';
    ok ? clearError(el, wrap) : setError(el, wrap, message || 'This field is required');
    return ok;
  }

  // ── Required file upload ─────────────────────────────────────────────
  function requiredFile(id, wrapId, message) {
    const el   = document.getElementById(id);
    const wrap = document.getElementById(wrapId || ('fw-' + id));
    if (!el) return true;
    const ok = el.files && el.files.length > 0;
    ok ? clearError(el, wrap) : setError(el, wrap, message || 'Please upload this document');
    return ok;
  }

  // ── NIN — exactly 11 digits ──────────────────────────────────────────
  function nin(id, wrapId) {
    const el   = document.getElementById(id);
    const wrap = document.getElementById(wrapId || ('fw-' + id));
    if (!el) return true;
    const ok = /^\d{11}$/.test(el.value.trim());
    ok ? clearError(el, wrap) : setError(el, wrap, 'NIN must be exactly 11 digits');
    return ok;
  }

  // ── Nigerian phone number ────────────────────────────────────────────
  function phone(id, wrapId) {
    const el   = document.getElementById(id);
    const wrap = document.getElementById(wrapId || ('fw-' + id));
    if (!el) return true;
    const val = el.value.trim().replace(/\s/g, '');
    const ok  = /^(\+234|0)[789]\d{9}$/.test(val);
    ok ? clearError(el, wrap) : setError(el, wrap, 'Enter a valid Nigerian phone number');
    return ok;
  }

  // ── Email ────────────────────────────────────────────────────────────
  function email(id, wrapId) {
    const el   = document.getElementById(id);
    const wrap = document.getElementById(wrapId || ('fw-' + id));
    if (!el) return true;
    const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(el.value.trim());
    ok ? clearError(el, wrap) : setError(el, wrap, 'Enter a valid email address');
    return ok;
  }

  // ── Run multiple checks, return true if all pass ─────────────────────
  function all(...checks) {
    return checks.reduce((acc, fn) => fn() && acc, true);
  }

  // ── Validate all required fields in a container ──────────────────────
  function validateContainer(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return true;
    let ok = true;
    container.querySelectorAll('[data-required]').forEach(el => {
      const wrapId = el.dataset.wrap;
      const wrap   = wrapId ? document.getElementById(wrapId) : el.closest('.agc-field');
      const val    = el.type === 'file'
        ? (el.files && el.files.length > 0)
        : el.value.trim() !== '';
      if (!val) { setError(el, wrap); ok = false; }
      else       { clearError(el, wrap); }
    });
    return ok;
  }

  return { required, requiredFile, nin, phone, email, all, validateContainer, setError, clearError };

})();