"""Build the GRC portfolio documents.

Writes print-ready HTML to ops/grc-portfolio/out/ (turned into PDFs by pdf.js)
and the risk register workbook to downloads/grc/.
"""
import html, os, sys
from collections import OrderedDict
sys.path.insert(0, os.path.dirname(__file__))
from data import *

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
OUT = os.path.join(HERE, 'out')
DL = os.path.join(ROOT, 'downloads', 'grc')
os.makedirs(OUT, exist_ok=True); os.makedirs(DL, exist_ok=True)
e = html.escape

CSS = """
@page { size: A4; margin: 20mm 18mm 20mm 18mm; }
* { box-sizing: border-box; }
body { font-family: 'DM Sans', Arial, sans-serif; color: #222; font-size: 10.2pt; line-height: 1.5; margin: 0; }
h1, h2, h3 { font-family: 'Fraunces', Georgia, serif; color: #0A2C48; line-height: 1.2; }
h1 { font-size: 26pt; margin: 0 0 6mm; }
h2 { font-size: 15pt; margin: 9mm 0 3mm; padding-bottom: 1.5mm; border-bottom: 1.5px solid #E2D3AE; break-after: avoid; }
h3 { font-size: 11.5pt; margin: 5mm 0 2mm; break-after: avoid; }
p { margin: 0 0 2.6mm; }
ul, ol { margin: 0 0 3mm; padding-left: 5.5mm; }
li { margin-bottom: 1mm; }
table { width: 100%; border-collapse: collapse; margin: 2mm 0 4mm; font-size: 8.6pt; }
th { background: #0F3A5F; color: #fff; text-align: left; padding: 1.8mm 2mm; font-weight: 600; }
td { border-bottom: 1px solid #E6DECD; padding: 1.6mm 2mm; vertical-align: top; }
tr { break-inside: avoid; }
tbody tr:nth-child(even) td { background: #FAF6EE; }
.cover { height: 250mm; display: flex; flex-direction: column; justify-content: space-between; break-after: page; }
.cover-top { border-top: 6px solid #0F3A5F; padding-top: 8mm; }
.brand { display: flex; align-items: center; gap: 4mm; font-weight: 700; color: #0F3A5F; font-size: 11pt; }
.brand img { width: 16mm; }
.kicker { text-transform: uppercase; letter-spacing: .12em; font-size: 8.5pt; color: #1B4F78; font-weight: 700; margin: 28mm 0 3mm; }
.sub { font-size: 12.5pt; color: #444; max-width: 150mm; }
.meta { width: auto; font-size: 9pt; margin-top: 10mm; }
.meta td { border: 0; padding: 1mm 6mm 1mm 0; background: none !important; }
.meta td:first-child { color: #666; }
.notice { border: 1.5px solid #C9A646; background: #FBF6E6; border-radius: 3mm; padding: 4mm 5mm; font-size: 9pt; }
.notice strong { color: #93701F; }
.callout { background: #F3ECDD; border-left: 4px solid #1B4F78; padding: 3mm 4mm; margin: 3mm 0 4mm; break-inside: avoid; }
.kpis { display: flex; gap: 3mm; margin: 3mm 0 5mm; }
.kpi { flex: 1; border: 1px solid #E6DECD; border-radius: 2.5mm; padding: 3mm; }
.kpi b { display: block; font-family: 'Fraunces', Georgia, serif; font-size: 18pt; color: #0F3A5F; }
.kpi span { font-size: 8pt; color: #555; }
.bar { height: 3.2mm; background: #EFE8DA; border-radius: 2mm; position: relative; overflow: hidden; }
.bar i { position: absolute; left: 0; top: 0; bottom: 0; background: #1B4F78; border-radius: 2mm; }
.bar s { position: absolute; top: -1mm; bottom: -1mm; width: 2px; background: #C9A646; }
.pill { display: inline-block; padding: .3mm 2mm; border-radius: 5mm; font-size: 7.6pt; font-weight: 700; white-space: nowrap; }
.Low { background: #DDF2E3; color: #1E6B3A; } .Medium { background: #FFF1C9; color: #7A5B00; }
.High { background: #FFD9B8; color: #8A3B00; } .Critical { background: #F8C9C9; color: #8A1212; }
.P1 { background: #F8C9C9; color: #8A1212; } .P2 { background: #FFF1C9; color: #7A5B00; } .P3 { background: #DDF2E3; color: #1E6B3A; }
.heat { width: auto; border-collapse: separate; border-spacing: 1.2mm; font-size: 8pt; }
.heat td, .heat th { width: 24mm; height: 12mm; text-align: center; vertical-align: middle; border: 0; border-radius: 1.5mm; padding: 1mm; }
.heat th { background: none; color: #0A2C48; font-size: 7.6pt; }
.heat td b { display: block; font-size: 7pt; opacity: .7; }
.cols { display: flex; gap: 6mm; break-inside: avoid; } .cols > div { flex: 1; }
.small { font-size: 8.4pt; color: #555; }
.sig td { height: 12mm; }
.check td:first-child { width: 7mm; font-size: 12pt; color: #1B4F78; }
.page-break { break-before: page; }
"""

