"""Build the free tool pages and the /tools hub from the /grc page shell.

  python3 ops/tools/build.py

Each tool answers a question people search for, using only figures already confirmed and
published on the site (ops/content-plan.md "Owner answers", the data protection page, the
tax and SCUML guides). Change a figure there first, then here.
"""
import html, json, os, re
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
e = html.escape
shell = open(os.path.join(ROOT, 'grc.html')).read()
head_start = shell.index('<title>'); head_end = shell.index('</head>')
header_end = shell.index('</header>') + len('</header>'); footer_start = shell.index('<!-- Footer -->')
SITE = 'https://awalglobal.com.ng'

COMMON_JS = r"""
    var naira = function (n) { return '₦' + Math.round(n).toLocaleString('en-NG'); };
    var $ = function (id) { return document.getElementById(id); };
    var val = function (name) { var el = document.querySelector('[name="' + name + '"]:checked'); return el ? el.value : ''; };
    var num = function (id) { var n = Number(String($(id).value).replace(/[^0-9.]/g, '')); return isFinite(n) && String($(id).value).trim() !== '' ? n : null; };
    var row = function (label, value, cls) { return '<div class="calc-row' + (cls ? ' ' + cls : '') + '"><span>' + label + '</span><strong>' + value + '</strong></div>'; };
    var verdict = function (tone, text) { return '<div class="calc-verdict ' + tone + '">' + text + '</div>'; };
    var cta = function (shortcut, label) { return '<div class="calc-cta"><a class="btn btn-primary" href="/kyc/?s=' + shortcut + '">' + label + ' →</a><a class="btn btn-secondary" href="/book">Book a free call</a></div>'; };
    var used = false;
    var track = function (name, params) { if (used && window.agcTrack) window.agcTrack('tool_used', Object.assign({ tool: name }, params || {})); used = true; };
    // Typed amounts get thousands separators as you go
    document.querySelectorAll('input[data-money]').forEach(function (el) {
      el.addEventListener('input', function () {
        var digits = el.value.replace(/[^0-9]/g, '');
        el.value = digits ? Number(digits).toLocaleString('en-NG') : '';
      });
    });
"""

TOOLS = []

# ── 1. Small company tax checker ─────────────────────────────────────────
TOOLS.append(dict(
    slug='small-company-tax-checker', short='Small company tax checker', icon='₦',
    title='Small Company Tax Exemption Checker (Nigeria Tax Act 2025) | Awal Global Consults',
    h1='Does my company pay company income tax?',
    lede='Check in a minute whether your business qualifies as a small company under the Nigeria Tax Act 2025, and what that means for company income tax, development levy and filing.',
    desc='Free checker: does your Nigerian company qualify for 0% company income tax as a small company under the Nigeria Tax Act 2025? Turnover, fixed assets and the professional services exclusion.',
    card='Find out if your company pays 0% company income tax under the 2025 rules.',
    form='''
        <fieldset class="calc-field"><legend>How is the business registered?</legend>
          <div class="calc-options">
            <label><input type="radio" name="structure" value="company" checked><span><strong>Limited company</strong><small>Has an RC number</small></span></label>
            <label><input type="radio" name="structure" value="bn"><span><strong>Business name</strong><small>Has a BN number</small></span></label>
          </div></fieldset>
        <div id="company-only">
          <fieldset class="calc-field"><legend>Does the company provide professional services?</legend>
            <p class="calc-hint" style="margin-top:0">Such as legal, accounting, consulting, engineering or similar advisory work.</p>
            <div class="calc-yn"><label><input type="radio" name="prof" value="n" checked> No</label><label><input type="radio" name="prof" value="y"> Yes</label></div></fieldset>
          <div class="calc-field"><label for="turnover">Annual turnover (all sales, before costs)</label>
            <input id="turnover" type="text" inputmode="numeric" data-money placeholder="e.g. 45,000,000"></div>
          <div class="calc-field"><label for="assets">Total fixed assets (equipment, vehicles, property, at cost)</label>
            <input id="assets" type="text" inputmode="numeric" data-money placeholder="e.g. 8,000,000"></div>
        </div>''',
    js=r"""
    function render() {
      var bn = val('structure') === 'bn';
      $('company-only').hidden = bn;
      if (bn) {
        return '<h2>Business names are taxed differently</h2>' +
          verdict('info', 'The small company exemption applies to companies only.') +
          '<p class="calc-note">A business name is not a company, so the owner pays personal income tax on the business’s profits to the state tax authority where they live, and files a personal return every year, profit or not.</p>' +
          '<p class="calc-note">If you are thinking of converting to a limited company, see <a href="/blog/convert-business-name-to-limited-company-nigeria/">converting a business name to a company</a>.</p>' +
          cta('tax', 'Get help with my tax');
      }
      var t = num('turnover'), a = num('assets'), prof = val('prof') === 'y';
      if (t === null || a === null) return '<h2>Your result</h2><p class="calc-note">Enter your annual turnover and fixed assets to see whether the company is a small company.</p>';
      var small = !prof && t <= 100000000 && a < 250000000;
      var reasons = [];
      if (prof) reasons.push('professional services businesses are excluded from the small company definition whatever their size');
      if (t > 100000000) reasons.push('turnover is above ₦100 million');
      if (a >= 250000000) reasons.push('fixed assets are ₦250 million or more');
      track('small_company_tax', { result: small ? 'small' : 'not_small' });
      var html = '<h2>' + (small ? 'Your company looks like a small company' : 'Your company is not a small company') + '</h2>' +
        (small ? verdict('ok', '0% company income tax, and no capital gains tax or development levy.')
               : verdict('warn', 'Company income tax at the standard rate of 30%, plus the 4% development levy on assessable profits.')) +
        (small ? '' : '<p class="calc-note">Why: ' + reasons.join('; ') + '.</p>') +
        '<h3>What you still have to do</h3>' +
        '<ul class="calc-list"><li><strong>File your tax return every year</strong>, even at 0% and even with no profit. Missing a return costs ₦100,000 for the first month and ₦50,000 for each month after.</li>' +
        '<li>Deduct and remit PAYE on staff salaries, and withholding tax where it applies.</li>' +
        '<li>File CAC annual returns.</li>' +
        (t > 100000000 ? '<li><strong>Register for VAT</strong>: turnover above ₦100 million means charging 7.5% VAT and filing monthly.</li>' : '<li>VAT: below ₦100 million turnover you don’t charge VAT, but watch the threshold.</li>') +
        '</ul>' +
        '<p class="calc-note">Based on the Nigeria Tax Act 2025 as described in our <a href="/blog/small-company-tax-exemption-nigeria-tax-act-2025/">small company guide</a>. Keep proper accounts: your figures are what prove you qualify. This is general guidance, not advice on your situation.</p>';
      return html + cta('tax', 'Get help with filing');
    }""",
    faq=[
        ('Who counts as a small company under the Nigeria Tax Act 2025?', 'A company with annual turnover of ₦100 million or less and total fixed assets of less than ₦250 million. It must meet both tests, and professional services businesses are excluded whatever their size.'),
        ('Do small companies still file tax returns?', 'Yes. A 0% rate is not an exemption from filing. A nil return is required by law, and missing one costs ₦100,000 for the first month and ₦50,000 for each month after.'),
        ('What do small companies not pay?', 'Company income tax (0%), capital gains tax and the 4% development levy. PAYE, withholding tax where it applies and CAC annual returns continue.'),
    ],
    guides=[('small-company-tax-exemption-nigeria-tax-act-2025', 'Small company tax exemption explained'), ('nigeria-tax-act-2025-compliance-guide', 'Nigeria Tax Act 2025 compliance guide'), ('no-profit-still-file-tax-returns-nigeria', 'No profit: do I still file?')],
))

