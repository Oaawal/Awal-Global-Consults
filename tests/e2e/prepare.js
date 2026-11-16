// Makes the larger test files that are not stored in the repository (a ~4MB photo for the
// "shrink photos to the size limit" checks), using the test browser's canvas.
const { chromium } = require('playwright'); const fs = require('fs'); const S = process.argv[2];
(async () => {
  if (fs.existsSync(S + '/bigphoto.jpg')) return;
  const b = await chromium.launch(); const p = await b.newPage();
  const dataUrl = await p.evaluate(() => {
    const c = document.createElement('canvas'); c.width = 2400; c.height = 1800; const x = c.getContext('2d');
    const img = x.createImageData(2400, 1800); for (let i = 0; i < img.data.length; i++) img.data[i] = (i % 4 === 3) ? 255 : Math.random() * 255;
    x.putImageData(img, 0, 0); return c.toDataURL('image/jpeg', 0.95);
  });
  fs.writeFileSync(S + '/bigphoto.jpg', Buffer.from(dataUrl.split(',')[1], 'base64'));
  await b.close();
})();
