/**
 * MODULE: TIN Validation
 */
(function () {
  const R = AGC_Renderer;
  const V = AGC_Validator;

  AGC_Router.register('tin_validation', {
    render(state) {
      const { step, total } = AGC_Router.stepInfo();
      return `
        <div class="agc-card">
          <div class="agc-card-head">
            <div class="agc-card-num">${step}</div>
            <div><div class="agc-card-title">TIN Validation</div>
            <div class="agc-card-sub">Verify an existing TIN — Nigerian Revenue Service (NRS)</div></div>
          </div>
          <div class="agc-card-body">
            ${R.requirements((window.AGC_SERVICES.find(s=>s.id==='tin_validation')||{requirements:[]}).requirements)}
            <div class="agc-field-row">
              ${R.field({ id:'tinv_number', label:'TIN Number to Validate', name:'TINV_Number', placeholder:'Your existing TIN (NRS)', required:true })}
              ${R.field({ id:'tinv_name', label:'Full Name as on NRS Records', name:'TINV_Name', placeholder:'Name exactly as registered', required:true })}
            </div>
            <div class="agc-field-row">
              ${R.field({ id:'tinv_bizname', label:'Business Name', name:'TINV_Business_Name', placeholder:'If business TIN', optional:true })}
              ${R.field({ id:'tinv_taxoffice', label:'Tax Office / State', name:'TINV_Tax_Office', placeholder:'e.g. Lagos State IRS', optional:true })}
            </div>
          </div>
          ${R.navBar({ step, total, onNext:'AGC_Router.next()', onBack:'AGC_Router.back()' })}
        </div>`;
    },

    validate() {
      return V.required('tinv_number') & V.required('tinv_name');
    }
  });
})();