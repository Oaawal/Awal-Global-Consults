/**
 * Awal Global Consults WhatsApp assistant (WhatsApp Cloud API + Claude).
 *
 * Flow: Meta posts a message to /whatsapp/webhook -> we answer 200 at once and, in the
 * background, load the chat, ask Claude (with three tools), and send the reply.
 *
 * Chats are kept in private storage (R2, key wa/chat/<wa_id>.json) so the assistant
 * remembers the conversation; the daily job deletes chats idle for 30 days. A chat starts
 * afresh after 12 hours of silence (history is only ever appended to, never edited).
 *
 * Settings (Cloudflare Pages > Settings > Variables and Secrets):
 *   WHATSAPP_TOKEN, WHATSAPP_APP_SECRET, WHATSAPP_VERIFY_TOKEN, ANTHROPIC_API_KEY  (secrets)
 *   WHATSAPP_PHONE_NUMBER_ID (optional, defaults below), WA_BOT_ENABLED ('0' pauses replies)
 */
import { SYSTEM_PROMPT, TOOLS, SERVICES, HUMAN_WHATSAPP, HUMAN_WHATSAPP_LINK } from './wa-knowledge.js';
import { recordSubmission, recordsEnabled, INTAKE_QUICK } from './records.js';
import { statusInfo, SITE_URL } from './cases.js';
import { serviceProgress } from './service-progress.js';
import { detailsUrl } from './upload-links.js';
import { notifyAdmins } from './webpush.js';
import { sendBrevoEmail } from './brevo.js';
import { adminNoticeEmail } from './email-templates.js';
import { adminEmails } from './admin-auth.js';

const DEFAULT_PHONE_NUMBER_ID = '1289545104233657'; // 0708 227 5885
const MODEL = 'claude-opus-5-5';
const SESSION_GAP_MS = 12 * 3600 * 1000;
const MAX_TURN_MESSAGES = 60;      // a very long chat starts afresh rather than growing forever
const MAX_TOOL_ROUNDS = 4;
const MAX_TRACK_FAILS = 5;
const enc = new TextEncoder();

const graphBase = env => (env.GRAPH_BASE || 'https://graph.facebook.com') + '/v21.0';
const anthropicBase = env => env.ANTHROPIC_BASE || 'https://api.anthropic.com';
const phoneId = env => env.WHATSAPP_PHONE_NUMBER_ID || DEFAULT_PHONE_NUMBER_ID;

// ── Webhook security ──────────────────────────────────────────
/** Meta signs each delivery: X-Hub-Signature-256 = "sha256=" + HMAC-SHA256(app secret, raw body). */
export async function validSignature(env, rawBody, header) {
  if (!env.WHATSAPP_APP_SECRET || !header || !header.startsWith('sha256=')) return false;
  const key = await crypto.subtle.importKey('raw', enc.encode(env.WHATSAPP_APP_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(rawBody)));
  const want = [...mac].map(b => b.toString(16).padStart(2, '0')).join('');
  const got = header.slice(7).toLowerCase();
  if (got.length !== want.length) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ got.charCodeAt(i);
  return diff === 0;
}

/** The incoming customer messages in a webhook payload (status updates are ignored). */
export function incomingMessages(payload) {
  const out = [];
  for (const entry of (payload && payload.entry) || []) for (const ch of entry.changes || []) {
    const v = ch.value || {};
    if (ch.field !== 'messages' || !v.messages) continue;
    const names = Object.fromEntries((v.contacts || []).map(c => [c.wa_id, c.profile && c.profile.name]));
    for (const m of v.messages) out.push({ ...m, profileName: names[m.from] || '', phoneNumberId: v.metadata && v.metadata.phone_number_id });
  }
  return out;
}

