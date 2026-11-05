const { chromium } = require('playwright'); const path = require('path');
(async () => { const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1360, height: 1800 }, deviceScaleFactor: 2 });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type()==='error') errs.push(m.text()); });
  await p.goto('file://' + path.join(__dirname, process.argv[2] || 'sheet.html')); await p.waitForTimeout(800);
  await p.evaluate(() => window.renderSheet()); await p.locator('#c').screenshot({ path: path.join(__dirname, 'renders', process.argv[3] || 'pose-sheet.png') });
  console.log('ERR', errs.join('\n')); await b.close(); })();
