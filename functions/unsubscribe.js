/** GET /unsubscribe?t=…: one-click unsubscribe from the newsletter. */
import { publicPage } from './_lib/public-page.js';

export async function onRequestGet({ request, env }) {
  const token = new URL(request.url).searchParams.get('t') || '';
  const row = env.DB && token ? await env.DB.prepare('SELECT id, status FROM subscribers WHERE token = ?1').bind(token).first() : null;
  if (row && row.status !== 'unsubscribed') {
    const now = new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare("UPDATE subscribers SET status = 'unsubscribed', unsubscribed_at = ?2 WHERE id = ?1").bind(row.id, now),
      env.DB.prepare("INSERT INTO audit_log (at, actor, action, entity_type, entity_id, detail, ip) VALUES (?1, 'system:newsletter', 'subscriber.unsubscribed', 'subscriber', ?2, NULL, ?3)")
        .bind(now, row.id, request.headers.get('CF-Connecting-IP'))
    ]);
  }
  return publicPage({
    title: 'Unsubscribed', heading: 'You’ve been unsubscribed',
    body: '<p>You won’t receive Awal Guides updates any more. You can still read every guide on our website, and sign up again at any time.</p>',
    actions: [{ href: '/blog/', label: 'Go to Awal Guides' }]
  });
}

// Mail apps' one-click unsubscribe (RFC 8058) sends a POST to the same link
export const onRequestPost = onRequestGet;
