/**
 * MODULE: SCUML Registration
 */
(function () {
  const R = AGC_Renderer;
  const V = AGC_Validator;

  AGC_Router.register('scuml', {
    render(state) {
      const { step, total } = AGC_Router.stepInfo();
      return `
        <div class="agc-card">
          <div class="agc-card-head">
            <div class="agc-card-num">${step}</div>
            <div><div class="agc-card-title">SCUML Registration</div>
            <div class="agc-card-sub">Special Control Unit Against Money Laundering — DNFBPs</div></div>
          </div>
          <div class="agc-card-body">
            ${R.requirements((window.AGC_SERVICES.find(s=>s.id==='scuml')||{requirements:[]}).requirements)}
            ${R.notice('SCUML registration is mandatory for Designated Non-Financial Businesses and Professions (DNFBPs) operating in Nigeria.', 'blue')}

            <div class="agc-sec-label">Business Category</div>
            <div class="agc-scuml-grid">
              ${[
                'Estate Agents / Real Estate',
                'Lawyers / Legal Practitioners',
                'Accountants / Auditors',
                'Dealers in Precious Metals & Stones',
                'Dealers in Luxury Goods',
                'Notaries / Trust & Company Service Providers',
                'Construction / Real Estate Development',
                'Car Dealers (High Value)',
                'Other DNFBP — specify below'
              ].map(cat => `
                <label class="agc-scuml-cat">
                  <input type="radio" name="SCUML_Category" value="${cat}"/>
                  ${cat}
                </label>`).join('')}
            </div>
            <div class="agc-field-row one">
              ${R.field({ id:'scuml_catother', label:'If Other — specify category', name:'SCUML_Category_Other', placeholder:'Describe your DNFBP category', optional:true })}
            </div>

            ${R.divider()}
            <div class="agc-sec-label">CAC / Business Details</div>
            <div class="agc-field-row">
              ${R.field({ id:'scuml_bizname', label:'Business / Company Name', name:'SCUML_Business_Name', placeholder:'Registered name as on CAC certificate', required:true })}
              ${R.field({ id:'scuml_rcbn', label:'RC / BN Number', name:'SCUML_RC_Number', placeholder:'e.g. RC 1234567 or BN 1234567', required:true })}
            </div>
            <div class="agc-field-row">
              <div class="agc-field">
                <label for="scuml_regtype">Registration Type</label>
                <select id="scuml_regtype" name="SCUML_Reg_Type">
                  <option value="">Select…</option>
                  <option>Business Name (BN)</option>
                  <option>Limited Company (RC)</option>
                  <option>Incorporated Trustees</option>
                  <option>Partnership</option>
                </select>
              </div>
              ${R.field({ id:'scuml_cacdate', label:'Date of CAC Registration', name:'SCUML_CAC_Date', type:'date', optional:true })}
            </div>
            <div class="agc-field-row one">
              ${R.field({ id:'scuml_bizaddress', label:'Business Address', name:'SCUML_Business_Address', placeholder:'Registered business address', optional:true })}
            </div>
            <div class="agc-field-row one">
              ${R.textarea({ id:'scuml_transactions', label:'Nature of Transactions / Services', name:'SCUML_Transactions', placeholder:'Describe the transactions or services your business handles that require SCUML registration', optional:true })}
            </div>
            <div class="agc-field-row one">
              ${R.field({ id:'scuml_existing', label:'Existing SCUML Number', name:'SCUML_Existing', placeholder:'If already registered', optional:true })}
            </div>

            ${R.divider()}
            <div class="agc-sec-label">Compliance Officer</div>
            ${R.notice('SCUML requires a designated compliance officer. This can be the business owner.', 'gold')}
            <div class="agc-field-row">
              ${R.field({ id:'scuml_officer', label:'Compliance Officer Full Name', name:'SCUML_Officer_Name', placeholder:'Full name', required:true })}
              ${R.field({ id:'scuml_officerphone', label:'Compliance Officer Phone', name:'SCUML_Officer_Phone', placeholder:'+234 800 000 0000', required:true })}
            </div>
            <div class="agc-field-row one">
              ${R.field({ id:'scuml_officernin', label:'Compliance Officer NIN', name:'SCUML_Officer_NIN', placeholder:'11-digit NIN', maxlength:'11', optional:true })}
            </div>

            ${R.divider()}
            <div class="agc-sec-label">Customer Due Diligence</div>
            ${R.notice('This information supports the risk assessment SCUML expects DNFBPs to carry out on their own clients and transactions.', 'blue')}
            <div class="agc-field-row one">
              ${R.textarea({ id:'scuml_sof', label:'Typical Source of Funds for Transactions', name:'SCUML_Source_Of_Funds', placeholder:'e.g. business revenue, client payments, investment capital', optional:true })}
            </div>
            <div class="agc-chk-field" id="fw-scuml_pep">
              <input type="checkbox" id="scuml_pep" name="SCUML_PEP_Declaration" value="Yes"/>
              <label for="scuml_pep">
                The business owner, a director, or a beneficial owner is a Politically Exposed
                Person (PEP) — currently or formerly holding a prominent public position, or a
                close associate/family member of someone who does.
              </label>
            </div>

            ${R.divider()}
            <div class="agc-sec-label">Documents</div>
            <div class="agc-field-row">
              ${R.upload({ id:'scuml_cac', label:'CAC Certificate', name:'SCUML_CAC_Cert', icon:'📄', description:'RC or BN certificate', required:true })}
              ${R.upload({ id:'scuml_officer_id', label:'Compliance Officer Valid ID', name:'SCUML_Officer_ID', icon:'🪪', description:'Passport, NIN card, or Driver\'s licence', required:true })}
            </div>
            <div class="agc-field-row">
              ${R.upload({ id:'scuml_officer_photo', label:'Compliance Officer Passport Photo', name:'SCUML_Officer_Photo', icon:'📷', required:true })}
              ${R.upload({ id:'scuml_extra', label:'Additional Documents', name:'SCUML_Extra', icon:'📎', optional:true })}
            </div>
          </div>
          ${R.navBar({ step, total, onNext:'AGC_Router.next()', onBack:'AGC_Router.back()' })}
        </div>`;
    },

    validate() {
      let ok = true;
      ['scuml_bizname','scuml_rcbn','scuml_officer','scuml_officerphone'].forEach(id => { if (!V.required(id)) ok = false; });
      if (!V.requiredFile('scuml_cac'))        ok = false;
      if (!V.requiredFile('scuml_officer_id')) ok = false;
      if (!V.requiredFile('scuml_officer_photo')) ok = false;
      return ok;
    }
  });
})();