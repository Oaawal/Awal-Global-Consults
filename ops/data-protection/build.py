"""Build /data-protection from the /grc page shell. Run: python3 ops/data-protection/build.py
Facts come from the NDPC Guidance Notice on Registration of Data Controllers and Processors of Major
Importance (NDPC/HQ/GN/VOL.03/B/24, 19 Dec 2024) and the NDPC DPCO Registration & Requirements page."""
import html, json, os, re
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
e = html.escape
shell = open(os.path.join(ROOT, 'grc.html')).read()
head_start = shell.index('<title>'); head_end = shell.index('</head>')
header_end = shell.index('</header>') + len('</header>'); footer_start = shell.index('<!-- Footer -->')

SLUG = 'data-protection'
TITLE = 'NDPC Registration and Data Protection Compliance in Nigeria | Awal Global Consults'
DESC = ('We register businesses with the Nigeria Data Protection Commission as data controllers or processors of '
        'major importance, prepare annual compliance audit returns, and support firms applying for a DPCO licence.')
WA = 'Hello%2C%20I%20need%20help%20with%20NDPC%20registration'

CRITERIA = [
    'You process the personal data of more than 200 people (customers, staff, students, patients, users) in any six months.',
    'You provide commercial ICT services on devices that belong to other people, such as phone or computer repair.',
    'You operate in any of these sectors: aviation, communication, education, electric power, export and import, financial, health, hospitality, insurance, oil and gas, tourism, e-commerce or public service.',
]
NOT_REQUIRED = [
    'Traders and artisans who do not pass personal data on to other businesses as part of their trade.',
    'Traders with fewer than 15 employees, and artisans, who keep no customer filing system beyond routine contacts, receipts and addresses.',
    'Exempt by the NDPC: community-based associations, faith-based organisations, embassies and high commissions, courts and tribunals, and multigovernmental organisations.',
]
TIERS = [
    ('Ultra-High Level (UHL)', '₦250,000', 'Commercial banks, telecoms, insurers, multinationals, electricity distribution, oil and gas, payment gateways and fintechs, public social media and email apps, device manufacturers, and any organisation processing data of more than 5,000 people in six months.'),
    ('Extra-High Level (EHL)', '₦100,000', 'Government ministries, departments and agencies, microfinance and mortgage banks, higher institutions, secondary and tertiary hospitals, and any organisation processing data of 1,000 to 5,000 people in six months.'),
    ('Ordinary-High Level (OHL)', '₦10,000', 'Primary and secondary schools, corporate training providers, primary health centres, independent medical laboratories, hotels and guest houses with fewer than 50 rooms, and any organisation processing data of 200 to 1,000 people in six months.'),
]
SERVICES = [
    ('Registration', 'NDPC registration (Data Controller / Data Processor)',
     'We confirm whether you must register and your category, then complete your registration on the NDPC portal and guide you through payment of the official fee.',
     ['Assessment of your category (UHL, EHL or OHL)', 'Data processing details, Data Protection Officer, representatives and security measures completed on the portal', 'Late penalty waiver request for new companies, and follow-up until confirmed']),
    ('Renewal', 'Annual renewal and processor fees',
     'Registration is renewed every year. We track your renewal date and, for UHL organisations, the fee payable for each data processor you engage.',
     ['Renewal reminders and filing', 'List of your data processors and fees due', 'Updates when your category changes']),
    ('Audit returns', 'Compliance audit return preparation',
     'UHL and EHL organisations file a compliance audit return every year by 31 March. We gather the evidence and prepare the return with you. Every filing must carry a verification statement from a licensed DPCO, so we file through a licensed DPCO.',
     ['Data inventory and records of processing', 'Evidence pack: policies, notices, training, breach log', 'Return prepared and filed through a licensed DPCO']),
    ('Compliance', 'Privacy notice, policies and DPO set-up',
     'The documents and roles the NDPA expects: a privacy notice, internal data protection policy, processor contracts, breach response plan, and support appointing and training your Data Protection Officer.',
     ['Privacy notice for your website and forms', 'Data processing terms for your suppliers', 'DPO appointment guidance and training']),
    ('DPCO licence', 'DPCO licence application support',
     'For consultancies, law firms, audit firms and IT companies that want to be licensed by the NDPC as a Data Protection Compliance Organisation. We prepare and organise the application.',
     ['Eligibility check against the NDPC requirements', 'CAC, tax clearance, staff qualifications and director ID organised', '.ng website and portal submission']),
]
DPCO_REQS = ['CAC registration', 'Evidence of tax clearance', 'Relevant professional or academic qualification of at least two listed staff (they need not be directors)',
             'Valid identification of one director', 'A website on a .ng domain', 'Payment of the NDPC licensing fee']
