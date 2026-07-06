/**
 * REMAINING SERVICE MODULES
 * One file for efficiency — each module is self-contained.
 */

// ─── Helper shorthand ───────────────────────────────────────────────────────
const _R = () => AGC_Renderer;
const _V = () => AGC_Validator;
function _svc(id) { return (window.AGC_SERVICES||[]).find(s=>s.id===id)||{requirements:[],name:id}; }
function _pay(id) { return (window.AGC_PAYMENT||{services:{}}).services[id]||{}; }

function _simpleModule(id, title, sub, bodyFn, validateFn) {
  AGC_Router.register(id, {
    render(state) {
      const { step, total } = AGC_Router.stepInfo();
      return `
        <div class="agc-card">
          <div class="agc-card-head">
            <div class="agc-card-num">${step}</div>
            <div><div class="agc-card-title">${title}</div>
            <div class="agc-card-sub">${sub}</div></div>
          </div>
          <div class="agc-card-body">
            ${_R().requirements(_svc(id).requirements)}
            ${bodyFn(state)}
          </div>
          ${_R().navBar({ step, total, onNext:'AGC_Router.next()', onBack:'AGC_Router.back()' })}
        </div>`;
    },
    validate: validateFn || (() => true)
  });
}

// ─── Annual Returns ─────────────────────────────────────────────────────────
_simpleModule('annual_returns','CAC Annual Returns','Yearly statutory compliance filing', () => `
  <div class="agc-field-row">
    ${_R().field({ id:'ar_name', label:'Company / Business Name', name:'AR_Name', placeholder:'Registered name', required:true })}
    ${_R().field({ id:'ar_rcbn', label:'RC / BN Number', name:'AR_RC_Number', placeholder:'e.g. RC 1234567', required:true })}
  </div>
  <div class="agc-field-row">
    <div class="agc-field">
      <label for="ar_type">Registration Type</label>
      <select id="ar_type" name="AR_Reg_Type"><option value="">Select…</option>
        <option>Business Name (BN)</option><option>Limited Company (RC)</option>
        <option>Incorporated Trustees</option>
      </select>
    </div>
    ${_R().field({ id:'ar_years', label:'Year(s) of Returns', name:'AR_Years', placeholder:'e.g. 2023, 2024', required:true, hint:'List all outstanding years.' })}
  </div>
  <div class="agc-field-row one">
    ${_R().field({ id:'ar_address', label:'Current Registered Address', name:'AR_Address', placeholder:'Current registered office address', optional:true })}
  </div>
  ${_R().divider()}
  <div class="agc-sec-label">Documents</div>
  <div class="agc-field-row">
    ${_R().upload({ id:'ar_cert', label:'CAC Certificate', name:'AR_CAC_Cert', icon:'📄', required:true })}
    ${_R().upload({ id:'ar_extra', label:'Additional Documents', name:'AR_Extra', icon:'📎', optional:true })}
  </div>`,
  () => _V().required('ar_name') & _V().required('ar_rcbn') & _V().required('ar_years') & _V().requiredFile('ar_cert')
);

// ─── Change of Directors ────────────────────────────────────────────────────
(function(){
  let count = 1;
  function dirBlock(i) {
    return _R().personBlock({ index:i, role:'Incoming Director', namePrefix:'cd-dir', removable:i>0, fields:`
      <div class="agc-field-row three">
        <div class="agc-field"><label>First Name</label><input type="text" name="CD_Dir${i}_First" placeholder="First name"/></div>
        <div class="agc-field"><label>Surname</label><input type="text" name="CD_Dir${i}_Surname" placeholder="Surname"/></div>
        <div class="agc-field"><label>NIN</label><input type="text" name="CD_Dir${i}_NIN" placeholder="11-digit NIN" maxlength="11"/></div>
      </div>
      <div class="agc-field-row">
        <div class="agc-field"><label>Phone</label><input type="tel" name="CD_Dir${i}_Phone" placeholder="+234…"/></div>
        <div class="agc-field"><label>Action</label>
          <select name="CD_Dir${i}_Action"><option value="">Select…</option><option>Add new director</option><option>Remove existing director</option><option>Update details</option></select>
        </div>
      </div>`,
      uploads:`<div class="agc-field-row">
        ${_R().upload({ id:`cd_dir${i}_id`, label:'Valid ID', name:`CD_Dir${i}_ID`, icon:'🪪', optional:true })}
        ${_R().upload({ id:`cd_dir${i}_photo`, label:'Passport Photo', name:`CD_Dir${i}_Photo`, icon:'📷', optional:true })}
      </div>
      <div class="agc-field-row">
        ${_R().upload({ id:`cd_dir${i}_sig`, label:'Signature', name:`CD_Dir${i}_Sig`, icon:'✍️', optional:true })}
        <div></div>
      </div>`
    });
  }
  AGC_Router.register('change_directors', {
    render(state) {
      const { step, total } = AGC_Router.stepInfo();
      count = 1;
      return `<div class="agc-card">
        <div class="agc-card-head"><div class="agc-card-num">${step}</div>
          <div><div class="agc-card-title">Change of Directors</div><div class="agc-card-sub">Add, remove, or update company directors</div></div>
        </div>
        <div class="agc-card-body">
          ${_R().requirements(_svc('change_directors').requirements)}
          <div class="agc-field-row">
            ${_R().field({ id:'cd_company', label:'Company Name', name:'CD_Company', placeholder:'Registered company name', required:true })}
            ${_R().field({ id:'cd_rc', label:'RC Number', name:'CD_RC', placeholder:'e.g. RC 1234567', required:true })}
          </div>
          ${_R().divider()}
          <div class="agc-sec-label">Directors Being Added / Removed</div>
          <div id="cd-dirs-container">${dirBlock(0)}
            ${_R().addPersonBtn('Add Another Director', 'AGC_Modules.cd.add()')}
          </div>
          ${_R().divider()}
          <div class="agc-sec-label">Supporting Documents</div>
          <div class="agc-field-row">
            ${_R().upload({ id:'cd_cert', label:'CAC Certificate', name:'CD_CAC_Cert', icon:'📄', required:true })}
            ${_R().upload({ id:'cd_resolution', label:'Board Resolution', name:'CD_Resolution', icon:'📄', hint:'Signed resolution approving the change', required:true })}
          </div>
        </div>
        ${_R().navBar({ step, total, onNext:'AGC_Router.next()', onBack:'AGC_Router.back()' })}
      </div>`;
    },
    validate() { return _V().required('cd_company') & _V().required('cd_rc') & _V().requiredFile('cd_cert') & _V().requiredFile('cd_resolution'); }
  });
  window.AGC_Modules = window.AGC_Modules||{};
  window.AGC_Modules.cd = { add() {
    count++;
    const c = document.getElementById('cd-dirs-container');
    const btn = c.querySelector('.agc-add-person-btn');
    const d = document.createElement('div'); d.innerHTML = dirBlock(count-1);
    c.insertBefore(d.firstElementChild, btn); AGC_Renderer.bindAllFileInputs('cd-dirs-container');
  }};
})();

