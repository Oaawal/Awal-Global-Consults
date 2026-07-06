/**
 * MODULE: Resume Screen
 */
(function () {
  AGC_Router.register('resume', {
    render(state) {
      const savedId = AGC_Storage.getCurrentId() || '';
      return `
        <div class="agc-resume-card">
          <h2>Welcome Back</h2>
          <p>Enter your Resume ID to continue where you left off, or start a fresh application below.</p>
          <div class="agc-resume-row">
            <input class="agc-resume-input" id="resume-id-input" type="text"
              placeholder="e.g. AGC-2026-7X4K" value="${savedId}" maxlength="13"/>
            <button type="button" class="agc-btn agc-btn-primary" onclick="AGC_Router.resumeFromInput()">Resume</button>
          </div>
          <div class="agc-notice error" id="resume-error" style="display:none;">
            Resume ID not found. Please check and try again, or start a new application.
          </div>
          <div class="agc-divider-or">or</div>
          <button type="button" class="agc-btn agc-btn-outline agc-btn-full"
            onclick="AGC_Storage.clear(); AGC_Router.showScreen('welcome');">
            Start New Application
          </button>
        </div>`;
    }
  });

  // Attach resume-from-input to router
  AGC_Router.resumeFromInput = function () {
    const input = document.getElementById('resume-id-input');
    const errEl = document.getElementById('resume-error');
    if (!input) return;
    const id = input.value.trim().toUpperCase();
    const ok = AGC_Router.resume(id);
    if (!ok && errEl) errEl.style.display = 'block';
    else if (errEl) errEl.style.display = 'none';
  };
})();