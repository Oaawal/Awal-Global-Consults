"""Build /grc-portfolio and /trust from the /grc page shell (header, footer, scripts) and the shared data."""
import html, os, re, sys
from collections import OrderedDict
sys.path.insert(0, os.path.dirname(__file__))
from data import *
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
e = html.escape
shell = open(os.path.join(ROOT, 'grc.html')).read()
head_start = shell.index('<title>')
head_end = shell.index('</head>')
body_start = shell.index('<!-- WhatsApp Float -->')
header_end = shell.index('</header>') + len('</header>')
footer_start = shell.index('<!-- Footer -->')

def page(slug, title, desc, schema, main, wa_text):
    url = f'https://awalglobal.com.ng/{slug}'
    meta = f'''<title>{e(title)}</title>
  <meta name="description" content="{e(desc)}">
  <meta name="robots" content="index, follow">
  <link rel="canonical" href="{url}">

  <link rel="icon" type="image/png" href="assets/images/favicon-gold.png">
  <script type="application/ld+json">
{schema}
  </script>
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600;0,9..144,700;1,9..144,500&family=DM+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="style.css?v=20261113">

  <meta property="og:title" content="{e(title)}">
  <meta property="og:description" content="{e(desc)}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="{url}">
  <meta property="og:site_name" content="Awal Global Consults">
  <meta property="og:image" content="https://awalglobal.com.ng/assets/images/og-awal.jpg">
  <meta property="og:image:alt" content="Awal Global Consults: governance, risk and compliance, CAC registration and trademarks in Nigeria">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:locale" content="en_NG">

  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="{e(title)}">
  <meta name="twitter:description" content="{e(desc)}">
  <meta name="twitter:image" content="https://awalglobal.com.ng/assets/images/og-awal.jpg">

'''
    top = shell[:head_start] + meta + shell[head_end:header_end]
    foot = shell[footer_start:]
    foot = foot.replace('Hello%20I%20need%20help%20with%20governance%2C%20risk%20and%20compliance', wa_text)
    return top + '\n\n' + main + '\n\n  ' + foot

def pill(t, cls=None):
    return f'<span class="risk-pill risk-{(cls or t).lower()}">{e(t)}</span>'

def heat_html():
    rows = ''
    for l in range(5, 0, -1):
        rows += f'<tr><th scope="row">{l}<span>{LIKELIHOOD[l-1][1]}</span></th>'
        for i in range(1, 6):
            s = l * i
            rows += f'<td class="risk-{band(s).lower()}">{s}</td>'
        rows += '</tr>'
    rows += '<tr><th></th>' + ''.join(f'<th scope="col">{i}<span>{IMPACT[i-1][1]}</span></th>' for i in range(1, 6)) + '</tr>'
    return f'<table class="heatmap" aria-label="5 by 5 risk matrix: likelihood rows, impact columns, cell shows the score"><tbody>{rows}</tbody></table>'

# ---------------- /grc-portfolio ----------------
funcs = OrderedDict()
for r in GAP:
    funcs.setdefault(r[0], []).append(r)
avg = lambda rs, i: sum(r[i] for r in rs) / len(rs)
profile_rows = ''.join(
    f'<tr><th scope="row">{f}</th><td>{avg(rs,3):.1f}</td><td>{avg(rs,4):.1f}</td>'
    f'<td class="profile-cell"><div class="maturity-bar" role="img" aria-label="Current {avg(rs,3):.1f}, target {avg(rs,4):.1f} out of 5"><i style="width:{avg(rs,3)/5*100:.0f}%"></i><s style="left:{avg(rs,4)/5*100:.0f}%"></s></div></td></tr>'
    for f, rs in funcs.items())