// ─── Change of Shareholders ─────────────────────────────────────────────────
(function(){
  let count = 1;
  function shBlock(i) {
    return _R().personBlock({ index:i, role:'Shareholder', namePrefix:'cs-sh', removable:i>0, fields:`
      <div class="agc-field-row three">
        <div class="agc-field"><label>Full Name</label><input type="text" name="CS_SH${i}_Name" placeholder="Full name"/></div>
        <div class="agc-field"><label>NIN</label><input type="text" name="CS_SH${i}_NIN" placeholder="11-digit NIN" maxlength="11"/></div>
        <div class="agc-field"><label>Phone</label><input type="tel" name="CS_SH${i}_Phone" placeholder="+234…"/></div>
      </div>
      <div class="agc-field-row">
        <div class="agc-field"><label>Shareholding %</label><input type="text" name="CS_SH${i}_Percent" placeholder="e.g. 30%"/></div>
        <div class="agc-field"><label>Action</label>
          <select name="CS_SH${i}_Action"><option value="">Select…</option><option>Transfer shares to this person</option><option>Allot new shares</option><option>Remove shareholder</option></select>
        </div>
      </div>`,
      uploads:`<div class="agc-field-row">
        ${_R().upload({ id:`cs_sh${i}_id`, label:'Valid ID', name:`CS_SH${i}_ID`, icon:'🪪', optional:true })}
        ${_R().upload({ id:`cs_sh${i}_sig`, label:'Signature', name:`CS_SH${i}_Sig`, icon:'✍️', optional:true })}
      </div>`
    });
  }
  AGC_Router.register('change_shareholders', {
    render(state) {
      const { step, total } = AGC_Router.stepInfo(); count = 1;
      return `<div class="agc-card">
        <div class="agc-card-head"><div class="agc-card-num">${step}</div>
          <div><div class="agc-card-title">Change of Shareholders</div><div class="agc-card-sub">Share transfer, allotment, or update</div></div>
        </div>
        <div class="agc-card-body">
          ${_R().requirements(_svc('change_shareholders').requirements)}
          <div class="agc-field-row">
            ${_R().field({ id:'cs_company', label:'Company Name', name:'CS_Company', placeholder:'Registered company name', required:true })}
            ${_R().field({ id:'cs_rc', label:'RC Number', name:'CS_RC', placeholder:'e.g. RC 1234567', required:true })}
          </div>
          <div id="cs-sh-container">${shBlock(0)}
            ${_R().addPersonBtn('Add Another Shareholder', 'AGC_Modules.cs.add()')}
          </div>
          ${_R().divider()}
          <div class="agc-sec-label">Documents</div>
          <div class="agc-field-row">
            ${_R().upload({ id:'cs_cert', label:'CAC Certificate', name:'CS_CAC_Cert', icon:'📄', required:true })}
            ${_R().upload({ id:'cs_form', label:'Share Transfer Form / Resolution', name:'CS_Transfer_Form', icon:'📄', required:true })}
          </div>
        </div>
        ${_R().navBar({ step, total, onNext:'AGC_Router.next()', onBack:'AGC_Router.back()' })}
      </div>`;
    },
    validate() { return _V().required('cs_company') & _V().required('cs_rc') & _V().requiredFile('cs_cert'); }
  });
  window.AGC_Modules.cs = { add() {
    count++; const c = document.getElementById('cs-sh-container');
    const btn = c.querySelector('.agc-add-person-btn');
    const d = document.createElement('div'); d.innerHTML = shBlock(count-1);
    c.insertBefore(d.firstElementChild, btn); AGC_Renderer.bindAllFileInputs('cs-sh-container');
  }};
})();

// ─── Increase of Share Capital ──────────────────────────────────────────────
_simpleModule('share_capital','Increase of Share Capital','Increase authorised share capital', () => `
  <div class="agc-field-row">
    ${_R().field({ id:'sc_company', label:'Company Name', name:'SC_Company', placeholder:'Registered company name', required:true })}
    ${_R().field({ id:'sc_rc', label:'RC Number', name:'SC_RC', placeholder:'e.g. RC 1234567', required:true })}
  </div>
  <div class="agc-field-row">
    ${_R().field({ id:'sc_current', label:'Current Share Capital', name:'SC_Current', placeholder:'e.g. ₦1,000,000', required:true })}
    ${_R().field({ id:'sc_proposed', label:'Proposed New Share Capital', name:'SC_Proposed', placeholder:'e.g. ₦10,000,000', required:true })}
  </div>
  ${_R().divider()}
  <div class="agc-sec-label">Documents</div>
  <div class="agc-field-row">
    ${_R().upload({ id:'sc_cert', label:'CAC Certificate', name:'SC_CAC_Cert', icon:'📄', required:true })}
    ${_R().upload({ id:'sc_resolution', label:'Board / Special Resolution', name:'SC_Resolution', icon:'📄', hint:'Resolution approving the increase', required:true })}
  </div>`,
  () => _V().required('sc_company') & _V().required('sc_rc') & _V().required('sc_current') & _V().required('sc_proposed') & _V().requiredFile('sc_cert')
);

// ─── Company Secretary ──────────────────────────────────────────────────────
_simpleModule('company_secretary','Company Secretary Services','Statutory compliance and secretarial support', () => `
  <div class="agc-field-row">
    ${_R().field({ id:'csec_company', label:'Company Name', name:'CSec_Company', placeholder:'Registered company name', required:true })}
    ${_R().field({ id:'csec_rc', label:'RC Number', name:'CSec_RC', placeholder:'e.g. RC 1234567', required:true })}
  </div>
  <div class="agc-field-row one">
    ${_R().textarea({ id:'csec_scope', label:'Scope of Secretarial Support Required', name:'CSec_Scope', placeholder:'Describe the secretarial services you need', required:true })}
  </div>
  <div class="agc-field-row">
    <div class="agc-field"><label>Frequency</label>
      <select name="CSec_Frequency"><option value="">Select…</option>
        <option>Monthly</option><option>Quarterly</option><option>Annual</option><option>As needed</option>
      </select>
    </div>
    <div></div>
  </div>
  ${_R().divider()}
  <div class="agc-field-row">
    ${_R().upload({ id:'csec_cert', label:'CAC Certificate', name:'CSec_CAC_Cert', icon:'📄', required:true })}
    ${_R().upload({ id:'csec_memart', label:'MEMART', name:'CSec_MEMART', icon:'📄', optional:true })}
  </div>`,
  () => _V().required('csec_company') & _V().required('csec_rc') & _V().required('csec_scope') & _V().requiredFile('csec_cert')
);

