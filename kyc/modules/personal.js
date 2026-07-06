/**
 * MODULE: Personal Details (shared)
 * Shown for all services that requiresPersonal = true
 */
(function () {
  const R = AGC_Renderer;
  const V = AGC_Validator;

  AGC_Router.register('personal', {

    render(state) {
      const { step, total } = AGC_Router.stepInfo();
      const stateOpts = R.STATES.map(s => `<option value="${s}">${s}</option>`).join('');

      return `
        <div class="agc-card">
          <div class="agc-card-head">
            <div class="agc-card-num">${step}</div>
            <div>
              <div class="agc-card-title">Personal Details</div>
              <div class="agc-card-sub">Enter exactly as they appear on your NIN record</div>
            </div>
          </div>
          <div class="agc-card-body">
            ${R.notice('⚠ These details must match your NIN record exactly to avoid CAC filing errors.', 'blue')}
            ${R.saveBar()}

            <div class="agc-field-row three">
              <div class="agc-field" id="fw-p_firstname">
                <label for="p_firstname">First Name <span class="agc-req">*</span></label>
                <input type="text" id="p_firstname" name="First_Name" placeholder="First name" data-required data-wrap="fw-p_firstname"/>
                <span class="agc-err-msg">Required</span>
              </div>
              <div class="agc-field">
                <label for="p_middlename">Middle Name <span class="agc-opt">(optional)</span></label>
                <input type="text" id="p_middlename" name="Middle_Name" placeholder="Middle name"/>
              </div>
              <div class="agc-field" id="fw-p_lastname">
                <label for="p_lastname">Surname <span class="agc-req">*</span></label>
                <input type="text" id="p_lastname" name="Surname" placeholder="Surname" data-required data-wrap="fw-p_lastname"/>
                <span class="agc-err-msg">Required</span>
              </div>
            </div>

            <div class="agc-field-row three">
              <div class="agc-field" id="fw-p_dob">
                <label for="p_dob">Date of Birth <span class="agc-req">*</span></label>
                <input type="date" id="p_dob" name="Date_of_Birth" data-required data-wrap="fw-p_dob"/>
                <span class="agc-err-msg">Required</span>
              </div>
              <div class="agc-field" id="fw-p_gender">
                <label for="p_gender">Gender <span class="agc-req">*</span></label>
                <select id="p_gender" name="Gender" data-required data-wrap="fw-p_gender">
                  <option value="">Select…</option>
                  <option>Male</option>
                  <option>Female</option>
                </select>
                <span class="agc-err-msg">Required</span>
              </div>
              <div class="agc-field" id="fw-p_state">
                <label for="p_state">State of Origin <span class="agc-req">*</span></label>
                <select id="p_state" name="State_of_Origin" data-required data-wrap="fw-p_state">
                  <option value="">Select state…</option>
                  ${stateOpts}
                </select>
                <span class="agc-err-msg">Required</span>
              </div>
            </div>

            <div class="agc-field-row">
              <div class="agc-field" id="fw-p_nationality">
                <label for="p_nationality">Nationality <span class="agc-req">*</span></label>
                <input type="text" id="p_nationality" name="Nationality" value="Nigerian" data-required data-wrap="fw-p_nationality"/>
                <span class="agc-err-msg">Required</span>
              </div>
              <div class="agc-field" id="fw-p_occupation">
                <label for="p_occupation">Occupation <span class="agc-req">*</span></label>
                <input type="text" id="p_occupation" name="Occupation" placeholder="e.g. Entrepreneur" data-required data-wrap="fw-p_occupation"/>
                <span class="agc-err-msg">Required</span>
              </div>
            </div>

            <div class="agc-field-row one">
              <div class="agc-field" id="fw-p_address">
                <label for="p_address">Residential Address <span class="agc-req">*</span></label>
                <textarea id="p_address" name="Residential_Address" placeholder="Full address — not a P.O. Box" data-required data-wrap="fw-p_address"></textarea>
                <span class="agc-err-msg">Required</span>
              </div>
            </div>

            <div class="agc-field-row">
              <div class="agc-field" id="fw-p_nin">
                <label for="p_nin">NIN Number <span class="agc-req">*</span></label>
                <input type="text" id="p_nin" name="NIN" placeholder="11-digit NIN" maxlength="11" pattern="\\d{11}" data-required data-wrap="fw-p_nin"/>
                <span class="agc-field-hint">11 digits. We can assist with retrieval if needed.</span>
                <span class="agc-err-msg">Must be exactly 11 digits</span>
              </div>
              <div class="agc-field">
                <label for="p_bvn">BVN <span class="agc-opt">(if applicable)</span></label>
                <input type="text" id="p_bvn" name="BVN" placeholder="11-digit BVN" maxlength="11"/>
                <span class="agc-field-hint">Only if relevant to your service.</span>
              </div>
            </div>

            <div class="agc-field-row">
              <div class="agc-field" id="fw-p_phone">
                <label for="p_phone">Phone / WhatsApp <span class="agc-req">*</span></label>
                <input type="tel" id="p_phone" name="Phone" placeholder="+234 800 000 0000" maxlength="14" data-required data-wrap="fw-p_phone"/>
                <span class="agc-err-msg">Enter a valid Nigerian number</span>
              </div>
              <div class="agc-field" id="fw-p_email">
                <label for="p_email">Email Address <span class="agc-req">*</span></label>
                <input type="email" id="p_email" name="Email" placeholder="your@email.com" data-required data-wrap="fw-p_email"/>
                <span class="agc-err-msg">Enter a valid email</span>
              </div>
            </div>

            <div class="agc-field-row">
              <div class="agc-field">
                <label for="p_ref">Invoice / Reference <span class="agc-opt">(if you have one)</span></label>
                <input type="text" id="p_ref" name="Invoice_Reference" placeholder="e.g. INV-2026-001"/>
                <span class="agc-field-hint">Leave blank if not yet assigned.</span>
              </div>
              <div></div>
            </div>

          </div>
          ${R.navBar({ step, total, onNext: 'AGC_Router.next()', onBack: 'AGC_Router.back()' })}
        </div>`;
    },

    validate(state) {
      const V = AGC_Validator;
      let ok = true;
      const fields = ['p_firstname','p_lastname','p_dob','p_gender','p_state','p_nationality','p_occupation','p_address','p_phone','p_email'];
      fields.forEach(id => { if (!V.required(id)) ok = false; });

      // NIN — exactly 11 digits
      const nin = document.getElementById('p_nin');
      const ninWrap = document.getElementById('fw-p_nin');
      if (!nin || !/^\d{11}$/.test(nin.value.trim())) {
        if (nin) nin.classList.add('agc-err');
        if (ninWrap) ninWrap.classList.add('has-err');
        ok = false;
      } else {
        if (nin) nin.classList.remove('agc-err');
        if (ninWrap) ninWrap.classList.remove('has-err');
      }

      // Email format
      if (!V.email('p_email')) ok = false;

      return ok;
    }
  });
})();