"""Build /digital-setup from the /grc page shell. Run: python3 ops/digital-setup/build.py"""
import html, os, re
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
e = html.escape
shell = open(os.path.join(ROOT, 'grc.html')).read()
head_start = shell.index('<title>'); head_end = shell.index('</head>')
header_end = shell.index('</header>') + len('</header>'); footer_start = shell.index('<!-- Footer -->')

SLUG = 'digital-setup'
TITLE = 'Website, Business Email and Google Profile Setup in Nigeria | Awal Global Consults'
DESC = ('Digital setup for Nigerian businesses: a simple business website, your own domain and business email, '
        'Google Business Profile, WhatsApp Business and social pages, set up securely and handed over in your name.')

SERVICES = [
    ('Website', 'Business website', 'A simple, fast website that works well on phones and tells customers what you do, where you are and how to reach you.',
     ['Up to 5 pages, mobile-friendly', 'Contact form with spam protection and a WhatsApp button', 'Search-friendly titles, Google Maps and Search Console set up']),
    ('Email', 'Domain and business email', 'Your own address ending in @yourbusiness.com.ng, instead of a free Gmail or Yahoo address.',
     ['.com.ng, .ng or .com domain registered in your business name', 'Business email set up on your phone and laptop', 'Email security records (SPF, DKIM, DMARC) so your emails reach the inbox']),
    ('Google', 'Google Business Profile', 'Show up on Google Search and Maps when people look for your service in your area.',
     ['Profile created or claimed, and verified', 'Categories, services, hours and photos', 'Your own review link to share with customers']),
    ('WhatsApp', 'WhatsApp Business', 'A proper business account customers trust, protected against takeover.',
     ['Business profile, catalogue and quick replies', 'Greeting and away messages', 'Two-step verification PIN and linked-device check']),
    ('Social', 'Social media pages', 'Instagram and Facebook business pages set up correctly from the start.',
     ['Business pages linked to the right accounts', 'At least two admins, so you are never locked out', 'Two-step verification on every account']),
    ('Forms', 'Online forms and payment links', 'Let customers book, enquire or pay without endless back-and-forth on chat.',
     ['Enquiry and booking forms that reach your email', 'Payment links through a licensed payment provider', 'A privacy notice where you collect personal data']),
]
STEPS = [('Free 20-minute call', 'Tell us what you have already and what you need. We point out what matters most.'),
         ('Fixed quote', 'An itemised quote covering our fee and any domain or hosting costs, before any work starts.'),
         ('Setup', 'We build and configure everything, with accounts registered in your name.'),
         ('Handover', 'You get every login, a one-page handover sheet and a short walkthrough.')]
WHY = [('Everything in your name', 'Domains, email, Google and social accounts are registered to your business, not to us. You can leave at any time and keep everything.'),
       ('Security from day one', 'Two-step verification, a password manager handover and recovery details you control, so a hijacked account does not take your business offline.'),
       ('Compliance built in', 'Your registered business name and number shown correctly, a privacy notice where you collect personal data, and cookie consent where needed under the NDPA 2023.'),
       ('We use what we build', 'This website, with its secure client portal, booking system and email alerts, was built and is run by our team.')]
FAQ = [('Do I own my website and accounts?', 'Yes. Your domain, email, Google profile and social pages are registered in your business name, and you receive every login at handover.'),
       ('How long does it take?', 'A business email and Google Business Profile usually take a few days. A small website usually takes 1 to 2 weeks once we have your content. Google verification time depends on Google.'),
       ('Do I need to be registered with CAC first?', 'No, but it helps. A registered name makes it easier to get a .com.ng domain and to verify your Google profile. We can handle your CAC registration too.'),
       ('Can you update my website later?', 'Yes. Updates and ongoing support are available on request, quoted separately.')]

