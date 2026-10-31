/** GET /subscribe-confirm?t=…: confirms a newsletter sign-up from the emailed link. */
import { publicPage } from './_lib/public-page.js';

export async function onRequestGet({ request, env }) {
  const token = new URL(request.url).searchParams.get('t') || '';
  const row = env.DB && token ? await env.DB.prepare('SELECT id, status FROM subscribers WHERE token = ?1').bind(token).first() : null;
  if (!row) {
    return publicPage({ title: 'Link not recognised', heading: 'This link isn’t valid', body: '<p>The confirmation link may be incomplete or out of date. You can sign up again on any Awal Guides page.</p>', actions: [{ href: '/blog/', label: 'Go to Awal Guides' }] }, 404);
  }
  if (row.status !== 'confirmed') {
    const now = new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare("UPDATE subscribers SET status = 'confirmed', confirmed_at = ?2, unsubscribed_at = NULL WHERE id = ?1").bind(row.id, now),
      env.DB.prepare("INSERT INTO audit_log (at, actor, action, entity_type, entity_id, detail, ip) VALUES (?1, 'system:newsletter', 'subscriber.confirmed', 'subscriber', ?2, NULL, ?3)")
        .bind(now, row.id, request.headers.get('CF-Connecting-IP'))
    ]);
  }
  return publicPage({
    title: 'Subscription confirmed', heading: 'You’re subscribed',
    body: '<p>Thank you. You’ll get new Awal Guides and important legal, tax and compliance updates by email, usually once a week. Every email has an unsubscribe link.</p>',
    actions: [{ href: '/blog/', label: 'Read the latest guides' }, { href: '/book', label: 'Book a consultation' }]
  });
}
