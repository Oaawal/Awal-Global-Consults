"""Build /cac-cost-calculator from the /grc page shell. Run: python3 ops/cac-calculator/build.py

Every figure comes from "Owner answers" in ops/content-plan.md: the official CAC charges
(owner, 31 Oct 2026) and the firm's own starting prices and timelines. Change them there
first, then here.
"""
import html, json, os, re
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
e = html.escape
shell = open(os.path.join(ROOT, 'grc.html')).read()
head_start = shell.index('<title>'); head_end = shell.index('</head>')
header_end = shell.index('</header>') + len('</header>'); footer_start = shell.index('<!-- Footer -->')

SLUG = 'cac-cost-calculator'
TITLE = 'CAC Registration Cost Calculator (2026) | Awal Global Consults'
DESC = ('Work out what it costs to register a business name or a limited company with CAC in 2026: official CAC charges '
        'by share capital, our package price, the timeline, and which structure suits you.')
FAQ = [
    ('Are these the official CAC fees?', 'The official charges shown are the CAC fees we pay on your behalf: name reservation, the filing fee and, for companies, stamp duty. Remita adds a small processing charge to each payment. Our own prices are shown separately as starting prices.'),
    ('Why does a company cost more with higher share capital?', 'CAC charges a filing fee of ₦10,000 for each ₦1 million of share capital, and stamp duty is 0.75% of the share capital. So the official charges rise as share capital rises.'),
    ('How long does registration take?', 'In our experience a business name is usually ready within 24 hours and a limited company within 48 to 72 hours if CAC raises no queries. These are our own turnaround times, not official CAC service times: CAC approval can take longer.'),
    ('Is this a final quotation?', 'No. It is an estimate from starting prices. You get an itemised quotation within 1 working day of asking, before you pay anything.'),
]
faq_html = ''.join(f'\n        <details class="faq-item"><summary>{e(q)}</summary><p>{e(a)}</p></details>' for q, a in FAQ)
faq_ld = ',\n'.join(f'    {{"@type": "Question", "name": {json.dumps(q)}, "acceptedAnswer": {{"@type": "Answer", "text": {json.dumps(a)}}}}}' for q, a in FAQ)
url = f'https://awalglobal.com.ng/{SLUG}'
schema = f'''{{
  "@context": "https://schema.org",
  "@graph": [
    {{"@type": "WebApplication", "name": "CAC Registration Cost Calculator", "url": "{url}", "applicationCategory": "BusinessApplication", "operatingSystem": "Any",
      "offers": {{"@type": "Offer", "price": "0", "priceCurrency": "NGN"}}, "provider": {{"@type": "Organization", "name": "Awal Global Consults Limited", "url": "https://awalglobal.com.ng/"}}}},
    {{"@type": "FAQPage", "mainEntity": [
{faq_ld}
    ]}}
  ]
}}'''
meta = f'''<title>{e(TITLE)}</title>
  <meta name="description" content="{e(DESC)}">
  <meta name="robots" content="index, follow">
  <link rel="canonical" href="{url}">

  <link rel="icon" type="image/png" href="assets/images/favicon.png">
  <script type="application/ld+json">
{schema}
  </script>
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600;0,9..144,700;1,9..144,500&family=DM+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="style.css">

  <meta property="og:title" content="{e(TITLE)}">
  <meta property="og:description" content="{e(DESC)}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="{url}">
  <meta property="og:site_name" content="Awal Global Consults">
  <meta property="og:image" content="https://awalglobal.com.ng/assets/images/og-image.jpg">
  <meta property="og:locale" content="en_NG">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="{e(TITLE)}">
  <meta name="twitter:description" content="{e(DESC)}">
  <meta name="twitter:image" content="https://awalglobal.com.ng/assets/images/og-image.jpg">

'''

