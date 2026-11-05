"""Shared content for the GRC portfolio: method, sample company, gap assessment, risk register.

The sample company is fictional and labelled as such everywhere it appears.
Rebuild everything with:  python3 ops/grc-portfolio/build.py && node ops/grc-portfolio/pdf.js
"""

PREPARER = "Abdullateef Olamilekan Abdulwaheed, Awal Global Consults Limited (RC-9282103)"
VERSION_DATE = "3 November 2026"

SAMPLE_CO = {
    "name": "Example Foods Ltd",
    "label": "Example Foods Ltd (a fictional company, used for illustration only)",
    "profile": (
        "A Lagos food manufacturer and distributor with 40 staff, two sites (Ikeja office and an Agbara factory), "
        "about 3,000 retail and wholesale customers, orders taken on WhatsApp Business and a website, payments by "
        "bank transfer and an online payment gateway, NAFDAC-registered products, and customer and staff personal "
        "data held in spreadsheets, a cloud accounting system and shared email."
    ),
    "scope": (
        "Information security and data protection across the head office, factory office, sales and finance teams; "
        "business email, WhatsApp Business, website, payment processes, laptops and phones; personal data of "
        "customers and staff. Out of scope: factory production control systems."
    ),
}

FRAMEWORKS = [
    ("NIST Cybersecurity Framework (CSF) 2.0", "Primary structure for gap assessments: six functions (Govern, Identify, Protect, Detect, Respond, Recover) and 22 categories."),
    ("ISO/IEC 27001:2022 and Annex A", "Control reference for risk treatment and policies: 93 controls in four themes (organizational, people, physical, technological)."),
    ("Nigeria Data Protection Act 2023 (NDPA)", "Legal baseline for personal data: lawful basis, data subject rights, security, breach notification within 72 hours, cross-border transfers and NDPC registration."),
    ("ISO 31000 risk management principles", "Risk method: identify, analyse (likelihood x impact), evaluate against appetite, treat, monitor and review."),
    ("Sector rules where they apply", "For example CBN expectations for payments and fintech partners, SCUML/AML for designated businesses, and CAC record-keeping under CAMA 2020."),
]

LIKELIHOOD = [
    (1, "Rare", "Not expected in the next 3 years"),
    (2, "Unlikely", "Could happen once in 3 years"),
    (3, "Possible", "Could happen once a year"),
    (4, "Likely", "Expected several times a year"),
    (5, "Almost certain", "Expected monthly or is already happening"),
]
IMPACT = [
    (1, "Negligible", "Loss under N100,000; no customer impact"),
    (2, "Minor", "Loss up to N1m; brief disruption; no personal data exposed"),
    (3, "Moderate", "Loss up to N10m; a day's disruption; limited personal data exposed"),
    (4, "Major", "Loss up to N50m; several days' disruption; reportable personal data breach"),
    (5, "Severe", "Loss over N50m; regulatory sanction; lasting reputational harm"),
]
BANDS = [(1, 4, "Low", "Accept and monitor"), (5, 9, "Medium", "Treat within 6 months"),
         (10, 14, "High", "Treat within 3 months; owner reports monthly"), (15, 25, "Critical", "Treat immediately; escalate to the board")]
APPETITE = ("Example Foods Ltd accepts Low risks, tolerates Medium risks with a dated treatment plan, and does not accept "
            "High or Critical risks to customer money, customer personal data or regulatory standing.")

MATURITY = [
    (0, "None", "No practice in place"),
    (1, "Initial", "Ad hoc, depends on individuals"),
    (2, "Repeatable", "Done consistently but not documented"),
    (3, "Defined", "Documented, approved and communicated"),
    (4, "Managed", "Measured and reviewed regularly"),
    (5, "Optimised", "Continuously improved from results"),
]

def band(score):
    for lo, hi, name, action in BANDS:
        if lo <= score <= hi:
            return name
    return ""