// ─── Tax Clearance ──────────────────────────────────────────────────────────
_simpleModule('tax_clearance','Tax Clearance Certificate','FIRS/NRS tax clearance', () => `
  <div class="agc-field-row">
    ${_R().field({ id:'tc_tin', label:'TIN Number', name:'TC_TIN', placeholder:'Your Tax Identification Number', required:true })}
    ${_R().field({ id:'tc_name', label:'Full Name / Company Name', name:'TC_Name', placeholder:'Name as on NRS records', required:true })}
  </div>
  <div class="agc-field-row">
    ${_R().field({ id:'tc_years', label:'Years Required', name:'TC_Years', placeholder:'e.g. 2022, 2023, 2024', required:true })}
    ${_R().field({ id:'tc_purpose', label:'Purpose', name:'TC_Purpose', placeholder:'e.g. Contract bid, loan application', optional:true })}
  </div>
  ${_R().divider()}
  <div class="agc-sec-label">Documents</div>
  <div class="agc-field-row">
    ${_R().upload({ id:'tc_id', label:'Valid ID', name:'TC_ID', icon:'🪪', required:true })}
    ${_R().upload({ id:'tc_returns', label:'Tax Returns / Evidence of Payment', name:'TC_Returns', icon:'📄', hint:'Last 3 years if available', optional:true })}
  </div>
  <div class="agc-field-row">
    ${_R().upload({ id:'tc_cac', label:'CAC Certificate', name:'TC_CAC', icon:'📄', hint:'If business tax clearance', optional:true })}
    ${_R().upload({ id:'tc_financials', label:'Audited Financial Statements', name:'TC_Financials', icon:'📊', optional:true })}
  </div>`,
  () => _V().required('tc_tin') & _V().required('tc_name') & _V().required('tc_years') & _V().requiredFile('tc_id')
);

// ─── VAT ────────────────────────────────────────────────────────────────────
_simpleModule('vat','VAT Registration & Filing','Value Added Tax', () => `
  <div class="agc-field-row one">
    <div class="agc-field"><label>VAT Service Required</label>
      <div class="agc-radio-group">
        <label class="agc-radio-opt"><input type="radio" name="VAT_Service" value="Registration" checked/> Registration</label>
        <label class="agc-radio-opt"><input type="radio" name="VAT_Service" value="Filing"/> Filing</label>
        <label class="agc-radio-opt"><input type="radio" name="VAT_Service" value="Both"/> Both</label>
      </div>
    </div>
  </div>
  <div class="agc-field-row">
    ${_R().field({ id:'vat_tin', label:'TIN Number', name:'VAT_TIN', placeholder:'Your TIN', required:true })}
    ${_R().field({ id:'vat_company', label:'Business / Company Name', name:'VAT_Company', placeholder:'Registered name', required:true })}
  </div>
  <div class="agc-field-row">
    ${_R().field({ id:'vat_rcbn', label:'RC / BN Number', name:'VAT_RC', placeholder:'e.g. RC 1234567', required:true })}
    ${_R().field({ id:'vat_period', label:'Filing Period', name:'VAT_Period', placeholder:'e.g. Jan–Mar 2026', optional:true })}
  </div>
  <div class="agc-field-row">
    ${_R().upload({ id:'vat_cert', label:'CAC Certificate', name:'VAT_CAC', icon:'📄', required:true })}
    ${_R().upload({ id:'vat_sales', label:'Sales Records', name:'VAT_Sales', icon:'📊', hint:'Monthly / quarterly sales data', optional:true })}
  </div>`,
  () => _V().required('vat_tin') & _V().required('vat_company') & _V().required('vat_rcbn') & _V().requiredFile('vat_cert')
);

// ─── PAYE ────────────────────────────────────────────────────────────────────
_simpleModule('paye','PAYE Registration & Filing','Pay As You Earn', () => `
  <div class="agc-field-row">
    ${_R().field({ id:'paye_company', label:'Company Name', name:'PAYE_Company', placeholder:'Registered name', required:true })}
    ${_R().field({ id:'paye_tin', label:'TIN Number', name:'PAYE_TIN', placeholder:'Company TIN', required:true })}
  </div>
  <div class="agc-field-row">
    ${_R().field({ id:'paye_state', label:'State of Operations', name:'PAYE_State', placeholder:'e.g. Lagos', required:true })}
    ${_R().field({ id:'paye_employees', label:'Number of Employees', name:'PAYE_Employees', type:'number', placeholder:'e.g. 10', required:true })}
  </div>
  <div class="agc-field-row one">
    ${_R().textarea({ id:'paye_employees_list', label:'Employee List', name:'PAYE_Employee_List', placeholder:'Name, salary, NIN for each employee (one per line)', optional:true })}
  </div>
  <div class="agc-field-row">
    ${_R().upload({ id:'paye_cert', label:'CAC Certificate', name:'PAYE_CAC', icon:'📄', required:true })}
    ${_R().upload({ id:'paye_payslips', label:'Payslips / Payroll Records', name:'PAYE_Payslips', icon:'📊', optional:true })}
  </div>`,
  () => _V().required('paye_company') & _V().required('paye_tin') & _V().required('paye_state') & _V().required('paye_employees') & _V().requiredFile('paye_cert')
);

// ─── Payroll ─────────────────────────────────────────────────────────────────
_simpleModule('payroll','Payroll Processing','Monthly payroll computation', () => `
  <div class="agc-field-row">
    ${_R().field({ id:'pr_company', label:'Company Name', name:'PR_Company', placeholder:'Business / company name', required:true })}
    ${_R().field({ id:'pr_employees', label:'Number of Employees', name:'PR_Employees', type:'number', placeholder:'e.g. 15', required:true })}
  </div>
  <div class="agc-field-row">
    <div class="agc-field"><label>Pay Schedule</label>
      <select name="PR_Schedule"><option value="">Select…</option>
        <option>Weekly</option><option>Bi-weekly</option><option>Monthly</option>
      </select>
    </div>
    ${_R().field({ id:'pr_start', label:'Start Month', name:'PR_Start_Month', placeholder:'e.g. July 2026', required:true })}
  </div>
  <div class="agc-field-row one">
    ${_R().textarea({ id:'pr_notes', label:'Additional Notes', name:'PR_Notes', placeholder:'Any allowances, bonuses, deductions, or special requirements', optional:true })}
  </div>
  <div class="agc-field-row">
    ${_R().upload({ id:'pr_staff', label:'Staff List with Salaries', name:'PR_Staff_List', icon:'📊', description:'Name, salary, account number, NIN', required:true })}
    ${_R().upload({ id:'pr_pension', label:'Pension Details', name:'PR_Pension', icon:'📄', description:'PFA and RSA numbers if applicable', optional:true })}
  </div>`,
  () => _V().required('pr_company') & _V().required('pr_employees') & _V().required('pr_start') & _V().requiredFile('pr_staff')
);

// ─── Accounting ──────────────────────────────────────────────────────────────
_simpleModule('accounting','Accounting Services','Bookkeeping and financial reporting', () => `
  <div class="agc-field-row">
    ${_R().field({ id:'acc_company', label:'Business / Company Name', name:'ACC_Company', placeholder:'Name', required:true })}
    <div class="agc-field"><label>Period Required</label>
      <select name="ACC_Period"><option value="">Select…</option>
        <option>Monthly</option><option>Quarterly</option><option>Annual</option><option>One-off catch-up</option>
      </select>
    </div>
  </div>
  <div class="agc-field-row one">
    ${_R().textarea({ id:'acc_scope', label:'Scope of Work', name:'ACC_Scope', placeholder:'Describe your accounting needs — bookkeeping, reconciliation, management accounts, etc.', required:true })}
  </div>
  <div class="agc-field-row">
    ${_R().field({ id:'acc_txvol', label:'Approximate Monthly Transactions', name:'ACC_Transactions', placeholder:'e.g. 50–100', optional:true })}
    ${_R().field({ id:'acc_software', label:'Accounting Software Used', name:'ACC_Software', placeholder:'e.g. QuickBooks, Wave, Excel', optional:true })}
  </div>
  <div class="agc-field-row">
    ${_R().upload({ id:'acc_statements', label:'Bank Statements', name:'ACC_Statements', icon:'🏦', description:'Last 3–12 months', required:true })}
    ${_R().upload({ id:'acc_prev', label:'Previous Financial Statements', name:'ACC_Prev_Financials', icon:'📊', optional:true })}
  </div>`,
  () => _V().required('acc_company') & _V().required('acc_scope') & _V().requiredFile('acc_statements')
);

