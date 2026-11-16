// Keeps the blog sources (including unpublished drafts) out of public reach.
export function onRequest() {
  return new Response('Not found', { status: 404 });
}