# ── 2. Late filing penalty calculator ────────────────────────────────────
TOOLS.append(dict(
    slug='tax-penalty-calculator', short='Late tax filing penalty calculator', icon='!',
    title='Late Tax Filing Penalty Calculator Nigeria (2026) | Awal Global Consults',
    h1='Late tax filing penalty calculator',
    lede='Missed a tax return? See the penalty for not filing under the Nigeria Tax Administration Act 2025, month by month, and what it costs to wait.',
    desc='Free calculator for the penalty for not filing a tax return in Nigeria: ₦100,000 for the first month and ₦50,000 for each month after, under the Nigeria Tax Administration Act 2025.',
    card='See what a missed tax return costs, month by month, and what waiting adds.',
    form='''
        <div class="calc-field"><label for="months">How many months late is the return?</label>
          <input id="months" type="number" inputmode="numeric" min="1" max="120" value="1">
          <p class="calc-hint">Count from the month the return was due. Part of a month counts as a month.</p></div>
        <div class="calc-field"><label for="returns">How many returns have not been filed?</label>
          <input id="returns" type="number" inputmode="numeric" min="1" max="20" value="1">
          <p class="calc-hint">For example, two years of annual returns missed = 2. We assume each is the same number of months late.</p></div>''',
    js=r"""
    var penalty = function (m) { return m < 1 ? 0 : 100000 + 50000 * (m - 1); };
    function render() {
      var m = Math.max(0, Math.min(120, Math.floor(num('months') || 0))), r = Math.max(1, Math.min(20, Math.floor(num('returns') || 1)));
      if (!m) return '<h2>Your result</h2><p class="calc-note">Enter how many months late the return is.</p>';
      var each = penalty(m), total = each * r, next = penalty(m + 1) * r;
      track('tax_penalty', { months: m, returns: r });
      return '<h2>Estimated penalty</h2>' +
        row('Penalty per return, ' + m + ' month' + (m === 1 ? '' : 's') + ' late', naira(each)) +
        (r > 1 ? row('Returns not filed', r) : '') +
        row('Total failure-to-file penalty', naira(total), 'total') +
        verdict('warn', 'Waiting one more month adds ' + naira(next - total) + (r > 1 ? ' across your returns' : '') + '.') +
        '<p class="calc-note">How it works: ₦100,000 for the first month and ₦50,000 for each month after, under the Nigeria Tax Administration Act 2025. This applies even when no tax is due, so a nil return is required by law.</p>' +
        '<p class="calc-note">This is only the penalty for not filing. Any tax actually owed, and interest on it, comes on top. It’s almost always cheaper to file the outstanding returns now than to wait for a demand notice.</p>' +
        cta('tax', 'Help me file my returns');
    }""",
    faq=[
        ('What is the penalty for not filing a tax return in Nigeria?', 'Under the Nigeria Tax Administration Act 2025, failing to file a return attracts ₦100,000 for the first month and ₦50,000 for each month after.'),
        ('Do I pay a penalty if I owed no tax?', 'Yes. The penalty is for not filing, not for unpaid tax. A nil return is required by law even when there was no profit or no sales.'),
        ('Can I still file late returns?', 'Yes. File the outstanding returns as soon as you can: the penalty grows every month you wait, and you need up-to-date filings for a tax clearance certificate.'),
    ],
    guides=[('no-profit-still-file-tax-returns-nigeria', 'No profit: do I still file a tax return?'), ('tax-clearance-certificate-nigeria', 'Getting a tax clearance certificate'), ('nigeria-tax-act-2025-compliance-guide', 'Nigeria Tax Act 2025 compliance guide')],
))