// ─── NIPC ────────────────────────────────────────────────────────────────────
_simpleModule('nipc','NIPC Registration','Nigerian Investment Promotion Commission', () => `
  <div class="agc-field-row">
    ${_R().field({ id:'nipc_company', label:'Company Name', name:'NIPC_Company', placeholder:'Registered company name', required:true })}
    ${_R().field({ id:'nipc_rc', label:'RC Number', name:'NIPC_RC', placeholder:'e.g. RC 1234567', required:true })}
  </div>
  <div class="agc-field-row">
    ${_R().field({ id:'nipc_investment', label:'Investment Amount', name:'NIPC_Investment', placeholder:'e.g. ₦50,000,000 or $100,000', required:true })}
    ${_R().field({ id:'nipc_sector', label:'Business Sector', name:'NIPC_Sector', placeholder:'e.g. Technology, Agriculture, Manufacturing', required:true })}
  </div>
  <div class="agc-field-row one">
    ${_R().textarea({ id:'nipc_activities', label:'Proposed Business Activities', name:'NIPC_Activities', placeholder:'Describe what the company will do in Nigeria', required:true })}
  </div>
  <div class="agc-field-row">
    ${_R().upload({ id:'nipc_cert', label:'CAC Certificate', name:'NIPC_CAC_Cert', icon:'📄', required:true })}
    ${_R().upload({ id:'nipc_memart', label:'MEMART', name:'NIPC_MEMART', icon:'📄', required:true })}
  </div>
  <div class="agc-field-row">
    ${_R().upload({ id:'nipc_proof', label:'Proof of Investment Capital', name:'NIPC_Proof_Capital', icon:'🏦', required:true })}
    ${_R().upload({ id:'nipc_extra', label:'Additional Documents', name:'NIPC_Extra', icon:'📎', optional:true })}
  </div>`,
  () => _V().required('nipc_company') & _V().required('nipc_rc') & _V().required('nipc_investment') & _V().requiredFile('nipc_cert')
);

// ─── Business Permit ─────────────────────────────────────────────────────────
_simpleModule('business_permit','Business Permit','Operational business permits', () => `
  <div class="agc-field-row">
    ${_R().field({ id:'bp_company', label:'Business / Company Name', name:'BP_Company', placeholder:'Registered name', required:true })}
    ${_R().field({ id:'bp_type', label:'Type of Permit Required', name:'BP_Permit_Type', placeholder:'e.g. Environmental, Trade, Food handling', required:true })}
  </div>
  <div class="agc-field-row one">
    ${_R().textarea({ id:'bp_nature', label:'Nature of Business Operations', name:'BP_Nature', placeholder:'Describe your business activities requiring the permit', required:true })}
  </div>
  <div class="agc-field-row">
    ${_R().field({ id:'bp_address', label:'Business Address', name:'BP_Address', placeholder:'Physical business address', required:true })}
    ${_R().field({ id:'bp_existing', label:'Existing Permits / Licences', name:'BP_Existing', placeholder:'List any existing permits', optional:true })}
  </div>
  <div class="agc-field-row">
    ${_R().upload({ id:'bp_cert', label:'CAC Certificate', name:'BP_CAC_Cert', icon:'📄', required:true })}
    ${_R().upload({ id:'bp_extra', label:'Supporting Documents', name:'BP_Extra', icon:'📎', optional:true })}
  </div>`,
  () => _V().required('bp_company') & _V().required('bp_type') & _V().required('bp_nature') & _V().requiredFile('bp_cert')
);

// ─── Expatriate Quota ────────────────────────────────────────────────────────
_simpleModule('expatriate_quota','Expatriate Quota / CERPAC','Foreign staff compliance', () => `
  <div class="agc-field-row">
    ${_R().field({ id:'eq_company', label:'Company Name', name:'EQ_Company', placeholder:'Registered company name', required:true })}
    ${_R().field({ id:'eq_rc', label:'RC Number', name:'EQ_RC', placeholder:'e.g. RC 1234567', required:true })}
  </div>
  <div class="agc-field-row one">
    <div class="agc-field"><label>Service Required</label>
      <div class="agc-radio-group">
        <label class="agc-radio-opt"><input type="radio" name="EQ_Service" value="Expatriate Quota" checked/> Expatriate Quota</label>
        <label class="agc-radio-opt"><input type="radio" name="EQ_Service" value="CERPAC"/> CERPAC</label>
        <label class="agc-radio-opt"><input type="radio" name="EQ_Service" value="Both"/> Both</label>
      </div>
    </div>
  </div>
  <div class="agc-field-row">
    ${_R().field({ id:'eq_expat_name', label:'Expatriate Full Name', name:'EQ_Expat_Name', placeholder:'As on passport', required:true })}
    ${_R().field({ id:'eq_position', label:'Proposed Position', name:'EQ_Position', placeholder:'e.g. Technical Director', required:true })}
  </div>
  <div class="agc-field-row">
    ${_R().field({ id:'eq_nationality', label:'Expatriate Nationality', name:'EQ_Nationality', placeholder:'e.g. Chinese, German', required:true })}
    ${_R().field({ id:'eq_existing_quota', label:'Existing Quota Approval', name:'EQ_Existing_Quota', placeholder:'If applicable', optional:true })}
  </div>
  <div class="agc-field-row">
    ${_R().upload({ id:'eq_passport', label:'Expatriate Passport', name:'EQ_Passport', icon:'🛂', required:true })}
    ${_R().upload({ id:'eq_employment', label:'Employment Letter / Contract', name:'EQ_Employment', icon:'📄', required:true })}
  </div>
  <div class="agc-field-row">
    ${_R().upload({ id:'eq_cert', label:'CAC Certificate', name:'EQ_CAC_Cert', icon:'📄', required:true })}
    ${_R().upload({ id:'eq_credentials', label:'Educational / Professional Credentials', name:'EQ_Credentials', icon:'🎓', optional:true })}
  </div>`,
  () => _V().required('eq_company') & _V().required('eq_rc') & _V().required('eq_expat_name') & _V().required('eq_position') & _V().requiredFile('eq_passport') & _V().requiredFile('eq_employment') & _V().requiredFile('eq_cert')
);

