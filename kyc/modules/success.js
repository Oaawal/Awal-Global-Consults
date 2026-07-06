/**
 * MODULE: Declaration & Submit
 */
(function () {
  const R = AGC_Renderer;

  AGC_Router.register('declaration', {

    render(state) {
      const { step, total } = AGC_Router.stepInfo();
      const SVCS = window.AGC_SERVICES || [];
      const selected = state.selectedServices || [];
      const serviceNames = selected.map(id => {
        const s = SVCS.find(x => x.id === id);
        return s ? s.name : id;
      });

      return `
        <div class="agc-card">
          <div class="agc-card-head">
            <div class="agc-card-num">${step}</div>
            <div>
              <div class="agc-card-title">Declaration & Submission</div>
              <div class="agc-card-sub">Read and confirm before submitting your application</div>
            </div>
          </div>
          <div class="agc-card-body">

            ${R.notice('Please review your selected services and confirm the declarations below before submitting.', 'blue')}

            <div class="agc-sec-label">Services You Are Applying For</div>
            <div style="background:var(--bg);border:1px solid var(--border);border-radius:var(--radius-md);padding:var(--space-md);margin-bottom:var(--space-lg);">
              ${serviceNames.map(name => `
                <div style="display:flex;align-items:center;gap:8px;padding:5px 0;font-size:13px;color:var(--text);border-bottom:1px solid var(--border);">
                  <span style="color:var(--gold);font-weight:700;">✓</span> ${name}
                </div>`).join('')}
            </div>

            <div class="agc-sec-label">Declarations</div>

            <div class="agc-chk-field" id="fw-dec1">
              <input type="checkbox" id="dec1"/>
              <label for="dec1">
                I confirm that all information submitted in this form is accurate, true, and complete
                to the best of my knowledge. I understand that providing false or incorrect information
                may delay, invalidate, or result in rejection of my application.
              </label>
            </div>

            <div class="agc-chk-field" id="fw-dec2">
              <input type="checkbox" id="dec2"/>
              <label for="dec2">
                I consent to Awal Global Consults Limited collecting, processing, and using the
                information and documents I have submitted solely for the purpose of delivering the
                services I have selected. My data will be handled in accordance with the Nigeria
                Data Protection Regulation (NDPR).
              </label>
            </div>

            <div class="agc-chk-field" id="fw-dec3">
              <input type="checkbox" id="dec3"/>
              <label for="dec3">
                I confirm that no additional shareholders, directors, nominees, trustees, or
                authorised persons should be added to any registration or filing unless I
                expressly confirm this in a separate written instruction to Awal Global
                Consults Limited.
              </label>
            </div>

            <div class="agc-chk-field" id="fw-dec4">
              <input type="checkbox" id="dec4"/>
              <label for="dec4">
                I understand that processing will begin upon receipt of the minimum required
                deposit, and that Awal Global Consults Limited will contact me within
                1 working day to confirm receipt of this submission and advise on next steps.
              </label>
            </div>

            <div id="decl-error" class="agc-notice error" style="display:none;margin-top:var(--space-md);">
              Please tick all four declarations before submitting.
            </div>

          </div>
          <div class="agc-nav-bar">
            <button type="button" class="agc-btn agc-btn-outline" onclick="AGC_Router.back()">← Back</button>
            <span class="agc-step-counter">Step ${step} of ${total}</span>
            <button type="button" class="agc-btn agc-btn-gold" onclick="AGC_Modules.declaration.submit()">
              Submit Application ✓
            </button>
          </div>
        </div>`;
    },

    validate() {
      const all = ['dec1','dec2','dec3','dec4'].every(id => {
        const el = document.getElementById(id);
        return el && el.checked;
      });
      const err = document.getElementById('decl-error');
      if (err) err.style.display = all ? 'none' : 'block';
      return all;
    }
  });

  window.AGC_Modules = window.AGC_Modules || {};
  window.AGC_Modules.declaration = {
    submit() {
      // Validate declarations
      const all = ['dec1','dec2','dec3','dec4'].every(id => {
        const el = document.getElementById(id);
        return el && el.checked;
      });
      const err = document.getElementById('decl-error');
      if (!all) {
        if (err) err.style.display = 'block';
        return;
      }
      if (err) err.style.display = 'none';

      // Collect final data
      AGC_Router.collectData();

      // Update hidden fields
      const state = AGC_Router.getState();
      const SVCS  = window.AGC_SERVICES || [];

      const subjectEl  = document.getElementById('h-subject');
      const servicesEl = document.getElementById('h-services');
      const resumeEl   = document.getElementById('h-resume-id');

      const serviceNames = (state.selectedServices || []).map(id => {
        const s = SVCS.find(x => x.id === id);
        return s ? s.name : id;
      });

      if (subjectEl)  subjectEl.value  = `Client KYC — ${document.getElementById('p_fullname')?.value || 'New Client'} — ${serviceNames.slice(0,2).join(', ')}`;
      if (servicesEl) servicesEl.value = serviceNames.join(', ');
      if (resumeEl)   resumeEl.value   = AGC_Storage.getCurrentId() || '';

      // Build and append all collected data to hidden form
      const form = document.getElementById('agc-hidden-form');
      if (form) {
        // Remove old dynamic fields
        form.querySelectorAll('.agc-dyn').forEach(el => el.remove());

        Object.entries(state.formData || {}).forEach(([key, val]) => {
          const inp = document.createElement('input');
          inp.type = 'hidden';
          inp.name = key;
          inp.value = val;
          inp.className = 'agc-dyn';
          form.appendChild(inp);
        });
      }

      // Show success screen
      AGC_Router.showScreen('success');

      // Clear saved session
      AGC_Storage.clear();

      // Submit form after brief delay to allow success screen to render
      setTimeout(() => {
        const f = document.getElementById('agc-hidden-form');
        if (f) f.submit();
      }, 400);
    }
  };

})();