# ── 3. VAT threshold checker ─────────────────────────────────────────────
TOOLS.append(dict(
    slug='vat-registration-checker', short='VAT registration checker', icon='%',
    title='Do I Need to Register for VAT in Nigeria? VAT Threshold Checker | Awal Global Consults',
    h1='Do I need to register for VAT?',
    lede='Check whether your business has to charge VAT under the 2025 tax laws, and what to do if you are above or close to the ₦100 million threshold.',
    desc='Free VAT threshold checker for Nigerian businesses: under the 2025 tax laws, businesses with turnover above ₦100 million must register, charge 7.5% VAT and file monthly.',
    card='Check your turnover against the ₦100 million VAT threshold.',
    form='''
        <div class="calc-field"><label for="vturnover">Annual turnover (or what you expect this year)</label>
          <input id="vturnover" type="text" inputmode="numeric" data-money placeholder="e.g. 85,000,000"></div>
        <fieldset class="calc-field"><legend>Is everything you sell exempt from VAT?</legend>
          <p class="calc-hint" style="margin-top:0">For example many basic food items, medical and pharmaceutical products and educational services.</p>
          <div class="calc-yn"><label><input type="radio" name="exempt" value="n" checked> No</label><label><input type="radio" name="exempt" value="y"> Yes</label><label><input type="radio" name="exempt" value="u"> Not sure</label></div></fieldset>''',
    js=r"""
    function render() {
      var t = num('vturnover'), ex = val('exempt');
      if (t === null) return '<h2>Your result</h2><p class="calc-note">Enter your annual turnover to check it against the threshold.</p>';
      var above = t > 100000000, close = !above && t >= 80000000;
      track('vat_threshold', { result: above ? 'above' : close ? 'close' : 'below' });
      var html;
      if (above && ex === 'y') html = '<h2>Above the threshold, but your sales may be exempt</h2>' + verdict('info', 'If everything you sell is exempt, VAT may not apply even above ₦100 million.') +
        '<p class="calc-note">The exempt and zero-rated lists changed with the 2025 reforms, so check each item you sell against the current lists before deciding. We can review this with you.</p>';
      else if (above) html = '<h2>You need to register for VAT</h2>' + verdict('warn', 'Turnover above ₦100 million: register, charge 7.5% VAT and file monthly.') +
        '<ul class="calc-list"><li>Register for VAT with the tax authority using your TIN.</li><li>Charge 7.5% on taxable sales and show it on your invoices.</li><li>File VAT returns every month, including nil returns, and pay over what you collect less VAT on qualifying purchases.</li><li>Keep sales and purchase invoices.</li></ul>' +
        (ex === 'u' ? '<p class="calc-note">Not sure whether your sales are exempt? Some are, so it’s worth checking before you start charging.</p>' : '');
      else html = '<h2>You don’t have to charge VAT yet</h2>' + verdict(close ? 'warn' : 'ok', close ? 'You’re close to the ₦100 million threshold: plan now.' : 'Turnover of ₦100 million or less: no VAT to charge or file.') +
        '<p class="calc-note">' + (close ? 'If you cross ₦100 million and don’t start charging VAT, you can end up owing VAT you never collected from customers. Track your turnover monthly.' : 'Keep an eye on your turnover through the year: once it goes above ₦100 million, you must register and start charging.') + '</p>';
      html += '<p class="calc-note">Never charge VAT without paying it over: that is treated very seriously. Based on our <a href="/blog/vat-registration-small-business-nigeria/">VAT guide</a>; general guidance, not advice on your situation.</p>';
      return html + cta('tax', above ? 'Help me register for VAT' : 'Talk to us about tax');
    }""",
    faq=[
        ('What is the VAT threshold in Nigeria?', 'Under the 2025 tax laws, a business with annual turnover of ₦100 million or less does not have to charge VAT or file VAT returns. Above that, it must register, charge 7.5% and file monthly.'),
        ('What is the VAT rate in Nigeria?', 'The VAT rate is 7.5%. Some goods and services are exempt or zero-rated.'),
        ('Do I file VAT returns if I made no sales?', 'Once registered, yes: VAT returns are monthly, including nil returns for months with no sales.'),
    ],
    guides=[('vat-registration-small-business-nigeria', 'VAT registration for small businesses'), ('small-company-tax-exemption-nigeria-tax-act-2025', 'Small company tax exemption'), ('tax-clearance-certificate-nigeria', 'Tax clearance certificates')],
))