// ─── SON ─────────────────────────────────────────────────────────────────────
_simpleModule('son','SON Registration','Standards Organisation of Nigeria', () => `
  <div class="agc-field-row">
    ${_R().field({ id:'son_company', label:'Company Name', name:'SON_Company', placeholder:'Registered name', required:true })}
    ${_R().field({ id:'son_product', label:'Product Name / Category', name:'SON_Product', placeholder:'e.g. Electrical cables, Cosmetics', required:true })}
  </div>
  <div class="agc-field-row one">
    ${_R().textarea({ id:'son_specs', label:'Product Technical Specifications', name:'SON_Specs', placeholder:'Describe the product composition, standards, and specifications', required:true })}
  </div>
  <div class="agc-field-row">
    ${_R().field({ id:'son_factory', label:'Factory / Production Address', name:'SON_Factory', placeholder:'Manufacturing location', required:true })}
    ${_R().field({ id:'son_origin', label:'Country of Origin', name:'SON_Origin', placeholder:'e.g. Nigeria, China', required:true })}
  </div>
  <div class="agc-field-row">
    ${_R().upload({ id:'son_cert', label:'CAC Certificate', name:'SON_CAC_Cert', icon:'📄', required:true })}
    ${_R().upload({ id:'son_labels', label:'Product Labels / Packaging', name:'SON_Labels', icon:'🏷', required:true })}
  </div>
  <div class="agc-field-row">
    ${_R().upload({ id:'son_qms', label:'Quality Management Documentation', name:'SON_QMS', icon:'📋', optional:true })}
    ${_R().upload({ id:'son_extra', label:'Additional Documents', name:'SON_Extra', icon:'📎', optional:true })}
  </div>`,
  () => _V().required('son_company') & _V().required('son_product') & _V().required('son_factory') & _V().requiredFile('son_cert') & _V().requiredFile('son_labels')
);

// ─── NAFDAC ──────────────────────────────────────────────────────────────────
_simpleModule('nafdac','NAFDAC Registration','Food, drug, cosmetic, and chemical products', () => `
  <div class="agc-field-row">
    ${_R().field({ id:'naf_company', label:'Company Name', name:'NAF_Company', placeholder:'Registered name', required:true })}
    ${_R().field({ id:'naf_product', label:'Product Name', name:'NAF_Product', placeholder:'Exact product name', required:true })}
  </div>
  <div class="agc-field-row">
    <div class="agc-field"><label>Product Category <span class="agc-req">*</span></label>
      <select id="naf_category" name="NAF_Category" data-required data-wrap="fw-naf_category">
        <option value="">Select…</option>
        <option>Food & Beverages</option><option>Cosmetics</option><option>Drugs / Pharmaceuticals</option>
        <option>Medical Devices</option><option>Chemicals / Pesticides</option><option>Water</option><option>Other</option>
      </select><span class="agc-err-msg">Required</span>
    </div>
    <div class="agc-field"><label>Manufacturing Type <span class="agc-req">*</span></label>
      <select id="naf_mfg" name="NAF_Manufacturing" data-required data-wrap="fw-naf_mfg">
        <option value="">Select…</option>
        <option>Locally manufactured</option><option>Imported</option>
      </select><span class="agc-err-msg">Required</span>
    </div>
  </div>
  <div class="agc-field-row one">
    ${_R().textarea({ id:'naf_composition', label:'Product Composition / Formulation', name:'NAF_Composition', placeholder:'List all ingredients or components', required:true })}
  </div>
  <div class="agc-field-row">
    ${_R().upload({ id:'naf_cert', label:'CAC Certificate', name:'NAF_CAC_Cert', icon:'📄', required:true })}
    ${_R().upload({ id:'naf_labels', label:'Product Labels & Artwork', name:'NAF_Labels', icon:'🏷', required:true })}
  </div>
  <div class="agc-field-row">
    ${_R().upload({ id:'naf_samples', label:'Product Samples / Test Results', name:'NAF_Samples', icon:'🧪', optional:true })}
    ${_R().upload({ id:'naf_import', label:'Import / Origin Certificate', name:'NAF_Import_Cert', icon:'🛂', hint:'For imported products', optional:true })}
  </div>`,
  () => _V().required('naf_company') & _V().required('naf_product') & _V().required('naf_composition') & _V().requiredFile('naf_cert') & _V().requiredFile('naf_labels')
);

// ─── NDPR ────────────────────────────────────────────────────────────────────
_simpleModule('ndpr','NDPR / Data Protection','Nigeria Data Protection Regulation compliance', () => `
  <div class="agc-field-row">
    ${_R().field({ id:'ndpr_company', label:'Organisation Name', name:'NDPR_Company', placeholder:'Registered name', required:true })}
    ${_R().field({ id:'ndpr_size', label:'Organisation Size', name:'NDPR_Size', placeholder:'e.g. 10 employees, 500 customers', optional:true })}
  </div>
  <div class="agc-field-row one">
    ${_R().textarea({ id:'ndpr_activities', label:'Data Processing Activities', name:'NDPR_Activities', placeholder:'Describe how your organisation collects, stores, and uses personal data', required:true })}
  </div>
  <div class="agc-field-row">
    ${_R().field({ id:'ndpr_dpo', label:'Data Protection Officer (DPO)', name:'NDPR_DPO', placeholder:'Name and contact if applicable', optional:true })}
    ${_R().field({ id:'ndpr_processors', label:'Third-party Data Processors', name:'NDPR_Processors', placeholder:'e.g. payment providers, cloud services', optional:true })}
  </div>
  <div class="agc-field-row">
    ${_R().upload({ id:'ndpr_cert', label:'CAC Certificate', name:'NDPR_CAC_Cert', icon:'📄', required:true })}
    ${_R().upload({ id:'ndpr_policy', label:'Existing Privacy Policy', name:'NDPR_Policy', icon:'📄', hint:'If you have one already', optional:true })}
  </div>`,
  () => _V().required('ndpr_company') & _V().required('ndpr_activities') & _V().requiredFile('ndpr_cert')
);

// ─── ISO ─────────────────────────────────────────────────────────────────────
_simpleModule('iso','ISO Certification Support','Standards preparation and certification', () => `
  <div class="agc-field-row">
    ${_R().field({ id:'iso_company', label:'Organisation Name', name:'ISO_Company', placeholder:'Registered name', required:true })}
    ${_R().field({ id:'iso_standard', label:'ISO Standard Required', name:'ISO_Standard', placeholder:'e.g. ISO 9001, ISO 27001, ISO 14001', required:true })}
  </div>
  <div class="agc-field-row">
    ${_R().field({ id:'iso_size', label:'Organisation Size', name:'ISO_Size', placeholder:'Number of employees and locations', required:true })}
    ${_R().field({ id:'iso_sector', label:'Industry / Sector', name:'ISO_Sector', placeholder:'e.g. Healthcare, Technology, Manufacturing', required:true })}
  </div>
  <div class="agc-field-row one">
    ${_R().textarea({ id:'iso_scope', label:'Scope of Certification', name:'ISO_Scope', placeholder:'Describe the products, services, and processes to be covered by the certification', required:true })}
  </div>
  <div class="agc-field-row">
    ${_R().upload({ id:'iso_cert', label:'CAC Certificate', name:'ISO_CAC_Cert', icon:'📄', required:true })}
    ${_R().upload({ id:'iso_qms', label:'Existing QMS Documentation', name:'ISO_QMS', icon:'📋', optional:true })}
  </div>`,
  () => _V().required('iso_company') & _V().required('iso_standard') & _V().required('iso_size') & _V().required('iso_scope') & _V().requiredFile('iso_cert')
);

