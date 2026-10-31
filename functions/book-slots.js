/** GET /book-slots?type=…: free consultation times for the next three weeks, grouped by Lagos date. */
import { CONSULT_TYPES, availableSlots, takenSlots, feeText } from './_lib/booking.js';

export async function onRequestGet({ request, env }) {
  const type = new URL(request.url).searchParams.get('type') || '';
  const headers = { 'content-type': 'application/json', 'cache-control': 'no-store' };
  if (!CONSULT_TYPES[type]) return new Response(JSON.stringify({ error: 'Unknown consultation type' }), { status: 400, headers });
  if (!env.DB) return new Response(JSON.stringify({ error: 'Booking is not available right now.' }), { status: 503, headers });
  const days = availableSlots(type, await takenSlots(env));
  return new Response(JSON.stringify({ type, minutes: CONSULT_TYPES[type].minutes, fee: feeText(type), days }), { headers });
}
