/*
 * Електричний рушій симулятора.
 *
 * Схема перетворюється на систему рівнянь методом вузлових потенціалів
 * (Modified Nodal Analysis без ідеальних джерел — усі джерела мають
 * внутрішній опір, тому достатньо матриці провідностей G·V = I).
 * Нелінійні елементи (діоди, світлодіоди, транзистори) — кусково-лінійні:
 * система розв'язується повторно, поки стани елементів не стабілізуються.
 *
 * ШІМ (analogWrite) моделюється точно: період ділиться на інтервали, у
 * кожному з яких кожен ШІМ-пін або HIGH, або LOW; результати (струми,
 * напруги) усереднюються з вагами — так світлодіод плавно змінює яскравість,
 * а мотор — швидкість, як у реальності.
 */
(function (G) {
  'use strict';
  const Sim = (G.Sim = G.Sim || {});

  const LEAK = 1e-9;

  class MNA {
    constructor(n) {
      this.n = n;
      this.A = new Float64Array(n * n);
      this.b = new Float64Array(n);
      this.strong = new Float64Array(n);
    }
    addG(a, b, g) {
      const n = this.n;
      const A = this.A;
      if (a >= 0) { A[a * n + a] += g; if (g > 1e-7) this.strong[a] += g; }
      if (b >= 0) { A[b * n + b] += g; if (g > 1e-7) this.strong[b] += g; }
      if (a >= 0 && b >= 0) { A[a * n + b] -= g; A[b * n + a] -= g; }
    }
    addI(a, i) { if (a >= 0) this.b[a] += i; }
    // джерело напруги V (a — плюс, b — мінус) з послідовним опором R
    addVS(a, b, V, R) {
      const g = 1 / R;
      this.addG(a, b, g);
      this.addI(a, g * V);
      this.addI(b, -g * V);
    }
    // струм gm·(Vcp − Vcq − v0), що витікає з вузла p у вузол q
    addVCCS(p, q, cp, cq, gm, v0) {
      const n = this.n;
      const A = this.A;
      if (p >= 0) { if (cp >= 0) A[p * n + cp] += gm; if (cq >= 0) A[p * n + cq] -= gm; this.b[p] += gm * v0; }
      if (q >= 0) { if (cp >= 0) A[q * n + cp] -= gm; if (cq >= 0) A[q * n + cq] += gm; this.b[q] -= gm * v0; }
    }
    solve() {
      const n = this.n;
      if (n === 0) return new Float64Array(0);
      const A = this.A.slice();
      const b = this.b.slice();
      for (let c = 0; c < n; c++) {
        let piv = c;
        let best = Math.abs(A[c * n + c]);
        for (let r = c + 1; r < n; r++) {
          const v = Math.abs(A[r * n + c]);
          if (v > best) { best = v; piv = r; }
        }
        if (best < 1e-30) continue;
        if (piv !== c) {
          for (let k = 0; k < n; k++) { const t = A[c * n + k]; A[c * n + k] = A[piv * n + k]; A[piv * n + k] = t; }
          const t = b[c]; b[c] = b[piv]; b[piv] = t;
        }
        const d = A[c * n + c];
        for (let r = c + 1; r < n; r++) {
          const f = A[r * n + c] / d;
          if (f === 0) continue;
          for (let k = c; k < n; k++) A[r * n + k] -= f * A[c * n + k];
          b[r] -= f * b[c];
        }
      }
      const x = new Float64Array(n);
      for (let r = n - 1; r >= 0; r--) {
        let s = b[r];
        for (let k = r + 1; k < n; k++) s -= A[r * n + k] * x[k];
        const d = A[r * n + r];
        x[r] = Math.abs(d) < 1e-30 ? 0 : s / d;
      }
      return x;
    }
  }

  class Engine {
    constructor() {
      this.project = null;
      this.board = null;
      this.runtime = null;
      this.states = new Map();
      this.topoDirty = true;
      this.dirty = true;
      this.V = new Float64Array(0);
      this.warnings = new Map();
      this.logFn = null;
      this.pinReadState = new Map();
      this.pinCurrents = new Map();
      this.time = 0;
    }

    setProject(p) {
      this.project = p;
      this.board = Sim.Boards[p.board];
      this.topoDirty = true;
      this.dirty = true;
    }

    resetStates() {
      this.states.clear();
      this.dirty = true;
    }

    state(c) {
      let s = this.states.get(c.id);
      if (!s) {
        const def = Sim.Components[c.type];
        s = (def && def.init ? def.init(c) : {}) || {};
        s.m = {};
        this.states.set(c.id, s);
      }
      return s;
    }

    log(msg, kind) { if (this.logFn) this.logFn(msg, kind || 'warn'); }

    warn(key, msg, compId) {
      if (!this.warnings.has(key)) this.warnings.set(key, { msg, compId });
    }

    // ------------------------------------------------------------ топологія
    buildTopology() {
      const p = this.project;
      const b = this.board;
      const parent = new Map();
      const find = (k) => {
        if (!parent.has(k)) parent.set(k, k);
        let r = k;
        while (parent.get(r) !== r) r = parent.get(r);
        let x = k;
        while (parent.get(x) !== r) { const nx = parent.get(x); parent.set(x, r); x = nx; }
        return r;
      };
      const union = (a, c) => { const ra = find(a); const rc = find(c); if (ra !== rc) parent.set(ra, rc); };

      const byGpio = {};
      let gndKey = null;
      let v33Key = null;
      let v5Key = null;
      for (const pin of b.pins) {
        if (pin.kind === 'nc') continue;
        const k = 'B:' + pin.id;
        find(k);
        if (pin.kind === 'gnd') { if (gndKey) union(k, gndKey); else gndKey = k; }
        if (pin.kind === 'v33') { if (v33Key) union(k, v33Key); else v33Key = k; }
        if (pin.kind === 'v5' || pin.kind === 'vin') { if (v5Key) union(k, v5Key); else v5Key = k; }
        if (pin.gpio != null) {
          if (byGpio[pin.gpio]) union(k, byGpio[pin.gpio]); else byGpio[pin.gpio] = k;
        }
      }
      const compKeys = new Set();
      for (const c of p.components) {
        const def = Sim.Components[c.type];
        if (!def) continue;
        for (const pin of def.pins) { const k = c.id + ':' + pin.id; find(k); compKeys.add(k); }
      }
      const wired = new Set();
      for (const w of p.wires) {
        if (!parent.has(w.a) || !parent.has(w.b)) continue;
        union(w.a, w.b);
        wired.add(w.a);
        wired.add(w.b);
      }
      // які мережі потрібні (містять вивід компонента або дріт)
      const need = new Set();
      for (const k of compKeys) need.add(find(k));
      for (const k of wired) need.add(find(k));
      const gndRoot = gndKey ? find(gndKey) : null;
      const nodeOfRoot = new Map();
      let n = 0;
      for (const r of need) {
        if (r === gndRoot) nodeOfRoot.set(r, -1);
        else nodeOfRoot.set(r, n++);
      }
      this.nNodes = n;
      this.nodeOf = (k) => {
        if (!parent.has(k)) return null;
        const r = find(k);
        if (r === gndRoot) return -1;
        const v = nodeOfRoot.get(r);
        return v === undefined ? null : v;
      };
      this.compNodes = new Map();
      for (const c of p.components) {
        const def = Sim.Components[c.type];
        if (!def) continue;
        const nd = {};
        for (const pin of def.pins) nd[pin.id] = this.nodeOf(c.id + ':' + pin.id);
        this.compNodes.set(c.id, nd);
      }
      this.gpioNode = new Map();
      this.nodeGpios = Array.from({ length: n }, () => []);
      this.gndGpios = [];
      for (const g of Object.keys(byGpio)) {
        const gpio = +g;
        const node = this.nodeOf(byGpio[g]);
        this.gpioNode.set(gpio, node);
        if (node != null && node >= 0) this.nodeGpios[node].push(gpio);
        if (node === -1) this.gndGpios.push(gpio);
      }
      this.power = [];
      if (v5Key) this.power.push({ node: this.nodeOf(v5Key), V: 5, name: '5V/VIN', maxA: 0.5 });
      if (v33Key) this.power.push({ node: this.nodeOf(v33Key), V: 3.3, name: '3.3V', maxA: b.id === 'uno' ? 0.15 : 0.5 });
      this.netKey = (k) => (parent.has(k) ? find(k) : null);
      this.topoDirty = false;
      this.dirty = true;
    }

    // чи з'єднані два виводи (для I2C, сервоприводу тощо)
    sameNet(a, b) {
      if (this.topoDirty) this.buildTopology();
      const ra = this.netKey(a);
      return ra != null && ra === this.netKey(b);
    }

    gpiosOnNode(node) {
      if (node == null) return [];
      if (node === -1) return this.gndGpios;
      return this.nodeGpios[node] || [];
    }

    v(node) { return node == null || node < 0 ? 0 : this.Vcur[node]; }

    // ------------------------------------------------------------- розв'язок
    pinDrive(gpio, high) {
      // повертає {Vs, R} | {pull: R} | null
      const rt = this.runtime;
      if (!rt || !rt.running) return null;
      const st = rt.pins.get(gpio);
      if (!st) return null;
      const b = this.board;
      if (st.mode === 'output') {
        let Vs;
        if (st.dac != null) Vs = st.dac;
        else if (st.duty != null) Vs = high[gpio] ? b.vcc : 0;
        else Vs = st.value ? b.vcc : 0;
        return { Vs, R: b.rout };
      }
      if (st.mode === 'input_pullup') return { Vs: b.vcc, R: b.pullup, pull: true };
      if (st.mode === 'input_pulldown') return { Vs: 0, R: b.pullup, pull: true };
      return null;
    }

    stampBoard(m, high) {
      for (const pw of this.power) {
        if (pw.node != null && pw.node >= 0) m.addVS(pw.node, -1, pw.V, 0.05);
      }
      for (const [gpio, node] of this.gpioNode) {
        if (node == null || node < 0) continue;
        const d = this.pinDrive(gpio, high);
        if (d) m.addVS(node, -1, d.Vs, d.R);
      }
    }

    solveIfDirty() {
      if (this.dirty || this.topoDirty) this.solve();
    }

    solve(collect) {
      if (!this.project) return;
      if (this.topoDirty) this.buildTopology();
      const comps = this.project.components;
      const N = this.nNodes;
      const rt = this.runtime;
      // інтервали ШІМ
      const duties = new Set();
      if (rt && rt.running) {
        for (const [gpio, st] of rt.pins) {
          if (st.mode === 'output' && st.duty != null && st.dac == null && st.duty > 0 && st.duty < 1) {
            const node = this.gpioNode.get(gpio);
            if (node != null) duties.add(st.duty);
          }
        }
      }
      const ds = [...duties].sort((a, b) => a - b);
      const configs = [];
      let prev = 0;
      for (const d of ds) { if (d - prev > 1e-9) configs.push({ start: prev, w: d - prev }); prev = d; }
      if (1 - prev > 1e-9) configs.push({ start: prev, w: 1 - prev });
      if (!configs.length) configs.push({ start: 0, w: 1 });

      this.warnings = new Map();
      const Vavg = new Float64Array(N);
      const acc = new Map();
      const pinPeak = new Map();
      const pinAvg = new Map();
      const powerPeak = this.power.map(() => 0);
      const ctx = this.ctx || (this.ctx = this.makeCtx());

      for (const cfg of configs) {
        const high = {};
        if (rt && rt.running) {
          for (const [gpio, st] of rt.pins) if (st.duty != null) high[gpio] = st.duty >= 1 || st.duty > cfg.start + 1e-12;
        }
        let V = null;
        let m = null;
        for (let iter = 0; iter < 30; iter++) {
          m = new MNA(N);
          for (let k = 0; k < N; k++) m.addG(k, -1, LEAK);
          this.stampBoard(m, high);
          for (const c of comps) {
            const def = Sim.Components[c.type];
            if (!def || !def.stamp) continue;
            def.stamp(c, this.state(c), m, this.compNodes.get(c.id), ctx);
          }
          V = m.solve();
          this.Vcur = V;
          let changed = false;
          for (const c of comps) {
            const def = Sim.Components[c.type];
            if (!def || !def.update) continue;
            if (def.update(c, this.state(c), ctx, this.compNodes.get(c.id))) changed = true;
          }
          if (!changed) break;
        }
        this.mna = m;
        for (let k = 0; k < N; k++) Vavg[k] += V[k] * cfg.w;
        // струми пінів
        for (const [gpio, node] of this.gpioNode) {
          if (node == null) continue;
          const d = this.pinDrive(gpio, high);
          if (!d) continue;
          const I = (d.Vs - this.v(node)) / d.R;
          if (Math.abs(I) > Math.abs(pinPeak.get(gpio) || 0)) pinPeak.set(gpio, I);
          pinAvg.set(gpio, (pinAvg.get(gpio) || 0) + I * cfg.w);
        }
        this.power.forEach((pw, idx) => {
          if (pw.node == null) return;
          const I = pw.node === -1 ? pw.V / 0.05 : (pw.V - this.v(pw.node)) / 0.05;
          if (I > powerPeak[idx]) powerPeak[idx] = I;
        });
        for (const c of comps) {
          const def = Sim.Components[c.type];
          if (!def || !def.measure) continue;
          const r = def.measure(c, this.state(c), ctx, this.compNodes.get(c.id));
          if (!r) continue;
          let a = acc.get(c.id);
          if (!a) { a = {}; acc.set(c.id, a); }
          for (const key in r) a[key] = (a[key] || 0) + r[key] * cfg.w;
        }
      }
      this.V = Vavg;
      this.Vcur = Vavg;
      for (const c of comps) {
        const s = this.state(c);
        s.m = acc.get(c.id) || {};
        const def = Sim.Components[c.type];
        if (def && def.check) def.check(c, s, ctx, this.compNodes.get(c.id));
      }
      this.pinCurrents = pinAvg;
      this.checkBoard(pinPeak, powerPeak);
      this.dirty = false;
      if (rt && rt.running) rt.checkInterrupts();
    }

    checkBoard(pinPeak, powerPeak) {
      const b = this.board;
      for (const [gpio, I] of pinPeak) {
        const mA = Math.abs(I) * 1000;
        const node = this.gpioNode.get(gpio);
        if (node === -1 && mA > 1) {
          this.warn('short' + gpio, `Пін ${b.pinName(gpio)} з'єднано напряму з GND — коротке замикання! Струм ${mA.toFixed(0)} мА`);
        } else if (mA > b.pinMaxmA) {
          this.warn('pin' + gpio, `Перевантаження піна ${b.pinName(gpio)}: ${mA.toFixed(0)} мА (максимум ${b.pinMaxmA} мА). Додайте резистор або керуйте навантаженням через транзистор.`);
        }
      }
      this.power.forEach((pw, idx) => {
        const I = powerPeak[idx];
        if (pw.node === -1) this.warn('pshort' + idx, `Живлення ${pw.name} з'єднано напряму з GND — коротке замикання!`);
        else if (I > 3) this.warn('pshort' + idx, `Коротке замикання на лінії живлення ${pw.name}! Струм ${I.toFixed(1)} А`);
        else if (I > pw.maxA) this.warn('pover' + idx, `Перевантаження живлення ${pw.name}: ${(I * 1000).toFixed(0)} мА (максимум ${(pw.maxA * 1000).toFixed(0)} мА)`);
      });
      if (b.maxSafeV) {
        for (const [gpio, node] of this.gpioNode) {
          if (node == null || node < 0) continue;
          if (this.V[node] > b.maxSafeV + 0.05) {
            this.warn('hv' + gpio, `На пін ${b.pinName(gpio)} подано ${this.V[node].toFixed(1)} В — це більше за допустимі ${b.maxSafeV} В для ESP! Плата може вийти з ладу.`);
          }
        }
      }
    }

    makeCtx() {
      const eng = this;
      return {
        v: (node) => eng.v(node),
        get engine() { return eng; },
        get board() { return eng.board; },
        get runtime() { return eng.runtime; },
        warn: (key, msg, id) => eng.warn(key, msg, id),
        log: (msg, kind) => eng.log(msg, kind),
        gpiosOn: (node) => eng.gpiosOnNode(node),
      };
    }

    // кадр анімації
    frame(dt) {
      if (!this.project) return;
      this.time += dt;
      this.solve(true);
      const ctx = this.ctx;
      for (const c of this.project.components) {
        const def = Sim.Components[c.type];
        if (def && def.animate) def.animate(c, this.state(c), dt, ctx, this.compNodes.get(c.id));
      }
    }

    // ------------------------------------------------- читання пінів кодом
    pinVoltage(gpio) {
      this.solveIfDirty();
      const node = this.gpioNode.get(gpio);
      if (node == null) return null;
      return this.v(node);
    }

    isFloating(gpio) {
      const node = this.gpioNode.get(gpio);
      if (node == null) return true;
      if (node === -1) return false;
      const m = this.mna;
      return !m || m.strong[node] === 0;
    }

    readDigital(gpio) {
      this.solveIfDirty();
      const rt = this.runtime;
      const st = rt.pins.get(gpio);
      const node = this.gpioNode.get(gpio);
      const b = this.board;
      if (st && st.mode === 'output' && (node == null || node >= 0)) {
        if (node == null) return st.duty != null ? (st.duty >= 0.5 ? 1 : 0) : st.value;
      }
      if (node === undefined) return 0;
      if (node === -1) return 0;
      if (node == null) {
        if (st && st.mode === 'input_pullup') return 1;
        if (st && st.mode === 'input_pulldown') return 0;
        return Math.random() < 0.5 ? 1 : 0;
      }
      if ((!st || st.mode === 'input') && this.isFloating(gpio)) return Math.random() < 0.5 ? 1 : 0;
      const V = this.V[node];
      const prev = this.pinReadState.get(gpio) || 0;
      let r;
      if (V >= 0.6 * b.vcc) r = 1;
      else if (V <= 0.3 * b.vcc) r = 0;
      else r = prev;
      this.pinReadState.set(gpio, r);
      return r;
    }

    readVoltage(gpio) {
      this.solveIfDirty();
      const node = this.gpioNode.get(gpio);
      const st = this.runtime && this.runtime.pins.get(gpio);
      if (node == null || ((!st || st.mode === 'input') && node >= 0 && this.isFloating(gpio))) {
        // "плаваючий" вхід — випадковий шум
        this._noise = (this._noise || 0.3) + (Math.random() - 0.5) * 0.08;
        this._noise = Math.min(0.7, Math.max(0.1, this._noise));
        return this._noise * this.board.vcc;
      }
      return Math.max(0, this.v(node));
    }

    // I2C: чи підключено пристрій з адресою addr
    i2cDevice(addr) {
      if (!this.project) return null;
      for (const c of this.project.components) {
        const def = Sim.Components[c.type];
        if (def && def.i2c && def.i2cAddr(c) === addr && def.i2cOk(c, this.state(c), this)) return c;
      }
      return null;
    }

    // HC-SR04: тривалість імпульсу ECHO для піна gpio
    echoFor(gpio) {
      if (!this.project) return null;
      this.solveIfDirty();
      for (const c of this.project.components) {
        if (c.type !== 'ultrasonic') continue;
        const nd = this.compNodes.get(c.id);
        if (!nd) continue;
        if (!this.gpiosOnNode(nd.ECHO).includes(gpio)) continue;
        const s = this.state(c);
        const vcc = this.v(nd.VCC) - this.v(nd.GND);
        if (vcc < 3) return { us: 0, reason: 'nopower' };
        const trigGpios = this.gpiosOnNode(nd.TRIG);
        if (!trigGpios.length) return { us: 0, reason: 'notrig' };
        void s;
        return { us: c.props.distance * 58.3 };
      }
      return null;
    }
  }

  Sim.MNA = MNA;
  Sim.Engine = Engine;
})(typeof window !== 'undefined' ? window : globalThis);
