// Запуск: node test/browser.test.js <приклад> [мс]  (потрібен http-сервер на :8765)
const { chromium } = require('playwright');
const OUT = process.env.OUT || '.';
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  const list = (process.argv[2] || 'led-resistor').split(',');
  const wait = +(process.argv[3] || 2500);
  for (const ex of list) {
    await page.goto('http://localhost:8765/?t=' + Date.now() + '#example=' + ex);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForTimeout(500);
    if (process.env.BEFORE) await page.evaluate(process.env.BEFORE);
    await page.click('#btnRun');
    await page.waitForTimeout(wait);
    if (process.env.ACTION) { await page.evaluate(process.env.ACTION); await page.waitForTimeout(800); }
    await page.screenshot({ path: `${OUT}/shot-${ex}.png` });
    const serial = await page.$eval('#serialOut', (e) => e.textContent.slice(-300));
    const logs = await page.$eval('#logList', (e) => e.innerText.slice(-600));
    const warn = await page.$eval('#liveWarn', (e) => e.innerText);
    console.log('=====', ex);
    console.log('SERIAL:', JSON.stringify(serial));
    console.log('LOGS:', logs.replace(/\n/g, ' | '));
    if (warn) console.log('WARN:', warn);
  }
  console.log('ERRORS:', errors);
  await browser.close();
})();
