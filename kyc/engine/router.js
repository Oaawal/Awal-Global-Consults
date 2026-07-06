/**
 * AWAL GLOBAL CONSULTS — ROUTER ENGINE
 * ======================================
 * Controls screen flow, state, progress bar,
 * person management, tier selection, and submission.
 */

window.AGC_Router = (function () {

  // ── State ────────────────────────────────────────────────────────────
  const state = {
    screen:          'welcome',   // current screen id
    selectedServices:[],          // array of service ids
    flow:            [],          // ordered array of screen ids
    currentIdx:      0,
    tiers:           {},          // serviceId -> tier index
    personCounts:    {},          // key -> count (e.g. 'ltd-director' -> 2)
    formData:        {},          // accumulated field values
    resumeId:        null
  };

  // ── All possible screens in base order ──────────────────────────────
  const BASE_SCREENS = ['welcome', 'services', 'personal'];
  const LAST_SCREENS = ['docs', 'payment', 'declaration'];

  // ── Screen registry (populated by modules calling register()) ───────
  const registry = {};

  function register(screenId, module) {
    registry[screenId] = module;
  }

  // ── Build the flow from selected services ───────────────────────────
  function buildFlow() {
    state.flow = [...BASE_SCREENS];

    // Add a screen for each selected service
    state.selectedServices.forEach(id => {
      if (registry[id]) state.flow.push(id);
    });

    state.flow.push(...LAST_SCREENS);
    buildProgressBar();
  }

  // ── Progress bar ─────────────────────────────────────────────────────
  const SCREEN_LABELS = {
    welcome: 'Welcome', services: 'Services', personal: 'Personal',
    docs: 'Documents', payment: 'Payment', declaration: 'Confirm',
    // Service labels pulled from AGC_SERVICES
  };

  function getLabel(id) {
    if (SCREEN_LABELS[id]) return SCREEN_LABELS[id];
    const svc = (window.AGC_SERVICES || []).find(s => s.id === id);
    return svc ? svc.name.split(' ')[0] : id;
  }

  function buildProgressBar() {
    const wrap = document.getElementById('agc-progress-steps');
    if (!wrap) return;

    // Only show service steps + fixed steps (exclude welcome)
    const visible = state.flow.filter(s => s !== 'welcome');
    wrap.innerHTML = visible.map((s, i) => `
      <div class="agc-p-step" id="pdot-${s}">
        <div class="agc-p-dot">${i + 1}</div>
        <div class="agc-p-label">${getLabel(s)}</div>
      </div>
    `).join('');
  }

  function updateProgress() {
    const visible = state.flow.filter(s => s !== 'welcome');
    visible.forEach((s, i) => {
      const dot = document.getElementById('pdot-' + s);
      if (!dot) return;
      dot.classList.remove('active', 'done');
      const dotEl = dot.querySelector('.agc-p-dot');
      if (i < state.currentIdx - 1) {
        dot.classList.add('done');
        if (dotEl) dotEl.textContent = '✓';
      } else if (s === state.screen) {
        dot.classList.add('active');
        if (dotEl) dotEl.textContent = i + 1;
      } else {
        if (dotEl) dotEl.textContent = i + 1;
      }
    });
  }

  // ── Show a screen ────────────────────────────────────────────────────
  function showScreen(screenId) {
    // Hide all screens
    document.querySelectorAll('.agc-screen').forEach(el => el.classList.remove('active'));

    // Show progress bar only after welcome
    const progWrap = document.getElementById('agc-progress-wrap');
    if (progWrap) progWrap.style.display = screenId === 'welcome' ? 'none' : 'block';

    // Render screen if module has a render function
    const mod = registry[screenId];
    const container = document.getElementById('screen-' + screenId);

    if (container) {
      if (mod && typeof mod.render === 'function') {
        container.innerHTML = mod.render(state);
        // Bind file inputs
        AGC_Renderer.bindAllFileInputs('screen-' + screenId);
        // Call onMount if defined
        if (typeof mod.onMount === 'function') mod.onMount(state);
      }
      container.classList.add('active');
    }

    state.screen = screenId;
    state.currentIdx = state.flow.indexOf(screenId);
    updateProgress();
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Auto-save on every screen change
    if (screenId !== 'welcome') autoSave();
  }

  // ── Navigate forward ─────────────────────────────────────────────────
  function next() {
    const mod = registry[state.screen];

    // Validate current screen
    if (mod && typeof mod.validate === 'function') {
      if (!mod.validate(state)) return;
    }

    // Collect form data from current screen
    collectData();

    const idx = state.flow.indexOf(state.screen);
    if (idx < state.flow.length - 1) {
      showScreen(state.flow[idx + 1]);
    }
  }

  // ── Navigate back ────────────────────────────────────────────────────
  function back() {
    collectData();
    const idx = state.flow.indexOf(state.screen);
    if (idx > 0) showScreen(state.flow[idx - 1]);
  }

  // ── Collect all form data from visible inputs ────────────────────────
  function collectData() {
    const container = document.getElementById('screen-' + state.screen);
    if (!container) return;

    container.querySelectorAll('input:not([type="file"]):not([type="checkbox"]):not([type="radio"]), select, textarea').forEach(el => {
      if (el.name) state.formData[el.name] = el.value;
    });

    container.querySelectorAll('input[type="radio"]:checked').forEach(el => {
      if (el.name) state.formData['radio_' + el.name] = el.value;
    });

    container.querySelectorAll('input[type="checkbox"]').forEach(el => {
      if (el.name) state.formData[el.name + '_' + el.value] = el.checked;
    });
  }

  // ── Service selection ────────────────────────────────────────────────
  function setServices(ids) {
    state.selectedServices = ids;
    buildFlow();
  }

  // ── Tier selection ───────────────────────────────────────────────────
  function selectTier(serviceId, index, chipEl) {
    state.tiers[serviceId] = index;
    const grid = document.getElementById('tier-grid-' + serviceId);
    if (grid) {
      grid.querySelectorAll('.agc-tier-card').forEach((c, i) => {
        c.classList.toggle('selected', i === index);
        const radio = c.querySelector('input[type="radio"]');
        if (radio) radio.checked = (i === index);
      });
    }
  }

  // ── Person management ────────────────────────────────────────────────
  function getPersonCount(key) {
    return state.personCounts[key] || 1;
  }

  function addPerson(key, renderFn, containerId) {
    const count = (state.personCounts[key] || 1) + 1;
    state.personCounts[key] = count;
    const container = document.getElementById(containerId);
    if (!container) return;
    const div = document.createElement('div');
    div.innerHTML = renderFn(count - 1);
    container.insertBefore(div.firstElementChild, container.lastElementChild);
    AGC_Renderer.bindAllFileInputs(containerId);
  }

  function removePerson(key, index) {
    const block = document.getElementById(`person-block-${key}-${index}`);
    if (block) block.remove();
    if (state.personCounts[key] > 1) state.personCounts[key]--;
  }

  // ── Save progress ─────────────────────────────────────────────────────
  function saveProgress() {
    collectData();
    const payload = {
      selectedServices: state.selectedServices,
      flow:             state.flow,
      currentIdx:       state.currentIdx,
      screen:           state.screen,
      tiers:            state.tiers,
      personCounts:     state.personCounts,
      formData:         state.formData
    };
    const id = AGC_Storage.save(payload);
    state.resumeId = id;

    // Update save bar
    const badge = document.getElementById('save-bar-id');
    if (badge) { badge.textContent = id; badge.style.display = 'inline-block'; }

    // Update hidden form field
    const hiddenId = document.getElementById('h-resume-id');
    if (hiddenId) hiddenId.value = id;

    AGC_Renderer.toast(`✓ Saved — Resume ID: ${id}`);
  }

  // ── Auto-save silently ───────────────────────────────────────────────
  function autoSave() {
    if (!AGC_Storage.getCurrentId()) return;
    collectData();
    AGC_Storage.save({
      selectedServices: state.selectedServices,
      flow:             state.flow,
      currentIdx:       state.currentIdx,
      screen:           state.screen,
      tiers:            state.tiers,
      personCounts:     state.personCounts,
      formData:         state.formData
    });
  }

  // ── Resume from saved state ──────────────────────────────────────────
  function resume(id) {
    const saved = AGC_Storage.load(id);
    if (!saved) return false;

    state.selectedServices = saved.selectedServices || [];
    state.flow             = saved.flow             || [];
    state.currentIdx       = saved.currentIdx       || 0;
    state.tiers            = saved.tiers            || {};
    state.personCounts     = saved.personCounts     || {};
    state.formData         = saved.formData         || {};
    state.resumeId         = id;

    buildProgressBar();
    showScreen(saved.screen || 'services');

    // Restore field values after render
    setTimeout(() => restoreData(), 100);

    return true;
  }

  function restoreData() {
    Object.entries(state.formData).forEach(([key, val]) => {
      if (key.startsWith('radio_')) {
        const name = key.replace('radio_', '');
        const radio = document.querySelector(`input[name="${name}"][value="${val}"]`);
        if (radio) radio.checked = true;
        return;
      }
      const el = document.querySelector(`[name="${key}"]`);
      if (el && el.type !== 'file') el.value = val;
    });

    // Re-check service checkboxes
    state.selectedServices.forEach(id => {
      const cb = document.querySelector(`input[name="svc"][value="${id}"]`);
      if (cb) { cb.checked = true; cb.closest('.agc-svc-card')?.classList.add('selected'); }
    });
  }

  // ── Step counter helper ──────────────────────────────────────────────
  function stepInfo() {
    const visible = state.flow.filter(s => s !== 'welcome');
    const idx     = visible.indexOf(state.screen);
    return { step: idx + 1, total: visible.length };
  }

  // ── Submit ───────────────────────────────────────────────────────────
  function submit() {
    collectData();

    // Build hidden fields and submit
    const form = document.getElementById('agc-hidden-form');
    if (!form) return;

    // Clear old hidden fields
    form.querySelectorAll('.agc-dynamic-field').forEach(el => el.remove());

    // Add all collected data
    Object.entries(state.formData).forEach(([key, val]) => {
      const input = document.createElement('input');
      input.type  = 'hidden';
      input.name  = key;
      input.value = val;
      input.className = 'agc-dynamic-field';
      form.appendChild(input);
    });

    // Add services and total
    const svcs = document.createElement('input');
    svcs.type = 'hidden'; svcs.name = 'Services_Requested';
    svcs.value = state.selectedServices.map(id => {
      const svc = (window.AGC_SERVICES || []).find(s => s.id === id);
      return svc ? svc.name : id;
    }).join(', ');
    svcs.className = 'agc-dynamic-field';
    form.appendChild(svcs);

    // Add resume ID
    const resumeInput = document.createElement('input');
    resumeInput.type = 'hidden'; resumeInput.name = 'Resume_ID';
    resumeInput.value = state.resumeId || AGC_Storage.getCurrentId() || '';
    resumeInput.className = 'agc-dynamic-field';
    form.appendChild(resumeInput);

    // Show success screen
    showScreen('success');

    // Clear saved state
    AGC_Storage.clear();

    // Submit form
    form.submit();
  }

  // ── Init ─────────────────────────────────────────────────────────────
  function init() {
    // Hide progress bar initially
    const progWrap = document.getElementById('agc-progress-wrap');
    if (progWrap) progWrap.style.display = 'none';

    // Check for saved session
    if (AGC_Storage.hasSaved()) {
      showScreen('resume');
    } else {
      showScreen('welcome');
    }
  }

  return {
    register,
    showScreen,
    next,
    back,
    setServices,
    selectTier,
    addPerson,
    removePerson,
    saveProgress,
    resume,
    submit,
    init,
    stepInfo,
    collectData,
    getPersonCount,
    getState: () => state
  };

})();