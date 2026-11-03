const { chromium } = require('playwright');
const OUT = process.env.OUT || '.';
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 860 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('dialog', (d) => d.accept());
  await page.goto('http://localhost:8765/#example=button');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForTimeout(500);
  await page.click('#btnRun');
  await page.waitForTimeout(600);
  // натиснути кнопку (ковпачок)
  const cap = await page.$('.comp .cap');
  const bb = await cap.boundingBox();
  await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(500);
  const ledOn = await page.evaluate(() => { const s = Sim.App.engine.states; for (const [k, v] of s) if ('bright' in v) return v.bright; });
  await page.screenshot({ path: OUT + '/i-button-pressed.png' });
  await page.mouse.up();
  await page.waitForTimeout(400);
  const ledOff = await page.evaluate(() => { const s = Sim.App.engine.states; for (const [k, v] of s) if ('bright' in v) return v.bright; });
  console.log('LED pressed bright', ledOn, 'released', ledOff);
  console.log('SERIAL', JSON.stringify(await page.$eval('#serialOut', (e) => e.textContent)));

  // новий порожній проєкт, додати світлодіод і резистор, з'єднати мишею
  await page.click('#btnNew');
  await page.waitForTimeout(400);
  await page.click('.pal-item[data-type="led"]');
  await page.click('.pal-item[data-type="resistor"]');
  await page.waitForTimeout(200);
  const pinScreen = async (ref) => page.evaluate((ref) => {
    const sc = Sim.App.schem; const p = sc.pinPos(ref); const r = sc.svg.getBoundingClientRect();
    return { x: r.left + (p.x - sc.view.x) * sc.view.s, y: r.top + (p.y - sc.view.y) * sc.view.s };
  }, ref);
  const ids = await page.evaluate(() => Sim.App.project.components.map((c) => c.id));
  const [led, res] = ids;
  const conn = async (a, b) => { const pa = await pinScreen(a); const pb = await pinScreen(b); await page.mouse.click(pa.x, pa.y); await page.mouse.move(pb.x, pb.y, { steps: 5 }); await page.mouse.click(pb.x, pb.y); await page.waitForTimeout(100); };
  await conn('B:D13', res + ':A');
  await conn(res + ':B', led + ':A');
  await conn(led + ':K', 'B:GND_T');
  console.log('wires', await page.evaluate(() => Sim.App.project.wires.map((w) => w.a + '-' + w.b).join(', ')));
  // код з помилкою
  await page.evaluate(() => Sim.App.editor.set('void setup() {\n  pinMode(13, OUTPUT)\n  digitalWrite(13, HIGH);\n}\nvoid loop() {}\n'));
  await page.click('#btnRun');
  await page.waitForTimeout(400);
  console.log('ERRLOG', await page.$eval('#logList', (e) => e.innerText.split('\n').slice(-1)[0]));
  await page.screenshot({ path: OUT + '/i-compile-error.png' });
  await page.evaluate(() => Sim.App.editor.set('void setup() {\n  pinMode(13, OUTPUT);\n  digitalWrite(13, HIGH);\n}\nvoid loop() {}\n'));
  await page.click('#btnRun');
  await page.waitForTimeout(600);
  const st = await page.evaluate(() => { for (const [k, v] of Sim.App.engine.states) if ('bright' in v) return { b: v.bright, I: v.m.I }; });
  console.log('new LED', st);
  await page.screenshot({ path: OUT + '/i-new-circuit.png' });
  // потенціометр: перетягнути ручку
  await page.goto('http://localhost:8765/#example=pot');
  await page.evaluate(() => localStorage.clear()); await page.reload(); await page.waitForTimeout(500);
  await page.click('#btnRun'); await page.waitForTimeout(500);
  const knob = await page.$('.comp .knob');
  const kb = await knob.boundingBox();
  await page.mouse.move(kb.x + kb.width / 2, kb.y + kb.height / 2);
  await page.mouse.down();
  await page.mouse.move(kb.x + kb.width / 2, kb.y + kb.height / 2 + 120, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(600);
  console.log('pot pos', await page.evaluate(() => Sim.App.project.components.find((c) => c.type === 'pot').props.pos));
  console.log('SERIAL tail', JSON.stringify(await page.$eval('#serialOut', (e) => e.textContent.slice(-60))));
  // плоттер
  await page.click('.tab[data-tab="plot"]'); await page.waitForTimeout(800);
  await page.screenshot({ path: OUT + '/i-plot.png' });
  console.log('ERRORS', errors);
  await browser.close();
})();
