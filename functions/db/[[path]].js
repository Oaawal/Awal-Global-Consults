// Keeps the database schema notes in /db out of public reach.
export function onRequest() {
  return new Response('Not found', { status: 404 });
}