FAQ = [
    ('Does my small business have to register with the NDPC?', 'Only if you are a data controller or processor of major importance: more than 200 people’s data in six months, ICT services on other people’s devices, or one of the listed sectors. Small traders and artisans without a customer filing system are not of major importance. Either way, the rest of the NDPA still applies to you.'),
    ('Is there a penalty for registering late?', 'Yes. The NDPC registration period has closed, and registrations now attract a 50% late penalty on top of the fee. Companies incorporated no more than six months before applying can ask the NDPC to waive the late penalty, by letter with their Certificate of Incorporation. We handle that request as part of your registration.'),
    ('How much does NDPC registration cost?', 'The NDPC fee is ₦250,000 for Ultra-High Level, ₦100,000 for Extra-High Level and ₦10,000 for Ordinary-High Level organisations, renewed yearly, plus a 50% late penalty now that the registration period has closed (new companies can apply for a waiver). Ultra-High Level controllers also pay ₦5,000 for each data processor they engage in a year. Our professional fee is separate and quoted before we start.'),
    ('Who files the annual compliance audit return?', 'Ultra-High and Extra-High Level organisations file every year by 31 March. Every filing must carry a verification statement from a licensed Data Protection Compliance Organisation (DPCO). We prepare the return and evidence with you and file it through a licensed DPCO.'),
    ('What happens if we do not register?', 'The NDPA allows the Commission to impose penalties of up to the higher of ₦10 million or 2% of annual gross revenue for data controllers and processors of major importance. Registering and filing on time is far cheaper.'),
    ('Can you help my firm become a DPCO?', 'Yes. We check your eligibility against the NDPC requirements, organise your documents and staff qualifications, and prepare the application on the portal. The NDPC fees are ₦50,000 to apply, ₦3,500,000 for the one-year licence once provisionally approved, and ₦1,500,000 a year to renew. Licensing decisions are made by the NDPC.'),
]

li = lambda xs: ''.join(f'<li>{e(x)}</li>' for x in xs)
tiers = ''.join(f'<tr><th scope="row">{e(n)}</th><td><strong>{e(f)}</strong> a year</td><td>{e(w)}</td></tr>' for n, f, w in TIERS)
cards = ''.join(f'''
        <div class="service-card portfolio-card">
          <span class="grc-tag">{e(tag)}</span>
          <h3>{e(t)}</h3>
          <p>{e(d)}</p>
          <ul class="grc-list">{li(items)}</ul>
        </div>''' for tag, t, d, items in SERVICES)
faq = ''.join(f'''
        <details class="faq-item"><summary>{e(q)}</summary><p>{e(a)}</p></details>''' for q, a in FAQ)
faq_ld = ',\n'.join('    {"@type": "Question", "name": %s, "acceptedAnswer": {"@type": "Answer", "text": %s}}' % (json.dumps(q), json.dumps(a)) for q, a in FAQ)