// ─── Copyright ───────────────────────────────────────────────────────────────
_simpleModule('copyright','Copyright Registration','Literary, artistic, and musical works', () => `
  ${_R().notice('Copyright registration protects your original creative works in Nigeria.', 'blue')}
  <div class="agc-field-row">
    ${_R().field({ id:'copy_title', label:'Title of Work', name:'Copy_Title', placeholder:'Title of your work', required:true })}
    ${_R().field({ id:'copy_year', label:'Year of Creation', name:'Copy_Year', placeholder:'e.g. 2025', required:true })}
  </div>
  <div class="agc-field-row">
    <div class="agc-field"><label>Type of Work <span class="agc-req">*</span></label>
      <select id="copy_type" name="Copy_Type" data-required data-wrap="fw-copy_type">
        <option value="">Select…</option>
        <option>Literary Work (book, article, script)</option>
        <option>Musical Work</option>
        <option>Artistic Work (painting, drawing, photograph)</option>
        <option>Software / Computer Program</option>
        <option>Film / Audiovisual Work</option>
        <option>Sound Recording</option>
        <option>Other</option>
      </select><span class="agc-err-msg">Required</span>
    </div>
    ${_R().field({ id:'copy_author', label:'Author / Creator Full Name', name:'Copy_Author', placeholder:'Full name as on ID', required:true })}
  </div>
  <div class="agc-field-row one">
    ${_R().textarea({ id:'copy_description', label:'Description of the Work', name:'Copy_Description', placeholder:'Briefly describe the work and its content', required:true })}
  </div>
  <div class="agc-field-row">
    ${_R().upload({ id:'copy_work', label:'Copy / Sample of the Work', name:'Copy_Work_File', icon:'📄', description:'Upload a sample, excerpt, or the full work', required:true })}
    ${_R().upload({ id:'copy_id', label:'Author Valid ID', name:'Copy_Author_ID', icon:'🪪', required:true })}
  </div>`,
  () => _V().required('copy_title') & _V().required('copy_year') & _V().required('copy_author') & _V().required('copy_description') & _V().requiredFile('copy_work') & _V().requiredFile('copy_id')
);

// ─── Legal Document ───────────────────────────────────────────────────────────
_simpleModule('legal_doc','Legal Document Drafting','Agreements, MOUs, affidavits, contracts', () => {
  const payment = _pay('legal_doc');
  return `
    <div class="agc-sec-label">Choose Document Tier</div>
    ${_R().tierSelector('legal_doc', payment.tiers, 0)}
    ${_R().divider()}
    <div class="agc-field-row">
      <div class="agc-field"><label>Document Type <span class="agc-req">*</span></label>
        <select id="ldoc_type" name="LDoc_Type" data-required data-wrap="fw-ldoc_type">
          <option value="">Select…</option>
          <option>Affidavit</option><option>Legal Letter</option>
          <option>Simple Agreement</option><option>MOU</option>
          <option>Employment Contract</option><option>Service Agreement</option>
          <option>Privacy Policy</option><option>Website Terms</option>
          <option>Shareholder Agreement</option><option>Power of Attorney</option>
          <option>Other</option>
        </select><span class="agc-err-msg">Required</span>
      </div>
      <div class="agc-field"><label>Urgency</label>
        <select name="LDoc_Urgency">
          <option>Standard (3–5 business days)</option>
          <option>Urgent (within 48 hours)</option>
        </select>
      </div>
    </div>
    <div class="agc-field-row one">
      ${_R().textarea({ id:'ldoc_parties', label:'Parties Involved', name:'LDoc_Parties', placeholder:'Full names, roles, and contact details of all parties', required:true })}
    </div>
    <div class="agc-field-row one">
      ${_R().textarea({ id:'ldoc_details', label:'Key Terms and Purpose', name:'LDoc_Details', placeholder:'Describe the purpose of the document and key terms or conditions to be captured', required:true })}
    </div>
    <div class="agc-field-row">
      ${_R().upload({ id:'ldoc_draft', label:'Existing Draft', name:'LDoc_Draft', icon:'📄', description:'If you have a draft or reference document', optional:true })}
      ${_R().upload({ id:'ldoc_extra', label:'Supporting Documents', name:'LDoc_Extra', icon:'📎', optional:true })}
    </div>`;
}, () => _V().required('ldoc_type') & _V().required('ldoc_parties') & _V().required('ldoc_details')
);

// ─── Legal Advisory ───────────────────────────────────────────────────────────
_simpleModule('legal_advisory','Corporate Advisory','Business structure, compliance, and legal strategy', () => {
  const payment = _pay('legal_advisory');
  return `
    <div class="agc-sec-label">Advisory Package</div>
    ${_R().tierSelector('legal_advisory', payment.tiers, 0)}
    ${_R().divider()}
    <div class="agc-field-row one">
      ${_R().textarea({ id:'adv_issue', label:'Description of Issue / Topic', name:'ADV_Issue', placeholder:'Describe the business or legal matter you need guidance on', required:true })}
    </div>
    <div class="agc-field-row">
      <div class="agc-field"><label>Preferred Consultation Format</label>
        <select name="ADV_Format">
          <option>WhatsApp</option><option>Email</option><option>Video Call</option><option>In-person (Lagos)</option>
        </select>
      </div>
      ${_R().field({ id:'adv_company', label:'Business / Company Name', name:'ADV_Company', placeholder:'If applicable', optional:true })}
    </div>
    <div class="agc-field-row">
      ${_R().upload({ id:'adv_docs', label:'Existing Documents / Correspondence', name:'ADV_Docs', icon:'📄', description:'Any relevant documents', optional:true })}
      <div></div>
    </div>`;
}, () => _V().required('adv_issue')
);

// ─── NIN ─────────────────────────────────────────────────────────────────────
_simpleModule('nin','NIN Registration / Retrieval','National Identification Number', () => `
  <div class="agc-field-row one">
    <div class="agc-field"><label>Service Required</label>
      <div class="agc-radio-group">
        <label class="agc-radio-opt"><input type="radio" name="NIN_Service" value="New Registration" checked/> New NIN Registration</label>
        <label class="agc-radio-opt"><input type="radio" name="NIN_Service" value="Retrieval"/> Retrieve Existing NIN</label>
        <label class="agc-radio-opt"><input type="radio" name="NIN_Service" value="Both"/> Both</label>
      </div>
    </div>
  </div>
  <div class="agc-field-row">
    ${_R().field({ id:'nin_existing', label:'Existing NIN', name:'NIN_Existing', placeholder:'If retrieving', optional:true, hint:'Leave blank if registering for the first time.' })}
    ${_R().field({ id:'nin_dob', label:'Date of Birth', name:'NIN_DOB', type:'date', required:true })}
  </div>
  <div class="agc-field-row">
    ${_R().field({ id:'nin_stateorigin', label:'State of Origin', name:'NIN_State_Origin', placeholder:'e.g. Lagos', required:true })}
    ${_R().field({ id:'nin_homeaddress', label:'Home Address', name:'NIN_Home_Address', placeholder:'Current home address', required:true })}
  </div>
  <div class="agc-field-row">
    ${_R().upload({ id:'nin_id', label:'Existing Valid ID', name:'NIN_Existing_ID', icon:'🪪', description:'Birth certificate, old passport, or voter\'s card', required:true })}
    ${_R().upload({ id:'nin_photo', label:'Passport Photograph', name:'NIN_Photo', icon:'📷', required:true })}
  </div>`,
  () => _V().required('nin_dob') & _V().required('nin_stateorigin') & _V().required('nin_homeaddress') & _V().requiredFile('nin_id') & _V().requiredFile('nin_photo')
);

