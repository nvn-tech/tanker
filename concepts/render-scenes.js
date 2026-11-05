const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto('file://' + path.join(__dirname, 'render.html'));
  await p.waitForTimeout(1500);
  for (const n of (process.argv[2] || 'paper,ink,pulp,doodle').split(',')) {
    await p.evaluate((n) => window.renderConcept(n), n);
    await p.locator('#c').screenshot({ path: path.join(__dirname, 'renders', n + '.png') });
  }
  const fonts = await p.evaluate(() => [...document.fonts].filter(f => f.status === 'loaded').map(f => f.family).filter((v, i, a) => a.indexOf(v) === i));
  console.log('fonts', fonts.join(', '));
  console.log('ERR', errs.join('\n'));
  await b.close();
})();