# ── 4. NDPC registration checker ─────────────────────────────────────────
SECTORS = ['aviation', 'communication', 'education', 'electric power', 'export and import', 'financial', 'health', 'hospitality', 'insurance', 'oil and gas', 'tourism', 'e-commerce', 'public service']
ORG_TYPES = [
    ('uhl', 'Commercial bank, telecoms, insurer, multinational, electricity distribution, oil and gas, payment gateway or fintech, social media or email app, device manufacturer'),
    ('ehl', 'Government ministry, department or agency, microfinance or mortgage bank, higher institution, secondary or tertiary hospital'),
    ('ohl', 'Primary or secondary school, corporate training provider, primary health centre, independent medical laboratory, hotel or guest house with fewer than 50 rooms'),
    ('none', 'None of these'),
]
TOOLS.append(dict(
    slug='ndpc-registration-checker', short='NDPC registration checker', icon='🔒',
    title='Do I Need to Register with the NDPC? Fee and Category Checker | Awal Global Consults',
    h1='Do I need to register with the NDPC?',
    lede='Check whether your organisation is a data controller or processor of major importance under the Nigeria Data Protection Act, which category applies (UHL, EHL or OHL) and the registration fee.',
    desc='Free NDPC registration checker: find out if your organisation must register with the Nigeria Data Protection Commission, whether you are UHL, EHL or OHL, and the fee (₦250,000, ₦100,000 or ₦10,000).',
    card='Find out if you must register, your category (UHL, EHL or OHL) and the fee.',
    form='''
        <div class="calc-field"><label for="people">Whose personal data do you hold? How many people in any six months?</label>
          <p class="calc-hint" style="margin-top:0">Customers, staff, students, patients, users: everyone you hold details about.</p>
          <select id="people"><option value="0">Fewer than 200</option><option value="1">200 to 1,000</option><option value="2">1,000 to 5,000</option><option value="3">More than 5,000</option></select></div>
        <div class="calc-field"><label for="sector">Your sector</label>
          <select id="sector"><option value="">Not one of these</option>''' + ''.join(f'<option>{e(s.capitalize())}</option>' for s in SECTORS) + '''</select></div>
        <div class="calc-field"><label for="orgtype">Does any of these describe your organisation?</label>
          <select id="orgtype">''' + ''.join(f'<option value="{k}">{e(t)}</option>' for k, t in ORG_TYPES[::-1]) + '''</select></div>
        <fieldset class="calc-field"><legend>Do you provide commercial ICT services on devices that belong to other people?</legend>
          <p class="calc-hint" style="margin-top:0">For example phone or computer repair.</p>
          <div class="calc-yn"><label><input type="radio" name="ict" value="n" checked> No</label><label><input type="radio" name="ict" value="y"> Yes</label></div></fieldset>''',
    js=r"""
    var TIERS = [null,
      { key: 'OHL', name: 'Ordinary-High Level (OHL)', fee: 10000 },
      { key: 'EHL', name: 'Extra-High Level (EHL)', fee: 100000 },
      { key: 'UHL', name: 'Ultra-High Level (UHL)', fee: 250000 }];
    function render() {
      var people = Number($('people').value), sector = $('sector').value, org = $('orgtype').value, ict = val('ict') === 'y';
      var reasons = [];
      if (people >= 1) reasons.push('you hold the personal data of 200 or more people in six months');
      if (sector) reasons.push('you operate in a designated sector (' + sector.toLowerCase() + ')');
      if (ict) reasons.push('you provide ICT services on other people’s devices');
      if (org !== 'none') reasons.push('your type of organisation is named in the NDPC’s categories');
      track('ndpc_check', { must: reasons.length > 0 });
      if (!reasons.length) return '<h2>You probably don’t need to register</h2>' + verdict('ok', 'Fewer than 200 people’s data, no designated sector and no ICT services on others’ devices.') +
        '<p class="calc-note">You still have to protect the personal data you hold under the Nigeria Data Protection Act: have a privacy policy, collect only what you need, keep it secure and respect people’s rights. Count again if you grow: registration starts at 200 people in any six months.</p>' +
        '<p class="calc-note">See <a href="/blog/privacy-policy-small-business-nigeria/">does my small business need a privacy policy?</a></p>' + cta('data-protection', 'Get a privacy check');
      var level = Math.max(people, { uhl: 3, ehl: 2, ohl: 1, none: 1 }[org]);
      var t = TIERS[level];
      var html = '<h2>You need to register with the NDPC</h2>' + verdict('warn', 'Likely category: ' + t.name + '.') +
        '<p class="calc-note">Why: ' + reasons.join('; ') + '.</p>' +
        '<h3>NDPC fees (paid to the NDPC)</h3>' + row('Registration, renewed every year', naira(t.fee), 'total') +
        (t.key === 'UHL' ? row('Plus, for each data processor you engage', naira(5000) + ' a year') : '') +
        '<p class="calc-note">The registration period has ended, so a <strong>50% late penalty</strong> applies to new registrations. Companies incorporated recently can ask for it to be waived.</p>' +
        '<h3>What else applies</h3><ul class="calc-list">' +
        (t.key !== 'OHL' ? '<li><strong>Annual compliance audit return</strong> by 31 March, verified by a licensed Data Protection Compliance Organisation (DPCO).</li>' : '') +
        '<li>A Data Protection Officer, a privacy policy and proper security measures.</li>' +
        '<li>Not complying can cost up to ₦10 million or 2% of annual gross revenue, whichever is higher.</li></ul>' +
        '<p class="calc-note">The category is our best reading of the NDPC Guidance Notice (NDPC/HQ/GN/VOL.03/B/24); we confirm it when we review your details. See our <a href="/data-protection">data protection service</a>.</p>';
      return html + cta('data-protection', 'Register me with the NDPC');
    }""",
    faq=[
        ('Who has to register with the NDPC?', 'Data controllers and processors of major importance: organisations that process the personal data of more than 200 people in any six months, provide commercial ICT services on other people’s devices, or operate in a designated sector such as education, health, financial services, hospitality or e-commerce.'),
        ('How much is NDPC registration?', 'The NDPC fee is ₦250,000 for Ultra-High Level, ₦100,000 for Extra-High Level and ₦10,000 for Ordinary-High Level organisations, renewed yearly, plus a 50% late penalty now that the registration period has ended. Ultra-High Level organisations also pay ₦5,000 a year for each data processor they engage.'),
        ('Who files the annual compliance audit return?', 'Ultra-High and Extra-High Level organisations, every year by 31 March, with a verification statement from a licensed DPCO.'),
    ],
    guides=[('ndpa-compliance-nigerian-business', 'NDPA compliance for Nigerian businesses'), ('privacy-policy-small-business-nigeria', 'Does my small business need a privacy policy?'), ('data-breach-response-nigeria-ndpa', 'Responding to a data breach')],
))

