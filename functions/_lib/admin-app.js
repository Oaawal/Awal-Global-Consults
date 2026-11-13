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
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

// No fetch handler on purpose: pages and form posts go straight to the network (nothing is stored
// on the device), and the browser doesn't have to wake this worker before every page load, which
// made the installed app slow to open. The worker is only for notifications.

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

  // Quotation / invoice form: live totals with the discount (same rules as the server)
  document.querySelectorAll('form.bill-form').forEach(form => {
    const out = form.querySelector('.disc-preview');
    if (!out) return;
    const rate = Number(form.dataset.vat || 0) / 100;
    const num = v => Math.round(Number(String(v || '').replace(/[^0-9.]/g, '')) || 0);
    const naira = n => '₦' + Math.round(n).toLocaleString('en-NG');
    const update = () => {
      let fees = 0, gov = 0;
      for (let i = 0; i < 20; i++) {
        const d = form.elements['desc_' + i]; if (!d || !d.value.trim()) continue;
        const amt = Math.max(1, num(form.elements['qty_' + i].value)) * num(form.elements['unit_' + i].value);
        if (form.elements['gov_' + i] && form.elements['gov_' + i].checked) gov += amt; else fees += amt;
      }
      const vatOf = d => Math.round((fees - d) * rate);
      const target = num(form.elements.discount_total.value), raw = form.elements.discount.value;
      let disc = 0;
      if (form.elements.discount_total.value.trim() && target > 0) {
        disc = Math.round(fees - (target - gov) / (1 + rate));
        for (let k = 0; k < 3; k++) disc += (fees + gov - disc + vatOf(disc)) - target;
      } else if (/%/.test(raw)) disc = Math.round(fees * Math.min(100, num(raw)) / 100);
      else disc = num(raw);
      const capped = disc > fees;
      disc = Math.max(0, Math.min(fees, disc));
      const total = fees + gov - disc + vatOf(disc);
      out.innerHTML = 'Your fees ' + naira(fees) + ' · Government fees ' + naira(gov) +
        (disc ? ' · Discount −' + naira(disc) + (fees ? ' (' + (Math.round(disc * 1000 / fees) / 10) + '% of your fees)' : '') : '') +
        (rate ? ' · VAT ' + naira(vatOf(disc)) : '') + '<br><strong>Client pays ' + naira(total) + '</strong>' +
        (capped ? '<br><span style="color:#b42318">The discount can’t be more than your fees: government fees are always charged in full.</span>' : '');
    };
    form.addEventListener('input', update);
    form.addEventListener('change', update);
    update();
  });

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