top_risks = sorted(RISKS, key=lambda r: -(r[4]*r[5]))[:6]
CSF_FOR = {'R01': 'PR.AA, PR.AT', 'R02': 'GV.SC, PR.AT', 'R03': 'PR.AA, PR.AT', 'R04': 'PR.DS, ID.AM', 'R05': 'RS.MA, RS.CO', 'R06': 'PR.DS, PR.PS',
           'R07': 'RC.RP, PR.DS', 'R08': 'PR.AA', 'R09': 'PR.PS', 'R10': 'GV.SC', 'R11': 'PR.IR', 'R12': 'PR.AA, PR.AT', 'R13': 'PR.PS', 'R14': 'GV.RR, PR.AA', 'R15': 'GV.OC'}
risk_rows = ''.join(
    f'<tr><td>{r[0]}</td><td><strong>{e(r[2])}</strong><span class="table-sub">{e(r[1])}</span></td><td>{r[4]} × {r[5]} = {pill(str(r[4]*r[5]), band(r[4]*r[5]))}</td>'
    f'<td>{e(r[7])}</td><td>{r[8]}</td><td>{CSF_FOR[r[0]]}</td><td>{pill(str(r[9]*r[10]), band(r[9]*r[10]))}</td></tr>' for r in top_risks)

samples = [
    ('sample-gap-assessment-nist-csf-2.pdf', 'PDF · 8 pages', 'Gap assessment report',
     'NIST CSF 2.0 current and target profiles across all 22 categories, findings with evidence, NDPA observations, prioritised gaps and a 90-day roadmap with sign-off.',
     ['Control assessment against a framework', 'Maturity scoring and target profiles', 'Writing for a board audience']),
    ('sample-risk-assessment-register.pdf', 'PDF · 7 pages', 'Risk assessment and register',
     'Fifteen risks scored on a 5×5 matrix, inherent and residual heat maps, risk appetite, treatment plans mapped to ISO/IEC 27001:2022 Annex A, owners and dates.',
     ['ISO 31000 risk process', 'Likelihood × impact scoring', 'Control selection and residual risk']),
    ('sample-risk-register.xlsx', 'Excel workbook', 'Working risk register',
     'The register as a live tool: scores and ratings calculated by formula, validated inputs, a heat map that updates from the register, the gap assessment and the roadmap.',
     ['Risk register maintenance', 'Spreadsheet tooling for GRC', 'Traceability from gap to risk to action']),
    ('sample-information-security-policy.pdf', 'PDF · 4 pages', 'Information security policy',
     'A plain-language top-level policy for a small business, every section mapped to ISO/IEC 27001:2022 Annex A, with roles, staff acknowledgement and document control.',
     ['Policy writing', 'Annex A control mapping', 'Document control']),
    ('ndpa-2023-compliance-checklist.pdf', 'PDF · 4 pages', 'NDPA 2023 compliance checklist',
     'The Nigeria Data Protection Act 2023 turned into evidence-based checks, referenced to sections of the Act, covering governance, lawful basis, rights, security, breaches and transfers.',
     ['Regulatory requirement analysis', 'Evidence-based compliance checks', 'Nigerian data protection law']),
]
cards = ''.join(f'''
        <article class="service-card portfolio-card">
          <span class="grc-tag">{e(kind)}</span>
          <h3>{e(t)}</h3>
          <p>{e(d)}</p>
          <ul class="grc-list">{''.join(f'<li>{e(x)}</li>' for x in shows)}</ul>
          <a class="btn btn-primary btn-sm" href="/downloads/grc/{f}"{' download' if f.endswith('.xlsx') else ' target="_blank" rel="noopener"'}>{'Download' if f.endswith('.xlsx') else 'Open'} {e(t[0].lower()+t[1:] if not t.startswith('NDPA') else t)}</a>
        </article>''' for f, kind, t, d, shows in samples)

fw_rows = ''.join(f'<tr><th scope="row">{e(n)}</th><td>{e(u)}</td></tr>' for n, u in FRAMEWORKS)
mat_rows = ''.join(f'<tr><th scope="row">{n}</th><td>{e(a)}</td><td>{e(b)}</td></tr>' for n, a, b in MATURITY)
lk_rows = ''.join(f'<tr><th scope="row">{n}</th><td>{e(a)}</td><td>{e(b)}</td></tr>' for n, a, b in LIKELIHOOD)
im_rows = ''.join(f'<tr><th scope="row">{n}</th><td>{e(a)}</td><td>{e(b)}</td></tr>' for n, a, b in IMPACT)
band_rows = ''.join(f'<tr><th scope="row">{lo}–{hi}</th><td>{pill(nm)}</td><td>{e(ac)}</td></tr>' for lo, hi, nm, ac in BANDS)