# ── 5. SCUML checker ─────────────────────────────────────────────────────
DNFBP = ['Estate agent or real estate practice', 'Dealer in jewellery, luxury or other high-value goods', 'Car or automobile dealer', 'Hotel or hospitality operator',
         'Lawyer or law firm (handling client transactions)', 'Accountant, audit firm or tax consultant', 'Consultant or consulting firm', 'Trust or company service provider',
         'Casino, lottery or gaming business', 'Estate surveyor or valuer']
TOOLS.append(dict(
    slug='scuml-checker', short='Do I need SCUML?', icon='✓',
    title='Do I Need SCUML Registration? Free SCUML Checker Nigeria | Awal Global Consults',
    h1='Does my business need SCUML registration?',
    lede='SCUML registration is required for certain types of business, whatever their size, and banks ask for it when you open a corporate account. Check yours in seconds.',
    desc='Free SCUML checker: find out whether your Nigerian business is a designated non-financial business (DNFBP) that must register with SCUML, the EFCC’s anti-money laundering unit.',
    card='Check whether your type of business must register with SCUML.',
    form='''
        <fieldset class="calc-field"><legend>What does your business do? Tick all that apply.</legend>
          <div class="calc-checks">''' + ''.join(f'<label><input type="checkbox" name="dnfbp" value="{e(d)}"> {e(d)}</label>' for d in DNFBP) + '''
            <label><input type="checkbox" name="dnfbp" value="none" id="dnfbp-none"> None of these</label></div></fieldset>''',
    js=r"""
    document.querySelectorAll('input[name=dnfbp]').forEach(function (cb) { cb.addEventListener('change', function () {
      if (cb.value === 'none' && cb.checked) document.querySelectorAll('input[name=dnfbp]').forEach(function (o) { if (o !== cb) o.checked = false; });
      if (cb.value !== 'none' && cb.checked) $('dnfbp-none').checked = false;
    }); });
    function render() {
      var picked = Array.prototype.slice.call(document.querySelectorAll('input[name=dnfbp]:checked')).map(function (c) { return c.value; });
      if (!picked.length) return '<h2>Your result</h2><p class="calc-note">Tick what your business does to see whether SCUML applies.</p>';
      var none = picked.indexOf('none') !== -1;
      track('scuml_check', { must: !none });
      if (none) return '<h2>SCUML probably doesn’t apply to you</h2>' + verdict('ok', 'Your business isn’t in one of the designated categories.') +
        '<p class="calc-note">If your business handles high-value, cash-heavy or trust-based transactions for clients, it may still fall within the designated categories: ask us to check before a bank does.</p>' + cta('scuml', 'Ask us to check');
      return '<h2>Your business needs SCUML registration</h2>' + verdict('warn', 'This is a legal requirement for your category, whatever the size of the business.') +
        '<ul class="calc-list">' + picked.map(function (p) { return '<li>' + p + '</li>'; }).join('') + '</ul>' +
        '<p class="calc-note">Banks treat the SCUML certificate as standard account-opening documentation for these businesses. Without it, a corporate account can be declined or restricted.</p>' +
        '<h3>Cost</h3>' + row('SCUML’s own registration fee', 'Free') + row('Our professional fee', naira(70000), 'total') +
        '<p class="calc-note">Once registered, you are expected to run customer due diligence on your own clients. See our <a href="/blog/scuml-registration-nigeria/">SCUML guide</a>.</p>' +
        cta('scuml', 'Register my business with SCUML');
    }""",
    faq=[
        ('What is SCUML?', 'The Special Control Unit against Money Laundering, a unit of the EFCC that registers and monitors designated non-financial businesses and professions (DNFBPs).'),
        ('Which businesses need SCUML registration?', 'Designated categories including estate agents, dealers in jewellery and high-value goods, car dealers, hotels, lawyers, accountants and tax consultants, consultants, trust and company service providers, casinos and estate surveyors. It depends on the category, not the size.'),
        ('How much does SCUML registration cost?', 'SCUML registration itself is free. Our professional fee for handling it is ₦70,000.'),
    ],
    guides=[('scuml-registration-nigeria', 'SCUML registration explained'), ('scuml-real-estate-car-dealers-jewellers-nigeria', 'SCUML for estate agents, car dealers and jewellers'), ('open-corporate-bank-account-nigeria', 'Opening a corporate bank account')],
))

