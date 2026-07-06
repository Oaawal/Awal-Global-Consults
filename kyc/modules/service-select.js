/**
 * MODULE: Service Selection Screen
 */
(function () {
  const V = AGC_Validator;

  AGC_Router.register('services', {

    render(state) {
      const categories = window.AGC_CATEGORIES || [];
      const services   = window.AGC_SERVICES   || [];
      const { step, total } = AGC_Router.stepInfo();

      const categorySections = categories.map(cat => {
        const svcs = services.filter(s => s.category === cat);
        if (!svcs.length) return '';
        return `
          <div class="agc-svc-category">
            <div class="agc-cat-label">${cat}</div>
            <div class="agc-svc-grid">
              ${svcs.map(svc => `
                <label class="agc-svc-card ${state.selectedServices.includes(svc.id) ? 'selected' : ''}"
                  onclick="AGC_Modules.services.toggle(this)">
                  <input type="checkbox" name="svc" value="${svc.id}"
                    ${state.selectedServices.includes(svc.id) ? 'checked' : ''}/>
                  <div>
                    <div class="agc-svc-card-text">${svc.name}</div>
                    <div class="agc-svc-card-sub">${svc.description}</div>
                  </div>
                </label>
              `).join('')}
            </div>
          </div>`;
      }).join('');

      return `
        <div class="agc-card">
          <div class="agc-card-head">
            <div class="agc-card-num">1</div>
            <div>
              <div class="agc-card-title">What do you need help with?</div>
              <div class="agc-card-sub">Select all services that apply to your engagement</div>
            </div>
          </div>
          <div class="agc-card-body">
            ${AGC_Renderer.saveBar()}
            ${categorySections}
            <div id="svc-error" class="agc-notice error" style="display:none; margin-top:var(--space-sm);">
              Please select at least one service to continue.
            </div>
          </div>
          <div class="agc-nav-bar">
            <button type="button" class="agc-btn agc-btn-outline"
              onclick="AGC_Router.showScreen('welcome')">← Back</button>
            <span class="agc-step-counter">Step 1 of —</span>
            <button type="button" class="agc-btn agc-btn-primary"
              onclick="AGC_Modules.services.proceed()">Continue →</button>
          </div>
        </div>`;
    },

    validate(state) {
      if (state.selectedServices.length === 0) {
        const err = document.getElementById('svc-error');
        if (err) err.style.display = 'block';
        return false;
      }
      return true;
    }
  });

  // Attach module helpers
  window.AGC_Modules = window.AGC_Modules || {};
  window.AGC_Modules.services = {
    toggle(label) {
      setTimeout(() => {
        const cb = label.querySelector('input[type="checkbox"]');
        label.classList.toggle('selected', cb.checked);
        // Sync state
        const state = AGC_Router.getState();
        state.selectedServices = Array.from(
          document.querySelectorAll('input[name="svc"]:checked')
        ).map(c => c.value);
        const err = document.getElementById('svc-error');
        if (err && state.selectedServices.length > 0) err.style.display = 'none';
      }, 0);
    },

    proceed() {
      const state = AGC_Router.getState();
      state.selectedServices = Array.from(
        document.querySelectorAll('input[name="svc"]:checked')
      ).map(c => c.value);

      if (state.selectedServices.length === 0) {
        const err = document.getElementById('svc-error');
        if (err) err.style.display = 'block';
        return;
      }

      // Update subject and services hidden field
      const subject  = document.getElementById('h-subject');
      const services = document.getElementById('h-services');
      const serviceNames = state.selectedServices.map(id => {
        const svc = (window.AGC_SERVICES || []).find(s => s.id === id);
        return svc ? svc.name : id;
      });
      if (subject)  subject.value  = `Client KYC — ${serviceNames.slice(0, 2).join(', ')}`;
      if (services) services.value = serviceNames.join(', ');

      AGC_Router.setServices(state.selectedServices);
      AGC_Router.showScreen('personal');
    }
  };
})();