LOGO = 'file://' + os.path.join(ROOT, 'assets', 'images', 'logo-mark.png')

def doc(title, body):
    return f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><title>{e(title)}</title>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=DM+Sans:wght@400;600;700&display=swap" rel="stylesheet">
<style>{CSS}</style></head><body>{body}</body></html>"""

def cover(kicker, title, sub, rows):
    meta = ''.join(f'<tr><td>{e(k)}</td><td><strong>{e(v)}</strong></td></tr>' for k, v in rows)
    return f"""<section class="cover"><div class="cover-top"><div class="brand"><img src="{LOGO}" alt="">Awal Global Consults Limited</div>
<p class="kicker">{e(kicker)}</p><h1>{e(title)}</h1><p class="sub">{e(sub)}</p><table class="meta">{meta}</table></div>
<div class="notice"><strong>Illustrative sample.</strong> {e(SAMPLE_CO['name'])} is a fictional company. This document shows the method,
structure and quality of a real engagement; it is not a client deliverable and contains no client information.
Prepared by {e(PREPARER)}.</div></section>"""

def pill(text, cls=None):
    return f'<span class="pill {cls or text}">{e(text)}</span>'

# ---------- 1. NIST CSF 2.0 gap assessment ----------
def gap_report():
    funcs = OrderedDict()
    for row in GAP:
        funcs.setdefault(row[0], []).append(row)
    avg = lambda rows, i: sum(r[i] for r in rows) / len(rows)
    cur_all, tgt_all = avg(GAP, 3), avg(GAP, 4)
    p1 = [r for r in GAP if r[7] == 'P1']
    gaps_2plus = [r for r in GAP if r[4] - r[3] >= 2]

    func_rows = ''.join(
        f'<tr><td><strong>{f}</strong></td><td>{len(rs)}</td><td>{avg(rs,3):.1f}</td><td>{avg(rs,4):.1f}</td>'
        f'<td style="width:62mm"><div class="bar"><i style="width:{avg(rs,3)/5*100:.0f}%"></i><s style="left:{avg(rs,4)/5*100:.0f}%"></s></div></td>'
        f'<td>{avg(rs,4)-avg(rs,3):.1f}</td></tr>' for f, rs in funcs.items())
    detail = ''
    for f, rs in funcs.items():
        detail += f'<h3>{f}</h3><table><thead><tr><th style="width:15mm">ID</th><th style="width:34mm">Category</th><th style="width:13mm">Now</th><th style="width:13mm">Target</th><th>Finding</th><th>Recommendation</th><th style="width:12mm">Priority</th></tr></thead><tbody>'
        detail += ''.join(f'<tr><td>{r[1]}</td><td>{e(r[2])}</td><td>{r[3]}</td><td>{r[4]}</td><td>{e(r[5])}</td><td>{e(r[6])}</td><td>{pill(r[7])}</td></tr>' for r in rs)
        detail += '</tbody></table>'
    mat = ''.join(f'<tr><td><strong>{n}</strong></td><td>{e(a)}</td><td>{e(b)}</td></tr>' for n, a, b in MATURITY)
    road = ''.join(f'<tr><td><strong>{e(w)}</strong></td><td>{e(t)}</td><td>{e(d)}</td></tr>' for w, t, d in ROADMAP)
    top = ''.join(f'<li><strong>{r[1]} {e(r[2])}:</strong> {e(r[5])}</li>' for r in p1[:6])

    body = cover('Gap assessment report', 'Cybersecurity and Data Protection Gap Assessment',
                 'Current-state maturity of Example Foods Ltd measured against the NIST Cybersecurity Framework 2.0, with NDPA 2023 obligations, target maturity and a prioritised 90-day roadmap.',
                 [('Client', SAMPLE_CO['label']), ('Framework', 'NIST CSF 2.0 (22 categories), NDPA 2023'), ('Assessor', PREPARER), ('Version', f'1.0, {VERSION_DATE}'), ('Classification', 'Confidential (sample)')])
    body += f"""
<h2>1. Executive summary</h2>
<p>Example Foods Ltd has grown quickly on WhatsApp, email and online payments, but its security and data protection practices have not kept pace.
Across the 22 NIST CSF 2.0 categories the business scores an average maturity of <strong>{cur_all:.1f} out of 5</strong> against an agreed
target of <strong>{tgt_all:.1f}</strong>. The weakest areas are governance (no policies or named owner) and incident response
(no plan and no awareness of the 72-hour breach notification duty under the NDPA).</p>
<div class="kpis"><div class="kpi"><b>{cur_all:.1f}</b><span>Average current maturity (0–5)</span></div>
<div class="kpi"><b>{tgt_all:.1f}</b><span>Average target maturity</span></div>
<div class="kpi"><b>{len(p1)}</b><span>Priority 1 gaps (act in 30 days)</span></div>
<div class="kpi"><b>{len(gaps_2plus)}</b><span>Categories two or more levels below target</span></div></div>
<h3>Most urgent gaps</h3><ul>{top}</ul>
<div class="callout"><strong>Headline recommendation:</strong> name a security and data protection lead, protect the WhatsApp, email and payment
processes this week, and approve a short policy set and breach response plan within 30 days. Most actions cost staff time rather than new software.</div>