# ── 6. Trademark class finder ────────────────────────────────────────────
# Nice Classification (11th edition) classes for common Nigerian business types
CLASSES = {
    3: 'Cosmetics, skincare, hair care products, perfumes, soaps', 5: 'Pharmaceuticals, medicines, food supplements', 9: 'Software, apps, phones and electronics',
    12: 'Vehicles and vehicle parts', 14: 'Jewellery and watches', 16: 'Printed matter, books, stationery, packaging', 18: 'Bags, leather goods',
    19: 'Building materials (non-metal)', 20: 'Furniture', 21: 'Household utensils, kitchenware', 24: 'Fabrics and textiles (such as Ankara)', 25: 'Clothing, footwear, headwear',
    26: 'Wigs, hair extensions, hair accessories', 29: 'Meat, fish, eggs, dairy, oils, processed fruit and vegetables', 30: 'Bread, pastries, rice, spices, coffee, tea, sauces, snacks',
    31: 'Fresh produce, live animals, animal feed', 32: 'Water, soft drinks, juices', 33: 'Alcoholic drinks (except beer)',
    35: 'Advertising, retail and online stores, business management and consulting', 36: 'Financial services, payments, insurance, real estate agency',
    37: 'Construction, repair, cleaning', 38: 'Telecommunications', 39: 'Transport, logistics, delivery, travel arrangement', 41: 'Education, training, entertainment, events, publishing',
    42: 'Software development, IT and design services, SaaS', 43: 'Restaurants, catering, hotels and accommodation', 44: 'Medical, beauty, salon and spa services, agriculture services',
    45: 'Legal services, security services, personal services',
}
BUSINESSES = [
    ('Fashion brand: clothing or shoes', [25, 35]), ('Bags or leather goods', [18, 35]), ('Jewellery', [14, 35]), ('Fabrics, Ankara or textiles', [24]),
    ('Wigs or hair extensions', [26, 35]), ('Skincare, cosmetics, hair care or perfume', [3, 35]), ('Salon, spa or beauty services', [44]),
    ('Restaurant, café, catering or food delivery', [43, 39]), ('Bakery, snacks or packaged food', [30, 29]), ('Drinks: water, juice or soft drinks', [32]), ('Alcoholic drinks', [33]),
    ('Farm produce, poultry or animal feed', [31, 29]), ('Pharmacy products or supplements', [5]), ('Clinic, hospital or medical services', [44]),
    ('Mobile app or software product', [9, 42]), ('Fintech or payments', [36, 9, 42]), ('IT, web design or digital agency', [42, 35]), ('Phones, gadgets or electronics', [9, 35]),
    ('School, training or online courses', [41]), ('Events, music, media or entertainment', [41]), ('Consulting or business services', [35]), ('Law firm or legal services', [45]),
    ('Real estate agency', [36]), ('Construction or building', [37, 19]), ('Cleaning or repair services', [37]), ('Logistics, delivery or transport', [39]),
    ('Hotel or short-let apartments', [43]), ('Travel agency', [39]), ('Online store or retail shop', [35]), ('Furniture', [20]), ('Printing or publishing', [16, 41]),
    ('Car dealership or auto parts', [12, 35]), ('Security services', [45]),
]
TOOLS.append(dict(
    slug='trademark-class-finder', short='Trademark class finder', icon='®',
    title='Trademark Class Finder Nigeria: Which Class Should I Register? | Awal Global Consults',
    h1='Which trademark class do I need?',
    lede='Your trademark only protects you in the classes you register. Pick what your business sells or does and see the classes to consider before you file.',
    desc='Free trademark class finder for Nigerian businesses: find the Nice Classification classes for clothing, food, cosmetics, apps, fintech, restaurants, consulting and more before you register with NIPO.',
    card='Pick what you sell or do and see which trademark classes to consider.',
    form='''
        <fieldset class="calc-field"><legend>What does your brand sell or do? Tick all that apply.</legend>
          <div class="calc-checks calc-checks-2">''' + ''.join(f'<label><input type="checkbox" name="biz" value="{i}"> {e(b)}</label>' for i, (b, _) in enumerate(BUSINESSES)) + '''</div></fieldset>''',
    js=r"""
    var CLASSES = """ + json.dumps(CLASSES) + r""";
    var BUSINESSES = """ + json.dumps(BUSINESSES) + r""";
    function render() {
      var picked = Array.prototype.slice.call(document.querySelectorAll('input[name=biz]:checked')).map(function (c) { return BUSINESSES[Number(c.value)]; });
      if (!picked.length) return '<h2>Your classes</h2><p class="calc-note">Tick what your brand sells or does.</p>';
      var classes = {};
      picked.forEach(function (b) { b[1].forEach(function (c) { (classes[c] = classes[c] || []).push(b[0]); }); });
      var list = Object.keys(classes).map(Number).sort(function (a, b) { return a - b; });
      track('trademark_class', { classes: list.length });
      return '<h2>' + list.length + ' class' + (list.length === 1 ? '' : 'es') + ' to consider</h2>' +
        list.map(function (c) { return '<div class="calc-class"><span class="calc-class-num">Class ' + c + '</span><div><strong>' + CLASSES[c] + '</strong><small>For: ' + classes[c].join('; ') + '</small></div></div>'; }).join('') +
        '<p class="calc-note">Nigeria doesn’t allow multi-class applications, so <strong>each class is a separate application and fee</strong>. Register in the classes your business actually uses, or genuinely plans to use soon, not every class “just in case”.</p>' +
        '<p class="calc-note">These are starting points from the Nice Classification. The right class, and the wording of your goods or services within it, depends on exactly what you do: we confirm both before filing. See <a href="/blog/trademark-classes-explained-nigeria/">trademark classes explained</a>.</p>' +
        cta('trademark', 'Get a trademark quotation');
    }""",
    faq=[
        ('What is a trademark class?', 'Nigeria uses the Nice Classification: 45 classes covering every type of goods (classes 1 to 34) and services (classes 35 to 45). Your trademark protects you only in the classes you register.'),
        ('Can I register a trademark in more than one class?', 'Yes, but in Nigeria each class is a separate application with its own fee, so register in the classes your business actually uses.'),
        ('How long does a Nigerian trademark last?', 'A registration lasts 7 years before it needs renewing.'),
    ],
    guides=[('trademark-classes-explained-nigeria', 'Trademark classes explained'), ('trademark-search-nigeria', 'Doing a trademark search'), ('trademark-registration-cost-nigeria', 'What trademark registration costs')],
))


