/**
 * MODULE: Service Selection Screen
 * Hidden services: payroll, accounting, iso, son, nafdac, paye
 * NIPC handled conditionally inside ltd.js
 */
(function () {

  // Services hidden from selection — not currently offered as standalone
  const HIDDEN = ['payroll','accounting','iso','son','nafdac','paye','nipc'];

  AGC_Router.register('services', {

    render(state) {
      const categories = window.AGC_CATEGORIES || [];
      const services   = window.AGC_SERVICES   || [];

      const categorySections = categories.map(cat => {
        // Filter out hidden services
        const svcs = services.filter(s => s.category === cat && !HIDDEN.includes(s.id));
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
                </label>`).join('')}
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

            <!-- Other Services contact box -->
            <div style="margin-top:24px;background:var(--gold-pale);border:1px solid var(--gold-light);border-radius:var(--radius-md);padding:var(--space-lg);">
              <div class="agc-sec-label" style="margin-bottom:8px;">Don't see what you need?</div>
              <p style="font-size:13px;color:var(--text);line-height:1.65;margin-bottom:var(--space-md);">
                We offer many more business, legal, and compliance services beyond what's listed here —
                including payroll, accounting, NAFDAC, SON, ISO certification support, NIPC, and more.
                Reach out directly and we will guide you on the best approach for your specific situation.
              </p>
              <div style="display:flex;gap:10px;flex-wrap:wrap;">
                <a href="https://wa.me/2347038336596?text=Hello%2C%20I%20need%20help%20with%20a%20service%20not%20listed%20on%20your%20KYC%20form"
                  target="_blank" rel="noopener"
                  class="agc-btn agc-btn-gold agc-btn-sm">
                  💬 Chat on WhatsApp
                </a>
                <a href="mailto:info@awalglobal.com.ng?subject=Service%20Enquiry"
                  class="agc-btn agc-btn-outline agc-btn-sm">
                  ✉ Send an Email
                </a>
              </div>
            </div>

            <div id="svc-error" class="agc-notice error" style="display:none;margin-top:var(--space-sm);">
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

  window.AGC_Modules = window.AGC_Modules || {};
  window.AGC_Modules.services = {

    toggle(label) {
      setTimeout(() => {
        const cb = label.querySelector('input[type="checkbox"]');
        label.classList.toggle('selected', cb.checked);
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

      const subject  = document.getElementById('h-subject');
      const services = document.getElementById('h-services');
      const serviceNames = state.selectedServices.map(id => {
        const svc = (window.AGC_SERVICES || []).find(s => s.id === id);
        return svc ? svc.name : id;
      });
      if (subject)  subject.value  = `Client KYC — ${serviceNames.slice(0,2).join(', ')}`;
      if (services) services.value = serviceNames.join(', ');

      AGC_Router.setServices(state.selectedServices);
      AGC_Router.showScreen('personal');
    }
  };

})();