// Filing pack tab: copy buttons, "Copy all", and one zip of the documents renamed for the portal
// (photos over the size limit are shrunk here in the browser, so the server does no image work).
// Written without template literals so it can sit inside String.raw.
export const FILING_SCRIPT = String.raw`
(function () {
  function flash(btn, text) { var old = btn.innerHTML; btn.textContent = text; setTimeout(function () { btn.innerHTML = old; }, 1400); }
  function copyText(text, btn) {
    var done = function () { flash(btn, 'Copied'); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function () { fallback(); });
    else fallback();
    function fallback() { var t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); done(); } catch (e) {} t.remove(); }
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-copy]');
    if (b) { copyText(b.getAttribute('data-copy'), b); return; }
    var all = e.target.closest('[data-copy-all]');
    if (all) {
      var box = document.getElementById(all.getAttribute('data-copy-all'));
      if (!box) return;
      var lines = Array.prototype.map.call(box.querySelectorAll('.fp-row'), function (r) {
        var l = r.querySelector('.fp-label').firstChild.textContent.trim();
        return l + ': ' + r.querySelector('[data-copy]').getAttribute('data-copy');
      });
      copyText(lines.join('\n'), all);
    }
  });

  var zipBtn = document.getElementById('fp-zip');
  if (!zipBtn) return;
  var status = document.getElementById('fp-zip-status');
  var limitSel = document.getElementById('fp-limit');
  try { var saved = localStorage.getItem('agc_fp_limit'); if (saved) limitSel.value = saved; } catch (e) {}
  limitSel.addEventListener('change', function () { try { localStorage.setItem('agc_fp_limit', limitSel.value); } catch (e) {} });

  var CRC = (function () { var t = new Uint32Array(256); for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(u8) { var c = 0xFFFFFFFF; for (var i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  // Stored (uncompressed) zip: documents are already compressed formats
  function makeZip(files) {
    var enc = new TextEncoder(), parts = [], central = [], offset = 0;
    var d = new Date(), dosTime = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), dosDate = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    files.forEach(function (f) {
      var name = enc.encode(f.name), crc = crc32(f.data), size = f.data.length;
      var h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
      h.setUint16(10, dosTime, true); h.setUint16(12, dosDate, true); h.setUint32(14, crc, true); h.setUint32(18, size, true); h.setUint32(22, size, true);
      h.setUint16(26, name.length, true); h.setUint16(28, 0, true);
      parts.push(new Uint8Array(h.buffer), name, f.data);
      var cd = new DataView(new ArrayBuffer(46));
      cd.setUint32(0, 0x02014b50, true); cd.setUint16(4, 20, true); cd.setUint16(6, 20, true); cd.setUint16(8, 0x0800, true); cd.setUint16(10, 0, true);
      cd.setUint16(12, dosTime, true); cd.setUint16(14, dosDate, true); cd.setUint32(16, crc, true); cd.setUint32(20, size, true); cd.setUint32(24, size, true);
      cd.setUint16(28, name.length, true); cd.setUint32(42, offset, true);
      central.push(new Uint8Array(cd.buffer), name);
      offset += 30 + name.length + size;
    });
    var cdSize = central.reduce(function (t, p) { return t + p.length; }, 0);
    var end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
    end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
    return new Blob(parts.concat(central, [new Uint8Array(end.buffer)]), { type: 'application/zip' });
  }
  // Shrink a photo to under the limit: lower JPEG quality, then smaller dimensions
  async function shrink(blob, limit) {
    var bmp = await createImageBitmap(blob);
    var w = bmp.width, h = bmp.height, scale = Math.min(1, 2000 / Math.max(w, h));
    for (var round = 0; round < 8; round++) {
      var cv = document.createElement('canvas'); cv.width = Math.round(w * scale); cv.height = Math.round(h * scale);
      var ctx = cv.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height); ctx.drawImage(bmp, 0, 0, cv.width, cv.height);
      for (var q = 0.9; q >= 0.5; q -= 0.1) {
        var out = await new Promise(function (res) { cv.toBlob(res, 'image/jpeg', q); });
        if (out && out.size <= limit) return out;
      }
      scale *= 0.8;
    }
    return null;
  }
  zipBtn.addEventListener('click', async function () {
    var items = Array.prototype.slice.call(document.querySelectorAll('.fp-doc'));
    var limit = Number(limitSel.value) || 0, files = [], notes = [];
    zipBtn.disabled = true;
    try {
      for (var i = 0; i < items.length; i++) {
        var el = items[i], name = el.getAttribute('data-doc-name');
        status.textContent = 'Preparing ' + (i + 1) + ' of ' + items.length + '…';
        var r = await fetch('/admin/doc/' + el.getAttribute('data-doc-id'), { credentials: 'same-origin' });
        if (!r.ok) { notes.push(name + ' could not be fetched'); continue; }
        var blob = await r.blob();
        if (limit && blob.size > limit) {
          if (/\.(jpg|jpeg|png)$/i.test(name)) {
            var small = await shrink(blob, limit).catch(function () { return null; });
            if (small) { blob = small; name = name.replace(/\.(png|jpeg)$/i, '.jpg'); }
            else notes.push(name + ' is still over the limit');
          } else notes.push(name + ' is over the limit (PDF not changed)');
        }
        files.push({ name: name, data: new Uint8Array(await blob.arrayBuffer()) });
      }
      var zip = makeZip(files);
      var a = document.createElement('a'); a.href = URL.createObjectURL(zip); a.download = zipBtn.getAttribute('data-zip-name');
      document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
      status.textContent = 'Downloaded ' + files.length + ' file' + (files.length === 1 ? '' : 's') + '.' + (notes.length ? ' Check: ' + notes.join('; ') + '.' : '');
    } catch (e) {
      status.textContent = 'The zip could not be made: ' + (e && e.message || e) + '. Download the files one by one instead.';
    } finally { zipBtn.disabled = false; }
  });
})();
`;