def page(t):
    url = f'{SITE}/{t["slug"]}'
    faq_html = ''.join(f'\n        <details class="faq-item"><summary>{e(q)}</summary><p>{e(a)}</p></details>' for q, a in t['faq'])
    faq_ld = ',\n'.join(f'      {{"@type": "Question", "name": {json.dumps(q)}, "acceptedAnswer": {{"@type": "Answer", "text": {json.dumps(a)}}}}}' for q, a in t['faq'])
    guides = ' · '.join(f'<a href="/blog/{s}/">{e(n)}</a>' for s, n in t['guides'])
    schema = f'''{{
  "@context": "https://schema.org",
  "@graph": [
    {{"@type": "WebApplication", "name": {json.dumps(t['short'])}, "url": "{url}", "applicationCategory": "BusinessApplication", "operatingSystem": "Any",
      "offers": {{"@type": "Offer", "price": "0", "priceCurrency": "NGN"}}, "provider": {{"@type": "Organization", "name": "Awal Global Consults Limited", "url": "{SITE}/"}}}},
    {{"@type": "FAQPage", "mainEntity": [
{faq_ld}
    ]}},
    {{"@type": "BreadcrumbList", "itemListElement": [
      {{"@type": "ListItem", "position": 1, "name": "Home", "item": "{SITE}/"}},
      {{"@type": "ListItem", "position": 2, "name": "Free tools", "item": "{SITE}/tools"}},
      {{"@type": "ListItem", "position": 3, "name": {json.dumps(t['short'])}, "item": "{url}"}}
    ]}}
  ]
}}'''
    main = f'''  <section class="hero service-hero">
    <div class="container">
      <div class="hero-text" style="max-width:760px;">
        <span class="eyebrow"><a href="/tools" style="color:inherit;text-decoration:none;">Free Tools</a></span>
        <h1>{e(t['h1'])}</h1>
        <p>{e(t['lede'])}</p>
      </div>
    </div>
  </section>

  <section class="section" id="tool">
    <div class="container calc-wrap">
      <form class="calc-card" id="calc" onsubmit="return false">{t['form']}
      </form>
      <div class="calc-card calc-result" id="result" aria-live="polite"></div>
    </div>
  </section>

  <section class="section alt-bg" id="faq">
    <div class="container">
      <div class="section-head"><span class="eyebrow">Questions</span><h2>Good to know</h2></div>
      <div class="faq-list">{faq_html}
      </div>
      <p class="price-note-line" style="margin-top:22px;">Read more: {guides} · <a href="/tools">All free tools</a></p>
    </div>
  </section>

  <script>
  (function () {{{COMMON_JS}{t['js']}
    var go = function () {{ $('result').innerHTML = render(); }};
    $('calc').addEventListener('input', go);
    $('calc').addEventListener('change', go);
    go();
  }})();
  </script>

'''
    return t['title'], t['desc'], url, schema, main