// ── WhatsApp sending ──────────────────────────────────────────
async function graph(env, path, body) {
  const r = await fetch(`${graphBase(env)}/${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!r.ok) throw new Error(`WhatsApp API ${r.status}: ${(await r.text()).slice(0, 300)}`);
  return r.json();
}
export const sendText = (env, to, text) => graph(env, `${phoneId(env)}/messages`, {
  messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'text', text: { body: String(text).slice(0, 4000), preview_url: true }
});
/** Up to 3 tap buttons (titles max 20 characters). */
export const sendButtons = (env, to, text, buttons) => graph(env, `${phoneId(env)}/messages`, {
  messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'interactive',
  interactive: { type: 'button', body: { text: text.slice(0, 1024) }, action: { buttons: buttons.map(([id, title]) => ({ type: 'reply', reply: { id, title } })) } }
});
/** A pick-list of up to 10 rows (titles max 24 characters). */
const sendList = (env, to, text, button, rows) => graph(env, `${phoneId(env)}/messages`, {
  messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'interactive',
  interactive: { type: 'list', body: { text }, action: { button, sections: [{ title: 'Services', rows: rows.map(([id, title, description]) => ({ id, title, description })) }] } }
});
/** Blue ticks plus "typing..." while the assistant thinks (best effort). */
const markRead = (env, messageId) => graph(env, `${phoneId(env)}/messages`, {
  messaging_product: 'whatsapp', status: 'read', message_id: messageId, typing_indicator: { type: 'text' }
}).catch(() => {});

// ── Chat storage ──────────────────────────────────────────────
const chatKey = waId => `wa/chat/${waId.replace(/\D/g, '')}.json`;
async function loadChat(env, waId) {
  const obj = await env.DOCS.get(chatKey(waId));
  if (!obj) return null;
  try { return await obj.json(); } catch (e) { return null; }
}
async function saveChat(env, chat) {
  chat.updated_at = new Date().toISOString();
  await env.DOCS.put(chatKey(chat.wa_id), JSON.stringify(chat), {
    httpMetadata: { contentType: 'application/json' }, customMetadata: { updated: chat.updated_at, kind: 'whatsapp-chat' }
  });
}

// ── Claude ────────────────────────────────────────────────────
async function askClaude(env, messages) {
  const r = await fetch(`${anthropicBase(env)}/v1/messages`, {
    method: 'POST',
    headers: {
      'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2026-10-21', 'content-type': 'application/json',
      // If a safety classifier declines, the API retries on a suitable model inside the same call
      'anthropic-beta': 'server-side-fallback-2026-07-01'
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2000,
      output_config: { effort: 'low' },
      fallbacks: 'default',
      system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      tools: TOOLS,
      tool_choice: { type: 'auto' },
      // Cache the conversation so far, so each new message only pays for what is new
      cache_control: { type: 'ephemeral' },
      messages
    })
  });
  if (!r.ok) throw new Error(`Claude API ${r.status}: ${(await r.text()).slice(0, 300)}`);
  return r.json();
}
const textOf = content => (content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();

// ── Tools ─────────────────────────────────────────────────────
const validEmail = e => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(e || '').trim());

async function toolRequestQuote(env, request, chat, input) {
  if (!recordsEnabled(env)) return { error: 'The quotation system is unavailable right now. Use talk_to_person instead.' };
  if (chat.case_ref) return { already_requested: true, reference: chat.case_ref, note: 'A quotation request was already made in this chat. Do not create another; tell them we will email the quote.' };
  const name = String(input.full_name || '').trim().slice(0, 120);
  const email = String(input.email || '').trim().slice(0, 254);
  const services = (input.services || []).filter(s => SERVICES.includes(s)).slice(0, 8);
  if (name.length < 3) return { error: 'Ask for their full name.' };
  if (!validEmail(email)) return { error: 'That email address does not look right. Ask them to check it.' };
  if (!services.length) return { error: 'Ask which service they need.' };
  const fields = {
    'Full Name': name, Email: email, Phone: '+' + chat.wa_id, 'Services Requested': services.join(', '),
    Intake: INTAKE_QUICK, 'Found Us Via': 'WhatsApp assistant',
    ...(input.details ? { 'Additional Notes': String(input.details).slice(0, 1500) } : {})
  };
  const { reference, caseId } = await recordSubmission(env, request, {
    kind: 'application', fullName: name, email, phone: '+' + chat.wa_id, services, fields,
    consentAccuracy: false, consentProcessing: true
  });
  chat.case_ref = reference; chat.case_id = caseId;
  const caseUrl = `${SITE_URL}/admin/case/${caseId}`;
  await notifyAdmins(env, { title: `WhatsApp quote request ${reference}`, body: `${name}: ${services.join(', ')}`, url: caseUrl, tag: reference });
  for (const to of adminEmails(env)) {
    await sendBrevoEmail(env, {
      to: { email: to }, subject: `[${reference}] WhatsApp quote request: ${services.slice(0, 2).join(', ')}`,
      html: adminNoticeEmail({ heading: 'New quotation request from the WhatsApp assistant', reference, services, caseUrl,
        lines: [`${name} · ${email} · +${chat.wa_id}`, input.details ? `Notes: ${input.details}` : 'Send the itemised quotation from the Billing tab.'] })
    }).catch(err => console.error('wa: admin email failed:', err && err.message));
  }
  return { reference, full_application_link: await detailsUrl(env, caseId), note: 'Quote will be emailed within one working day. The full application link is private: share it only if they want to send their details now.' };
}

async function toolTrack(env, chat, input) {
  if ((chat.track_fails || 0) >= MAX_TRACK_FAILS) return { error: 'Too many attempts in this chat. Use talk_to_person.' };
  const reference = String(input.reference || '').trim().toUpperCase().replace(/\s+/g, '').slice(0, 20);
  const email = String(input.email || '').trim().toLowerCase().slice(0, 254);
  const c = await env.DB.prepare(
    `SELECT c.id, c.reference, c.kind, c.services, c.status, c.created_at, c.status_changed_at
     FROM cases c JOIN clients cl ON cl.id = c.client_id
     WHERE c.reference = ?1 AND cl.email = ?2 AND cl.anonymised_at IS NULL AND c.purged_at IS NULL`).bind(reference, email).first();
  if (!c) { chat.track_fails = (chat.track_fails || 0) + 1; return { found: false, note: 'No application matches that reference and email. Ask them to check both.' }; }
  const events = (await env.DB.prepare("SELECT event, from_status, to_status, created_at FROM case_events WHERE case_id = ?1 AND event IN ('service_progress', 'service_ref')").bind(c.id).all()).results || [];
  const info = statusInfo(c.kind, c.status);
  return {
    found: true, reference: c.reference, status: info.label === 'New' ? 'Received' : info.label, meaning: info.client || '',
    last_update: (c.status_changed_at || c.created_at).slice(0, 10),
    services: serviceProgress(c.services, events).filter(r => r.step !== 'not_needed').map(r => ({ service: r.service, step: r.label, agency_reference: r.reference || undefined })),
    tracking_page: `${SITE_URL}/track`
  };
}

async function toolHandoff(env, chat, input) {
  const summary = String(input.summary || '').slice(0, 600);
  chat.handoffs = (chat.handoffs || 0) + 1;
  const title = `${input.urgent ? 'URGENT: ' : ''}WhatsApp chat needs you: ${chat.name || '+' + chat.wa_id}`;
  await notifyAdmins(env, { title, body: summary, url: `https://wa.me/${chat.wa_id}`, tag: `wa-${chat.wa_id}` });
  for (const to of adminEmails(env)) {
    await sendBrevoEmail(env, {
      to: { email: to }, subject: title,
      html: adminNoticeEmail({ heading: 'A WhatsApp client asked for a person', reference: chat.case_ref || `+${chat.wa_id}`, caseUrl: `https://wa.me/${chat.wa_id}`,
        lines: [`${chat.name || 'Client'} · +${chat.wa_id}`, summary, 'The button opens a WhatsApp chat with them from your phone.'] })
    }).catch(err => console.error('wa: handoff email failed:', err && err.message));
  }
  return { human_contact: HUMAN_WHATSAPP, chat_link: HUMAN_WHATSAPP_LINK, note: 'Tell them a colleague has been notified and will reach out, and that they can also message this number directly. Office hours Mon to Fri 10am to 4pm, Sat 10am to 1pm.' };
}

async function runTool(env, request, chat, block) {
  try {
    if (block.name === 'request_quote') return await toolRequestQuote(env, request, chat, block.input || {});
    if (block.name === 'track_application') return await toolTrack(env, chat, block.input || {});
    if (block.name === 'talk_to_person') return await toolHandoff(env, chat, block.input || {});
    return { error: 'Unknown tool' };
  } catch (err) {
    console.error('wa tool failed:', block.name, err && err.message);
    return { error: 'That did not work just now. Apologise and use talk_to_person.' };
  }
}

// ── One incoming message ──────────────────────────────────────
const NON_TEXT_NOTE = type => `[The person sent a ${type === 'image' ? 'photo' : type === 'audio' ? 'voice note' : type === 'document' ? 'document' : type} that this assistant cannot read.]`;

export async function handleMessage(env, request, m) {
  if (env.WA_BOT_ENABLED === '0') return { skipped: 'paused' };
  if (m.phoneNumberId && m.phoneNumberId !== phoneId(env)) return { skipped: 'other number' };
  const waId = String(m.from || '').replace(/\D/g, '');
  if (!waId) return { skipped: 'no sender' };

  let chat = await loadChat(env, waId);
  const now = Date.now();
  if (chat && (chat.seen || []).includes(m.id)) return { skipped: 'duplicate' }; // Meta retries deliveries
  // No AI key yet (or AI switched off): a free tap-button menu does the essentials
  if (!env.ANTHROPIC_API_KEY || env.WA_AI_ENABLED === '0') return handleMenu(env, request, m, waId, chat);
  const fresh = !chat || now - new Date(chat.updated_at).getTime() > SESSION_GAP_MS || (chat.messages || []).length > MAX_TURN_MESSAGES;
  if (fresh) {
    chat = { wa_id: waId, name: m.profileName || (chat && chat.name) || '', started_at: new Date().toISOString(), messages: [],
      seen: (chat && chat.seen) || [], case_ref: chat && chat.case_ref, case_id: chat && chat.case_id, handoffs: 0, track_fails: 0 };
  }
  chat.seen = [...(chat.seen || []), m.id].slice(-40);
  if (m.profileName) chat.name = m.profileName;
  markRead(env, m.id);

  let text = m.type === 'text' ? String(m.text && m.text.body || '') : m.type === 'button' ? String(m.button && m.button.text || '')
    : m.type === 'interactive' ? String((m.interactive && (m.interactive.button_reply || m.interactive.list_reply) || {}).title || '') : NON_TEXT_NOTE(m.type);
  text = text.slice(0, 2000);
  // First message of a chat: a one-line notice the assistant must include (privacy)
  const firstNote = fresh && !(chat.greeted) ? '\n\n[System note: this is the first message of this chat. In your reply, briefly say you are Awal Global Consults\' automated assistant, that a person is available on request, and that we handle their details under our privacy policy at awalglobal.com.ng/privacy-policy.]' : '';
  chat.greeted = true;
  chat.messages.push({ role: 'user', content: [{ type: 'text', text: (chat.name && fresh ? `[WhatsApp name: ${chat.name}] ` : '') + text + firstNote }] });

  let reply = '';
  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const res = await askClaude(env, chat.messages);
    chat.messages.push({ role: 'assistant', content: res.content });
    if (res.stop_reason === 'tool_use') {
      const results = [];
      for (const block of res.content.filter(b => b.type === 'tool_use')) {
        results.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(await runTool(env, request, chat, block)) });
      }
      chat.messages.push({ role: 'user', content: results });
      continue;
    }
    if (res.stop_reason === 'refusal') reply = `Sorry, I can't help with that here. You can reach a colleague on WhatsApp at ${HUMAN_WHATSAPP}.`;
    else reply = textOf(res.content);
    break;
  }
  if (!reply) reply = `Thanks for your message. A colleague will get back to you shortly, or message us at ${HUMAN_WHATSAPP}.`;
  await saveChat(env, chat);
  await sendText(env, waId, reply);
  return { replied: true };
}

