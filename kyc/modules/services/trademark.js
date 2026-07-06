/**
 * MODULE: Trademark Registration
 */
(function () {
  const R = AGC_Renderer;
  const V = AGC_Validator;

  AGC_Router.register('trademark', {
    render(state) {
      const { step, total } = AGC_Router.stepInfo();
      return `
        <div class="agc-card">
          <div class="agc-card-head">
            <div class="agc-card-num">${step}</div>
            <div><div class="agc-card-title">Trademark Registration</div>
            <div class="agc-card-sub">Word, logo, slogan, combined, or other marks</div></div>
          </div>
          <div class="agc-card-body">
            ${R.requirements((window.AGC_SERVICES.find(s=>s.id==='trademark')||{requirements:[]}).requirements)}

            <div class="agc-sec-label">Type of Mark — select all that apply</div>
            <div class="agc-tm-grid" id="tm-type-grid">
              ${[
                { value:'Word Mark', icon:'🅰', label:'Word Mark', sub:'Name or text' },
                { value:'Logo / Device Mark', icon:'🖼', label:'Logo / Device', sub:'Graphic or symbol' },
                { value:'Combined Mark', icon:'🔤', label:'Combined', sub:'Word + logo together' },
                { value:'Slogan / Tagline', icon:'💬', label:'Slogan / Tagline', sub:'Phrase or motto' },
                { value:'Series Mark', icon:'📚', label:'Series Mark', sub:'Multiple related marks' },
                { value:'Shape / 3D Mark', icon:'📦', label:'Shape / 3D', sub:'Product shape or packaging' }
              ].map((t,i) => `
                <label class="agc-tm-chip" onclick="AGC_Modules.trademark.toggleType(this)">
                  <input type="checkbox" name="TM_Type" value="${t.value}"/>
                  <div class="agc-tm-icon">${t.icon}</div>
                  <div class="agc-tm-label">${t.label}</div>
                  <div class="agc-tm-sub">${t.sub}</div>
                </label>`).join('')}
            </div>
            <div id="tm-type-error" class="agc-notice error" style="display:none;">Please select at least one mark type.</div>

            <div class="agc-field-row">
              ${R.field({ id:'tm_mark', label:'Word / Mark to be Filed', name:'TM_Word_Mark', placeholder:'e.g. BRANDNAME', required:true })}
              ${R.field({ id:'tm_class', label:'Trademark Class', name:'TM_Class', placeholder:'e.g. Class 35, Class 42', hint:'Not sure? We will advise on the correct class.', required:true })}
            </div>

            <div id="tm-logo-upload" style="display:none;">
              <div class="agc-field-row one">
                ${R.upload({ id:'tm_logo', label:'Upload Logo / Mark Image', name:'TM_Logo', icon:'🖼', description:'JPG, PNG, PDF, or SVG', hint:'Required for logo, combined, or shape marks.' })}
              </div>
            </div>

            ${R.divider()}
            <div class="agc-sec-label">Applicant Details</div>
            <div class="agc-field-row">
              ${R.field({ id:'tm_applicant', label:'Applicant Name', name:'TM_Applicant_Name', placeholder:'Individual or company name as on certificate', required:true })}
              ${R.field({ id:'tm_phone', label:'Applicant Phone', name:'TM_Applicant_Phone', placeholder:'+234 800 000 0000', required:true })}
            </div>
            <div class="agc-field-row one">
              ${R.textarea({ id:'tm_address', label:'Applicant Address', name:'TM_Applicant_Address', placeholder:'Full address for trademark registration record', required:true })}
            </div>
            <div class="agc-field-row one">
              ${R.textarea({ id:'tm_future', label:'Additional / Future Marks', name:'TM_Future_Marks', placeholder:'List any other marks you may want to register in future, with intended class if known', optional:true })}
            </div>

            ${R.divider()}
            <div class="agc-sec-label">Applicant Documents</div>
            <div class="agc-field-row">
              ${R.upload({ id:'tm_id', label:'Valid ID', name:'TM_Applicant_ID', icon:'🪪', description:'Passport, NIN card, or Driver\'s licence', required:true })}
              ${R.upload({ id:'tm_extra', label:'CAC Certificate', name:'TM_CAC_Cert', icon:'📄', description:'If filing under a company name', optional:true })}
            </div>
          </div>
          ${R.navBar({ step, total, onNext:'AGC_Router.next()', onBack:'AGC_Router.back()' })}
        </div>`;
    },

    validate() {
      let ok = true;
      const types = document.querySelectorAll('input[name="TM_Type"]:checked');
      const typeErr = document.getElementById('tm-type-error');
      if (types.length === 0) { if (typeErr) typeErr.style.display = 'block'; ok = false; }
      else { if (typeErr) typeErr.style.display = 'none'; }
      ['tm_mark','tm_class','tm_applicant','tm_phone','tm_address'].forEach(id => { if (!V.required(id)) ok = false; });
      if (!V.requiredFile('tm_id')) ok = false;
      return ok;
    }
  });

  window.AGC_Modules = window.AGC_Modules || {};
  window.AGC_Modules.trademark = {
    toggleType(chip) {
      setTimeout(() => {
        const cb = chip.querySelector('input');
        chip.classList.toggle('selected', cb.checked);
        const logoTypes = ['Logo / Device Mark', 'Combined Mark', 'Shape / 3D Mark'];
        const needLogo = Array.from(document.querySelectorAll('input[name="TM_Type"]:checked'))
          .some(c => logoTypes.includes(c.value));
        const logoUpload = document.getElementById('tm-logo-upload');
        if (logoUpload) logoUpload.style.display = needLogo ? 'block' : 'none';
      }, 0);
    }
  };
})();