main = f'''  <section class="hero service-hero">
    <div class="container">
      <div class="hero-text" style="max-width:760px;">
        <span class="eyebrow">Free Tool</span>
        <h1>CAC registration cost calculator</h1>
        <p>See what it costs to register a business name or a limited company: the official CAC charges, our package price and how long it takes. No sign-up needed.</p>
      </div>
    </div>
  </section>

  <section class="section" id="calculator">
    <div class="container calc-wrap">
      <div class="calc-card" id="calc">
        <fieldset class="calc-field">
          <legend>What are you registering?</legend>
          <div class="calc-options" role="radiogroup">
            <label><input type="radio" name="type" value="bn" checked><span><strong>Business name</strong><small>Sole owner or partners, trading under a name</small></span></label>
            <label><input type="radio" name="type" value="ltd"><span><strong>Limited company</strong><small>A separate legal entity with shareholders</small></span></label>
            <label><input type="radio" name="type" value="ngo"><span><strong>NGO or foundation</strong><small>Incorporated trustees</small></span></label>
            <label><input type="radio" name="type" value="unsure"><span><strong>I'm not sure</strong><small>Answer 3 questions to find out</small></span></label>
          </div>
        </fieldset>

        <div class="calc-field" id="capital-field" hidden>
          <label for="capital">Share capital</label>
          <select id="capital">
            <option value="1000000">₦1,000,000</option><option value="2000000">₦2,000,000</option><option value="5000000">₦5,000,000</option>
            <option value="10000000">₦10,000,000</option><option value="25000000">₦25,000,000</option><option value="100000000">₦100,000,000</option>
            <option value="custom">Another amount…</option>
          </select>
          <input id="capital-custom" type="text" inputmode="numeric" placeholder="e.g. 3,000,000" aria-label="Share capital in naira" hidden>
          <p class="calc-hint">Not sure what to choose? See <a href="/blog/share-capital-new-company-nigeria/">how share capital works</a>.</p>
        </div>

        <div class="calc-field" id="quiz" hidden>
          <p class="calc-q">1. Will you have partners or investors who own part of the business, now or later?</p>
          <div class="calc-yn"><label><input type="radio" name="q1" value="y"> Yes</label><label><input type="radio" name="q1" value="n"> No</label></div>
          <p class="calc-q">2. Do you want your personal assets kept separate from the business's debts?</p>
          <div class="calc-yn"><label><input type="radio" name="q2" value="y"> Yes</label><label><input type="radio" name="q2" value="n"> No</label></div>
          <p class="calc-q">3. Will you bid for contracts with government or large companies, or apply for licences?</p>
          <div class="calc-yn"><label><input type="radio" name="q3" value="y"> Yes</label><label><input type="radio" name="q3" value="n"> No</label></div>
        </div>
      </div>

      <div class="calc-card calc-result" id="result" aria-live="polite"></div>
    </div>
  </section>

  <section class="section alt-bg" id="faq">
    <div class="container">
      <div class="section-head">
        <span class="eyebrow">Questions</span>
        <h2>About these figures</h2>
      </div>
      <div class="faq-list">{faq_html}
      </div>
      <p class="price-note-line" style="margin-top:22px;">More detail: <a href="/blog/cac-fees-2026-fee-table/">CAC fees 2026</a> · <a href="/blog/business-name-vs-limited-company-nigeria/">business name vs limited company</a> · <a href="/cac-registration">our CAC packages</a>.</p>
    </div>
  </section>

  <script>
  (function () {{
    // Official CAC charges and our starting prices: see "Owner answers" in ops/content-plan.md
    var CAC = {{ nameReservation: 1000, bnFiling: 20000, companyFilingPerMillion: 10000, stampDutyRate: 0.0075 }};
    var OURS = {{ bn: 40000, ltd: 75000, ngo: 150000 }};
    var naira = function (n) {{ return '₦' + Math.round(n).toLocaleString('en-NG'); }};
    var $ = function (id) {{ return document.getElementById(id); }};
    var row = function (label, value, cls) {{ return '<div class="calc-row' + (cls ? ' ' + cls : '') + '"><span>' + label + '</span><strong>' + value + '</strong></div>'; }};
    var cta = function (shortcut, label) {{ return '<div class="calc-cta"><a class="btn btn-primary" href="kyc/?s=' + shortcut + '">' + label + ' →</a><a class="btn btn-secondary" href="/book">Book a free call</a></div><p class="calc-hint">An estimate from starting prices, not a quotation. Your itemised quotation comes within 1 working day, before you pay anything.</p>'; }};

    function capital() {{
      var sel = $('capital').value;
      if (sel !== 'custom') return Number(sel);
      var n = Number(String($('capital-custom').value).replace(/[^0-9]/g, ''));
      return n >= 100000 ? n : 0;
    }}
    function bn() {{
      var official = CAC.nameReservation + CAC.bnFiling;
      return '<h2>Business name</h2>' +
        row('Our Basic Starter package', 'From ' + naira(OURS.bn), 'total') +
        '<p class="calc-note">This includes the official CAC charges below, your certificate, status report and TIN.</p>' +
        '<h3>Official CAC charges (included)</h3>' +
        row('Name reservation', naira(CAC.nameReservation)) + row('Filing fee', naira(CAC.bnFiling)) + row('Total paid to CAC', naira(official) + ' + Remita charges', 'sub') +
        '<h3>Timeline</h3><p class="calc-note">Usually within 24 hours, in our experience. This is our own turnaround, not an official CAC service time.</p>' +
        cta('business-name', 'Get my quotation');
    }}
    function ltd() {{
      var c = capital();
      if (!c) return '<h2>Limited company</h2><p class="calc-note">Enter a share capital of at least ₦100,000 to see the official charges.</p>';
      var filing = Math.ceil(c / 1000000) * CAC.companyFilingPerMillion, duty = c * CAC.stampDutyRate;
      var official = CAC.nameReservation + filing + duty;
      return '<h2>Limited company</h2>' +
        row('Our Core Setup package', 'From ' + naira(OURS.ltd), 'total') +
        '<p class="calc-note">Includes name check, certificate, memorandum and articles, status report and TIN. Official charges rise with share capital, so your quotation shows exactly how the two add up at ' + naira(c) + '.</p>' +
        '<h3>Official CAC charges at ' + naira(c) + ' share capital</h3>' +
        row('Name reservation', naira(CAC.nameReservation)) +
        row('Filing fee (₦10,000 per ₦1m)', naira(filing)) +
        row('Stamp duty (0.75%)', naira(duty)) +
        row('Total paid to CAC', naira(official) + ' + Remita charges', 'sub') +
        '<h3>Timeline</h3><p class="calc-note">Usually 48 to 72 hours if CAC raises no queries, in our experience. This is our own turnaround, not an official CAC service time.</p>' +
        cta('company', 'Get my quotation');
    }}
    function ngo() {{
      return '<h2>NGO or foundation (incorporated trustees)</h2>' +
        row('Our package', 'From ' + naira(OURS.ngo), 'total') +
        '<p class="calc-note">Official charges and the newspaper publication are itemised in your quotation.</p>' +
        '<h3>Timeline</h3><p class="calc-note">Name consent and reservation takes about 3 business days. The law then requires a newspaper publication with a 28-day window, followed by final submission and approval (about 3 business days).</p>' +
        cta('ngo', 'Get my quotation');
    }}
    function unsure() {{
      var a = ['q1', 'q2', 'q3'].map(function (q) {{ var el = document.querySelector('input[name=' + q + ']:checked'); return el ? el.value : ''; }});
      if (a.indexOf('') !== -1) return '<h2>Which structure suits you?</h2><p class="calc-note">Answer the three questions to see a suggestion.</p>';
      var company = a.indexOf('y') !== -1;
      return '<h2>' + (company ? 'A limited company usually suits you' : 'A business name is usually enough') + '</h2>' +
        '<p class="calc-note">' + (company
          ? 'Shared ownership, protecting personal assets and bidding for larger contracts all point to a limited company. It is a separate legal entity, and its shares can be divided between owners.'
          : 'If you own the business alone and do not need shareholders or limited liability, a business name is the simpler and cheaper start. You can <a href="/blog/convert-business-name-to-limited-company-nigeria/">convert to a company later</a>.') + '</p>' +
        row(company ? 'Limited company' : 'Business name', 'From ' + naira(company ? OURS.ltd : OURS.bn), 'total') +
        '<p class="calc-note">This is general guidance, not advice on your situation. <a href="/blog/business-name-vs-limited-company-nigeria/">Compare the two in detail</a>, or ask us on a free call.</p>' +
        '<div class="calc-cta"><button type="button" class="btn btn-primary" id="use-suggestion">See the cost breakdown →</button><a class="btn btn-secondary" href="/book">Book a free call</a></div>';
    }}
    function render() {{
      var type = document.querySelector('input[name=type]:checked').value;
      $('capital-field').hidden = type !== 'ltd';
      $('quiz').hidden = type !== 'unsure';
      $('capital-custom').hidden = $('capital').value !== 'custom';
      $('result').innerHTML = {{ bn: bn, ltd: ltd, ngo: ngo, unsure: unsure }}[type]();
      var use = $('use-suggestion');
      if (use) use.addEventListener('click', function () {{
        var company = ['q1', 'q2', 'q3'].some(function (q) {{ var el = document.querySelector('input[name=' + q + ']:checked'); return el && el.value === 'y'; }});
        document.querySelector('input[name=type][value=' + (company ? 'ltd' : 'bn') + ']').checked = true;
        render(); $('result').scrollIntoView({{ behavior: 'smooth', block: 'start' }});
      }});
      if (window.agcTrack && render.done) window.agcTrack('calculator_used', {{ type: type }});
      render.done = true;
    }}
    $('calc').addEventListener('change', render);
    $('capital-custom').addEventListener('input', render);
    var want = new URLSearchParams(location.search).get('type');
    if (want && document.querySelector('input[name=type][value=' + want.replace(/[^a-z]/g, '') + ']')) document.querySelector('input[name=type][value=' + want.replace(/[^a-z]/g, '') + ']').checked = true;
    render();
  }})();
  </script>

'''
foot = shell[footer_start:]
foot = re.sub(r'  <section class="cta-section">.*?</section>\n\n', '', foot, count=1, flags=re.S)
foot = foot.replace('Hello%20I%20need%20help%20with%20governance%2C%20risk%20and%20compliance', 'Hello%2C%20I%20want%20to%20register%20my%20business')
open(os.path.join(ROOT, f'{SLUG}.html'), 'w').write(shell[:head_start] + meta + shell[head_end:header_end] + '\n\n' + main + '  ' + foot)
print('built', SLUG)
