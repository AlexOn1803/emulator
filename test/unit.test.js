// Модульні тести (без браузера): node test/unit.test.js
for (const f of ['transpiler', 'boards', 'components', 'engine', 'runtime']) require('../js/' + f + '.js');
const Sim = globalThis.Sim;
const assert = require('assert');
const AF = Object.getPrototypeOf(async function () {}).constructor;
let passed = 0;
let failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log('  ✓', name); } catch (e) { failed++; console.log('  ✗', name, '\n    ', e.message); }
}

// виконує setup() і повертає виведення Serial
async function runSetup(board, code) {
  const e = new Sim.Engine();
  e.setProject({ board, components: [], wires: [] });
  let out = '';
  const rt = new Sim.Runtime(e, { serial: (s) => { out += s; }, log: () => {} });
  e.runtime = rt;
  const res = rt.compile(code);
  const names = res.apiNames.filter((n) => !res.topNames.has(n));
  const fn = new AF('__api', '__st', `var {${names.join(',')}} = __api;\n${res.code}\n;return {setup, loop};`);
  const api = rt.buildApi();
  rt.running = true;
  rt.t0 = performance.now();
  rt.lastYield = performance.now();
  const prog = await fn(api, {});
  await prog.setup();
  rt.running = false;
  return out.replace(/\r\n/g, '\n');
}
const compileErr = (code, board = 'uno') => {
  const e = new Sim.Engine();
  e.setProject({ board, components: [], wires: [] });
  const rt = new Sim.Runtime(e, {});
  e.runtime = rt;
  try { rt.compile(code); } catch (err) { return err; }
  return null;
};
function circuit(board, comps, wires, pins) {
  const e = new Sim.Engine();
  e.setProject({ board, components: comps.map((c) => Object.assign({ props: {} }, c, { props: Object.assign({}, Sim.Components[c.type].defaults, c.props) })), wires });
  e.runtime = { running: true, pins: new Map(Object.entries(pins || {}).map(([k, v]) => [+k, v])), checkInterrupts() {}, i2c: { sda: 18, scl: 19 }, lcds: new Map() };
  e.solve();
  return e;
}
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} ≠ ${b} ± ${tol}`);

(async () => {
  console.log('Транслятор і середовище виконання');
  await test('типи, переповнення, форматування Serial', async () => {
    const out = await runSetup('uno', `
float t = 23.456;
void setup() {
  Serial.begin(9600);
  int x = 40000; Serial.println(x);
  byte b = 300; Serial.println(b);
  Serial.println(7 / 2);
  Serial.println(t);
  Serial.println(t, 1);
  Serial.println(255, HEX);
  Serial.println(5, BIN);
  Serial.println('A');
  char c = 'B'; c++; Serial.println(c);
  byte k = 255; k++; Serial.println(k);
  unsigned long big = 4294967295; big = big + 2; Serial.println(big);
  Serial.println(sizeof(int));
  Serial.println(map(512, 0, 1023, 0, 255));
}
void loop() {}`);
    assert.strictEqual(out, ['-25536', '44', '3', '23.46', '23.5', 'FF', '101', 'A', 'C', '0', '1', '2', '127', ''].join('\n'));
  });
  await test('ESP32: int 32-бітний, printf, #ifdef', async () => {
    const out = await runSetup('esp32', `
#ifdef ESP32
#define NAME "esp32"
#else
#define NAME "other"
#endif
void setup() { Serial.begin(115200); int x = 40000; Serial.println(x); Serial.printf("%s %05.1f %d\\n", NAME, 3.14159, 7); }
void loop() {}`);
    assert.strictEqual(out, '40000\nesp32 003.1 7\n');
  });
  await test('масиви, String, char-буфери, static, enum', async () => {
    const out = await runSetup('uno', `
