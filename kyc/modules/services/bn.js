/**
 * MODULE: Business Name Registration
 */
(function () {
  const R = AGC_Renderer;
  const V = AGC_Validator;

  AGC_Router.register('bn', {
    render(state) {
      const { step, total } = AGC_Router.stepInfo();
      const payment = window.AGC_PAYMENT.services.bn;

      return `
        <div class="agc-card">
          <div class="agc-card-head">
            <div class="agc-card-num">${step}</div>
            <div>
              <div class="agc-card-title">Business Name Registration</div>
              <div class="agc-card-sub">Sole proprietorship — processed within 24 hours</div>
            </div>
          </div>
          <div class="agc-card-body">
            ${R.requirements((window.AGC_SERVICES.find(s=>s.id==='bn')||{requirements:[]}).requirements)}

            <div class="agc-sec-label">Choose Your Package</div>
            ${R.tierSelector('bn', payment.tiers, state.tiers['bn'] || 0)}

            ${R.divider()}
            <div class="agc-sec-label">Business Name Options</div>
            ${R.notice('CAC checks availability. Provide 2 options in order of preference.', 'blue')}

            <div class="agc-field-row">
              ${R.field({ id:'bn_name1', label:'1st Choice', name:'BN_Name_1st', placeholder:'Your preferred business name', required:true })}
              ${R.field({ id:'bn_name2', label:'2nd Choice', name:'BN_Name_2nd', placeholder:'Alternative name', optional:true })}
            </div>

            <div class="agc-field-row one">
              ${R.textarea({ id:'bn_nature', label:'Nature of Business', name:'BN_Nature', placeholder:'Describe what the business does', required:true })}
            </div>

            <div class="agc-field-row">
              ${R.field({ id:'bn_address', label:'Business Address', name:'BN_Address', placeholder:'Physical business address in Nigeria', required:true })}
              ${R.field({ id:'bn_existing', label:'Existing BN Number', name:'BN_Existing', placeholder:'e.g. BN 1234567', optional:true, hint:'Only for renewals or post-registration changes.' })}
            </div>

            ${R.notice('A Business Name is a sole proprietorship. Your personal details from the previous step will be used as proprietor information.', 'blue')}

            ${R.divider()}
            <div class="agc-sec-label">Proprietor Documents</div>
            <div class="agc-field-row">
              ${R.upload({ id:'bn_id', label:'Valid ID', name:'BN_ID', icon:'🪪', description:'Passport, NIN card, or Driver\'s licence', required:true })}
              ${R.upload({ id:'bn_photo', label:'Passport Photograph', name:'BN_Photo', icon:'📷', description:'Plain background, recent', required:true })}
            </div>
            <div class="agc-field-row">
              ${R.upload({ id:'bn_sig', label:'Signature', name:'BN_Signature', icon:'✍️', description:'Sign on white paper, photograph or scan', required:true })}
              ${R.upload({ id:'bn_extra', label:'Additional Documents', name:'BN_Extra', icon:'📎', description:'Any supporting documents', optional:true })}
            </div>

          </div>
          ${R.navBar({ step, total, onNext:'AGC_Router.next()', onBack:'AGC_Router.back()' })}
        </div>`;
    },

    validate() {
      let ok = true;
      ['bn_name1','bn_nature','bn_address'].forEach(id => { if (!V.required(id)) ok = false; });
      if (!V.requiredFile('bn_id'))    ok = false;
      if (!V.requiredFile('bn_photo')) ok = false;
      if (!V.requiredFile('bn_sig'))   ok = false;
      return ok;
    }
  });
})();