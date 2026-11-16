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