// ─── Data Correction ──────────────────────────────────────────────────────────
_simpleModule('data_correction','Data Correction','NIN / NIMC identity record correction', () => `
  <div class="agc-field-row">
    ${_R().field({ id:'dc_nin', label:'Existing NIN Number', name:'DC_NIN', placeholder:'11-digit NIN', maxlength:'11', required:true })}
    ${_R().field({ id:'dc_error', label:'Field Containing the Error', name:'DC_Error_Field', placeholder:'e.g. Date of Birth, Name', required:true })}
  </div>
  <div class="agc-field-row">
    ${_R().field({ id:'dc_wrong', label:'Incorrect Information (as recorded)', name:'DC_Wrong_Info', placeholder:'What is currently wrong', required:true })}
    ${_R().field({ id:'dc_correct', label:'Correct Information', name:'DC_Correct_Info', placeholder:'What it should be', required:true })}
  </div>
  <div class="agc-field-row">
    ${_R().upload({ id:'dc_support', label:'Supporting Document for Correction', name:'DC_Support_Doc', icon:'📄', description:'Birth certificate, court affidavit, or other proof', required:true })}
    ${_R().upload({ id:'dc_photo', label:'Passport Photograph', name:'DC_Photo', icon:'📷', required:true })}
  </div>`,
  () => _V().required('dc_nin') & _V().required('dc_error') & _V().required('dc_wrong') & _V().required('dc_correct') & _V().requiredFile('dc_support') & _V().requiredFile('dc_photo')
);

// ─── Student Visa ─────────────────────────────────────────────────────────────
_simpleModule('student_visa','Student Visa Assistance','School applications and visa support', () => `
  <div class="agc-field-row">
    ${_R().field({ id:'sv_country', label:'Target Country', name:'SV_Country', placeholder:'e.g. United Kingdom, Canada', required:true })}
    <div class="agc-field"><label>Level of Study <span class="agc-req">*</span></label>
      <select id="sv_level" name="SV_Level" data-required data-wrap="fw-sv_level">
        <option value="">Select…</option>
        <option>Bachelor\'s Degree</option><option>Master\'s Degree</option>
        <option>PhD / Doctorate</option><option>Diploma</option><option>Language School</option><option>Other</option>
      </select><span class="agc-err-msg">Required</span>
    </div>
  </div>
  <div class="agc-field-row one">
    ${_R().textarea({ id:'sv_institutions', label:'Preferred Institutions', name:'SV_Institutions', placeholder:'List your preferred universities or institutions', optional:true })}
  </div>
  <div class="agc-field-row one">
    ${_R().textarea({ id:'sv_course', label:'Intended Course / Field of Study', name:'SV_Course', placeholder:'e.g. MSc Computer Science, MBA', required:true })}
  </div>
  <div class="agc-field-row">
    ${_R().upload({ id:'sv_passport', label:'International Passport', name:'SV_Passport', icon:'🛂', description:'Minimum 6 months validity', required:true })}
    ${_R().upload({ id:'sv_transcripts', label:'Academic Transcripts / Certificates', name:'SV_Transcripts', icon:'🎓', required:true })}
  </div>
  <div class="agc-field-row">
    ${_R().upload({ id:'sv_proof_funds', label:'Proof of Financial Capacity', name:'SV_Proof_Funds', icon:'🏦', optional:true })}
    ${_R().upload({ id:'sv_photo', label:'Passport Photographs', name:'SV_Photos', icon:'📷', required:true })}
  </div>`,
  () => _V().required('sv_country') & _V().required('sv_course') & _V().requiredFile('sv_passport') & _V().requiredFile('sv_transcripts') & _V().requiredFile('sv_photo')
);

// ─── Immigration ──────────────────────────────────────────────────────────────
_simpleModule('immigration','Immigration Support','CERPAC, business visa, and residence permits', () => `
  <div class="agc-field-row">
    <div class="agc-field"><label>Type of Support Required <span class="agc-req">*</span></label>
      <select id="imm_type" name="IMM_Type" data-required data-wrap="fw-imm_type">
        <option value="">Select…</option>
        <option>CERPAC (Combined Expatriate Residence Permit)</option>
        <option>Business Visa Support</option>
        <option>Temporary Residence Permit</option>
        <option>Work Permit</option>
        <option>Regularisation of Stay</option>
        <option>Other</option>
      </select><span class="agc-err-msg">Required</span>
    </div>
    ${_R().field({ id:'imm_nationality', label:'Applicant Nationality', name:'IMM_Nationality', placeholder:'e.g. German, Indian', required:true })}
  </div>
  <div class="agc-field-row one">
    ${_R().textarea({ id:'imm_purpose', label:'Purpose / Details', name:'IMM_Purpose', placeholder:'Describe the purpose and any relevant details about the immigration matter', required:true })}
  </div>
  <div class="agc-field-row">
    ${_R().upload({ id:'imm_passport', label:'International Passport', name:'IMM_Passport', icon:'🛂', required:true })}
    ${_R().upload({ id:'imm_current_permit', label:'Current Visa / Permit', name:'IMM_Current_Permit', icon:'📄', description:'If applicable', optional:true })}
  </div>
  <div class="agc-field-row">
    ${_R().upload({ id:'imm_employment', label:'Employment / Business Documentation', name:'IMM_Employment_Doc', icon:'📄', optional:true })}
    ${_R().upload({ id:'imm_photo', label:'Passport Photographs', name:'IMM_Photos', icon:'📷', required:true })}
  </div>`,
  () => _V().required('imm_nationality') & _V().required('imm_purpose') & _V().requiredFile('imm_passport') & _V().requiredFile('imm_photo')
);

// ─── Export / Import ──────────────────────────────────────────────────────────
_simpleModule('export_import','Export / Import Documentation','Trade documentation and licensing', () => `
  <div class="agc-field-row one">
    <div class="agc-field"><label>Trade Direction</label>
      <div class="agc-radio-group">
        <label class="agc-radio-opt"><input type="radio" name="EI_Direction" value="Export" checked/> Export</label>
        <label class="agc-radio-opt"><input type="radio" name="EI_Direction" value="Import"/> Import</label>
        <label class="agc-radio-opt"><input type="radio" name="EI_Direction" value="Both"/> Both</label>
      </div>
    </div>
  </div>
  <div class="agc-field-row">
    ${_R().field({ id:'ei_company', label:'Company / Business Name', name:'EI_Company', placeholder:'Registered name', required:true })}
    ${_R().field({ id:'ei_goods', label:'Nature of Goods', name:'EI_Goods', placeholder:'e.g. Cocoa, Electronics, Textiles', required:true })}
  </div>
  <div class="agc-field-row">
    ${_R().field({ id:'ei_country', label:'Country of Origin / Destination', name:'EI_Country', placeholder:'e.g. Nigeria to Germany', required:true })}
    ${_R().field({ id:'ei_value', label:'Estimated Value', name:'EI_Value', placeholder:'e.g. $50,000', optional:true })}
  </div>
  <div class="agc-field-row">
    ${_R().upload({ id:'ei_cert', label:'CAC Certificate', name:'EI_CAC_Cert', icon:'📄', required:true })}
    ${_R().upload({ id:'ei_existing', label:'Existing Trade Permits', name:'EI_Existing_Permits', icon:'📄', optional:true })}
  </div>`,
  () => _V().required('ei_company') & _V().required('ei_goods') & _V().required('ei_country') & _V().requiredFile('ei_cert')
);