<h2>2. Scope and approach</h2>
<p><strong>Organisation:</strong> {e(SAMPLE_CO['profile'])}</p>
<p><strong>Scope:</strong> {e(SAMPLE_CO['scope'])}</p>
<h3>Method</h3>
<ol><li><strong>Scope and context:</strong> kick-off with the Managing Director; agree scope, obligations and target profile.</li>
<li><strong>Evidence gathering:</strong> interviews with the MD, Finance, Sales and HR leads; walkthrough of account settings, payment approvals and device configuration; review of existing documents.</li>
<li><strong>Scoring:</strong> each NIST CSF 2.0 category scored 0–5 for current and target maturity, using the scale below. Scores reflect evidence seen, not intentions.</li>
<li><strong>Gap analysis:</strong> gap = target minus current; each gap given a priority by its link to the top risks in the risk register.</li>
<li><strong>Roadmap:</strong> recommendations grouped into a 90-day plan with owners, then validated with management.</li></ol>
<h3>Maturity scale</h3>
<table><thead><tr><th style="width:12mm">Level</th><th style="width:30mm">Name</th><th>Meaning</th></tr></thead><tbody>{mat}</tbody></table>
<p class="small">Priorities: {pill('P1')} act within 30 days, linked to a High or Critical risk; {pill('P2')} within 60 days; {pill('P3')} within 90 days.</p>

<h2 class="page-break">3. Results by function</h2>
<p>Blue bar: current maturity. Gold marker: target. Govern is new in CSF 2.0 and sits at the centre of the framework: it covers strategy, roles, policy and supplier risk.</p>
<table><thead><tr><th>Function</th><th>Categories</th><th>Current</th><th>Target</th><th>Profile (0–5)</th><th>Gap</th></tr></thead><tbody>{func_rows}</tbody></table>

<h2>4. Detailed findings</h2>{detail}

<h2 class="page-break">5. NDPA 2023 observations</h2>
<table><thead><tr><th style="width:52mm">Obligation</th><th>Observation</th><th style="width:16mm">Status</th></tr></thead><tbody>
<tr><td>Lawful basis and privacy notice</td><td>No privacy notice on the website or WhatsApp catalogue; marketing messages sent without recorded consent.</td><td>{pill('Gap','High')}</td></tr>
<tr><td>Security of processing</td><td>Shared passwords and unencrypted laptops do not meet the duty to apply appropriate technical and organisational measures.</td><td>{pill('Gap','High')}</td></tr>
<tr><td>Breach notification (72 hours to the NDPC)</td><td>Duty not known; no plan or templates.</td><td>{pill('Gap','Critical')}</td></tr>
<tr><td>Data subject rights</td><td>No process for access, correction or deletion requests.</td><td>{pill('Gap','Medium')}</td></tr>
<tr><td>Data processors</td><td>Cloud accounting and payment providers used without data processing terms.</td><td>{pill('Gap','Medium')}</td></tr>
<tr><td>Registration and annual compliance returns</td><td>Data-subject volumes not tracked, so registration status as a data controller of major importance is unknown.</td><td>{pill('Review','Medium')}</td></tr>
</tbody></table>

<h2>6. 90-day roadmap</h2>
<table><thead><tr><th style="width:20mm">When</th><th style="width:42mm">Theme</th><th>Actions</th></tr></thead><tbody>{road}</tbody></table>
<p>Success measures at day 90: no shared accounts; two-step verification on 100% of business accounts; policy acknowledgement from every staff member;
one tested backup restore; breach plan approved and walked through; average maturity raised to at least {cur_all+1:.1f}.</p>