# NIST CSF 2.0: function, category id, category name, current, target, finding, recommendation, priority
GAP = [
    ("Govern", "GV.OC", "Organizational Context", 2, 3, "Owners understand obligations informally (NAFDAC, NDPA, tax) but they are not written down.", "Record legal, regulatory and contractual security obligations in one register.", "P2"),
    ("Govern", "GV.RM", "Risk Management Strategy", 1, 3, "No risk appetite or method; risks handled when they occur.", "Adopt the risk method and appetite statement in this report; review the register quarterly.", "P1"),
    ("Govern", "GV.RR", "Roles, Responsibilities, and Authorities", 1, 3, "No named owner for information security or data protection.", "Name a security and data protection lead with board reporting.", "P1"),
    ("Govern", "GV.PO", "Policy", 0, 3, "No information security, acceptable use or data protection policy.", "Approve an information security policy set and staff acknowledgement.", "P1"),
    ("Govern", "GV.OV", "Oversight", 1, 3, "Board receives no security reporting.", "Quarterly one-page security and privacy report to the board.", "P3"),
    ("Govern", "GV.SC", "Cybersecurity Supply Chain Risk Management", 1, 3, "Payment gateway, cloud accounting and IT vendor chosen without security checks.", "Supplier security questionnaire and contract clauses for key vendors.", "P2"),
    ("Identify", "ID.AM", "Asset Management", 1, 3, "No list of devices, accounts, systems or where personal data is held.", "Asset and data inventory, including who holds each account.", "P1"),
    ("Identify", "ID.RA", "Risk Assessment", 1, 3, "No assessment before this engagement.", "Maintain the attached risk register; reassess after changes.", "P2"),
    ("Identify", "ID.IM", "Improvement", 1, 2, "Incidents (one hijacked WhatsApp account last year) not reviewed for lessons.", "Short post-incident review for every incident.", "P3"),
    ("Protect", "PR.AA", "Identity Management, Authentication, and Access Control", 1, 4, "Shared email password; no two-step verification; former staff still on WhatsApp and bank logins.", "Individual accounts, two-step verification everywhere, leaver process the same day.", "P1"),
    ("Protect", "PR.AT", "Awareness and Training", 0, 3, "No staff training; finance staff unaware of invoice fraud patterns.", "Annual training plus induction briefing; phishing examples for finance.", "P1"),
    ("Protect", "PR.DS", "Data Security", 1, 3, "Customer lists in spreadsheets emailed around; no encryption on laptops.", "Restrict customer data to one system, encrypt laptops, stop emailing exports.", "P2"),
    ("Protect", "PR.PS", "Platform Security", 2, 3, "Some laptops a year behind on updates; no endpoint protection on two.", "Automatic updates and endpoint protection on all devices.", "P2"),
    ("Protect", "PR.IR", "Technology Infrastructure Resilience", 1, 3, "Single internet link; office Wi-Fi uses default password and is shared with visitors.", "Separate guest Wi-Fi, change defaults, backup mobile data link for sales.", "P3"),
    ("Detect", "DE.CM", "Continuous Monitoring", 1, 3, "Bank alerts only on one account; no login alerts on email or social media.", "Turn on bank, email and social login alerts; weekly review by the lead.", "P2"),
    ("Detect", "DE.AE", "Adverse Event Analysis", 0, 2, "No way for staff to report suspicious messages.", "Single reporting channel and simple triage checklist.", "P3"),
    ("Respond", "RS.MA", "Incident Management", 0, 3, "No incident response plan.", "Incident and data breach response plan with contacts and decision tree.", "P1"),
    ("Respond", "RS.AN", "Incident Analysis", 0, 2, "Incidents not investigated or recorded.", "Incident log with cause, impact and evidence kept.", "P3"),
    ("Respond", "RS.CO", "Incident Response Reporting and Communication", 0, 3, "Unaware of the NDPA 72-hour notification duty.", "Notification templates for the NDPC, customers and the bank.", "P1"),
    ("Respond", "RS.MI", "Incident Mitigation", 1, 3, "Containment steps (password resets, revoking sessions, calling the bank) not defined.", "Containment checklist inside the response plan.", "P2"),
    ("Recover", "RC.RP", "Incident Recovery Plan Execution", 1, 3, "Accounting data backed up by vendor; other files not backed up; restore never tested.", "Automatic backup of shared files; test a restore every six months.", "P2"),
    ("Recover", "RC.CO", "Incident Recovery Communication", 0, 2, "No plan for telling customers after an incident.", "Customer communication templates and approval route.", "P3"),
]

