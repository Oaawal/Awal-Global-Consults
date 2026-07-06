/**
 * AWAL GLOBAL CONSULTS — RENDERER ENGINE
 * ========================================
 * Builds UI components dynamically.
 * Used by modules to render their fields without
 * repeating boilerplate HTML.
 */

window.AGC_Renderer = (function () {

  // ── Show toast notification ──────────────────────────────────────────
  function toast(message, duration = 3000) {
    const el = document.getElementById('agc-toast');
    if (!el) return;
    el.textContent = message;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), duration);
  }

  // ── Show/hide file name after upload ────────────────────────────────
  function bindFileLabel(inputId, labelId) {
    const input = document.getElementById(inputId);
    const label = document.getElementById(labelId);
    if (!input || !label) return;
    input.addEventListener('change', () => {
      if (input.files && input.files.length > 0) {
        label.textContent = '✓ ' + input.files[0].name;
        input.closest('.agc-upload-zone')?.classList.add('has-file');
      }
    });
  }

  // ── Build a requirements notice ──────────────────────────────────────
  function requirements(items) {
    return `
      <div class="agc-requirements">
        <div class="agc-requirements-title">
          <span>📋</span> Before you begin — have these ready
        </div>
        <ul>${items.map(i => `<li>${i}</li>`).join('')}</ul>
      </div>`;
  }

  // ── Build a field row ────────────────────────────────────────────────
  function fieldRow(fields, cols = 2) {
    const colClass = cols === 1 ? 'one' : cols === 3 ? 'three' : '';
    return `<div class="agc-field-row ${colClass}">${fields.join('')}</div>`;
  }

  // ── Build a text/email/tel/date/number input field ───────────────────
  function field({ id, label, type = 'text', name, placeholder = '', required = false, optional = false, hint = '', value = '', maxlength = '', pattern = '', wrapId = '' }) {
    const req    = required ? `<span class="agc-req">*</span>` : '';
    const opt    = optional ? `<span class="agc-opt">(optional)</span>` : '';
    const ml     = maxlength ? `maxlength="${maxlength}"` : '';
    const pat    = pattern   ? `pattern="${pattern}"` : '';
    const val    = value     ? `value="${value}"` : '';
    const wrap   = wrapId    ? `id="${wrapId}"` : `id="fw-${id}"`;
    const dreq   = required  ? `data-required` : '';
    const dwrap  = wrapId    ? `data-wrap="${wrapId}"` : `data-wrap="fw-${id}"`;
    return `
      <div class="agc-field" ${wrap}>
        <label for="${id}">${label}${req}${opt}</label>
        <input type="${type}" id="${id}" name="${name || id}" placeholder="${placeholder}" ${ml} ${pat} ${val} ${dreq} ${dwrap}/>
        ${hint ? `<span class="agc-field-hint">${hint}</span>` : ''}
        <span class="agc-err-msg">This field is required</span>
      </div>`;
  }

  // ── Build a select field ─────────────────────────────────────────────
  function select({ id, label, name, options = [], required = false, optional = false, hint = '' }) {
    const req  = required ? `<span class="agc-req">*</span>` : '';
    const opt  = optional ? `<span class="agc-opt">(optional)</span>` : '';
    const dreq = required ? `data-required data-wrap="fw-${id}"` : '';
    const opts = options.map(o =>
      typeof o === 'string'
        ? `<option value="${o}">${o}</option>`
        : `<option value="${o.value}">${o.label}</option>`
    ).join('');
    return `
      <div class="agc-field" id="fw-${id}">
        <label for="${id}">${label}${req}${opt}</label>
        <select id="${id}" name="${name || id}" ${dreq}>
          <option value="">Select…</option>
          ${opts}
        </select>
        ${hint ? `<span class="agc-field-hint">${hint}</span>` : ''}
        <span class="agc-err-msg">This field is required</span>
      </div>`;
  }

  // ── Build a textarea field ───────────────────────────────────────────
  function textarea({ id, label, name, placeholder = '', required = false, optional = false, hint = '', rows = 4 }) {
    const req  = required ? `<span class="agc-req">*</span>` : '';
    const opt  = optional ? `<span class="agc-opt">(optional)</span>` : '';
    const dreq = required ? `data-required data-wrap="fw-${id}"` : '';
    return `
      <div class="agc-field" id="fw-${id}">
        <label for="${id}">${label}${req}${opt}</label>
        <textarea id="${id}" name="${name || id}" placeholder="${placeholder}" rows="${rows}" ${dreq}></textarea>
        ${hint ? `<span class="agc-field-hint">${hint}</span>` : ''}
        <span class="agc-err-msg">This field is required</span>
      </div>`;
  }

  // ── Build a file upload zone ─────────────────────────────────────────
  function upload({ id, label, name, accept = '.pdf,.jpg,.jpeg,.png', icon = '📎', description = '', hint = '', required = false, optional = false }) {
    const req  = required ? `<span class="agc-req">*</span>` : '';
    const opt  = optional ? `<span class="agc-opt">(optional)</span>` : '';
    const dreq = required ? `data-required data-wrap="fw-${id}"` : '';
    return `
      <div class="agc-field" id="fw-${id}">
        <label>${label}${req}${opt}</label>
        <div class="agc-upload-zone">
          <input type="file" id="${id}" name="${name || id}" accept="${accept}" ${dreq}/>
          <div class="agc-upload-icon">${icon}</div>
          <p><strong>Click to upload</strong>${description ? ' — ' + description : ''}</p>
          <p>PDF, JPG, or PNG — max 5MB</p>
          <div class="agc-file-name" id="${id}-fname"></div>
        </div>
        ${hint ? `<span class="agc-field-hint">${hint}</span>` : ''}
        <span class="agc-err-msg">Please upload this document</span>
      </div>`;
  }

  // ── Build a person block (director / shareholder / trustee) ─────────
  function personBlock({ index, role = 'Person', namePrefix, removable = true, fields = '', uploads = '' }) {
    const removeBtn = removable
      ? `<button type="button" class="agc-person-remove" onclick="AGC_Router.removePerson('${namePrefix}', ${index})">Remove</button>`
      : '';
    return `
      <div class="agc-person-block" id="person-block-${namePrefix}-${index}">
        <div class="agc-person-block-head">
          <div class="agc-person-block-title">
            <span class="agc-person-num">${index + 1}</span>
            ${role} ${index + 1}
          </div>
          ${removeBtn}
        </div>
        <div class="agc-person-block-body">
          ${fields}
          ${uploads ? `<hr class="agc-sec-divider"/><div class="agc-sec-label">Upload Documents</div>${uploads}` : ''}
        </div>
      </div>`;
  }

  // ── Build add-person button ──────────────────────────────────────────
  function addPersonBtn(label, onclick) {
    return `<button type="button" class="agc-add-person-btn" onclick="${onclick}">+ ${label}</button>`;
  }

  // ── Build a Nigerian states select ──────────────────────────────────
  const STATES = ['Abia','Adamawa','Akwa Ibom','Anambra','Bauchi','Bayelsa','Benue','Borno','Cross River','Delta','Ebonyi','Edo','Ekiti','Enugu','FCT — Abuja','Gombe','Imo','Jigawa','Kaduna','Kano','Katsina','Kebbi','Kogi','Kwara','Lagos','Nasarawa','Niger','Ogun','Ondo','Osun','Oyo','Plateau','Rivers','Sokoto','Taraba','Yobe','Zamfara'];

  function stateSelect({ id, label, name, required = false }) {
    return select({ id, label, name, required, options: STATES });
  }

  // ── Build tier selector ──────────────────────────────────────────────
  function tierSelector(serviceId, tiers, selectedIndex = 0) {
    return `
      <div class="agc-tier-grid" id="tier-grid-${serviceId}">
        ${tiers.map((t, i) => `
          <label class="agc-tier-card ${i === selectedIndex ? 'selected' : ''}" onclick="AGC_Router.selectTier('${serviceId}', ${i}, this)">
            <input type="radio" name="tier_${serviceId}" value="${t.id}" ${i === selectedIndex ? 'checked' : ''}/>
            <div class="agc-tier-name">${t.label}</div>
            <div class="agc-tier-price">${window.AGC_PAYMENT.currency}${t.price.toLocaleString()}</div>
            <div class="agc-tier-desc">${t.desc || t.description || ''}</div>
          </label>
        `).join('')}
      </div>`;
  }

  // ── Build notice ─────────────────────────────────────────────────────
  function notice(text, type = 'blue') {
    return `<div class="agc-notice ${type}">${text}</div>`;
  }

  // ── Build section label ──────────────────────────────────────────────
  function secLabel(text) {
    return `<div class="agc-sec-label">${text}</div>`;
  }

  // ── Build section divider ────────────────────────────────────────────
  function divider() {
    return `<hr class="agc-sec-divider"/>`;
  }

  // ── Build nav bar ────────────────────────────────────────────────────
  function navBar({ step, total, showBack = true, submitLabel = '', onNext = '', onBack = 'AGC_Router.back()' }) {
    const backBtn = showBack
      ? `<button type="button" class="agc-btn agc-btn-outline" onclick="${onBack}">← Back</button>`
      : `<span></span>`;
    const nextBtn = submitLabel
      ? `<button type="button" class="agc-btn agc-btn-gold" onclick="${onNext}">${submitLabel} ✓</button>`
      : `<button type="button" class="agc-btn agc-btn-primary" onclick="${onNext}">Continue →</button>`;
    return `
      <div class="agc-nav-bar">
        ${backBtn}
        <span class="agc-step-counter">Step ${step} of ${total}</span>
        ${nextBtn}
      </div>`;
  }

  // ── Build a save bar ─────────────────────────────────────────────────
  function saveBar() {
    return `
      <div class="agc-save-bar">
        <span class="agc-save-bar-text">You can save and continue later. Your Resume ID will be shown after saving.</span>
        <button type="button" class="agc-btn agc-btn-ghost agc-btn-sm" onclick="AGC_Router.saveProgress()">💾 Save Progress</button>
        <span class="agc-resume-id-badge" id="save-bar-id" style="display:none;"></span>
      </div>`;
  }

  // ── Bind all file inputs in a container ─────────────────────────────
  function bindAllFileInputs(containerId) {
    const container = document.getElementById(containerId) || document;
    container.querySelectorAll('input[type="file"]').forEach(input => {
      const fnameEl = document.getElementById(input.id + '-fname');
      if (!fnameEl) return;
      input.addEventListener('change', () => {
        if (input.files && input.files.length > 0) {
          fnameEl.textContent = '✓ ' + input.files[0].name;
          input.closest('.agc-upload-zone')?.classList.add('has-file');
        }
      });
    });
  }

  return {
    toast,
    bindFileLabel,
    requirements,
    fieldRow,
    field,
    select,
    textarea,
    upload,
    personBlock,
    addPersonBtn,
    stateSelect,
    tierSelector,
    notice,
    secLabel,
    divider,
    navBar,
    saveBar,
    bindAllFileInputs,
    STATES
  };

})();