<div style="break-inside:avoid"><h2>7. Management response and sign-off</h2>
<table class="sig"><thead><tr><th>Role</th><th>Name</th><th>Signature</th><th>Date</th></tr></thead><tbody>
<tr><td>Managing Director (risk owner)</td><td></td><td></td><td></td></tr><tr><td>Security and data protection lead</td><td></td><td></td><td></td></tr><tr><td>Assessor</td><td>Abdullateef Olamilekan Abdulwaheed</td><td></td><td></td></tr></tbody></table>
<p class="small">Limitations: this assessment relied on interviews, walkthroughs and documents provided at the time. It did not include technical testing
such as penetration testing or vulnerability scanning. Companion documents: risk assessment and register; information security policy.</p></div>
"""
    return doc('Sample Gap Assessment: NIST CSF 2.0', body)

# ---------- 2. Risk assessment ----------
def heatmap(use_residual=False):
    cells = {}
    for r in RISKS:
        l, i = (r[9], r[10]) if use_residual else (r[4], r[5])
        cells.setdefault((l, i), []).append(r[0])
    rows = ''
    for l in range(5, 0, -1):
        rows += f'<tr><th>{l} {LIKELIHOOD[l-1][1]}</th>'
        for i in range(1, 6):
            s = l * i
            rows += f'<td class="{band(s)}"><b>{s}</b>{" ".join(cells.get((l, i), []))}</td>'
        rows += '</tr>'
    rows += '<tr><th></th>' + ''.join(f'<th>{i} {IMPACT[i-1][1]}</th>' for i in range(1, 6)) + '</tr>'
    return f'<table class="heat"><tbody>{rows}</tbody></table><p class="small">Rows: likelihood. Columns: impact. Each cell shows the score (likelihood × impact) and the risks in it.</p>'

def risk_report():
    inh = sorted(RISKS, key=lambda r: -(r[4]*r[5]))
    counts = lambda idx: {b[2]: sum(1 for r in RISKS if band(r[idx[0]]*r[idx[1]]) == b[2]) for b in BANDS}
    ci, cr = counts((4, 5)), counts((9, 10))
    lk = ''.join(f'<tr><td>{n}</td><td>{e(a)}</td><td>{e(b)}</td></tr>' for n, a, b in LIKELIHOOD)
    im = ''.join(f'<tr><td>{n}</td><td>{e(a)}</td><td>{e(b)}</td></tr>' for n, a, b in IMPACT)
    bd = ''.join(f'<tr><td>{lo}–{hi}</td><td>{pill(nm)}</td><td>{e(ac)}</td></tr>' for lo, hi, nm, ac in BANDS)
    reg = ''.join(
        f'<tr><td>{r[0]}</td><td>{e(r[1])}</td><td>{e(r[2])}</td><td>{e(r[3])}</td><td>{r[4]}</td><td>{r[5]}</td>'
        f'<td>{pill(str(r[4]*r[5]), band(r[4]*r[5]))}</td><td>{e(r[7])}</td><td>{r[8]}</td><td>{pill(str(r[9]*r[10]), band(r[9]*r[10]))}</td><td>{e(r[11])}</td></tr>'
        for r in inh)
    summary = ''.join(f'<tr><td>{pill(b)}</td><td>{ci[b]}</td><td>{cr[b]}</td></tr>' for b in ci)
    body = cover('Risk assessment', 'Information Security Risk Assessment and Register',
                 'Fifteen risks to Example Foods Ltd identified, scored on a 5×5 likelihood and impact matrix, evaluated against the board’s risk appetite and treated with ISO/IEC 27001:2022 Annex A controls.',
                 [('Client', SAMPLE_CO['label']), ('Method', 'ISO 31000 process, 5×5 qualitative matrix'), ('Control set', 'ISO/IEC 27001:2022 Annex A'), ('Assessor', PREPARER), ('Version', f'1.0, {VERSION_DATE}')])
    body += f"""
<h2>1. Summary</h2>
<p>Before treatment, {ci['Critical']} risks are Critical and {ci['High']} are High. The Critical risks, supplier payment fraud, WhatsApp account
takeover and business email compromise, are the ways Nigerian small businesses most often lose money, and all three can be cut sharply within a month
at little cost: a call-back rule, two-step verification and staff training. After the planned treatment no risk remains above the appetite set by the board.</p>
<table style="width:90mm"><thead><tr><th>Rating</th><th>Inherent</th><th>Residual (planned)</th></tr></thead><tbody>{summary}</tbody></table>
<div class="callout"><strong>Risk appetite.</strong> {e(APPETITE)}</div>

<h2>2. Method</h2>
<ol><li><strong>Context:</strong> scope and obligations taken from the gap assessment.</li>
<li><strong>Identify:</strong> for each important asset, the threats that could affect it and the weaknesses that make them possible.</li>
<li><strong>Analyse:</strong> likelihood (1–5) × impact (1–5) = inherent score, considering controls already in place.</li>
<li><strong>Evaluate:</strong> compare each score with the risk appetite and the rating bands below.</li>
<li><strong>Treat:</strong> choose controls (mapped to ISO/IEC 27001:2022 Annex A), name an owner and a date, and estimate residual risk.</li>
<li><strong>Monitor:</strong> owners report monthly on High and Critical risks; the full register is reviewed every quarter and after any incident or major change.</li></ol>
<div class="cols"><div><h3>Likelihood</h3><table><thead><tr><th>#</th><th>Rating</th><th>Guide</th></tr></thead><tbody>{lk}</tbody></table></div>
<div><h3>Impact</h3><table><thead><tr><th>#</th><th>Rating</th><th>Guide</th></tr></thead><tbody>{im}</tbody></table></div></div>
<h3>Rating bands</h3><table><thead><tr><th style="width:18mm">Score</th><th style="width:22mm">Rating</th><th>Required response</th></tr></thead><tbody>{bd}</tbody></table>

<h2 class="page-break">3. Heat maps</h2>
<div class="cols"><div><h3>Inherent risk</h3>{heatmap(False)}</div></div>
<div class="cols"><div><h3>Residual risk after planned treatment</h3>{heatmap(True)}</div></div>

<h2 class="page-break">4. Risk register</h2>
<p class="small">Sorted by inherent score. L = likelihood, I = impact. The full register, with existing controls, residual likelihood and impact, and due dates, is in the companion Excel workbook.</p>
<table style="font-size:7.6pt"><thead><tr><th>ID</th><th>Asset</th><th>Threat</th><th>Vulnerability</th><th>L</th><th>I</th><th>Score</th><th>Treatment</th><th>Annex A</th><th>Residual</th><th>Owner</th></tr></thead><tbody>{reg}</tbody></table>