portfolio_main = f'''  <section class="hero service-hero">
    <div class="container hero-grid">
      <div class="hero-text">
        <span class="eyebrow">Our GRC Method</span>
        <h1>How we assess governance, risk and compliance</h1>
        <p>
          The method, risk scoring and sample reports behind our gap assessments, risk registers and
          GRC Reviews, published so you can see exactly what you will get before you engage us.
        </p>
        <div class="hero-actions">
          <a class="btn btn-primary" href="#samples">See the work samples</a>
          <a class="btn btn-secondary" href="/grc#assessments">See the services</a>
        </div>
      </div>
      <div class="hero-card">
        <div class="hero-card-inner">
          <h3>At a glance:</h3>
          <ul>
            <li><strong>Frameworks:</strong> NIST CSF 2.0, ISO/IEC 27001:2022, ISO 31000, NDPA 2023</li>
            <li><strong>Artefacts:</strong> gap assessment, risk assessment, risk register, policy, NDPA checklist</li>
            <li><strong>Proof in practice:</strong> the same controls protect our own client portal</li>
          </ul>
          <p class="hero-note">Sample reports use a fictional company, Example Foods Ltd. We never publish client information.</p>
        </div>
      </div>
    </div>
  </section>

  <nav class="container page-toc" aria-label="On this page">
    <a href="#frameworks">Frameworks</a><a href="#method">Method</a><a href="#scoring">Risk scoring</a><a href="#samples">Sample reports</a><a href="#results">Sample results</a><a href="#live">Our own controls</a>
  </nav>

  <section class="section" id="frameworks">
    <div class="container">
      <div class="section-head">
        <span class="eyebrow">Frameworks</span>
        <h2>The standards behind the work</h2>
        <p>International frameworks give structure. Nigerian law decides what is actually required.</p>
      </div>
      <div class="table-wrap"><table class="data-table">
        <thead><tr><th scope="col">Framework</th><th scope="col">How it is used</th></tr></thead>
        <tbody>{fw_rows}</tbody>
      </table></div>
    </div>
  </section>

  <section class="section alt-bg" id="method">
    <div class="container">
      <div class="section-head">
        <span class="eyebrow">Method</span>
        <h2>Five steps, every engagement</h2>
      </div>
      <div class="process-grid process-grid-5">
        <div class="process-card"><span class="process-number">1</span><h3>Scope and context</h3><p>Agree what is in scope, the legal and contractual obligations, and the target profile with management.</p></div>
        <div class="process-card"><span class="process-number">2</span><h3>Current state</h3><p>Interviews, walkthroughs of real settings and processes, and document review. Scores reflect evidence seen, not intentions.</p></div>
        <div class="process-card"><span class="process-number">3</span><h3>Gap analysis</h3><p>Each NIST CSF 2.0 category scored 0–5 now and at target. Gaps prioritised by the risks they leave open.</p></div>
        <div class="process-card"><span class="process-number">4</span><h3>Risk assessment</h3><p>Risks scored likelihood × impact, evaluated against appetite, treated with mapped controls, owners and dates.</p></div>
        <div class="process-card"><span class="process-number">5</span><h3>Roadmap and review</h3><p>A 90-day plan management signs off, then quarterly review of the register and progress.</p></div>
      </div>
      <h3 class="subhead">Maturity scale used in gap assessments</h3>
      <div class="table-wrap"><table class="data-table">
        <thead><tr><th scope="col">Level</th><th scope="col">Name</th><th scope="col">Meaning</th></tr></thead>
        <tbody>{mat_rows}</tbody>
      </table></div>
    </div>
  </section>

  <section class="section" id="scoring">
    <div class="container">
      <div class="section-head">
        <span class="eyebrow">Risk scoring</span>
        <h2>A 5×5 matrix with defined scales</h2>
        <p>Defined scales make scores repeatable: two assessors looking at the same evidence should reach the same rating.</p>
      </div>
      <div class="two-col scoring-grid">
        <div>{heat_html()}<p class="table-note">Rows: likelihood. Columns: impact. Cell: score.</p></div>
        <div>
          <div class="table-wrap"><table class="data-table compact">
            <thead><tr><th scope="col">Score</th><th scope="col">Rating</th><th scope="col">Response</th></tr></thead>
            <tbody>{band_rows}</tbody>
          </table></div>
          <div class="content-card appetite"><p><strong>Example risk appetite:</strong> {e(APPETITE)}</p></div>
        </div>
      </div>
      <div class="two-col">
        <div class="table-wrap"><table class="data-table compact">
          <caption>Likelihood</caption>
          <thead><tr><th scope="col">#</th><th scope="col">Rating</th><th scope="col">Guide</th></tr></thead><tbody>{lk_rows}</tbody>
        </table></div>
        <div class="table-wrap"><table class="data-table compact">
          <caption>Impact</caption>
          <thead><tr><th scope="col">#</th><th scope="col">Rating</th><th scope="col">Guide</th></tr></thead><tbody>{im_rows}</tbody>
        </table></div>
      </div>
    </div>
  </section>

  <section class="section alt-bg" id="samples">
    <div class="container">
      <div class="section-head">
        <span class="eyebrow">Sample reports</span>
        <h2>What you receive</h2>
        <p>One fictional company, Example Foods Ltd, assessed end to end. Each document is complete and consistent with the others: the gaps drive the risks, the risks drive the controls, and the controls appear in the policy.</p>
      </div>
      <div class="service-grid service-grid-3 portfolio-grid">{cards}
        <article class="service-card portfolio-card portfolio-card-alt">
          <span class="grc-tag">Live</span>
          <h3>Our own security programme</h3>
          <p>The controls, retention rules and self-assessment for the client portal this firm runs, including the gaps still open.</p>
          <a class="btn btn-secondary btn-sm" href="/trust">View the Trust page</a>
        </article>
      </div>
    </div>
  </section>

  <section class="section" id="results">
    <div class="container">
      <div class="section-head">
        <span class="eyebrow">Sample results</span>
        <h2>From gaps to risks to actions</h2>
        <p>Extracts from the Example Foods Ltd assessment. The full detail is in the documents above.</p>
      </div>
      <div class="two-col results-grid">
        <div>
          <h3 class="subhead">NIST CSF 2.0 profile</h3>
          <div class="table-wrap"><table class="data-table compact">
            <thead><tr><th scope="col">Function</th><th scope="col">Now</th><th scope="col">Target</th><th scope="col">Profile (0–5)</th></tr></thead>
            <tbody>{profile_rows}</tbody>
          </table></div>
          <p class="table-note">Blue: current maturity. Gold line: target.</p>
        </div>
        <div class="content-card">
          <h3>Headline findings</h3>
          <ul>
            <li>No named owner, policies or risk method (Govern averages {avg(funcs["Govern"],3):.1f} of 5)</li>
            <li>Shared passwords and no two-step verification on business accounts</li>
            <li>No incident plan and no awareness of the 72-hour NDPC breach notification duty</li>
            <li>Supplier bank-detail changes paid without a call-back check</li>
          </ul>
        </div>
      </div>
      <h3 class="subhead">Top risks, treatments and control mapping</h3>
      <div class="table-wrap"><table class="data-table compact">
        <thead><tr><th scope="col">ID</th><th scope="col">Risk</th><th scope="col">Inherent</th><th scope="col">Treatment</th><th scope="col">ISO 27001 Annex A</th><th scope="col">NIST CSF 2.0</th><th scope="col">Residual</th></tr></thead>
        <tbody>{risk_rows}</tbody>
      </table></div>
    </div>
  </section>

  <section class="section alt-bg" id="live">
    <div class="container">
      <div class="content-card live-card">
        <div>
          <span class="eyebrow">We do this ourselves</span>
          <h2>A real programme, not just templates</h2>
          <p>Awal Global Consults holds clients' identity documents and personal data, so it runs its own security and privacy programme: one-time-code sign-in, an append-only audit log, retention and erasure rules, nightly backups and a breach plan. The Trust page sets out each control and an honest NIST CSF 2.0 self-assessment, gaps included.</p>
        </div>
        <div class="hero-actions">
          <a class="btn btn-primary" href="/trust">See the Trust page</a>
          <a class="btn btn-secondary" href="/grc">GRC services for businesses</a>
        </div>
      </div>
    </div>
  </section>

  <section class="cta-section">
    <div class="container">
      <div class="cta-box">
        <div class="cta-content">
          <span class="eyebrow">Get in touch</span>
          <h2>Want this done for your business?</h2>
          <p>Book a free 20-minute call. We will tell you which assessment fits and send a fixed, itemised quote.</p>
        </div>
        <div class="cta-actions">
          <a href="/book" class="btn btn-primary">Book a Free Call</a>
          <!--email_off--><a href="mailto:info@awalglobal.com.ng?subject=GRC%20assessment" class="btn btn-secondary">Email info@awalglobal.com.ng</a><!--/email_off-->
          <a href="https://wa.me/2347038336596?text=Hello%2C%20I%20need%20a%20GRC%20assessment" class="btn btn-secondary" target="_blank" rel="noopener">Chat on WhatsApp</a>
        </div>
      </div>
    </div>
  </section>

'''
# Remove the newsletter-band duplicate? It lives after <!-- Footer --> and is shared; keep it.
portfolio_schema = '''{
  "@context": "https://schema.org",
  "@type": "WebPage",
  "name": "Our GRC Method and Sample Reports",
  "url": "https://awalglobal.com.ng/grc-method",
  "dateModified": "2026-11-03",
  "publisher": { "@id": "https://awalglobal.com.ng/#organization" }
}'''
open(os.path.join(ROOT, 'grc-method.html'), 'w').write(page(
    'grc-method', 'Gap Assessment and Risk Register: Our Method and Sample Reports | Awal Global Consults',
    'How we run cybersecurity and data protection gap assessments and risk assessments for Nigerian businesses, with sample reports: NIST CSF 2.0, ISO 27001, ISO 31000 and NDPA 2023.',
    portfolio_schema, portfolio_main, 'Hello%2C%20I%20need%20a%20GRC%20assessment'))