enum Mode { OFF, ON = 5, AUTO };
int vals[] = {3, 1, 2};
String s = "hello";
char buf[16];
int counter() { static int n = 0; n++; return n; }
void setup() {
  Serial.begin(9600);
  int total = 0;
  for (int i = 0; i < sizeof(vals) / sizeof(vals[0]); i++) total += vals[i];
  Serial.println(total);
  Serial.println(AUTO);
  s += '!'; s.toUpperCase(); Serial.println(s);
  Serial.println(s.length());
  Serial.println(s[1]);
  sprintf(buf, "n=%d", 42); Serial.println(buf);
  counter(); counter(); Serial.println(counter());
  String num = "123"; Serial.println(num.toInt() + 1);
}
void loop() {}`);
    assert.strictEqual(out, '6\n6\nHELLO!\n6\nE\nn=42\n3\n124\n');
  });
  await test('помилка: бракує ;', async () => {
    const e = compileErr('void setup() {\n  int x = 5\n  pinMode(13, OUTPUT);\n}\nvoid loop() {}');
    assert.ok(e && e.line === 2 && /;/.test(e.message), e && e.message);
  });
  await test('помилка: опечатка з підказкою', async () => {
    const e = compileErr('void setup() {\n  pinmode(13, OUTPUT);\n}\nvoid loop() {}');
    assert.ok(e && e.line === 2 && /pinMode/.test(e.message), e && e.message);
  });
  await test('помилка: WiFi на Uno', async () => {
    const e = compileErr('void setup() { WiFi.begin("a", "b"); }\nvoid loop() {}');
    assert.ok(e && /ESP/.test(e.message), e && e.message);
  });
  await test('помилка: незакрита дужка', async () => {
    const e = compileErr('void setup() {\n  if (1) {\n}\nvoid loop() {}');
    assert.ok(e && /дужк/.test(e.message), e && e.message);
  });
  await test('помилка: немає loop()', async () => {
    const e = compileErr('void setup() {}');
    assert.ok(e && /loop/.test(e.message));
  });

  console.log('Електрична модель');
  await test('LED + 220 Ом від 5 В ≈ 12 мА', async () => {
    const e = circuit('uno', [{ id: 'r', type: 'resistor', props: { r: 220 } }, { id: 'l', type: 'led', props: { color: 'red' } }],
      [{ a: 'B:D9', b: 'r:A' }, { a: 'r:B', b: 'l:A' }, { a: 'l:K', b: 'B:GND1' }], { 9: { mode: 'output', value: 1 } });
    near(e.states.get('l').m.I * 1000, 12.3, 0.3, 'струм');
    assert.strictEqual(e.warnings.size, 0);
  });
  await test('ШІМ 25% дає чверть струму', async () => {
    const e = circuit('uno', [{ id: 'r', type: 'resistor', props: { r: 220 } }, { id: 'l', type: 'led', props: { color: 'red' } }],
      [{ a: 'B:D9', b: 'r:A' }, { a: 'r:B', b: 'l:A' }, { a: 'l:K', b: 'B:GND1' }], { 9: { mode: 'output', value: 0, duty: 0.25 } });
    near(e.states.get('l').m.I * 1000, 3.08, 0.1, 'струм');
  });
  await test('LED без резистора — попередження', async () => {
    const e = circuit('uno', [{ id: 'l', type: 'led', props: { color: 'red' } }], [{ a: 'B:D9', b: 'l:A' }, { a: 'l:K', b: 'B:GND1' }], { 9: { mode: 'output', value: 1 } });
    assert.ok(e.states.get('l').m.I > 0.05);
    assert.ok([...e.warnings.values()].some((w) => /резистор/.test(w.msg)));
  });
  await test('NPN-ключ вмикає мотор', async () => {
    const comps = [{ id: 'q', type: 'npn' }, { id: 'rb', type: 'resistor', props: { r: 1000 } }, { id: 'm', type: 'motor', props: { vnom: 6 } }, { id: 'b', type: 'battery', props: { v: 6 } }];
    const wires = [{ a: 'B:D3', b: 'rb:A' }, { a: 'rb:B', b: 'q:B' }, { a: 'q:E', b: 'B:GND1' }, { a: 'b:N', b: 'B:GND2' }, { a: 'b:P', b: 'm:A' }, { a: 'm:B', b: 'q:C' }];
    let e = circuit('uno', comps, wires, { 3: { mode: 'output', value: 1 } });
    assert.ok(e.states.get('m').m.V > 4.5, 'мотор отримує напругу');
    e = circuit('uno', comps, wires, { 3: { mode: 'output', value: 0 } });
    near(e.states.get('m').m.V, 0, 0.01, 'вимкнено');
  });
  await test('кнопка з INPUT_PULLUP і «плаваючий» вхід', async () => {
    const e = circuit('uno', [{ id: 'b', type: 'button' }], [{ a: 'B:D2', b: 'b:A' }, { a: 'b:B', b: 'B:GND1' }], { 2: { mode: 'input_pullup' } });
    assert.strictEqual(e.readDigital(2), 1);
    e.states.get('b').pressed = true;
    e.dirty = true;
    assert.strictEqual(e.readDigital(2), 0);
    e.runtime.pins.get(2).mode = 'input';
    e.states.get('b').pressed = false;
    e.dirty = true;
    const reads = new Set();
    for (let i = 0; i < 40; i++) reads.add(e.readDigital(2));
    assert.strictEqual(reads.size, 2, 'випадкові значення');
  });
  await test('подільник на потенціометрі', async () => {
    const e = circuit('uno', [{ id: 'p', type: 'pot', props: { r: 10000, pos: 0.3 } }], [{ a: 'B:GND1', b: 'p:A' }, { a: 'p:B', b: 'B:5V' }, { a: 'p:W', b: 'B:A0' }]);
    near(e.readVoltage(14), 1.5, 0.01, 'напруга');
  });
  await test('коротке замикання 5V–GND', async () => {
    const e = circuit('uno', [], [{ a: 'B:5V', b: 'B:GND1' }]);
    assert.ok([...e.warnings.values()].some((w) => /коротке/i.test(w.msg)));
  });
  await test('IRF520 від 3.3 В відкривається лише частково', async () => {
    const comps = [{ id: 'f', type: 'mosfet', props: { model: 'IRF520' } }, { id: 'm', type: 'motor', props: { vnom: 6 } }, { id: 'b', type: 'battery', props: { v: 6 } }];
    const wires = [{ a: 'B:G18', b: 'f:G' }, { a: 'f:S', b: 'B:GND_A' }, { a: 'b:N', b: 'B:GND_A' }, { a: 'b:P', b: 'm:A' }, { a: 'm:B', b: 'f:D' }];
    const e = circuit('esp32', comps, wires, { 18: { mode: 'output', value: 1 } });
    assert.ok(e.states.get('m').m.V < 0.5, 'мотор отримує мало напруги: ' + e.states.get('m').m.V);
    const e2 = circuit('esp32', comps.map((c) => c.id === 'f' ? Object.assign({}, c, { props: { model: 'IRLZ44N' } }) : c), wires, { 18: { mode: 'output', value: 1 } });
    assert.ok(e2.states.get('m').m.V > 5.5, 'IRLZ44N відкритий повністю');
  });

  console.log(`\n${passed} пройдено, ${failed} не пройдено`);
  process.exit(failed ? 1 : 0);
})();