<h2>5. Treatment decisions</h2>
<p>All fifteen risks are <strong>treated</strong> (reduced). None are transferred: cyber insurance was considered for R02 but is not yet cost-effective at this size,
and will be reconsidered at the annual review. No risks are accepted above Low without a dated plan, in line with the appetite statement.</p>
<h2>6. Review and ownership</h2>
<p>The security and data protection lead keeps this register, reports monthly to the Managing Director on every High and Critical risk, and
re-scores the register each quarter. A new assessment is triggered by any incident, a new system or supplier, a new site, or a change in law.</p>
<p class="small">Annex A references use the ISO/IEC 27001:2022 numbering, for example A.5.17 Authentication information, A.6.3 Information security awareness,
education and training, A.8.5 Secure authentication, A.8.13 Information backup.</p>
"""
    return doc('Sample Risk Assessment and Register', body)

# ---------- 3. NDPA checklist ----------
NDPA = [
    ("Governance", [
        ("Name a person responsible for data protection (a Data Protection Officer where required)", "s.32"),
        ("Keep a record of what personal data you hold, why, where, who can see it and how long you keep it", "s.24, s.29"),
        ("Check whether you are a data controller or processor of major importance and register with the NDPC if so", "s.44"),
        ("File the annual compliance audit return where it applies (deadline 30 May; check the NDPC's current guidance)", "GAID 2025"),
        ("Train staff who handle personal data, and keep attendance records", "s.39"),
    ]),
    ("Lawful processing", [
        ("Identify a lawful basis for each use of personal data (consent, contract, legal obligation, vital interest, public task or legitimate interest)", "s.25"),
        ("Where you rely on consent, make it freely given, specific, informed and recorded, and as easy to withdraw as to give", "s.26, s.35"),
        ("Collect only the data you need and delete it when no longer needed", "s.24"),
        ("Apply extra care to sensitive data (health, religion, biometrics and similar) and children's data", "s.30, s.31"),
    ]),
    ("Transparency", [
        ("Publish a clear privacy notice on your website, forms and other collection points", "s.27"),
        ("Tell people who you are, what you collect, why, who you share it with, how long you keep it and their rights", "s.27"),
    ]),
    ("Data subject rights", [
        ("Have a process to handle requests to access, correct, delete or move personal data", "s.34, s.38"),
        ("Handle objections to processing, including direct marketing", "s.36"),
        ("Explain and allow review of decisions made only by automated means", "s.37"),
    ]),
    ("Security", [
        ("Use appropriate technical and organisational measures: two-step verification, access control, encryption, backups, updates", "s.39"),
        ("Assess the impact before high-risk processing (Data Protection Impact Assessment)", "s.28"),
        ("Put written data processing terms in place with suppliers who process personal data for you", "s.29"),
    ]),
    ("Breaches", [
        ("Have a written breach response plan with roles and contacts", "s.40"),
        ("Notify the NDPC within 72 hours of becoming aware of a breach likely to risk people's rights and freedoms", "s.40"),
        ("Tell affected people promptly where the breach is likely to cause them high risk, with steps they can take", "s.40"),
        ("Keep a record of every breach, even ones you do not report", "s.40"),
    ]),
    ("International transfers", [
        ("Know which personal data leaves Nigeria (for example cloud, email and marketing tools) and record the legal basis for each transfer", "s.41–43"),
    ]),
]

def ndpa_checklist():
    body = cover('Compliance checklist', 'Nigeria Data Protection Act 2023: Compliance Checklist',
                 'A practical checklist that turns the NDPA 2023 and the NDPC General Application and Implementation Directive (GAID) 2025 into actions a business can evidence.',
                 [('Use', 'Self-assessment or the starting point for a gap assessment'), ('Law', 'Nigeria Data Protection Act 2023; GAID 2025'), ('Prepared by', PREPARER), ('Version', f'1.0, {VERSION_DATE}')])
    body = body.replace('<strong>Illustrative sample.</strong> Example Foods Ltd is a fictional company. This document shows the method,\nstructure and quality of a real engagement; it is not a client deliverable and contains no client information.',
                        '<strong>General guidance, not legal advice.</strong> This checklist summarises the main duties; it does not replace the text of the Act or advice on your circumstances. Section numbers refer to the NDPA 2023.')
    body += '<h2>How to use it</h2><p>For each item, record <strong>Yes</strong>, <strong>Partly</strong> or <strong>No</strong>, and the evidence you could show the NDPC or a client (a policy, a record, a screenshot of a setting). Any "No" against Security or Breaches should be treated first.</p>'
    for sec, items in NDPA:
        body += f'<h2>{e(sec)}</h2><table class="check"><thead><tr><th></th><th>Requirement</th><th style="width:22mm">NDPA ref.</th><th style="width:20mm">Status</th><th style="width:38mm">Evidence</th></tr></thead><tbody>'
        body += ''.join(f'<tr><td>☐</td><td>{e(t)}</td><td>{e(ref)}</td><td></td><td></td></tr>' for t, ref in items)
        body += '</tbody></table>'
    body += '<div class="callout">Penalties under the Act can reach the higher of ₦10 million or 2% of annual gross revenue for a data controller or processor of major importance, and the higher of ₦2 million or 2% for others (s.48). Good records are the best defence.</div>'
    return doc('NDPA 2023 Compliance Checklist', body)

# ---------- 4. Information security policy ----------
POLICY = [
    ("1. Purpose", ["This policy sets out how Example Foods Ltd protects the information it relies on, including customer and staff personal data, and meets its duties under the Nigeria Data Protection Act 2023."]),
    ("2. Scope", ["It applies to all staff, contractors and temporary workers, and to all business information, accounts, devices and systems, including personal phones used for work."]),
    ("3. Roles and responsibilities", ["<strong>Board / Managing Director:</strong> approves this policy and the risk appetite, and receives a quarterly security report.",
                                       "<strong>Security and Data Protection Lead:</strong> keeps the risk register, policies and incident log, and coordinates training and breach response.",
                                       "<strong>Managers:</strong> make sure their teams follow this policy and request access changes for joiners and leavers.",
                                       "<strong>All staff:</strong> follow this policy and report incidents and mistakes immediately. Reporting a mistake early is always the right thing to do."]),
    ("4. Accounts and passwords (A.5.15–A.5.18, A.8.5)", ["Every person has their own account. Shared logins are not allowed.",
                                                       "Two-step verification is switched on for email, WhatsApp Business, social media, banking and cloud systems.",
                                                       "Passwords are long, unique and stored in the company password manager. Never share a password or a verification code with anyone, including someone claiming to be from a bank, Meta or IT support.",
                                                       "Access is given on a need-to-know basis, reviewed every quarter and removed on the day someone leaves."]),
    ("5. Acceptable use (A.5.10)", ["Business devices, email and accounts are for business use. Do not install unapproved software or forward business data to personal accounts."]),
    ("6. Devices (A.8.1, A.7.9, A.8.7, A.8.8)", ["Devices have a screen lock, automatic updates, endpoint protection and disk encryption.",
                                               "Lost or stolen devices are reported straight away so they can be locked and wiped."]),
    ("7. Payments (A.5.14)", ["Any request to change a supplier's bank details is confirmed by calling the supplier on a number already on file, never one in the request.",
                              "Payments over ₦500,000 need a second approver. Urgent payment requests from senior staff are confirmed by phone."]),
    ("8. Data protection (A.5.34, A.8.12)", ["Personal data is collected only for a stated purpose, kept in approved systems, shared only with those who need it, and deleted when no longer needed.",
                                            "Customer lists and exports are not sent by email or WhatsApp."]),
    ("9. Backups (A.8.13)", ["Business files are backed up automatically with version history. A restore is tested every six months."]),
    ("10. Suppliers (A.5.19–A.5.21)", ["Suppliers that handle our data or money complete a security questionnaire and sign security and data processing terms."]),
    ("11. Incidents and breaches (A.5.24–A.5.28)", ["Suspected incidents are reported immediately to the Security and Data Protection Lead.",
                                                     "The incident response plan is followed. Where personal data is affected, the lead assesses whether the NDPC must be notified within 72 hours and whether affected people must be told."]),
    ("12. Training (A.6.3)", ["All staff complete security awareness training when they join and every year, and sign to confirm they have read this policy."]),
    ("13. Compliance and review (A.5.1, A.5.36)", ["Breaches of this policy may lead to disciplinary action. This policy is reviewed every year and after any significant incident or change."]),
]

def policy_doc():
    body = cover('Policy sample', 'Information Security Policy',
                 'A short, plain-language top-level policy for a small business, with each section mapped to ISO/IEC 27001:2022 Annex A controls.',
                 [('Organisation', SAMPLE_CO['label']), ('Owner', 'Security and Data Protection Lead'), ('Approved by', 'Managing Director'), ('Review', 'Annually'), ('Version', f'1.0, {VERSION_DATE}')])
    for h, paras in POLICY:
        body += f'<h2>{e(h)}</h2>' + (''.join(f'<p>{p}</p>' for p in paras) if len(paras) == 1 else '<ul>' + ''.join(f'<li>{p}</li>' for p in paras) + '</ul>')
    body += """<div style="break-inside:avoid"><h2>Staff acknowledgement</h2><p>I have read and understood this policy and agree to follow it.</p>
