/**
 * MODULE: Welcome Screen
 */
(function () {
  const R = AGC_Renderer;

  AGC_Router.register('welcome', {
    render(state) {
      return `
        <div class="agc-screen active" id="screen-welcome-inner">
          <div class="agc-welcome-card">
            <div class="agc-welcome-head">
              <img src="../assets/images/logo.png" alt="Awal Global Consults" class="agc-welcome-logo"
                onerror="this.style.display='none'">
              <h1>Welcome to Awal Global Consults</h1>
              <p>Governance | Risk | Compliance</p>
            </div>
            <div class="agc-welcome-body">
              <p style="font-size:14px; color:var(--text); line-height:1.7; margin-bottom:var(--space-lg);">
                This secure portal allows you to submit your client intake and KYC information for the services you need.
                Your submission is reviewed by our team and we will contact you within <strong>1 working day</strong> to confirm next steps.
              </p>

              <div class="agc-welcome-meta">
                <div class="agc-welcome-meta-item"><span class="agc-welcome-meta-icon">⏱</span><span>5–15 minutes depending on services selected</span></div>
                <div class="agc-welcome-meta-item"><span class="agc-welcome-meta-icon">💾</span><span>Save progress and return later with your Resume ID</span></div>
                <div class="agc-welcome-meta-item"><span class="agc-welcome-meta-icon">📱</span><span>Works on mobile and desktop</span></div>
                <div class="agc-welcome-meta-item"><span class="agc-welcome-meta-icon">📎</span><span>Upload documents directly — no email needed</span></div>
              </div>

              <div class="agc-privacy-box">
                🔒 <strong>Privacy & Confidentiality</strong><br>
                All information submitted through this portal is treated with strict confidentiality.
                Your details are used solely for the purpose of the services you select and are never shared with third parties without your consent.
                Awal Global Consults Limited is bound by the Nigeria Data Protection Regulation (NDPR).
              </div>

              <div class="agc-welcome-footer">
                <button type="button" class="agc-btn agc-btn-gold agc-btn-lg agc-btn-full"
                  onclick="AGC_Router.showScreen('services')">
                  Start Application →
                </button>
                <p style="text-align:center; font-size:11.5px; color:var(--muted); margin-top:var(--space-md);">
                  Already started? <a href="#" onclick="AGC_Router.showScreen('resume'); return false;" style="color:var(--navy); font-weight:600;">Resume with your ID →</a>
                </p>
              </div>
            </div>
          </div>
        </div>`;
    }
  });
})();