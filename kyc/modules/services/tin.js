/**
 * MODULE: TIN Registration
 */
(function () {
  const R = AGC_Renderer;
  const V = AGC_Validator;

  AGC_Router.register('tin', {
    render(state) {
      const { step, total } = AGC_Router.stepInfo();
      return `
        <div class="agc-card">
          <div class="agc-card-head">
            <div class="agc-card-num">${step}</div>
            <div><div class="agc-card-title">TIN Registration</div>
            <div class="agc-card-sub">Tax Identification Number — Nigerian Revenue Service (NRS)</div></div>
          </div>
          <div class="agc-card-body">
            ${R.requirements((window.AGC_SERVICES.find(s=>s.id==='tin')||{requirements:[]}).requirements)}

            <div class="agc-field-row one">
              <div class="agc-field">
                <label>TIN Service Required</label>
                <div class="agc-radio-group">
                  <label class="agc-radio-opt"><input type="radio" name="TIN_Service" value="New TIN Registration" checked/> New TIN Registration</label>
                  <label class="agc-radio-opt"><input type="radio" name="TIN_Service" value="TIN Validation"/> TIN Validation</label>
                  <label class="agc-radio-opt"><input type="radio" name="TIN_Service" value="Both"/> Both</label>
                </div>
              </div>
            </div>

            <div class="agc-field-row">
              ${R.field({ id:'tin_existing', label:'Existing TIN', name:'TIN_Existing', placeholder:'Your Tax Identification Number (NRS)', optional:true, hint:'Leave blank if applying for a new TIN.' })}
              ${R.field({ id:'tin_taxoffice', label:'Tax Office / State', name:'TIN_Tax_Office', placeholder:'e.g. Lagos State IRS', optional:true })}
            </div>

            ${R.divider()}
            <div class="agc-sec-label">Business TIN Details</div>
            ${R.notice('Complete this section only if the TIN is for a registered business or company.', 'gold')}
            <div class="agc-field-row">
              ${R.field({ id:'tin_bizname', label:'Business / Company Name', name:'TIN_Business_Name', placeholder:'Registered name', optional:true })}
              ${R.field({ id:'tin_rcbn', label:'RC / BN Number', name:'TIN_RC_Number', placeholder:'e.g. RC 1234567 or BN 1234567', optional:true })}
            </div>
            <div class="agc-field-row">
              <div class="agc-field">
                <label for="tin_regtype">Registration Type <span class="agc-opt">(optional)</span></label>
                <select id="tin_regtype" name="TIN_Reg_Type">
                  <option value="">Select…</option>
                  <option>Business Name (BN)</option>
                  <option>Limited Company (RC)</option>
                  <option>Incorporated Trustees</option>
                  <option>Partnership</option>
                </select>
              </div>
              ${R.field({ id:'tin_bizaddress', label:'Business Address', name:'TIN_Business_Address', placeholder:'Registered business address', optional:true })}
            </div>
            <div class="agc-field-row one">
              ${R.field({ id:'tin_nature', label:'Nature of Business', name:'TIN_Nature', placeholder:'e.g. Retail trade, technology services', optional:true })}
            </div>

            ${R.divider()}
            <div class="agc-sec-label">Supporting Documents</div>
            <div class="agc-field-row">
              ${R.upload({ id:'tin_id', label:'Valid ID', name:'TIN_ID', icon:'🪪', description:'Passport, NIN card, or Driver\'s licence', required:true })}
              ${R.upload({ id:'tin_cac', label:'CAC Certificate', name:'TIN_CAC', icon:'📄', description:'If business TIN', optional:true })}
            </div>
          </div>
          ${R.navBar({ step, total, onNext:'AGC_Router.next()', onBack:'AGC_Router.back()' })}
        </div>`;
    },

    validate() {
      return V.requiredFile('tin_id');
    }
  });
})();