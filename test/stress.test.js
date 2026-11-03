const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1300, height: 800 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => d.accept());
  await page.goto('http://localhost:8765/#example=blink-builtin');
  await page.evaluate(() => localStorage.clear()); await page.reload(); await page.waitForTimeout(400);
  const codes = {
    tight: 'void setup(){ pinMode(13, OUTPUT); Serial.begin(9600); }\nunsigned long n = 0;\nvoid loop(){ digitalWrite(13, HIGH); digitalWrite(13, LOW); n++; if (n % 100000 == 0) Serial.println(n); }',
    whileTrue: 'void setup(){ Serial.begin(9600); Serial.println("start"); while(true){} }\nvoid loop(){}',
    busyWait: 'void setup(){ Serial.begin(9600); }\nvoid loop(){ unsigned long t = millis(); while (millis() - t < 500); Serial.println(millis()); }',
    recursion: 'int f(int x){ return f(x+1); }\nvoid setup(){ Serial.begin(9600); f(0); }\nvoid loop(){}',
    oob: 'int a[3];\nvoid setup(){ Serial.begin(9600); int x = a[10]; Serial.println(x); a[5][1] = 3; }\nvoid loop(){}',
  };
  for (const [name, code] of Object.entries(codes)) {
    await page.evaluate((c) => Sim.App.editor.set(c), code);
    await page.click('#btnRun');
    const t0 = Date.now();
    // кадри мають оновлюватись
    const frames = await page.evaluate(() => new Promise((res) => { let n = 0; const t = performance.now(); const f = () => { n++; if (performance.now() - t < 1000) requestAnimationFrame(f); else res(n); }; requestAnimationFrame(f); }));
    const serial = await page.$eval('#serialOut', (e) => e.textContent.trim().split('\n').slice(-2).join(' | '));
    const log = await page.evaluate(() => { const l = Sim.App.logs; return l[l.length - 1].msg; });
    if (await page.evaluate(() => Sim.App.runtime.running)) await page.click('#btnStop');
    await page.waitForTimeout(150);
    const running = await page.evaluate(() => Sim.App.runtime.running);
    console.log(name.padEnd(10), 'fps≈', frames, 'serial:', serial.slice(0, 60), '| log:', log.slice(0, 120), '| stopped:', !running, (Date.now() - t0) + 'ms');
  }
  console.log('errors', errors);
  await browser.close();
})();