def hub():
    url = f'{SITE}/tools'
    tools = [('cac-cost-calculator', 'CAC registration cost calculator', 'See the cost of registering a business name, company or NGO, with official CAC charges by share capital.')] + \
            [(t['slug'], t['short'], t['card']) for t in TOOLS]
    cards = ''.join(f'''
        <a class="need-chip tool-chip" href="/{s}"><strong>{e(n)}</strong><span>{e(d)}</span></a>''' for s, n, d in tools)
    schema = json.dumps({'@context': 'https://schema.org', '@type': 'CollectionPage', 'name': 'Free business tools', 'url': url,
                         'hasPart': [{'@type': 'WebApplication', 'name': n, 'url': f'{SITE}/{s}'} for s, n, _ in tools]}, indent=2)
    main = f'''  <section class="hero service-hero">
    <div class="container">
      <div class="hero-text" style="max-width:760px;">
        <span class="eyebrow">Free Tools</span>
        <h1>Free tools for Nigerian businesses</h1>
        <p>Quick answers to the questions we hear most: what registration costs, which taxes apply, and whether you need NDPC, SCUML or trademark registration. No sign-up needed.</p>
      </div>
    </div>
  </section>

  <section class="section">
    <div class="container">
      <div class="need-grid">{cards}
      </div>
      <p class="price-note-line" style="margin-top:26px;">These tools give general guidance from published rules and our own prices, not advice on your situation. For a firm answer, <a href="/book">book a free 20-minute call</a> or <a href="/kyc/">ask for a quotation</a>.</p>
    </div>
  </section>

'''
    return ('Free Business Tools: CAC, Tax, VAT, NDPC, SCUML and Trademark Checkers | Awal Global Consults',
            'Free tools for Nigerian businesses: CAC registration cost calculator, small company tax checker, late filing penalty calculator, VAT threshold checker, NDPC, SCUML and trademark class checkers.',
            url, schema, main)


def write(slug, title, desc, url, schema, main):
    meta = f'''<title>{e(title)}</title>
  <meta name="description" content="{e(desc)}">
  <meta name="robots" content="index, follow">
  <link rel="canonical" href="{url}">

  <link rel="icon" type="image/png" href="assets/images/favicon.png">
  <script type="application/ld+json">
{schema}
  </script>
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600;0,9..144,700;1,9..144,500&family=DM+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="style.css">

  <meta property="og:title" content="{e(title)}">
  <meta property="og:description" content="{e(desc)}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="{url}">
  <meta property="og:site_name" content="Awal Global Consults">
  <meta property="og:image" content="{SITE}/assets/images/og-image.jpg">
  <meta property="og:locale" content="en_NG">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="{e(title)}">
  <meta name="twitter:description" content="{e(desc)}">
  <meta name="twitter:image" content="{SITE}/assets/images/og-image.jpg">

'''
    foot = shell[footer_start:]
    foot = re.sub(r'  <section class="cta-section">.*?</section>\n\n', '', foot, count=1, flags=re.S)
    foot = foot.replace('Hello%20I%20need%20help%20with%20governance%2C%20risk%20and%20compliance', 'Hello%2C%20I%20used%20one%20of%20your%20free%20tools')
    open(os.path.join(ROOT, f'{slug}.html'), 'w').write(shell[:head_start] + meta + shell[head_end:header_end] + '\n\n' + main + '  ' + foot)
    print('built', slug)


for t in TOOLS:
    write(t['slug'], *page(t))
write('tools', *hub())