PRICES = {'Business website': 'From ₦200,000 (plus hosting and domain)', 'Domain and business email': 'From ₦40,000 (plus yearly domain and email costs)', 'Google Business Profile': 'From ₦25,000', 'WhatsApp Business': 'From ₦15,000', 'Social media pages': 'From ₦20,000', 'Online forms and payment links': 'Quoted after a short call'}
cards = ''.join(f'''
        <div class="service-card portfolio-card">
          <span class="grc-tag">{e(tag)}</span>
          <h3>{e(t)}</h3>
          <p class="price-from">{e(PRICES[t])}</p>
          <p>{e(d)}</p>
          <ul class="grc-list">{''.join(f'<li>{e(i)}</li>' for i in items)}</ul>
        </div>''' for tag, t, d, items in SERVICES)
steps = ''.join(f'''
        <div class="process-card"><span class="process-number">{n}</span><h3>{e(t)}</h3><p>{e(d)}</p></div>''' for n, (t, d) in enumerate(STEPS, 1))
why = ''.join(f'''
        <div class="feature-card"><h3>{e(t)}</h3><p>{e(d)}</p></div>''' for t, d in WHY)
faq = ''.join(f'''
        <details class="faq-item"><summary>{e(q)}</summary><p>{e(a)}</p></details>''' for q, a in FAQ)
faq_ld = ',\n'.join(f'''    {{"@type": "Question", "name": {json_q}, "acceptedAnswer": {{"@type": "Answer", "text": {json_a}}}}}'''
                    for json_q, json_a in [(__import__('json').dumps(q), __import__('json').dumps(a)) for q, a in FAQ])
WA = 'Hello%2C%20I%20need%20help%20setting%20up%20my%20business%20online'

