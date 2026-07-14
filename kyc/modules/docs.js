/**
 * MODULE: Documents Upload Screen
 * Shows only relevant uploads based on selected services
 */
(function () {
  const R = AGC_Renderer;
  const V = AGC_Validator;

  AGC_Router.register('docs', {

    render(state) {
      const { step, total } = AGC_Router.stepInfo();
      const svcs = state.selectedServices || [];

      // Determine which extra doc sections to show
      const needsCAC = svcs.some(id => ['ltd','it','annual_returns','change_directors',
        'change_shareholders','share_capital','company_secretary','scuml','nipc',
        'business_permit','expatriate_quota','son','nafdac','ndpr','iso','vat',
        'paye','payroll','tax_clearance','export_import'].includes(id));

      const needsTM = svcs.includes('trademark');
      const needsPassport = svcs.some(id => ['expatriate_quota','student_visa','immigration'].includes(id));
      const needsDirectorDocs = svcs.includes('ltd');

      return `
        <div class="agc-card">
          <div class="agc-card-head">
            <div class="agc-card-num">${step}</div>
            <div>
              <div class="agc-card-title">Identity Documents</div>
              <div class="agc-card-sub">Upload clear, legible copies of all required documents</div>
            </div>
          </div>
          <div class="agc-card-body">

            ${R.notice('📎 All files are sent securely with your submission. Maximum 5MB per file. Accepted formats: JPG, PNG, PDF.', 'gold')}
            ${R.saveBar()}

            <div class="agc-sec-label">Your Personal Documents</div>
            <div class="agc-field-row">
              ${R.upload({ id:'doc_id', label:'Valid Government ID', name:'Doc_ID',
                icon:'🪪', description:'Passport, NIN card, or Driver\'s licence', required:true })}
              ${R.upload({ id:'doc_photo', label:'Passport Photograph', name:'Doc_Photo',
                icon:'📷', description:'Plain background, recent, clear', required:true })}
            </div>
            <div class="agc-field-row">
              ${R.upload({ id:'doc_sig', label:'Signature', name:'Doc_Signature',
                icon:'✍️', description:'Sign on white paper, photograph or scan clearly', required:true })}
              ${R.upload({ id:'doc_poa', label:'Proof of Address', name:'Doc_Proof_Of_Address',
                icon:'🏠', description:'Utility bill, bank statement, or tenancy agreement — dated within the last 3 months', optional:true,
                hint:'Not required for every service, but speeds up processing and is needed for most regulatory and financial filings.' })}
            </div>
            <div class="agc-field-row">
              ${R.upload({ id:'doc_extra', label:'Additional Documents', name:'Doc_Extra',
                icon:'📎', description:'Any other supporting documents', optional:true })}
            </div>

            ${needsCAC ? `
              <hr class="agc-sec-divider"/>
              <div class="agc-sec-label">Business / Company Documents</div>
              <div class="agc-field-row">
                ${R.upload({ id:'doc_cac', label:'CAC Certificate', name:'Doc_CAC_Cert',
                  icon:'📄', description:'RC or BN certificate from CAC', optional:true,
                  hint:'Required for corporate services.' })}
                ${R.upload({ id:'doc_memart', label:'MEMART', name:'Doc_MEMART',
                  icon:'📄', description:'Memorandum & Articles of Association', optional:true,
                  hint:'For Limited Company services.' })}
              </div>` : ''}

            ${needsTM ? `
              <hr class="agc-sec-divider"/>
              <div class="agc-sec-label">Trademark Documents</div>
              <div class="agc-field-row">
                ${R.upload({ id:'doc_tm_logo', label:'Logo / Mark File', name:'Doc_TM_Logo',
                  icon:'🎨', description:'High-resolution logo or mark — PNG, SVG, or PDF', optional:true,
                  hint:'Required if filing a logo or combined mark.' })}
                ${R.upload({ id:'doc_tm_cac', label:'CAC Certificate', name:'Doc_TM_CAC',
                  icon:'📄', description:'If filing trademark under a company name', optional:true })}
              </div>` : ''}

            ${needsPassport ? `
              <hr class="agc-sec-divider"/>
              <div class="agc-sec-label">Travel Documents</div>
              <div class="agc-field-row">
                ${R.upload({ id:'doc_passport', label:'International Passport', name:'Doc_Intl_Passport',
                  icon:'🛂', description:'Full data page — minimum 6 months validity', required:true })}
                ${R.upload({ id:'doc_visa', label:'Current Visa / Permit', name:'Doc_Current_Visa',
                  icon:'📄', description:'If applicable', optional:true })}
              </div>` : ''}

            ${needsDirectorDocs ? `
              <hr class="agc-sec-divider"/>
              <div class="agc-sec-label">Additional Directors / Shareholders Documents</div>
              ${R.notice('Each additional director or shareholder must upload their own ID, passport photo, and signature below.', 'blue')}
              <div id="dir-docs-container">
                ${renderDirectorDocBlock(0)}
                ${R.addPersonBtn('Add Another Director / Shareholder Documents', 'AGC_Modules.docs.addDirectorDocs()')}
              </div>` : ''}

          </div>
          ${R.navBar({ step, total, onNext:'AGC_Router.next()', onBack:'AGC_Router.back()' })}
        </div>`;
    },

    validate(state) {
      let ok = true;
      if (!V.requiredFile('doc_id'))    ok = false;
      if (!V.requiredFile('doc_photo')) ok = false;
      if (!V.requiredFile('doc_sig'))   ok = false;
      const needsPassport = (state.selectedServices||[]).some(id =>
        ['expatriate_quota','student_visa','immigration'].includes(id));
      if (needsPassport && !V.requiredFile('doc_passport')) ok = false;
      return ok;
    },

    onMount() {
      window._dirDocCount = 1;
    }
  });

  function renderDirectorDocBlock(index) {
    return R.personBlock({
      index,
      role: 'Director / Shareholder',
      namePrefix: 'dir-docs',
      removable: index > 0,
      fields: `
        <div class="agc-field-row one">
          <div class="agc-field">
            <label>Full Name</label>
            <input type="text" name="DirDoc_${index}_Name" placeholder="Director / Shareholder full name"/>
          </div>
        </div>`,
      uploads: `
        <div class="agc-field-row">
          ${R.upload({ id:`dirdoc_${index}_id`, label:'Valid ID', name:`DirDoc_${index}_ID`, icon:'🪪', optional:true })}
          ${R.upload({ id:`dirdoc_${index}_photo`, label:'Passport Photo', name:`DirDoc_${index}_Photo`, icon:'📷', optional:true })}
        </div>
        <div class="agc-field-row">
          ${R.upload({ id:`dirdoc_${index}_sig`, label:'Signature', name:`DirDoc_${index}_Sig`, icon:'✍️', optional:true })}
          <div></div>
        </div>`
    });
  }

  window.AGC_Modules = window.AGC_Modules || {};
  window.AGC_Modules.docs = {
    addDirectorDocs() {
      window._dirDocCount = (window._dirDocCount || 1) + 1;
      const container = document.getElementById('dir-docs-container');
      if (!container) return;
      const addBtn = container.querySelector('.agc-add-person-btn');
      const div = document.createElement('div');
      div.innerHTML = renderDirectorDocBlock(window._dirDocCount - 1);
      container.insertBefore(div.firstElementChild, addBtn);
      AGC_Renderer.bindAllFileInputs('dir-docs-container');
    }
  };

})();