# Risk register: id, asset, threat, vulnerability, L, I, existing controls, treatment, ISO 27001:2022 Annex A, residual L, residual I, owner, due
RISKS = [
    ("R01", "WhatsApp Business account", "Account takeover via verification-code scam", "No two-step verification PIN; staff unaware of code scams", 4, 4, "None", "Set PIN and recovery email; staff rule: never share codes; check linked devices weekly", "A.5.17, A.6.3, A.8.5", 2, 4, "Sales Manager", "Week 1"),
    ("R02", "Supplier payments", "Invoice or bank-detail change fraud (business email compromise)", "No call-back check; single approver", 4, 5, "Bank alerts on main account", "Call-back on a known number for any bank-detail change; second approval over N500,000", "A.5.14, A.5.19, A.6.3", 1, 5, "Finance Manager", "Week 1"),
    ("R03", "Business email", "Credential theft through phishing", "Shared password; no two-step verification", 4, 4, "Spam filter", "Individual accounts, two-step verification, phishing training", "A.5.15, A.5.17, A.8.5", 2, 3, "Security Lead", "Month 1"),
    ("R04", "Customer personal data", "Personal data breach from emailed spreadsheets", "Exports emailed and saved on personal devices", 3, 4, "None", "One controlled system; stop emailing exports; data minimisation", "A.5.14, A.5.34, A.8.12", 2, 3, "Data Protection Lead", "Month 2"),
    ("R05", "Regulatory standing (NDPA)", "Failure to notify a breach within 72 hours", "No incident plan; duty not known", 3, 4, "None", "Breach response plan, NDPC notification template, annual drill", "A.5.24, A.5.26, A.5.34", 1, 4, "Data Protection Lead", "Month 1"),
    ("R06", "Laptops and phones", "Loss or theft exposing data", "No disk encryption; no remote wipe", 3, 3, "Screen lock on some devices", "Encrypt laptops, enable find-and-wipe, device register", "A.8.1, A.8.24, A.7.9", 2, 2, "IT Support", "Month 2"),
    ("R07", "Shared files", "Ransomware or accidental deletion", "No backup of shared drive; restore never tested", 2, 4, "Accounting vendor backups", "Automatic cloud backup with version history; six-monthly restore test", "A.8.13, A.8.7", 1, 3, "IT Support", "Month 2"),
    ("R08", "All systems", "Former staff retaining access", "No leaver process", 3, 3, "None", "Leaver checklist actioned the same day; quarterly access review", "A.5.18, A.5.15", 1, 3, "HR Manager", "Month 1"),
    ("R09", "Laptops", "Malware through unpatched software", "Updates not automatic; two devices without protection", 3, 3, "Built-in protection on some devices", "Automatic updates; endpoint protection on all devices", "A.8.7, A.8.8", 2, 2, "IT Support", "Month 2"),
    ("R10", "Payment gateway and cloud accounting vendors", "Supplier security failure affecting the business", "No security checks or contract terms", 2, 4, "None", "Supplier questionnaire; security and data protection clauses at renewal", "A.5.19, A.5.20, A.5.23", 2, 3, "Finance Manager", "Month 3"),
    ("R11", "Office network", "Unauthorised access via Wi-Fi", "Default router password; visitors on staff network", 2, 3, "None", "Change defaults; separate guest network", "A.8.20", 1, 2, "IT Support", "Month 1"),
    ("R12", "Instagram and Facebook pages", "Page hijack through fake copyright notices", "Single admin; no two-step verification", 3, 3, "None", "Two admins, two-step verification, staff briefing", "A.5.17, A.6.3, A.8.5", 1, 3, "Marketing Lead", "Week 2"),
    ("R13", "Website", "Defacement or form abuse", "Outdated plugins; no bot protection on forms", 2, 2, "Hosting provider protection", "Update plugins; add bot protection; review admin accounts", "A.8.8, A.8.9", 1, 2, "Marketing Lead", "Month 2"),
    ("R14", "Key staff", "Loss of the only person who knows account passwords", "Passwords held by one person", 2, 4, "None", "Business password manager with shared vault and recovery", "A.5.17, A.5.30", 1, 3, "Managing Director", "Month 1"),
    ("R15", "Regulatory standing (data protection registration)", "Missing NDPC registration if thresholds are crossed", "Data volumes not tracked", 2, 3, "None", "Track data-subject numbers; register with the NDPC if required", "A.5.31, A.5.34", 1, 2, "Data Protection Lead", "Month 3"),
]

ROADMAP = [
    ("Week 1", "Protect accounts and payments", "WhatsApp PIN and recovery, call-back rule for bank-detail changes, second approval for large payments, staff warning on code scams."),
    ("Month 1", "Own the programme", "Name a security and data protection lead, approve the policy set, leaver process, two-step verification on all accounts, breach response plan."),
    ("Month 2", "Harden and back up", "Encrypt laptops, automatic updates and endpoint protection, backups with a tested restore, stop emailing customer exports, staff training."),
    ("Month 3", "Suppliers and oversight", "Supplier questionnaires and contract clauses, NDPC registration check, first quarterly board report, reassess the risk register."),
]
