/**
 * MODULE: Private Limited Company
 */
(function () {
  const R = AGC_Renderer;
  const V = AGC_Validator;

  let directorCount = 1;

  function directorBlock(index) {
    const i = index;
    const removable = i > 0;
    const stateOpts = R.STATES.map(s => `<option value="${s}">${s}</option>`).join('');
    const fields = `
      <div class="agc-field-row three">
        <div class="agc-field"><label>First Name <span class="agc-req">*</span></label>
          <input type="text" name="Dir_${i}_FirstName" placeholder="First name" ${i===0?'data-required':''}/>
        </div>
        <div class="agc-field"><label>Middle Name <span class="agc-opt">(opt)</span></label>
          <input type="text" name="Dir_${i}_MiddleName" placeholder="Middle name"/>
        </div>
        <div class="agc-field"><label>Surname <span class="agc-req">*</span></label>
          <input type="text" name="Dir_${i}_Surname" placeholder="Surname" ${i===0?'data-required':''}/>
        </div>
      </div>
      <div class="agc-field-row three">
        <div class="agc-field"><label>Date of Birth <span class="agc-req">*</span></label>
          <input type="date" name="Dir_${i}_DOB" ${i===0?'data-required':''}/>
        </div>
        <div class="agc-field"><label>Phone <span class="agc-req">*</span></label>
          <input type="tel" name="Dir_${i}_Phone" placeholder="+234…" ${i===0?'data-required':''}/>
        </div>
        <div class="agc-field"><label>NIN <span class="agc-req">*</span></label>
          <input type="text" name="Dir_${i}_NIN" placeholder="11-digit NIN" maxlength="11" ${i===0?'data-required':''}/>
        </div>
      </div>
      <div class="agc-field-row">
        <div class="agc-field"><label>Role</label>
          <select name="Dir_${i}_Role">
            <option value="">Select…</option>
            <option>Director only</option>
            <option>Shareholder only</option>
            <option>Shareholder and Director</option>
          </select>
        </div>
        <div class="agc-field"><label>Shareholding %</label>
          <input type="text" name="Dir_${i}_Shareholding" placeholder="e.g. 50%"/>
        </div>
      </div>
      <div class="agc-field-row one">
        <div class="agc-field"><label>Residential Address <span class="agc-req">*</span></label>
          <textarea name="Dir_${i}_Address" placeholder="Full address — not a P.O. Box" rows="2" ${i===0?'data-required':''}></textarea>
        </div>
      </div>`;

    const uploads = `
      <div class="agc-field-row">
        ${R.upload({ id:`ltd_dir${i}_id`, label:'Valid ID', name:`Dir_${i}_ID`, icon:'🪪', description:'Passport, NIN card, or Driver\'s licence', required: i===0 })}
        ${R.upload({ id:`ltd_dir${i}_photo`, label:'Passport Photo', name:`Dir_${i}_Photo`, icon:'📷', description:'Plain background, recent', required: i===0 })}
      </div>
      <div class="agc-field-row">
        ${R.upload({ id:`ltd_dir${i}_sig`, label:'Signature', name:`Dir_${i}_Signature`, icon:'✍️', description:'Sign on white paper', required: i===0 })}
        <div></div>
      </div>`;

    return R.personBlock({ index: i, role: 'Director / Shareholder', namePrefix: 'ltd-dir', removable, fields, uploads });
  }

  AGC_Router.register('ltd', {
    render(state) {
      const { step, total } = AGC_Router.stepInfo();
      const payment = window.AGC_PAYMENT.services.ltd;
      directorCount = AGC_Router.getPersonCount('ltd-dir');

      let dirBlocks = '';
      for (let i = 0; i < directorCount; i++) dirBlocks += directorBlock(i);

      return `
        <div class="agc-card">
          <div class="agc-card-head">
            <div class="agc-card-num">${step}</div>
            <div>
              <div class="agc-card-title">Private Limited Company</div>
              <div class="agc-card-sub">RC company registration — 3–7 business days</div>
            </div>
          </div>
          <div class="agc-card-body">
            ${R.requirements((window.AGC_SERVICES.find(s=>s.id==='ltd')||{requirements:[]}).requirements)}

            <div class="agc-sec-label">Choose Your Package</div>
            ${R.tierSelector('ltd', payment.tiers, state.tiers['ltd'] || 0)}

            ${R.divider()}
            <div class="agc-sec-label">Company Name Options</div>
            ${R.notice('CAC checks availability. Provide 2 options in order of preference.', 'blue')}
            <div class="agc-field-row">
              ${R.field({ id:'ltd_name1', label:'1st Choice', name:'Ltd_Name_1st', placeholder:'e.g. Your Company Limited', required:true })}
              ${R.field({ id:'ltd_name2', label:'2nd Choice', name:'Ltd_Name_2nd', placeholder:'Alternative name', optional:true })}
            </div>
            <div class="agc-field-row one">
              ${R.textarea({ id:'ltd_activities', label:'Principal Business Activities', name:'Ltd_Activities', placeholder:'Describe what the company does and its main activities', required:true })}
            </div>
            <div class="agc-field-row">
              <div class="agc-field" id="fw-ltd_share">
                <label for="ltd_share">Share Capital <span class="agc-req">*</span></label>
                <select id="ltd_share" name="Ltd_Share_Capital" data-required data-wrap="fw-ltd_share">
                  <option value="">Select…</option>
                  <option>₦1,000,000</option>
                  <option>₦5,000,000</option>
                  <option>₦10,000,000</option>
                  <option>₦100,000,000</option>
                  <option>Other — specify below</option>
                </select>
                <span class="agc-err-msg">Required</span>
              </div>
              ${R.field({ id:'ltd_share_custom', label:'Custom Share Capital', name:'Ltd_Share_Capital_Custom', placeholder:'e.g. ₦50,000,000', optional:true, hint:'Only if Other selected above.' })}
            </div>
            <div class="agc-field-row">
              ${R.field({ id:'ltd_address', label:'Registered Office Address', name:'Ltd_Office_Address', placeholder:'Physical address in Nigeria', optional:true })}
              ${R.field({ id:'ltd_rc', label:'Existing RC Number', name:'Ltd_RC_Number', placeholder:'e.g. RC 1234567', optional:true, hint:'Only for post-incorporation changes.' })}
            </div>

            ${R.divider()}
            <div class="agc-sec-label">Directors & Shareholders</div>
            ${R.notice('Each director and shareholder must provide their own ID, photograph, and signature.', 'blue')}

            <div id="ltd-directors-container">
              ${dirBlocks}
              ${R.addPersonBtn('Add Another Director / Shareholder', `AGC_Modules.ltd.addDirector()`)}
            </div>

          </div>
          ${R.navBar({ step, total, onNext:'AGC_Router.next()', onBack:'AGC_Router.back()' })}
        </div>`;
    },

    validate() {
      let ok = true;
      ['ltd_name1','ltd_activities','ltd_share'].forEach(id => { if (!V.required(id)) ok = false; });
      if (!V.requiredFile('ltd_dir0_id'))    ok = false;
      if (!V.requiredFile('ltd_dir0_photo')) ok = false;
      if (!V.requiredFile('ltd_dir0_sig'))   ok = false;
      return ok;
    },

    onMount() {
      directorCount = AGC_Router.getPersonCount('ltd-dir') || 1;
    }
  });

  window.AGC_Modules = window.AGC_Modules || {};
  window.AGC_Modules.ltd = {
    addDirector() {
      directorCount++;
      AGC_Router.getState().personCounts['ltd-dir'] = directorCount;
      const container = document.getElementById('ltd-directors-container');
      const addBtn = container.querySelector('.agc-add-person-btn');
      const div = document.createElement('div');
      div.innerHTML = directorBlock(directorCount - 1);
      container.insertBefore(div.firstElementChild, addBtn);
      AGC_Renderer.bindAllFileInputs('ltd-directors-container');
    }
  };
})();