/**
 * Email address checking used by every form.
 *
 * What it catches:
 *  - badly formed addresses
 *  - common typos in popular domains (gmial.com, yaho.com, gmail.con ...), with a suggestion
 *  - disposable / throwaway inbox services
 *  - domains that do not exist or cannot receive email (no MX record, and no A record)
 *
 * What no website can check without sending an email: whether the exact mailbox
 * (the part before @) exists. Brevo reports hard bounces for that.
 *
 * DNS lookups use Cloudflare's DNS-over-HTTPS. If the lookup itself fails
 * (network problem), the address is accepted so real clients are never blocked.
 */

const SYNTAX = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@([A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,}$/;

const TYPOS = {
  'gmial.com': 'gmail.com', 'gmai.com': 'gmail.com', 'gmal.com': 'gmail.com', 'gamil.com': 'gmail.com', 'gnail.com': 'gmail.com',
  'gmail.co': 'gmail.com', 'gmail.con': 'gmail.com', 'gmail.cm': 'gmail.com', 'gmail.om': 'gmail.com', 'gmaill.com': 'gmail.com',
  'gmail.comm': 'gmail.com', 'gmail.c': 'gmail.com', 'gmail.ng': 'gmail.com', 'gmail.com.ng': 'gmail.com', 'gmali.com': 'gmail.com', 'gimail.com': 'gmail.com',
  'yaho.com': 'yahoo.com', 'yahooo.com': 'yahoo.com', 'yahoo.co': 'yahoo.com', 'yahoo.con': 'yahoo.com', 'yhoo.com': 'yahoo.com', 'yaoo.com': 'yahoo.com',
  'hotmial.com': 'hotmail.com', 'hotmai.com': 'hotmail.com', 'hotmail.co': 'hotmail.com', 'hotmail.con': 'hotmail.com', 'hotmal.com': 'hotmail.com',
  'outlok.com': 'outlook.com', 'outlook.co': 'outlook.com', 'outlook.con': 'outlook.com', 'outloo.com': 'outlook.com',
  'iclod.com': 'icloud.com', 'icloud.co': 'icloud.com', 'icoud.com': 'icloud.com', 'icloud.con': 'icloud.com'
};

const DISPOSABLE = new Set([
  'mailinator.com', 'mailinator.net', 'guerrillamail.com', 'guerrillamail.net', 'guerrillamail.org', 'guerrillamailblock.com', 'sharklasers.com', 'grr.la',
  '10minutemail.com', '10minutemail.net', '10minemail.com', 'tempmail.com', 'temp-mail.org', 'temp-mail.io', 'tempmail.net', 'tempmailo.com', 'tempmail.dev',
  'tempr.email', 'throwawaymail.com', 'yopmail.com', 'yopmail.net', 'yopmail.fr', 'getnada.com', 'nada.email', 'trashmail.com', 'trashmail.de', 'trashmail.net',
  'dispostable.com', 'maildrop.cc', 'mailnesia.com', 'mintemail.com', 'mohmal.com', 'emailondeck.com', 'fakeinbox.com', 'fakemail.net', 'spambox.us',
  'mailcatch.com', 'mytemp.email', 'burnermail.io', 'inboxkitten.com', 'mail.tm', 'mail.gw', 'tmpmail.org', 'tmpmail.net', 'tmail.ws', 'moakt.com',
  'emailfake.com', 'fakemailgenerator.com', 'mailpoof.com', 'mvrht.com', 'spamgourmet.com', 'jetable.org', 'mailexpire.com', 'tempinbox.com',
  'discard.email', 'discardmail.com', 'trash-mail.com', 'wegwerfmail.de', 'byom.de', 'mail-temp.com', 'luxusmail.org', 'harakirimail.com',
  'tempemail.co', 'emailtemporanea.net', 'correotemporal.org', 'minuteinbox.com', 'mailforspam.com', 'anonbox.net', 'spam4.me', 'dropmail.me',
  'emltmp.com', 'firemailbox.club', 'linshiyouxiang.net', 'mailsac.com', 'inboxbear.com', 'getairmail.com', 'example.com', 'example.org', 'example.net', 'test.com'
]);

export function suggestDomain(email) {
  const at = email.lastIndexOf('@');
  if (at < 0) return null;
  const domain = email.slice(at + 1).toLowerCase();
  return TYPOS[domain] ? email.slice(0, at + 1) + TYPOS[domain] : null;
}

async function dnsHas(domain, type) {
  const res = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=${type}`, {
    headers: { accept: 'application/dns-json' }
  });
  if (!res.ok) throw new Error('dns ' + res.status);
  const data = await res.json();
  if (data.Status === 3) return false; // NXDOMAIN: domain does not exist
  const wanted = type === 'MX' ? 15 : 1;
  return (data.Answer || []).some(a => a.type === wanted && !(type === 'MX' && /^0\s+\.$/.test(String(a.data).trim())));
}

/**
 * Returns { ok: true, email } or { ok: false, reason, suggestion? }.
 * `reason` is a short message safe to show to the visitor.
 */
export async function checkEmail(raw) {
  const email = String(raw || '').trim();
  if (!email) return { ok: false, reason: 'Please enter your email address.' };
  if (email.length > 254 || !SYNTAX.test(email)) return { ok: false, reason: 'That email address doesn’t look right. Please check it.' };
  const suggestion = suggestDomain(email);
  if (suggestion) return { ok: false, reason: `Did you mean ${suggestion}?`, suggestion };
  const domain = email.split('@')[1].toLowerCase();
  if (DISPOSABLE.has(domain)) return { ok: false, reason: 'Please use a permanent email address. Temporary inboxes can’t receive our updates.' };
  try {
    if (await dnsHas(domain, 'MX')) return { ok: true, email };
    if (await dnsHas(domain, 'A')) return { ok: true, email };
    return { ok: false, reason: `The domain “${domain}” can’t receive email. Please check the address.` };
  } catch (err) {
    return { ok: true, email, unchecked: true }; // DNS lookup failed: don't block a real client
  }
}