/** Daily clean-up: delete chats idle for more than 30 days (NDPA: keep personal data no longer than needed). */
export async function purgeOldChats(env, now = new Date()) {
  if (!env.DOCS) return 0;
  const cutoff = now.getTime() - 30 * 86400000;
  let cursor, removed = 0;
  do {
    const list = await env.DOCS.list({ prefix: 'wa/chat/', cursor, include: ['customMetadata'] });
    for (const o of list.objects) {
      const updated = new Date((o.customMetadata && o.customMetadata.updated) || o.uploaded).getTime();
      if (updated < cutoff) { await env.DOCS.delete(o.key); removed++; }
    }
    cursor = list.truncated ? list.cursor : null;
  } while (cursor);
  return removed;
}


// ── Menu mode (no AI): quotation, tracking, a person ───────────
const MENU = [['quote', 'Get a quotation'], ['track', 'Track application'], ['person', 'Talk to a person']];
const MENU_SERVICES = [
  ['svc_bn', 'Business name', 'Register a business name with CAC', ['Business Name Registration']],
  ['svc_ltd', 'Limited company', 'Register a private limited company', ['Limited Company Registration']],
  ['svc_ngo', 'NGO / church / trustees', 'Incorporated trustees', ['Incorporated Trustees / NGO']],
  ['svc_post', 'CAC changes & returns', 'Annual returns, directors, shares, name or address changes', ['Post-Incorporation Changes & Compliance']],
  ['svc_tax', 'TIN, tax & VAT', 'TIN, tax filing, VAT, tax clearance', ['TIN Registration & Validation', 'Tax Clearance & VAT Filing']],
  ['svc_scuml', 'SCUML', 'SCUML (AML) registration', ['SCUML Registration']],
  ['svc_tm', 'Trademark', 'Protect your brand name or logo', ['Intellectual Property Registration']],
  ['svc_ndpc', 'Data protection (NDPC)', 'NDPC registration or audit return', ['NDPC Registration (Data Controller / Processor)']],
  ['svc_id', 'Passport or NIN', 'E-passport, NIN registration or correction', ['International Passport (E-passport)', 'NIN Registration & Correction']],
  ['svc_other', 'Something else', 'Licences, legal documents, visas, other', ['Business Advisory']]
];
const HOURS = 'Office hours: Mon to Fri 10am to 4pm, Sat 10am to 1pm (Lagos).';

