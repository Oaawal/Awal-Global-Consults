/** GET /validate-email?email=... : live check used by the forms as visitors type. */
import { checkEmail } from './_lib/email-check.js';

export async function onRequestGet({ request }) {
  const email = new URL(request.url).searchParams.get('email') || '';
  const result = await checkEmail(email.slice(0, 254));
  return new Response(JSON.stringify({ ok: result.ok, reason: result.reason || null, suggestion: result.suggestion || null }), {
    headers: { 'content-type': 'application/json', 'cache-control': 'private, max-age=300' }
  });
}
