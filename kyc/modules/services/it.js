/**
 * MODULE: Incorporated Trustees / NGO
 */
(function () {
  const R = AGC_Renderer;
  const V = AGC_Validator;

  let trusteeCount = 2;

  function trusteeBlock(index) {
    const removable = index > 1;
    const fields = `
      <div class="agc-field-row three">
        <div class="agc-field"><label>First Name</label><input type="text" name="Trustee_${index}_First" placeholder="First name"/></div>
        <div class="agc-field"><label>Surname</label><input type="text" name="Trustee_${index}_Surname" placeholder="Surname"/></div>
        <div class="agc-field"><label>NIN</label><input type="text" name="Trustee_${index}_NIN" placeholder="11-digit NIN" maxlength="11"/></div>
      </div>
      <div class="agc-field-row">
        <div class="agc-field"><label>Phone</label><input type="tel" name="Trustee_${index}_Phone" placeholder="+234…"/></div>
        <div class="agc-field"><label>Email</label><input type="email" name="Trustee_${index}_Email" placeholder="email@example.com"/></div>
      </div>
      <div class="agc-field-row one">
        <div class="agc-field"><label>Residential Address</label>
          <textarea name="Trustee_${index}_Address" placeholder="Full address" rows="2"></textarea>
        </div>
      </div>`;
    const uploads = `
      <div class="agc-field-row">
        ${R.upload({ id:`it_t${index}_id`, label:'Valid ID', name:`Trustee_${index}_ID`, icon:'🪪', required: index < 2 })}
        ${R.upload({ id:`it_t${index}_photo`, label:'Passport Photo', name:`Trustee_${index}_Photo`, icon:'📷', required: index < 2 })}
      </div>
      <div class="agc-field-row">
        ${R.upload({ id:`it_t${index}_sig`, label:'Signature', name:`Trustee_${index}_Sig`, icon:'✍️', required: index < 2 })}
        <div></div>
      </div>`;
    return R.personBlock({ index, role:'Trustee', namePrefix:'it-trustee', removable, fields, uploads });
  }

  AGC_Router.register('it', {
    render(state) {
      const { step, total } = AGC_Router.stepInfo();
      trusteeCount = Math.max(2, AGC_Router.getPersonCount('it-trustee'));
      let blocks = '';
      for (let i = 0; i < trusteeCount; i++) blocks += trusteeBlock(i);

      return `
        <div class="agc-card">
          <div class="agc-card-head">
            <div class="agc-card-num">${step}</div>
            <div><div class="agc-card-title">Incorporated Trustees / NGO</div>
            <div class="agc-card-sub">25–30 business days</div></div>
          </div>
          <div class="agc-card-body">
            ${R.requirements((window.AGC_SERVICES.find(s=>s.id==='it')||{requirements:[]}).requirements)}
            ${R.notice('A minimum of 2 trustees are required by CAC for all Incorporated Trustees registrations.', 'blue')}

            <div class="agc-sec-label">Organisation Details</div>
            <div class="agc-field-row">
              ${R.field({ id:'it_name1', label:'Organisation Name — 1st Choice', name:'IT_Name_1st', placeholder:'e.g. Hope Foundation', required:true })}
              ${R.field({ id:'it_name2', label:'Organisation Name — 2nd Choice', name:'IT_Name_2nd', placeholder:'Alternative name', optional:true })}
            </div>
            <div class="agc-field-row one">
              ${R.textarea({ id:'it_objects', label:'Objects / Purpose of Organisation', name:'IT_Objects', placeholder:'State the aims and objectives of the organisation', required:true })}
            </div>
            <div class="agc-field-row">
              ${R.field({ id:'it_address', label:'Organisation Address', name:'IT_Address', placeholder:'Physical address in Nigeria', optional:true })}
              ${R.field({ id:'it_type', label:'Organisation Type', name:'IT_Type', optional:true })}
            </div>

            ${R.divider()}
            <div class="agc-sec-label">Trustees</div>
            <div id="it-trustees-container">
              ${blocks}
              ${R.addPersonBtn('Add Another Trustee', 'AGC_Modules.it.addTrustee()')}
            </div>
          </div>
          ${R.navBar({ step, total, onNext:'AGC_Router.next()', onBack:'AGC_Router.back()' })}
        </div>`;
    },

    validate() {
      let ok = true;
      ['it_name1','it_objects'].forEach(id => { if (!V.required(id)) ok = false; });
      return ok;
    },

    onMount() { trusteeCount = 2; }
  });

  window.AGC_Modules = window.AGC_Modules || {};
  window.AGC_Modules.it = {
    addTrustee() {
      trusteeCount++;
      AGC_Router.getState().personCounts['it-trustee'] = trusteeCount;
      const container = document.getElementById('it-trustees-container');
      const addBtn = container.querySelector('.agc-add-person-btn');
      const div = document.createElement('div');
      div.innerHTML = trusteeBlock(trusteeCount - 1);
      container.insertBefore(div.firstElementChild, addBtn);
      AGC_Renderer.bindAllFileInputs('it-trustees-container');
    }
  };
})();