async function showMenu(env, waId, chat, lead) {
  chat.menu_state = null;
  await sendButtons(env, waId, `${lead ? lead + '\n\n' : ''}How can we help? Tap an option below.\n\n${HOURS}\nFree 20-minute call: https://awalglobal.com.ng/book`, MENU);
}

async function handleMenu(env, request, m, waId, chat) {
  const fresh = !chat || Date.now() - new Date(chat.updated_at).getTime() > SESSION_GAP_MS;
  if (!chat) chat = { wa_id: waId, name: '', started_at: new Date().toISOString(), messages: [], seen: [] };
  if (fresh) chat.menu_state = null;
  chat.seen = [...(chat.seen || []), m.id].slice(-40);
  if (m.profileName) chat.name = m.profileName;
  markRead(env, m.id);
  const pick = m.type === 'interactive' ? (m.interactive.button_reply || m.interactive.list_reply || {}).id
    : m.type === 'button' ? m.button && m.button.payload : null;
  const text = m.type === 'text' ? String(m.text && m.text.body || '').trim().slice(0, 500) : '';
  const st = chat.menu_state;
  const done = async () => { await saveChat(env, chat); return { replied: true, mode: 'menu' }; };

  if (/^(menu|start|hi|hello|good (morning|afternoon|evening)|cancel)$/i.test(text) || (!st && !pick)) {
    const intro = fresh ? `Hello${chat.name ? ' ' + chat.name.split(' ')[0] : ''}, welcome to *Awal Global Consults*: CAC registration, trademarks, tax, SCUML and compliance. This is our automated line; a person is available any time you need one. We handle your details under our privacy policy: awalglobal.com.ng/privacy-policy` : '';
    if (!pick && m.type !== 'text') await sendText(env, waId, 'I can only read text messages here. To send documents, use the secure upload link we email you, or tap *Talk to a person*.');
    await showMenu(env, waId, chat, intro);
    return done();
  }
  if (pick === 'person') {
    await toolHandoff(env, chat, { summary: `Asked for a person from the WhatsApp menu.${chat.last_text ? ' Last message: ' + chat.last_text : ''}`, urgent: false });
    await sendText(env, waId, `A colleague has been notified and will reach out to you. You can also chat with us directly on WhatsApp: ${HUMAN_WHATSAPP_LINK} (${HUMAN_WHATSAPP}). ${HOURS}`);
    chat.menu_state = null; return done();
  }
  if (pick === 'track') {
    await sendText(env, waId, `Track your application any time at ${SITE_URL}/track with your reference (like AGC-2026-0012) and the email address you applied with. Reply *menu* for other options.`);
    chat.menu_state = null; return done();
  }
  if (pick === 'quote') {
    if (chat.case_ref) { await sendText(env, waId, `We already have your quotation request *${chat.case_ref}* and will email the itemised quote within one working day. Reply *menu* for other options.`); return done(); }
    chat.menu_state = 'q_name'; chat.quote = {};
    await sendText(env, waId, 'Great. What is your *full name*?');
    return done();
  }
  if (st === 'q_name' && text) {
    if (text.length < 3) { await sendText(env, waId, 'Please type your full name.'); return done(); }
    chat.quote.full_name = text.slice(0, 120); chat.menu_state = 'q_email';
    await sendText(env, waId, 'Thanks. What *email address* should we send the quotation to?');
    return done();
  }
  if (st === 'q_email' && text) {
    if (!validEmail(text)) { await sendText(env, waId, 'That email address doesn\'t look right. Please check and type it again.'); return done(); }
    chat.quote.email = text.slice(0, 254); chat.menu_state = 'q_service';
    await sendList(env, waId, 'Which service do you need?', 'Choose a service', MENU_SERVICES.map(([id, t, d]) => [id, t, d]));
    return done();
  }
  if (st === 'q_service' && pick && pick.startsWith('svc_')) {
    const svc = MENU_SERVICES.find(x => x[0] === pick);
    chat.quote.services = svc[3]; chat.quote.label = svc[1]; chat.menu_state = 'q_details';
    await sendText(env, waId, pick === 'svc_other'
      ? 'Please describe briefly what you need (for example: NAFDAC registration, a tenancy agreement, a UK student visa).'
      : 'Anything we should know for the quote? For example the business type, number of directors or a deadline. Or reply *no*.');
    return done();
  }
  if (st === 'q_details' && text) {
    const details = /^(no|nope|none|nothing|n\/a|na)$/i.test(text) ? '' : `${chat.quote.label === 'Something else' ? 'Other service requested: ' : ''}${text}`;
    const res = await toolRequestQuote(env, request, chat, { ...chat.quote, details });
    chat.menu_state = null; chat.quote = null;
    if (res.error) await sendText(env, waId, `Sorry, I couldn't save that just now. Please message a colleague on ${HUMAN_WHATSAPP} (${HUMAN_WHATSAPP_LINK}).`);
    else await sendText(env, waId, `Thank you. Your reference is *${res.reference}*. We'll email your itemised quotation within one working day.\n\nWant to send your details and documents now? Use your private application link: ${res.full_application_link}\n\nReply *menu* for other options.`);
    return done();
  }
  if (st === 'q_service') {
    await sendList(env, waId, 'Please tap *Choose a service* and pick one from the list.', 'Choose a service', MENU_SERVICES.map(([id, t, d]) => [id, t, d]));
    return done();
  }
  // Anything else: remember it for the person who picks up, and show the options again
  chat.last_text = text.slice(0, 300);
  await showMenu(env, waId, chat, st ? 'Sorry, I didn\'t catch that.' : '');
  return done();
}
