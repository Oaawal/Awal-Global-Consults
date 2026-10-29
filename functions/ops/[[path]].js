// Keeps the operations notes in /ops out of public reach.
export function onRequest() {
  return new Response('Not found', { status: 404 });
}
