/**
 * MODULE: Incorporated Trustees / NGO
 * Full individual trustee blocks with uploads and add-more
 */
(function () {
  const R = AGC_Renderer;
  const V = AGC_Validator;

  let trusteeCount = 2;

  function trusteeBlock(index) {
    const removable = index > 1;
    const fields = `
      <div class="agc-field-row three">
        <div class="agc-field">
          <label>First Name <span class="agc-req">*</span></label>
          <input type="text" name="Trustee_${index}_First" placeholder="First name"
            ${index < 2 ? 'data-required' : ''}/>
        </div>
        <div class="agc-field">
          <label>Middle Name <span class="agc-opt">(optional)</span></label>
          <input type="text" name="Trustee_${index}_Middle" placeholder="Middle name"/>
        </div>
        <div class="agc-field">
          <label>Surname <span class="agc-req">*</span></label>
          <input type="text" name="Trustee_${index}_Surname" placeholder="Surname"
            ${index < 2 ? 'data-required' : ''}/>
        </div>
      </div>
      <div class="agc-field-row three">
        <div class="agc-field">
          <label>Date of Birth</label>
          <input type="date" name="Trustee_${index}_DOB"/>
        </div>
        <div class="agc-field">
          <label>Phone <span class="agc-req">*</span></label>
          <input type="tel" name="Trustee_${index}_Phone" placeholder="+234…"
            ${index < 2 ? 'data-required' : ''}/>
        </div>
        <div class="agc-field">
          <label>NIN</label>
          <input type="text" name="Trustee_${index}_NIN" placeholder="11-digit NIN" maxlength="11"/>
        </div>
      </div>
      <div class="agc-field-row">
        <div class="agc-field">
          <label>Email</label>
          <input type="email" name="Trustee_${index}_Email" placeholder="email@example.com"/>
        </div>
        <div class="agc-field">
          <label>Occupation</label>
          <input type="text" name="Trustee_${index}_Occupation" placeholder="e.g. Teacher, Engineer"/>
        </div>
      </div>
      <div class="agc-field-row one">
        <div class="agc-field">
          <label>Residential Address <span class="agc-req">*</span></label>
          <textarea name="Trustee_${index}_Address" placeholder="Full residential address — not a P.O. Box"
            rows="2" ${index < 2 ? 'data-required' : ''}></textarea>
        </div>
      </div>`;

    const uploads = `
      <div class="agc-field-row">
        ${R.upload({
          id: `it_t${index}_id`,
          label: 'Valid ID',
          name: `Trustee_${index}_ID`,
          icon: '🪪',
          description: 'Passport, NIN card, or Driver\'s licence',
          required: index < 2
        })}
        ${R.upload({
          id: `it_t${index}_photo`,
          label: 'Passport Photograph',
          name: `Trustee_${index}_Photo`,
          icon: '📷',
          description: 'Plain background, recent',
          required: index < 2
        })}
      </div>
      <div class="agc-field-row">
        ${R.upload({
          id: `it_t${index}_sig`,
          label: 'Signature',
          name: `Trustee_${index}_Sig`,
          icon: '✍️',
          description: 'Sign on white paper, photograph or scan',
          required: index < 2
        })}
        <div></div>
      </div>`;

    return R.personBlock({
      index,
      role: 'Trustee',
      namePrefix: 'it-trustee',
      removable,
      fields,
      uploads
    });
  }

  AGC_Router.register('it', {

    render(state) {
      const { step, total } = AGC_Router.stepInfo();
      trusteeCount = Math.max(2, AGC_Router.getPersonCount('it-trustee') || 2);

      let blocks = '';
      for (let i = 0; i < trusteeCount; i++) blocks += trusteeBlock(i);

      const svc = (window.AGC_SERVICES || []).find(s => s.id === 'it') || { requirements: [] };

      return `
        <div class="agc-card">
          <div class="agc-card-head">
            <div class="agc-card-num">${step}</div>
            <div>
              <div class="agc-card-title">Incorporated Trustees / NGO</div>
              <div class="agc-card-sub">Organisation registration — 25–30 business days</div>
            </div>
          </div>
          <div class="agc-card-body">

            ${R.requirements(svc.requirements)}
            ${R.notice('A minimum of <strong>2 trustees</strong> are required by CAC. Each trustee must provide their own ID, photograph, and signature.', 'blue')}

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
              <div class="agc-field">
                <label for="it_type">Organisation Type <span class="agc-opt">(optional)</span></label>
                <select id="it_type" name="IT_Type">
                  <option value="">Select…</option>
                  <option>Religious Organisation</option>
                  <option>Non-Governmental Organisation (NGO)</option>
                  <option>Community Development Association</option>
                  <option>Charity / Foundation</option>
                  <option>Professional Association</option>
                  <option>Cultural Organisation</option>
                  <option>Other</option>
                </select>
              </div>
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
      if (!V.required('it_name1'))   ok = false;
      if (!V.required('it_objects')) ok = false;
      // Validate first two trustees have required files
      [0, 1].forEach(i => {
        if (!V.requiredFile(`it_t${i}_id`))    ok = false;
        if (!V.requiredFile(`it_t${i}_photo`)) ok = false;
        if (!V.requiredFile(`it_t${i}_sig`))   ok = false;
      });
      return ok;
    },

    onMount() {
      trusteeCount = AGC_Router.getPersonCount('it-trustee') || 2;
    }
  });

  window.AGC_Modules = window.AGC_Modules || {};
  window.AGC_Modules.it = {
    addTrustee() {
      trusteeCount++;
      AGC_Router.getState().personCounts['it-trustee'] = trusteeCount;
      const container = document.getElementById('it-trustees-container');
      if (!container) return;
      const addBtn = container.querySelector('.agc-add-person-btn');
      const div = document.createElement('div');
      div.innerHTML = trusteeBlock(trusteeCount - 1);
      container.insertBefore(div.firstElementChild, addBtn);
      AGC_Renderer.bindAllFileInputs('it-trustees-container');
    }
  };

})();