main = f'''  <section class="hero service-hero">
    <div class="container hero-grid">
      <div class="hero-text">
        <span class="eyebrow">Digital Setup</span>
        <h1>Get your business properly online</h1>
        <p>A website, your own business email, a Google Business Profile and a secure WhatsApp Business account, set up for you and handed over in your name.</p>
        <div class="hero-actions">
          <a class="btn btn-primary" href="#start">Request a Quote</a>
          <a class="btn btn-secondary" href="/book">Book a Free 20-Minute Call</a>
        </div>
      </div>
      <div class="hero-card">
        <div class="hero-card-inner">
          <h3>You get:</h3>
          <ul>
            <li>Accounts registered to your business, not to us</li>
            <li>Two-step verification on everything</li>
            <li>A handover sheet with every login</li>
          </ul>
        </div>
      </div>
    </div>
  </section>

  <section class="section" id="services">
    <div class="container">
      <div class="section-head">
        <span class="eyebrow">What We Set Up</span>
        <h2>Pick what you need, or all of it</h2>
        <p>Each item can be done on its own, or get everything as a full digital setup from ₦300,000. Fixed, itemised quote before any work starts.</p>
      </div>
      <div class="service-grid service-grid-3 portfolio-grid">{cards}
      </div>
      <p class="price-note-line">Starting prices for a small business. Your exact fee is confirmed in an itemised quote before any work starts; domain, hosting and email subscription costs are extra.</p>
    </div>
  </section>

  <section class="section alt-bg" id="why">
    <div class="container">
      <div class="section-head">
        <span class="eyebrow">Why Us</span>
        <h2>Set up properly, owned by you</h2>
      </div>
      <div class="feature-grid">{why}
      </div>
    </div>
  </section>

  <section class="section" id="process">
    <div class="container">
      <div class="section-head">
        <span class="eyebrow">How It Works</span>
        <h2>From first call to handover</h2>
      </div>
      <div class="process-grid">{steps}
      </div>
    </div>
  </section>

  <section class="section alt-bg" id="faq">
    <div class="container">
      <div class="section-head">
        <span class="eyebrow">Common Questions</span>
        <h2>Frequently asked questions</h2>
      </div>
      <div class="faq-list">{faq}
      </div>
      <p class="table-note" style="margin-top:16px;">Related: <a href="/cybersecurity-support">protecting your business accounts</a> · <a href="/blog/secure-business-email-social-media-accounts/">securing business email and social media</a></p>
    </div>
  </section>

  <section class="section" id="start">
    <div class="container">
      <div class="section-head">
        <span class="eyebrow">Get Started</span>
        <h2>Request a quote</h2>
        <p>Tell us what you need and we will send a fixed, itemised quote.</p>
      </div>
      <div class="form-card">
        <form id="agc-contact-form" method="POST" class="form-grid">
          <input type="hidden" name="Service" value="Digital Setup">
          <div class="form-group">
            <label for="full-name">Full Name</label>
            <input type="text" id="full-name" name="Full Name" required>
          </div>
          <div class="form-group">
            <label for="phone-number">Phone / WhatsApp Number</label>
            <input type="tel" id="phone-number" name="Phone Number" required>
          </div>
          <div class="form-group">
            <label for="email-address">Email Address</label>
            <input type="email" id="email-address" name="Email Address">
          </div>
          <div class="form-group">
            <label for="support-type">What do you need?</label>
            <select id="support-type" name="Support Type">
              <option value="">Select one</option>
              <option>Full digital setup (website, email, Google, WhatsApp)</option>
              <option>Business website</option>
              <option>Domain and business email</option>
              <option>Google Business Profile</option>
              <option>WhatsApp Business setup</option>
              <option>Social media pages</option>
              <option>Online forms or payment links</option>
              <option>Not sure yet</option>
            </select>
          </div>
          <div class="form-group full-width">
            <label for="details">Brief Details</label>
            <textarea id="details" name="Details" rows="4" placeholder="What your business does, and what you already have online (if anything)"></textarea>
          </div>
          <div class="form-actions full-width">
            <button type="submit" class="btn btn-primary">Submit Request</button>
            <a class="btn btn-secondary" href="https://wa.me/2347038336596?text={WA}" target="_blank" rel="noopener">Chat on WhatsApp</a>
          </div>
        </form>
      </div>
    </div>
  </section>

'''
schema = f'''{{
  "@context": "https://schema.org",
  "@type": "Service",
  "name": "Digital Setup",
  "serviceType": "Website, business email and online presence setup",
  "description": {__import__('json').dumps(DESC)},
  "url": "https://awalglobal.com.ng/{SLUG}",
  "provider": {{ "@id": "https://awalglobal.com.ng/#organization" }},
  "areaServed": {{ "@type": "Country", "name": "Nigeria" }}
}}
  </script>
  <script type="application/ld+json">
{{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
{faq_ld}
  ]
}}'''
url = f'https://awalglobal.com.ng/{SLUG}'
meta = f'''<title>{e(TITLE)}</title>
  <meta name="description" content="{e(DESC)}">
  <meta name="robots" content="index, follow">
  <link rel="canonical" href="{url}">

  <link rel="icon" type="image/png" href="assets/images/favicon-gold.png">
  <script type="application/ld+json">
{schema}
  </script>
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600;0,9..144,700;1,9..144,500&family=DM+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="style.css?v=20261113b">

  <meta property="og:title" content="{e(TITLE)}">
  <meta property="og:description" content="{e(DESC)}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="{url}">
  <meta property="og:site_name" content="Awal Global Consults">
  <meta property="og:image" content="https://awalglobal.com.ng/assets/images/og-awal.jpg">
  <meta property="og:image:alt" content="Awal Global Consults: governance, risk and compliance, CAC registration and trademarks in Nigeria">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:locale" content="en_NG">

  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="{e(TITLE)}">
  <meta name="twitter:description" content="{e(DESC)}">
  <meta name="twitter:image" content="https://awalglobal.com.ng/assets/images/og-awal.jpg">

'''
foot = shell[footer_start:]
foot = re.sub(r'  <section class="cta-section">.*?</section>\n\n', '', foot, count=1, flags=re.S)
foot = foot.replace('Hello%20I%20need%20help%20with%20governance%2C%20risk%20and%20compliance', WA)
out = shell[:head_start] + meta + shell[head_end:header_end] + '\n\n' + main + '  ' + foot
# the /grc shell carries a GRC-specific CTA block before the footer; drop it if still present
open(os.path.join(ROOT, f'{SLUG}.html'), 'w').write(out)
print('built', SLUG)