main = f'''  <section class="hero service-hero">
    <div class="container hero-grid">
      <div class="hero-text">
        <span class="eyebrow">Data Protection · NDPC</span>
        <h1>NDPC registration and data protection compliance</h1>
        <p>We find out whether your organisation must register with the Nigeria Data Protection Commission, register you in the right category, keep your renewals and annual audit returns on time, and help firms apply for a DPCO licence.</p>
        <div class="hero-actions">
          <a class="btn btn-primary" href="#start">Request a Quote</a>
          <a class="btn btn-secondary" href="/book?type=free-registration">Book a Free 20-Minute Call</a>
        </div>
      </div>
      <div class="hero-card">
        <div class="hero-card-inner">
          <h3>Two NDPC registrations:</h3>
          <ul>
            <li><strong>DC/DP registration:</strong> for organisations that process personal data as data controllers or processors of major importance</li>
            <li><strong>DPCO registration:</strong> for firms licensed to train, audit and advise others on compliance</li>
          </ul>
        </div>
      </div>
    </div>
  </section>

  <section class="section" id="who">
    <div class="container">
      <div class="section-head">
        <span class="eyebrow">Do You Need to Register?</span>
        <h2>Who the NDPC treats as &ldquo;of major importance&rdquo;</h2>
        <p>Under the NDPC&rsquo;s registration guidance, you must register if you keep or have access to a filing system of personal data (paper or digital) and any of these applies:</p>
      </div>
      <div class="two-col">
        <div class="content-card"><h3>You must register if</h3><ul>{li(CRITERIA)}</ul></div>
        <div class="content-card"><h3>You do not need to register if</h3><ul>{li(NOT_REQUIRED)}</ul>
          <p class="table-note">Not registering does not take you outside the NDPA: you still need a lawful basis, a privacy notice and proper security for any personal data you hold.</p></div>
      </div>
      <div class="content-card" style="margin-top:22px;border-left:4px solid #C9A646;"><p style="margin:0;"><strong>The NDPC registration period has closed.</strong> Organisations registering now pay a 50% late penalty on top of the registration fee, and every day without registration adds to your regulatory risk. Register now rather than wait for the next cycle.</p></div>
      <div class="content-card" style="margin-top:22px;"><p style="margin:0;"><strong>Newly incorporated company?</strong> The NDPC waives late registration penalties for companies incorporated no more than six months before they apply. The waiver is requested by letter with the Certificate of Incorporation; we prepare and send it with your registration.</p></div>
    </div>
  </section>

  <section class="section alt-bg" id="categories">
    <div class="container">
      <div class="section-head">
        <span class="eyebrow">Categories and Official Fees</span>
        <h2>Your category decides your NDPC fee and duties</h2>
        <p>Fees are paid to the NDPC, not to us, and are renewed every year. Ultra-High Level controllers also pay ₦5,000 a year for each data processor they engage.</p>
      </div>
      <div class="table-wrap"><table class="data-table">
        <thead><tr><th scope="col">Category</th><th scope="col">NDPC fee</th><th scope="col">Who falls in it</th></tr></thead>
        <tbody>{tiers}</tbody>
      </table></div>
      <p class="table-note">Source: NDPC Guidance Notice on Registration of Data Controllers and Data Processors of Major Importance (NDPC/HQ/GN/VOL.03/B/24, 19 December 2024). Ultra-High and Extra-High Level organisations also file an annual compliance audit return by 31 March under the GAID 2025.</p>
    </div>
  </section>

  <section class="section" id="services">
    <div class="container">
      <div class="section-head">
        <span class="eyebrow">What We Do</span>
        <h2>From registration to annual compliance</h2>
        <p>Fixed, itemised quote before any work starts. NDPC fees are shown separately.</p>
      </div>
      <div class="service-grid service-grid-3 portfolio-grid">{cards}
      </div>
    </div>
  </section>

  <section class="section alt-bg" id="dpco">
    <div class="container two-col">
      <div>
        <span class="eyebrow">DPCO Licence</span>
        <h2>What the NDPC asks of a DPCO applicant</h2>
        <p>A Data Protection Compliance Organisation is an entity licensed by the NDPC under section 33 of the NDPA to train, audit, consult and render services that ensure compliance. Professional service consultancies, IT service providers, audit firms and law firms can apply, with staff qualified in areas such as data protection and privacy, information security, cybersecurity, data governance or GDPR compliance.</p>
      </div>
      <div class="content-card">
        <h3>Documents for licensing</h3>
        <ul>{li(DPCO_REQS)}</ul>
        <p class="table-note">Source: NDPC, DPCO Registration &amp; Requirements.</p>
      </div>
    </div>
    <div class="container" style="margin-top:28px;">
      <h3 class="subhead">NDPC fees for a DPCO licence</h3>
      <div class="table-wrap"><table class="data-table">
        <thead><tr><th scope="col">Fee</th><th scope="col">Duration</th><th scope="col">New application</th><th scope="col">Renewal</th></tr></thead>
        <tbody>
          <tr><th scope="row">Administrative fee</th><td>One-off</td><td>₦50,000</td><td>N/A</td></tr>
          <tr><th scope="row">Licence fee</th><td>1 year</td><td>₦3,500,000</td><td>N/A</td></tr>
          <tr><th scope="row">Licence renewal fee</th><td>1 year</td><td>N/A</td><td>₦1,500,000</td></tr>
          <tr><th scope="row">Total</th><td></td><td><strong>₦3,550,000</strong></td><td><strong>₦1,500,000</strong></td></tr>
        </tbody>
      </table></div>
      <ul class="table-note" style="margin-top:10px;">
        <li>The ₦3,500,000 licence fee is paid only after the Commission gives provisional approval.</li>
        <li>All NDPC fees are non-refundable, whatever the outcome of the application.</li>
        <li>An application not completed and paid for within 14 days of starting is deleted from the portal, and fees must be paid again.</li>
        <li>Fees are paid through Remita on the NDPC portal. Licensed DPCOs are published on the Commission&rsquo;s website.</li>
      </ul>
      <p class="table-note">Source: NDPC services portal, DPCO registration notice (November 2026). These are NDPC fees; our professional fee is quoted separately.</p>
    </div>
  </section>

  <section class="section" id="faq">
    <div class="container">
      <div class="section-head">
        <span class="eyebrow">Common Questions</span>
        <h2>Frequently asked questions</h2>
      </div>
      <div class="faq-list">{faq}
      </div>
      <p class="table-note" style="margin-top:16px;">Read more: <a href="/blog/ndpa-compliance-nigerian-business/">NDPA compliance and NDPC registration</a> · <a href="/blog/privacy-policy-small-business-nigeria/">privacy policies</a> · <a href="/blog/data-breach-response-nigeria-ndpa/">responding to a data breach</a></p>
    </div>
  </section>

  <section class="section alt-bg" id="start">
    <div class="container">
      <div class="section-head">
        <span class="eyebrow">Get Started</span>
        <h2>Request a quote</h2>
        <p>Tell us about your organisation and we will confirm whether you must register, your category, and our fixed fee.</p>
      </div>
      <div class="form-card">
        <form id="agc-contact-form" method="POST" class="form-grid">
          <input type="hidden" name="Service" value="Data Protection / NDPC">
          <div class="form-group"><label for="full-name">Full Name</label><input type="text" id="full-name" name="Full Name" required></div>
          <div class="form-group"><label for="phone-number">Phone / WhatsApp Number</label><input type="tel" id="phone-number" name="Phone Number" required></div>
          <div class="form-group"><label for="email-address">Email Address</label><input type="email" id="email-address" name="Email Address"></div>
          <div class="form-group"><label for="support-type">What do you need?</label>
            <select id="support-type" name="Support Type">
              <option value="">Select one</option>
              <option>NDPC registration (Data Controller / Processor)</option>
              <option>Annual renewal</option>
              <option>Compliance audit return</option>
              <option>Privacy notice, policies or DPO set-up</option>
              <option>DPCO licence application</option>
              <option>Not sure if we need to register</option>
            </select></div>
          <div class="form-group"><label for="sector">Sector</label><input type="text" id="sector" name="Sector" placeholder="e.g. school, clinic, fintech, e-commerce"></div>
          <div class="form-group"><label for="subjects">People whose data you hold (roughly)</label>
            <select id="subjects" name="Data Subjects (6 months)"><option value="">Select</option><option>Fewer than 200</option><option>200 to 1,000</option><option>1,000 to 5,000</option><option>More than 5,000</option><option>Not sure</option></select></div>
          <div class="form-group full-width"><label for="details">Brief Details</label><textarea id="details" name="Details" rows="4" placeholder="What your organisation does and what you need help with"></textarea></div>
          <div class="form-actions full-width">
            <button type="submit" class="btn btn-primary">Submit Request</button>
            <a class="btn btn-secondary" href="https://wa.me/2347038336596?text={WA}" target="_blank" rel="noopener">Chat on WhatsApp</a>
          </div>
        </form>
      </div>
    </div>
  </section>

'''
schema = '''{
  "@context": "https://schema.org",
  "@type": "Service",
  "name": "NDPC Registration and Data Protection Compliance",
  "serviceType": "Data protection compliance",
  "description": %s,
  "url": "https://awalglobal.com.ng/%s",
  "provider": { "@id": "https://awalglobal.com.ng/#organization" },
  "areaServed": { "@type": "Country", "name": "Nigeria" }
}
  </script>
  <script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
%s
  ]
}''' % (json.dumps(DESC), SLUG, faq_ld)
url = f'https://awalglobal.com.ng/{SLUG}'
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
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:locale" content="en_NG">

  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="{e(TITLE)}">
  <meta name="twitter:description" content="{e(DESC)}">
  <meta name="twitter:image" content="https://awalglobal.com.ng/assets/images/og-image.jpg">

'''
logos = '''  <!-- Agencies we file with -->
  <div class="credentials-bar" aria-label="Regulator we work with">
    <div class="container credentials-inner">
      <span class="credentials-label">Regulator we work with</span>
      <div class="credential-item">
        <img src="assets/images/credentials/ndpc.webp" width="34" height="34" alt="Nigeria Data Protection Commission logo" class="credential-logo" loading="lazy">
        <div class="credential-text">Nigeria Data Protection Commission<span>Registration, renewals and audit returns</span></div>
      </div>
    </div>
    <p class="container credentials-note">Logos identify the government agencies we file with or prepare you for. Awal Global Consults is an independent firm, not affiliated with or endorsed by these agencies.</p>
  </div>

'''
main = main.replace('  </section>\n\n  <section class="section" id="who">', '  </section>\n\n' + logos + '  <section class="section" id="who">', 1)
foot = shell[footer_start:].replace('Hello%20I%20need%20help%20with%20governance%2C%20risk%20and%20compliance', WA)
out = shell[:head_start] + meta + shell[head_end:header_end] + '\n\n' + main + '  ' + foot
open(os.path.join(ROOT, f'{SLUG}.html'), 'w').write(out)
print('built', SLUG)