# ---------------- /trust ----------------
CONTROLS = [
    ('Govern', [
        ('Written privacy policy and terms', 'Published on this site and kept in line with the Nigeria Data Protection Act 2023.'),
        ('Retention rules built into the system', 'Applications kept 6 years after closing (covering the 5-year AML minimum and CAMA/CITA record keeping); cancelled applications and enquiries 12 months. Every erasure is approved and logged.'),
        ('Named responsibility', 'The founder is accountable for security and data protection and reviews the daily system summary.'),
    ]),
    ('Identify', [
        ('Known data and locations', 'Application details and identity documents go to a private database and private document storage hosted on Cloudflare. We know what we hold and where.'),
        ('Data collected only for the service', 'Application forms ask only for what the relevant registration or filing needs.'),
    ]),
    ('Protect', [
        ('One-time-code sign-in', 'Staff sign in to the dashboard with a 6-digit code emailed to an authorised address. Codes expire in 10 minutes, allow 5 attempts and are limited to 5 an hour.'),
        ('Nothing usable stored', 'Sign-in codes and session tokens are stored only as SHA-256 hashes.'),
        ('Hardened sessions', 'Sessions use a Secure, HttpOnly, SameSite cookie with the __Host- prefix and end after 7 days.'),
        ('Private documents', 'Client documents are never public. Staff notifications link to the dashboard instead of attaching files to email.'),
        ('Encrypted connections and security headers', 'HTTPS everywhere with HSTS; anti-framing, MIME-sniffing and referrer headers; a strict Content Security Policy on the dashboard.'),
        ('Bot protection', 'Every form is protected by Cloudflare Turnstile, verified on the server.'),
        ('Consent you can prove', 'Newsletter sign-ups use double opt-in, and every email carries a one-click unsubscribe.'),
    ]),
    ('Detect', [
        ('Append-only audit log', 'Every sign-in, status change, export and erasure is recorded. The database refuses any edit or deletion of the log.'),
        ('Sign-in alerts', 'Every administrator is emailed when someone signs in from a new device or country, and when a wrong code is entered three times in 30 minutes.'),
        ('Daily summary', 'An automated daily check reports new activity, sign-ins, upcoming bookings and records due for review.'),
    ]),
    ('Respond', [
        ('Sign out all devices', 'One click ends every dashboard session for an account, for use if a device is lost or a sign-in looks wrong.'),
        ('Breach response', 'Suspected incidents are contained first (revoke sessions, rotate keys), then assessed. Where personal data is at risk we notify the NDPC within 72 hours and tell the people affected.'),
        ('Your rights handled on request', 'Requests to access, correct or erase your data are logged and answered; records the law requires us to keep are retained until their date.'),
    ]),
    ('Recover', [
        ('Nightly backups', 'The database is backed up every night to private storage and backups are kept for 30 days, so erased data leaves backups within that time.'),
        ('Backups checked every night', 'Each backup is read back and checked against what was written. Any problem is emailed to every administrator straight away.'),
    ]),
]
SELF = [
    ('Govern', 3, 'Policies, retention rules and accountability are written and enforced in the system.', 'No formal board-level risk register yet for the firm itself.'),
    ('Identify', 3, 'Data inventory and locations are known; collection is limited to need.', 'Supplier security reviews (hosting, email provider) are informal.'),
    ('Protect', 3, 'Strong sign-in, hashed secrets, private storage, security headers and bot protection.', 'Single administrator: key-person risk. No independent penetration test yet.'),
    ('Detect', 3, 'Append-only audit log; email alerts on new-device sign-ins and repeated wrong codes; daily sign-in summary.', 'Alerts are by email only; no round-the-clock monitoring service.'),
    ('Respond', 2, 'Breach steps and 72-hour NDPC duty understood and documented.', 'Response plan not yet tested with a tabletop exercise.'),
    ('Recover', 2, 'Nightly database backups kept 30 days, read back and checked every night.', 'Separate backup of client documents being switched on; full restore drill not yet carried out.'),
]
ctrl_html = ''.join(f'''
        <div class="feature-card">
          <span class="grc-tag">{f}</span>
          <ul class="control-list">{''.join(f'<li><strong>{e(t)}</strong><span>{e(d)}</span></li>' for t, d in items)}</ul>
        </div>''' for f, items in CONTROLS)
