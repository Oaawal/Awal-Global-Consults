/**
 * The admin dashboard as an installable app (PWA): manifest, service worker and
 * the small script that offers "Install" and "Turn on notifications".
 * Served from /admin/manifest.webmanifest, /admin/sw.js and /admin/app.js.
 *
 * Nothing from the dashboard is cached on the device: pages are always fetched
 * live, and an offline notice is shown when there is no connection.
 */

export const MANIFEST = JSON.stringify({
  name: 'Awal Case Manager',
  short_name: 'Awal Admin',
  description: 'Applications, enquiries, bookings and records for Awal Global Consults.',
  id: '/admin/',
  start_url: '/admin/',
  scope: '/admin/',
  display: 'standalone',
  orientation: 'portrait',
  background_color: '#0A2C48',
  theme_color: '#0A2C48',
  icons: [
    { src: '/assets/images/app/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: '/assets/images/app/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: '/assets/images/app/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
  ],
  shortcuts: [
    { name: 'Cases', url: '/admin/cases', icons: [{ src: '/assets/images/app/icon-192.png', sizes: '192x192' }] },
    { name: 'Records', url: '/admin/records', icons: [{ src: '/assets/images/app/icon-192.png', sizes: '192x192' }] }
  ]
});

export const SERVICE_WORKER = `
const OFFLINE = '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline</title>'
  + '<body style="margin:0;font-family:system-ui,sans-serif;background:#0A2C48;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center;padding:24px">'
  + '<div><h1 style="font-size:20px">You are offline</h1><p style="opacity:.8">Connect to the internet, then pull down or reopen the app.</p></div>';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

// Always go to the network; never store dashboard pages on the device.
self.addEventListener('fetch', e => {
  if (e.request.mode !== 'navigate') return;
  e.respondWith(fetch(e.request).catch(() => new Response(OFFLINE, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })));
});

self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { title: 'Awal Case Manager', body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Awal Case Manager', {
    body: d.body || '',
    icon: '/assets/images/app/icon-192.png',
    badge: '/assets/images/app/badge-mono-96.png',
    tag: d.tag || undefined,
    renotify: !!d.tag,
    data: { url: d.url || '/admin/' }
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || '/admin/', self.location.origin).href;
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of wins) {
      if (w.url.startsWith(self.location.origin + '/admin')) { await w.focus(); return w.navigate(url); }
    }
    return self.clients.openWindow(url);
  })());
});
`;

export const APP_SCRIPT = `
(function () {
  document.querySelectorAll('form[data-confirm]').forEach(f => f.addEventListener('submit', e => { if (!confirm(f.dataset.confirm)) e.preventDefault(); }));
  if (!('serviceWorker' in navigator)) return;
  const reg = navigator.serviceWorker.register('/admin/sw.js', { scope: '/admin/' });
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const pushSupported = 'PushManager' in window && 'Notification' in window;
  const panel = document.getElementById('app-panel');
  const settings = document.getElementById('push-settings');
  let installEvent = null;

  function b64ToBytes(s) {
    s = s.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(s + '==='.slice((s.length + 3) % 4));
    return Uint8Array.from(bin, c => c.charCodeAt(0));
  }
  async function post(url, body) {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}), credentials: 'same-origin' });
    if (!r.ok) throw new Error('Request failed');
    return r.json();
  }
  async function currentSub() {
    if (!pushSupported) return null;
    const r = await reg;
    return r.pushManager.getSubscription();
  }
  async function enablePush() {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') { alert('Notifications are blocked. Allow them for this app in your phone settings, then try again.'); return false; }
    const r = await reg;
    const { publicKey } = await (await fetch('/admin/push/key', { credentials: 'same-origin' })).json();
    let sub = await r.pushManager.getSubscription();
    if (!sub) sub = await r.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(publicKey) });
    await post('/admin/push/subscribe', sub.toJSON());
    return true;
  }
  async function disablePush() {
    const sub = await currentSub();
    if (sub) { await post('/admin/push/unsubscribe', { endpoint: sub.endpoint }); await sub.unsubscribe(); }
  }
  function dismissed() { try { return localStorage.getItem('agc_app_panel') === 'hide'; } catch (e) { return false; } }
  function dismiss() { try { localStorage.setItem('agc_app_panel', 'hide'); } catch (e) {} if (panel) panel.hidden = true; }

  function button(label, fn, cls) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'btn ' + (cls || 'primary') + ' sm'; b.textContent = label;
    b.addEventListener('click', async () => { b.disabled = true; try { await fn(); } catch (e) { alert('Something went wrong. Please try again.'); } b.disabled = false; render(); });
    return b;
  }

  async function render() {
    const sub = await currentSub().catch(() => null);
    const pushOn = !!sub && Notification.permission === 'granted';
    // Banner on every page until the app is installed and notifications are on
    if (panel) {
      panel.innerHTML = '';
      const needInstall = !isStandalone && (installEvent || isIOS);
      const needPush = pushSupported && !pushOn && (isStandalone || !isIOS);
      if ((needInstall || needPush) && !dismissed()) {
        const text = document.createElement('div');
        text.className = 'app-panel-text';
        text.innerHTML = needInstall
          ? (isIOS ? '<strong>Add the dashboard to your Home Screen</strong><span>Tap the Share button, then \\u201cAdd to Home Screen\\u201d. Open it from there to turn on notifications.</span>'
                   : '<strong>Install the dashboard as an app</strong><span>Open it from your home screen and get notified about new applications.</span>')
          : '<strong>Turn on notifications</strong><span>Get an alert on this device for every new application, enquiry and booking.</span>';
        panel.appendChild(text);
        const actions = document.createElement('div');
        actions.className = 'app-panel-actions';
        if (needInstall && installEvent) actions.appendChild(button('Install app', async () => { installEvent.prompt(); await installEvent.userChoice; installEvent = null; }));
        if (!needInstall && needPush) actions.appendChild(button('Turn on', enablePush));
        actions.appendChild(button('Not now', async () => dismiss(), 'ghost'));
        panel.appendChild(actions);
        panel.hidden = false;
      } else {
        panel.hidden = true;
      }
    }
    // Settings card on the Records page
    if (settings) {
      settings.innerHTML = '';
      const line = document.createElement('p');
      line.className = 'small';
      const row = document.createElement('div');
      row.className = 'app-panel-actions';
      if (!pushSupported) {
        line.innerHTML = isIOS && !isStandalone
          ? '<strong>Notifications on this device:</strong> add the dashboard to your Home Screen first (Share, then Add to Home Screen), then open it from there.'
          : '<strong>Notifications on this device:</strong> not supported by this browser.';
      } else if (pushOn) {
        line.innerHTML = '<strong>Notifications on this device:</strong> on';
        row.appendChild(button('Send a test', async () => { const r = await post('/admin/push/test'); alert(r.sent ? 'Test sent. It should arrive in a few seconds.' : 'No device received it. Try turning notifications off and on again.'); }, 'ghost'));
        row.appendChild(button('Turn off', disablePush, 'ghost'));
      } else {
        line.innerHTML = '<strong>Notifications on this device:</strong> off';
        row.appendChild(button('Turn on', enablePush));
      }
      settings.appendChild(line);
      settings.appendChild(row);
    }
  }

  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvent = e; render(); });
  window.addEventListener('appinstalled', () => { installEvent = null; render(); });
  render();
})();
`;
