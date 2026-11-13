// Awal Filing Assistant: runs inside the portal page (every frame), only when the side panel asks.
// It fills boxes and attaches files. It never clicks Submit, Pay or any button.
(() => {
  if (window.__agcFiller) return;

  const GOLD = '#D4A72C';
  let lastFocus = { el: null, at: 0 };
  document.addEventListener('focusin', e => {
    const el = e.target;
    if (el && el.matches && el.matches('input, textarea, select')) lastFocus = { el, at: Date.now() };
  }, true);

  const norm = s => String(s || '').replace(/\s+/g, ' ').replace(/[*:]+\s*$/, '').trim().toLowerCase();
  const visible = el => {
    if (!el || el.disabled) return false;
    const r = el.getBoundingClientRect();
    const st = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && st.visibility !== 'hidden' && st.display !== 'none';
  };

  /** The words a person would read next to a box. */
  function labelOf(el) {
    const bits = [];
    if (el.getAttribute('aria-label')) bits.push(el.getAttribute('aria-label'));
    const lb = el.getAttribute('aria-labelledby');
    if (lb) lb.split(/\s+/).forEach(id => { const t = document.getElementById(id); if (t) bits.push(t.textContent); });
    if (el.id) { const l = document.querySelector('label[for="' + CSS.escape(el.id) + '"]'); if (l) bits.push(l.textContent); }
    const wrap = el.closest('label'); if (wrap) bits.push(wrap.textContent);
    const mat = el.closest('mat-form-field, .form-group, .form-field, .field, .input-group, .mb-3, .form-row');
    if (mat) { const l = mat.querySelector('mat-label, label, .label, .control-label, legend'); if (l) bits.push(l.textContent); }
    if (!bits.length) {
      // Text just before the box (a heading or span in the same block)
      let n = el;
      for (let up = 0; up < 3 && n && !bits.length; up++) {
        let p = n.previousElementSibling;
        while (p && !bits.length) { const t = p.textContent.trim(); if (t && t.length < 90) bits.push(t); p = p.previousElementSibling; }
        n = n.parentElement;
      }
    }
    if (el.type === 'radio') {
      // A radio's own label says "Male"; the question ("Gender") is on the group around it
      const box = el.closest('fieldset, [role=radiogroup], .form-group, .mat-radio-group, mat-radio-group') || (el.closest('label') || el).parentElement;
      if (box) {
        const legend = box.querySelector('legend');
        let t = legend ? legend.textContent : box.textContent;
        if (!legend) box.querySelectorAll('label').forEach(l => { if (l.querySelector('input[type=radio]') || (l.htmlFor && document.getElementById(l.htmlFor) && document.getElementById(l.htmlFor).type === 'radio')) t = t.replace(l.textContent, ' '); });
        if (t.trim()) bits.unshift(t);
      }
    }
    if (el.placeholder) bits.push(el.placeholder);
    if (!bits.length && (el.name || el.id)) bits.push(String(el.name || el.id).replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' '));
    return [...new Set(bits.map(norm).filter(Boolean))].join(' ').slice(0, 140);
  }
  const signature = el => labelOf(el) + '|' + norm(el.name || el.id || '');

  function fillable() {
    return [...document.querySelectorAll('input, textarea, select')].filter(el => {
      if (el.tagName === 'INPUT' && /^(hidden|password|file|submit|button|reset|image|checkbox)$/i.test(el.type)) return false;
      if (el.readOnly || !visible(el)) return false;
      return !/captcha|otp|verification code|token/.test(labelOf(el));
    });
  }

  // Values are set the way typing would, so React / Angular / Vue forms notice
  function setValue(el, value) {
    value = String(value);
    if (el.tagName === 'SELECT') {
      const v = norm(value);
      const opts = [...el.options];
      const pick = opts.find(o => norm(o.textContent) === v || norm(o.value) === v)
        || opts.find(o => v && norm(o.textContent).startsWith(v))
        || opts.find(o => v.length > 3 && norm(o.textContent).includes(v))
        || opts.find(o => norm(o.textContent).length > 3 && v.includes(norm(o.textContent)));
      if (!pick) return false;
      el.value = pick.value;
    } else if (el.type === 'radio') {
      const group = el.name ? [...document.querySelectorAll('input[type=radio][name="' + CSS.escape(el.name) + '"]')] : [el];
      const v = norm(value);
      const word = new RegExp('(^|[^a-z])' + v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '($|[^a-z])');
      const own = x => { const l = x.id && document.querySelector('label[for="' + CSS.escape(x.id) + '"]'); return norm(l ? l.textContent : (x.closest('label') || {}).textContent || ''); };
      const r = group.find(x => norm(x.value) === v || word.test(own(x)))
        || group.find(x => (v === 'male' && /^m$/.test(norm(x.value))) || (v === 'female' && /^f$/.test(norm(x.value))));
      if (!r) return false;
      r.click();
      return r;
    } else {
      if (el.type === 'date') {
        const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value); if (m) value = m[3] + '-' + m[2] + '-' + m[1];
      }
      const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
      el.focus();
      setter.call(el, value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
    return el;
  }
  function mark(el) {
    if (!el.dataset.agcOutline) el.dataset.agcOutline = el.style.outline || 'none';
    el.style.outline = '2px solid ' + GOLD; el.style.outlineOffset = '1px';
  }

  // Which value a box wants, from its label (only used when the box was not learned yet)
  const RULES = {
    business: [
      ['name2', /second choice|2nd choice|proposed name ?(2|two|ii)\b|alternative name/],
      ['name3', /third choice|3rd choice|proposed name ?(3|three|iii)\b/],
      ['name1', /proposed name|first choice|1st choice|preferred name|name (to be )?reserv|name availability/],
      ['reg_number', /\b(rc|bn|it)\s*(number|no)\b|registration (number|no)|cac number/],
      ['business_name', /^(business|company|entity|organi[sz]ation|registered|enterprise) name|name of (business|company|organi[sz]ation|entity)/],
      ['company_type', /company type|type of company|entity type|business type/],
      ['nature', /specific nature|principal activit|line of business|description of (the )?business|business activit/],
      ['category', /nature of business|business category|category|sector/],
      ['objects', /object/],
      ['aims', /aims|objectives/],
      ['address', /(business|office|registered|company|head office|operational|principal place of business) address|address of (the )?(business|office|company)|^address\b/],
      ['share_capital_number', /share capital|authori[sz]ed capital/],
      ['contact_email', /e-?mail/],
      ['contact_phone', /phone|mobile|telephone|gsm/],
      ['contact_name', /contact (person|name)|applicant('s)? name|name of applicant/],
      ['state', /^state\b|state of (business|location)/]
    ],
    person: [
      ['surname', /surname|last name|family name/],
      ['first_name', /first name|given name|forename/],
      ['other_names', /other name|middle name/],
      ['full_name', /full name|^name\b|name of (director|proprietor|shareholder|trustee|subscriber)/],
      ['gender', /gender|\bsex\b/],
      ['dob', /date of birth|\bdob\b|birth ?date/],
      ['nationality', /nationality|citizenship|country of origin/],
      ['nin', /\bnin\b|national identi/],
      ['passport', /passport (number|no)/],
      ['email', /e-?mail/],
      ['phone', /phone|mobile|gsm|telephone/],
      ['occupation', /occupation|profession/],
      ['shares', /number of shares|no\.? of shares|shares (allotted|held|subscribed)/],
      ['share_pct', /percent|%|shareholding/],
      ['address', /address/]
    ]
  };

  function guess(el, scope, values) {
    const label = labelOf(el);
    for (const [key, re] of RULES[scope]) if (re.test(label) && values[key] != null && values[key] !== '') return key;
    return null;
  }

  const api = {
    // Where the cursor was left: the box to fill when a value is clicked in the panel
    focused() {
      const el = lastFocus.el;
      if (!el || !document.contains(el)) return null;
      return { at: lastFocus.at, label: labelOf(el), signature: signature(el) };
    },
    fillFocused({ value }) {
      const el = lastFocus.el;
      if (!el || !document.contains(el)) return { ok: false };
      const done = setValue(el, value);
      if (done) mark(done);
      return { ok: !!done, label: labelOf(el), signature: signature(el) };
    },
    // Fill every box we recognise. Learned boxes first, then labels. Only empty boxes are filled.
    fillPage({ scope, values, learned }) {
      const filled = [], skipped = [];
      const used = new Set();
      for (const el of fillable()) {
        if (el.type !== 'radio' && el.tagName !== 'SELECT' && el.value) continue;
        if (el.tagName === 'SELECT' && el.selectedIndex > 0) continue;
        if (el.type === 'radio') { if (!el.name || used.has(el.name)) continue; if (document.querySelector('input[type=radio][name="' + CSS.escape(el.name) + '"]:checked')) continue; }
        const sig = signature(el);
        const key = (learned && learned[sig] && learned[sig].scope === scope && values[learned[sig].key] != null) ? learned[sig].key : guess(el, scope, values);
        if (!key) { const l = labelOf(el); if (l) skipped.push(l); continue; }
        let value = values[key];
        if (key === 'dob' && el.type === 'date' && values.dob_iso) value = values.dob_iso;
        const done = setValue(el, value);
        if (done) { mark(done); filled.push(labelOf(el) || key); if (el.type === 'radio') used.add(el.name); }
        else skipped.push(labelOf(el));
      }
      return { filled, skipped: [...new Set(skipped)].slice(0, 12) };
    },
    fileBoxes() {
      return [...document.querySelectorAll('input[type=file]')].filter(el => !el.disabled).map((el, i) => {
        el.dataset.agcFileIndex = String(i);
        return { index: i, label: labelOf(el) || 'Upload box ' + (i + 1), signature: signature(el), hasFile: !!(el.files && el.files.length), accept: el.accept || '' };
      });
    },
    attach({ index, name, mime, base64 }) {
      const el = document.querySelector('input[type=file][data-agc-file-index="' + index + '"]');
      if (!el) return { ok: false, error: 'That upload box is no longer on the page.' };
      const bin = atob(base64); const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const dt = new DataTransfer();
      if (el.multiple && el.files) [...el.files].forEach(f => dt.items.add(f));
      dt.items.add(new File([bytes], name, { type: mime }));
      el.files = dt.files;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      const box = visible(el) ? el : (el.closest('label, div') || el);
      mark(box);
      return { ok: true, label: labelOf(el) };
    },
    clearMarks() {
      document.querySelectorAll('[data-agc-outline]').forEach(el => { el.style.outline = el.dataset.agcOutline === 'none' ? '' : el.dataset.agcOutline; delete el.dataset.agcOutline; });
      return true;
    }
  };
  window.__agcFiller = { handle: msg => (api[msg.type] ? api[msg.type](msg) : null) };
})();