self_rows = ''.join(f'<tr><th scope="row">{f}</th><td><div class="maturity-bar" role="img" aria-label="{s} out of 5"><i style="width:{s/5*100:.0f}%"></i></div><span class="table-sub">{s} of 5, {MATURITY[s][1]}</span></td><td>{e(ok)}</td><td>{e(gap)}</td></tr>' for f, s, ok, gap in SELF)

trust_main = f'''  <section class="hero service-hero">
    <div class="container hero-grid">
      <div class="hero-text">
        <span class="eyebrow">Trust &amp; Security</span>
        <h1>How we protect your information</h1>
        <p>
          Clients send us passports, identity numbers and company records. This page sets out the controls that protect them,
          the rules we follow under the Nigeria Data Protection Act 2023, and an honest assessment of where we still have work to do.
        </p>
        <div class="hero-actions">
          <a class="btn btn-primary" href="#controls">See our controls</a>
          <a class="btn btn-secondary" href="/privacy-policy">Privacy policy</a>
        </div>
      </div>
      <div class="hero-card">
        <div class="hero-card-inner">
          <h3>In short:</h3>
          <ul>
            <li>Documents kept private, never sent as email attachments</li>
            <li>One-time-code sign-in and a tamper-proof audit log</li>
            <li>Clear retention periods, and erasure when they end</li>
            <li>Breaches reported to the NDPC within 72 hours where required</li>
          </ul>
        </div>
      </div>
    </div>
  </section>

  <section class="section" id="controls">
    <div class="container">
      <div class="section-head">
        <span class="eyebrow">Our controls</span>
        <h2>Organised by the NIST Cybersecurity Framework 2.0</h2>
        <p>Every control below is in place today and enforced by the system, not just written down.</p>
      </div>
      <div class="feature-grid feature-grid-3 trust-grid">{ctrl_html}
      </div>
    </div>
  </section>

  <section class="section alt-bg" id="self-assessment">
    <div class="container">
      <div class="section-head">
        <span class="eyebrow">Self-assessment</span>
        <h2>Where we stand, gaps included</h2>
        <p>We assess ourselves the way we assess clients: on the 0–5 maturity scale, against evidence. Reviewed November 2026.</p>
      </div>
      <div class="table-wrap"><table class="data-table">
        <thead><tr><th scope="col">Function</th><th scope="col">Maturity</th><th scope="col">In place</th><th scope="col">Open gap</th></tr></thead>
        <tbody>{self_rows}</tbody>
      </table></div>
      <div class="content-card" style="margin-top:22px;">
        <p style="margin:0;"><strong>Next steps:</strong> a second authorised administrator with recovery procedures, a separate nightly backup of client documents, a tabletop breach exercise, a full restore drill, and a written supplier review of our hosting and email providers.</p>
      </div>
    </div>
  </section>

  <section class="section" id="rights">
    <div class="container two-col">
      <div>
        <span class="eyebrow">Your rights</span>
        <h2>Ask what we hold, correct it, or have it erased</h2>
        <p>Under the NDPA you can ask for a copy of the personal data we hold about you, ask us to correct it, object to marketing, or ask us to erase it.
          Some records must be kept for a set period by law (for example AML and company records); we will tell you when they can be erased.
          See the <a href="/privacy-policy">privacy policy</a> for details.</p>
      </div>
      <div class="content-card">
        <h3>Report a security concern</h3>
        <p>If you think you have found a security weakness on this site, or received a suspicious message claiming to be from us, email
          <!--email_off--><a href="mailto:info@awalglobal.com.ng?subject=Security%20concern">info@awalglobal.com.ng</a><!--/email_off--> with "Security concern" in the subject.
          We never ask for passwords or verification codes, and we only take payment into the company account named in our booking emails.</p>
      </div>
    </div>
  </section>

  <section class="cta-section">
    <div class="container">
      <div class="cta-box">
        <div class="cta-content">
          <span class="eyebrow">Governance · Risk · Compliance</span>
          <h2>Want the same for your business?</h2>
          <p>We assess and build security and data protection programmes for small businesses, with sample reports you can read first.</p>
        </div>
        <div class="cta-actions">
          <a href="/grc#assessments" class="btn btn-primary">See the Assessment Services</a>
          <a href="/book" class="btn btn-secondary">Book a Free Call</a>
        </div>
      </div>
    </div>
  </section>

'''
trust_schema = '''{
  "@context": "https://schema.org",
  "@type": "WebPage",
  "name": "Trust & Security",
  "url": "https://awalglobal.com.ng/trust",
  "dateModified": "2026-11-03",
  "publisher": { "@id": "https://awalglobal.com.ng/#organization" }
}'''
open(os.path.join(ROOT, 'trust.html'), 'w').write(page(
    'trust', 'Trust & Security: How We Protect Your Information | Awal Global Consults',
    'How Awal Global Consults protects client documents and personal data: one-time-code sign-in, private storage, audit log, retention, backups and NDPA breach response, with an honest self-assessment.',
    trust_schema, trust_main, 'Hello%2C%20I%20have%20a%20question%20about%20data%20protection'))
print('pages built')