<table class="sig"><thead><tr><th>Name</th><th>Role</th><th>Signature</th><th>Date</th></tr></thead><tbody><tr><td></td><td></td><td></td><td></td></tr><tr><td></td><td></td><td></td><td></td></tr></tbody></table></div>
<h2>Document control</h2><table><thead><tr><th>Version</th><th>Date</th><th>Change</th><th>Approved</th></tr></thead><tbody><tr><td>1.0</td><td>3 November 2026</td><td>First issue</td><td>Managing Director</td></tr></tbody></table>"""
    return doc('Sample Information Security Policy', body)

for name, fn in [('gap-assessment', gap_report), ('risk-assessment', risk_report), ('ndpa-checklist', ndpa_checklist), ('information-security-policy', policy_doc)]:
    with open(os.path.join(OUT, name + '.html'), 'w') as f:
        f.write(fn())

# ---------- Workbook ----------
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.formatting.rule import CellIsRule, FormulaRule
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.utils import get_column_letter

NAVY, PALE = '0F3A5F', 'F3ECDD'
FILL = {'Low': 'DDF2E3', 'Medium': 'FFF1C9', 'High': 'FFD9B8', 'Critical': 'F8C9C9'}
hdr_font, hdr_fill = Font(bold=True, color='FFFFFF'), PatternFill('solid', fgColor=NAVY)
thin = Border(bottom=Side(style='thin', color='E6DECD'))
wrap = Alignment(wrap_text=True, vertical='top')

def header(ws, row, cols, widths=None):
    for c, v in enumerate(cols, 1):
        cell = ws.cell(row=row, column=c, value=v)
        cell.font, cell.fill, cell.alignment = hdr_font, hdr_fill, Alignment(wrap_text=True, vertical='center')
    if widths:
        for c, w in enumerate(widths, 1):
            ws.column_dimensions[get_column_letter(c)].width = w
    ws.freeze_panes = ws.cell(row=row + 1, column=1)

def rating_formula(cell):
    return f'=IF({cell}>=15,"Critical",IF({cell}>=10,"High",IF({cell}>=5,"Medium","Low")))'

def colour_rating(ws, rng):
    for name, col in FILL.items():
        ws.conditional_formatting.add(rng, CellIsRule(operator='equal', formula=[f'"{name}"'], fill=PatternFill('solid', fgColor=col)))

wb = Workbook()
ws = wb.active; ws.title = 'Read me'
ws.column_dimensions['A'].width = 110
lines = [("Sample Information Security Risk Register", Font(bold=True, size=16, color=NAVY)),
         (f"{SAMPLE_CO['label']}", Font(italic=True, color='93701F')),
         ("ILLUSTRATIVE SAMPLE: a fictional company. Shows method and structure; contains no client information.", Font(bold=True, color='93701F')),
         (f"Prepared by {PREPARER}. Version 1.0, {VERSION_DATE}.", None), ("", None),
         ("Sheets", Font(bold=True, size=12, color=NAVY)),
         ("Method: likelihood and impact scales, rating bands and risk appetite.", None),
         ("Risk Register: 15 risks. Scores and ratings are formulas: edit the likelihood or impact (1–5) and the rating updates.", None),
         ("Heat Map: counts of inherent risks in each likelihood × impact cell, calculated from the register.", None),
         ("Gap Assessment: NIST CSF 2.0 categories with current and target maturity (0–5) and the gap.", None),
         ("Roadmap: 90-day treatment plan.", None), ("", None),
         ("Frameworks: ISO 31000 (risk process), ISO/IEC 27001:2022 Annex A (controls), NIST CSF 2.0 (gap assessment), Nigeria Data Protection Act 2023.", None)]
for i, (t, f) in enumerate(lines, 1):
    c = ws.cell(row=i, column=1, value=t)
    if f: c.font = f
    c.alignment = Alignment(wrap_text=True)

m = wb.create_sheet('Method')
m.column_dimensions['A'].width = 10; m.column_dimensions['B'].width = 18; m.column_dimensions['C'].width = 70
r = 1
for title, rows in [('Likelihood', LIKELIHOOD), ('Impact', IMPACT)]:
    m.cell(row=r, column=1, value=title).font = Font(bold=True, size=12, color=NAVY); r += 1
    for c, v in enumerate(['Score', 'Rating', 'Guide'], 1):
        x = m.cell(row=r, column=c, value=v); x.font, x.fill = hdr_font, hdr_fill
    r += 1
    for row in rows:
        for c, v in enumerate(row, 1): m.cell(row=r, column=c, value=v)
        r += 1
    r += 1
m.cell(row=r, column=1, value='Rating bands (score = likelihood × impact)').font = Font(bold=True, size=12, color=NAVY); r += 1
for c, v in enumerate(['Score', 'Rating', 'Required response'], 1):
    x = m.cell(row=r, column=c, value=v); x.font, x.fill = hdr_font, hdr_fill
r += 1
for lo, hi, nm, ac in BANDS:
    m.cell(row=r, column=1, value=f'{lo}–{hi}'); b = m.cell(row=r, column=2, value=nm); b.fill = PatternFill('solid', fgColor=FILL[nm]); m.cell(row=r, column=3, value=ac); r += 1
r += 1
m.cell(row=r, column=1, value='Risk appetite').font = Font(bold=True, size=12, color=NAVY); r += 1
c = m.cell(row=r, column=1, value=APPETITE); m.merge_cells(start_row=r, start_column=1, end_row=r, end_column=3); c.alignment = wrap; m.row_dimensions[r].height = 45

rr = wb.create_sheet('Risk Register')
cols = ['ID', 'Asset', 'Threat', 'Vulnerability', 'Likelihood', 'Impact', 'Inherent score', 'Inherent rating', 'Existing controls',
        'Treatment', 'Option', 'ISO 27001:2022 Annex A', 'Residual likelihood', 'Residual impact', 'Residual score', 'Residual rating', 'Owner', 'Due', 'Status']
header(rr, 1, cols, [6, 22, 30, 30, 10, 9, 10, 11, 20, 42, 10, 18, 10, 10, 10, 11, 18, 10, 12])
rr.row_dimensions[1].height = 32
for i, x in enumerate(RISKS, 2):
    vals = [x[0], x[1], x[2], x[3], x[4], x[5], f'=E{i}*F{i}', rating_formula(f'G{i}'), x[6], x[7], 'Treat', x[8], x[9], x[10], f'=M{i}*N{i}', rating_formula(f'O{i}'), x[11], x[12], 'Open']
    for c, v in enumerate(vals, 1):
        cell = rr.cell(row=i, column=c, value=v); cell.alignment = wrap; cell.border = thin
last = len(RISKS) + 1
dv = DataValidation(type='whole', operator='between', formula1='1', formula2='5', showErrorMessage=True, error='Enter a whole number from 1 to 5')
rr.add_data_validation(dv)
for col in 'EFMN': dv.add(f'{col}2:{col}{last}')
opt = DataValidation(type='list', formula1='"Treat,Transfer,Avoid,Accept"'); rr.add_data_validation(opt); opt.add(f'K2:K{last}')
st = DataValidation(type='list', formula1='"Open,In progress,Done"'); rr.add_data_validation(st); st.add(f'S2:S{last}')
colour_rating(rr, f'H2:H{last}'); colour_rating(rr, f'P2:P{last}')
rr.auto_filter.ref = f'A1:S{last}'

hm = wb.create_sheet('Heat Map')
hm['A1'] = 'Inherent risk heat map (number of risks per cell, calculated from the Risk Register)'; hm['A1'].font = Font(bold=True, size=12, color=NAVY)
hm['A2'] = 'Rows: likelihood. Columns: impact.'
hm.column_dimensions['A'].width = 22
for i in range(1, 6):
    hm.column_dimensions[get_column_letter(i + 1)].width = 15
    c = hm.cell(row=9, column=i + 1, value=f'{i} {IMPACT[i-1][1]}'); c.font = Font(bold=True); c.alignment = Alignment(horizontal='center', wrap_text=True)
for idx, l in enumerate(range(5, 0, -1)):
    row = 4 + idx
    hm.cell(row=row, column=1, value=f'{l} {LIKELIHOOD[l-1][1]}').font = Font(bold=True)
    hm.row_dimensions[row].height = 34
    for i in range(1, 6):
        c = hm.cell(row=row, column=i + 1, value=f"=COUNTIFS('Risk Register'!$E$2:$E${last},{l},'Risk Register'!$F$2:$F${last},{i})")
        c.fill = PatternFill('solid', fgColor=FILL[band(l * i)]); c.alignment = Alignment(horizontal='center', vertical='center'); c.font = Font(bold=True, size=13)

ga = wb.create_sheet('Gap Assessment')
header(ga, 1, ['Function', 'Category ID', 'Category', 'Current (0–5)', 'Target (0–5)', 'Gap', 'Finding', 'Recommendation', 'Priority'], [11, 11, 34, 11, 11, 7, 50, 50, 9])
for i, g in enumerate(GAP, 2):
    for c, v in enumerate([g[0], g[1], g[2], g[3], g[4], f'=E{i}-D{i}', g[5], g[6], g[7]], 1):
        cell = ga.cell(row=i, column=c, value=v); cell.alignment = wrap; cell.border = thin
gl = len(GAP) + 1
ga.cell(row=gl + 2, column=3, value='Average').font = Font(bold=True)
for col in 'DEF':
    ga[f'{col}{gl+2}'] = f'=ROUND(AVERAGE({col}2:{col}{gl}),1)'; ga[f'{col}{gl+2}'].font = Font(bold=True)
for p, colr in [('P1', 'F8C9C9'), ('P2', 'FFF1C9'), ('P3', 'DDF2E3')]:
    ga.conditional_formatting.add(f'I2:I{gl}', CellIsRule(operator='equal', formula=[f'"{p}"'], fill=PatternFill('solid', fgColor=colr)))
ga.conditional_formatting.add(f'F2:F{gl}', FormulaRule(formula=[f'F2>=2'], font=Font(bold=True, color='8A1212')))
ga.auto_filter.ref = f'A1:I{gl}'

rm = wb.create_sheet('Roadmap')
header(rm, 1, ['When', 'Theme', 'Actions'], [12, 30, 100])
for i, x in enumerate(ROADMAP, 2):
    for c, v in enumerate(x, 1):
        cell = rm.cell(row=i, column=c, value=v); cell.alignment = wrap

for sh in wb.worksheets:
    sh.sheet_view.showGridLines = sh.title in ('Risk Register', 'Gap Assessment')
    sh.page_setup.orientation = 'landscape'; sh.page_setup.fitToWidth = 1; sh.sheet_properties.pageSetUpPr.fitToPage = True; sh.page_setup.fitToHeight = 0
wb.properties.creator = 'Awal Global Consults Limited'; wb.properties.title = 'Sample Information Security Risk Register (fictional company)'
wb.save(os.path.join(DL, 'sample-risk-register.xlsx'))
print('built', os.listdir(OUT), os.listdir(DL))