// ─── Cybersecurity ────────────────────────────────────────────────────────────
_simpleModule('cybersecurity','Cybersecurity Services','Digital safety and awareness', () => `
  <div class="agc-field-row">
    <div class="agc-field"><label>Service Required</label>
      <select name="Cyber_Service"><option value="">Select…</option>
        <option>Security Awareness Training</option>
        <option>Digital Safety Assessment</option>
        <option>Phishing & Scam Prevention Guidance</option>
        <option>Business Digital Safety Review</option>
        <option>Data Breach Response Guidance</option>
        <option>General Cybersecurity Consultation</option>
      </select>
    </div>
    ${_R().field({ id:'cyber_org', label:'Organisation / Business Name', name:'Cyber_Org', placeholder:'If applicable', optional:true })}
  </div>
  <div class="agc-field-row">
    ${_R().field({ id:'cyber_users', label:'Number of Users / Employees', name:'Cyber_Users', placeholder:'e.g. 20', optional:true })}
    ${_R().field({ id:'cyber_systems', label:'Systems / Platforms Involved', name:'Cyber_Systems', placeholder:'e.g. Windows PCs, Google Workspace, e-commerce site', optional:true })}
  </div>
  <div class="agc-field-row one">
    ${_R().textarea({ id:'cyber_concern', label:'Describe the Concern or Requirement', name:'Cyber_Concern', placeholder:'Explain what you need help with or any recent security incidents', required:true })}
  </div>`,
  () => _V().required('cyber_concern')
);

// ─── Virtual Office ───────────────────────────────────────────────────────────
_simpleModule('virtual_office','Virtual Office','Professional business address and mail handling', () => {
  const payment = _pay('virtual_office');
  return `
    <div class="agc-sec-label">Choose Package</div>
    ${_R().tierSelector('virtual_office', payment.tiers, 0)}
    ${_R().divider()}
    <div class="agc-field-row">
      ${_R().field({ id:'vo_bizname', label:'Business Name', name:'VO_Business_Name', placeholder:'Registered or proposed name', required:true })}
      ${_R().field({ id:'vo_purpose', label:'Purpose of Virtual Office', name:'VO_Purpose', placeholder:'e.g. CAC registration address, client meetings', optional:true })}
    </div>
    <div class="agc-field-row">
      ${_R().upload({ id:'vo_id', label:'Valid ID', name:'VO_ID', icon:'🪪', required:true })}
      ${_R().upload({ id:'vo_photo', label:'Passport Photograph', name:'VO_Photo', icon:'📷', required:true })}
    </div>`;
}, () => _V().required('vo_bizname') & _V().requiredFile('vo_id') & _V().requiredFile('vo_photo')
);

// ─── Domain Registration ──────────────────────────────────────────────────────
_simpleModule('domain','Domain Registration','.com.ng, .ng, .com and other extensions', () => `
  <div class="agc-field-row one">
    ${_R().textarea({ id:'dom_names', label:'Preferred Domain Names', name:'DOM_Names', placeholder:'List your preferred domain names (minimum 3 options in order of preference)', required:true, hint:'e.g. mycompany.com.ng, mycompany.ng, mycompany.com' })}
  </div>
  <div class="agc-field-row">
    <div class="agc-field"><label>Preferred Extension</label>
      <select name="DOM_Extension"><option value="">Select…</option>
        <option>.com.ng</option><option>.ng</option><option>.com</option>
        <option>.org.ng</option><option>.net</option><option>Other</option>
      </select>
    </div>
    <div class="agc-field"><label>Registration Duration</label>
      <select name="DOM_Duration"><option value="">Select…</option>
        <option>1 Year</option><option>2 Years</option><option>3 Years</option><option>5 Years</option>
      </select>
    </div>
  </div>
  <div class="agc-field-row one">
    <div class="agc-field"><label>Hosting Required?</label>
      <div class="agc-radio-group">
        <label class="agc-radio-opt"><input type="radio" name="DOM_Hosting" value="No" checked/> No — domain only</label>
        <label class="agc-radio-opt"><input type="radio" name="DOM_Hosting" value="Yes"/> Yes — include hosting</label>
      </div>
    </div>
  </div>`,
  () => _V().required('dom_names')
);

// ─── Website ──────────────────────────────────────────────────────────────────
_simpleModule('website','Website Design & Development','Professional business websites', () => `
  ${_R().notice('Website pricing is custom-quoted. Fill in as much detail as possible for an accurate quote.', 'gold')}
  <div class="agc-field-row">
    ${_R().field({ id:'web_bizname', label:'Business / Brand Name', name:'WEB_Business_Name', placeholder:'Your business name', required:true })}
    <div class="agc-field"><label>Type of Website <span class="agc-req">*</span></label>
      <select id="web_type" name="WEB_Type" data-required data-wrap="fw-web_type">
        <option value="">Select…</option>
        <option>Brochure / Corporate Website</option>
        <option>E-commerce / Online Shop</option>
        <option>Portfolio Website</option>
        <option>Booking / Appointment Website</option>
        <option>Blog</option>
        <option>Landing Page</option>
        <option>Web Application</option>
        <option>Other</option>
      </select><span class="agc-err-msg">Required</span>
    </div>
  </div>
  <div class="agc-field-row">
    ${_R().field({ id:'web_pages', label:'Estimated Number of Pages', name:'WEB_Pages', placeholder:'e.g. 5–10', optional:true })}
    ${_R().field({ id:'web_domain', label:'Domain Name', name:'WEB_Domain', placeholder:'e.g. mycompany.com.ng (if already registered)', optional:true })}
  </div>
  <div class="agc-field-row one">
    ${_R().textarea({ id:'web_references', label:'Reference Websites', name:'WEB_References', placeholder:'List websites you like or want yours to be similar to', optional:true })}
  </div>
  <div class="agc-field-row one">
    ${_R().textarea({ id:'web_features', label:'Features Required', name:'WEB_Features', placeholder:'e.g. Contact form, WhatsApp chat, booking system, payment integration, blog, image gallery', required:true })}
  </div>
  <div class="agc-field-row">
    ${_R().field({ id:'web_colors', label:'Brand Colours', name:'WEB_Colors', placeholder:'e.g. Navy blue and gold', optional:true })}
    ${_R().field({ id:'web_deadline', label:'Target Launch Date', name:'WEB_Deadline', type:'date', optional:true })}
  </div>
  <div class="agc-field-row">
    ${_R().upload({ id:'web_logo', label:'Logo', name:'WEB_Logo', icon:'🎨', description:'If available', optional:true })}
    ${_R().upload({ id:'web_assets', label:'Brand Assets / Images', name:'WEB_Assets', icon:'🖼', description:'Photos, graphics, or content', optional:true })}
  </div>`,
  () => _V().required('web_bizname') & _V().required('web_features')
);