/**
 * AWAL GLOBAL CONSULTS — STORAGE ENGINE
 * ======================================
 * Handles save/resume via localStorage.
 * Drop-in replacement for API backend later.
 */

window.AGC_Storage = (function () {

  const PREFIX    = 'agc_kyc_';
  const ID_KEY    = PREFIX + 'resume_id';
  const CHARS     = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const YEAR      = new Date().getFullYear();

  // ── Generate a unique resume ID ──────────────────────────────────────
  function generateId() {
    let suffix = '';
    for (let i = 0; i < 4; i++) suffix += CHARS[Math.floor(Math.random() * CHARS.length)];
    return `AGC-${YEAR}-${suffix}`;
  }

  // ── Get or create resume ID ──────────────────────────────────────────
  function getOrCreateId() {
    let id = localStorage.getItem(ID_KEY);
    if (!id) {
      id = generateId();
      localStorage.setItem(ID_KEY, id);
    }
    return id;
  }

  // ── Save form state ──────────────────────────────────────────────────
  function save(state) {
    const id = getOrCreateId();
    const payload = {
      id,
      savedAt: new Date().toISOString(),
      version: 1,
      ...state
    };
    try {
      localStorage.setItem(PREFIX + id, JSON.stringify(payload));
      return id;
    } catch (e) {
      console.warn('AGC Storage: save failed', e);
      return null;
    }
  }

  // ── Load form state by ID ────────────────────────────────────────────
  function load(id) {
    try {
      const raw = localStorage.getItem(PREFIX + id.trim().toUpperCase());
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      console.warn('AGC Storage: load failed', e);
      return null;
    }
  }

  // ── Clear on successful submit ───────────────────────────────────────
  function clear() {
    const id = localStorage.getItem(ID_KEY);
    if (id) localStorage.removeItem(PREFIX + id);
    localStorage.removeItem(ID_KEY);
  }

  // ── Check if a saved session exists ─────────────────────────────────
  function hasSaved() {
    const id = localStorage.getItem(ID_KEY);
    return id ? !!localStorage.getItem(PREFIX + id) : false;
  }

  function getCurrentId() {
    return localStorage.getItem(ID_KEY);
  }

  return { save, load, clear, hasSaved, getCurrentId, getOrCreateId, generateId };

})();