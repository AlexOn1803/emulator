/*
 * Середовище виконання: реалізація Arduino API (pinMode, digitalWrite,
 * analogRead, Serial, Servo, LiquidCrystal_I2C, WiFi, ledc...) та запуск
 * транспільованої програми.
 */
(function (G) {
  'use strict';
  const Sim = (G.Sim = G.Sim || {});

  const STOP = { stop: true };
  const HIGH = 1;
  const LOW = 0;
  const MODES = { 0: 'input', 1: 'output', 2: 'input_pullup', 3: 'input_pulldown' };

  // ---------------------------------------------------------- типи значень
  class CChar extends Number {
    [Symbol.toPrimitive](hint) {
      const v = this.valueOf();
      return hint === 'string' ? String.fromCharCode(v & 255) : v;
    }
    toString() { return String.fromCharCode(this.valueOf() & 255); }
  }
  const chCache = new Map();
  function ch(code) {
    code = Number(code) | 0;
    let c = chCache.get(code);
    if (!c) { c = new CChar(code); chCache.set(code, c); }
    return c;
  }
  class FloatVal { constructor(v) { this.v = +v; } }

  function num(x) {
    if (x == null) return 0;
    if (typeof x === 'number') return x;
    if (typeof x === 'boolean') return x ? 1 : 0;
    if (x instanceof FloatVal) return x.v;
    if (typeof x === 'string') return parseFloat(x) || 0;
    return Number(x) || 0;
  }

  function cv(k, x) {
    x = num(x);
    if (!isFinite(x)) x = 0;
    x = Math.trunc(x);
    switch (k) {
      case 'i8': return (x << 24) >> 24;
      case 'u8': return x & 255;
      case 'i16': return (x << 16) >> 16;
      case 'u16': return x & 0xffff;
      case 'i32': return x | 0;
      case 'u32': return x >>> 0;
      default: return x;
    }
  }

  function fmtFloat(v, digits) {
    if (!isFinite(v)) return isNaN(v) ? 'nan' : v > 0 ? 'inf' : '-inf';
    return v.toFixed(digits);
  }

  // форматування як у Print::print
  function fmt(x, f) {
    if (x === undefined) return '';
    if (x === null) return '0';
    if (x instanceof CChar) return String.fromCharCode(x.valueOf() & 255);
    if (x instanceof FloatVal) return fmtFloat(x.v, f == null ? 2 : num(f));
    if (typeof x === 'boolean') return x ? '1' : '0';
    if (typeof x === 'number') {
      if (!Number.isInteger(x)) return fmtFloat(x, f == null ? 2 : num(f));
      if (f == null || f === 10) return String(x);
      const base = num(f);
      if (base === 16 || base === 2 || base === 8) return (x < 0 ? x >>> 0 : x).toString(base).toUpperCase();
      if (base >= 2 && base <= 36) return x.toString(base).toUpperCase();
      return String(x);
    }
    if (Array.isArray(x)) return x.map((c) => (typeof c === 'number' ? String.fromCharCode(c) : String(c))).join('').replace(/\0.*$/, '');
    return String(x);
  }

  function printf(f, args) {
    let i = 0;
    return String(f).replace(/%([-+ 0#]*)(\d+|\*)?(?:\.(\d+))?(hh|h|ll|l|z)?([diuxXfFeEgGsc%p])/g, (m, flags, width, prec, len, conv) => {
      if (conv === '%') return '%';
      let a = args[i++];
      let s;
      switch (conv) {
        case 'd': case 'i': s = String(Math.trunc(num(a))); break;
        case 'u': s = String(Math.trunc(num(a)) >>> 0); break;
        case 'x': s = (Math.trunc(num(a)) >>> 0).toString(16); break;
        case 'X': s = (Math.trunc(num(a)) >>> 0).toString(16).toUpperCase(); break;
        case 'f': case 'F': s = num(a).toFixed(prec == null ? 6 : +prec); break;
        case 'e': case 'E': s = num(a).toExponential(prec == null ? 6 : +prec); break;
        case 'g': case 'G': s = String(+num(a).toPrecision(prec == null ? 6 : +prec || 1)); break;
        case 'c': s = a instanceof CChar || typeof a === 'number' ? String.fromCharCode(num(a)) : String(a)[0] || ''; break;
        case 's': s = fmt(a); if (prec != null) s = s.slice(0, +prec); break;
        case 'p': s = '0x3ffb0000'; break;
        default: s = String(a);
      }
      if (flags.includes('+') && /[dif]/.test(conv) && num(a) >= 0) s = '+' + s;
      const w = width ? +width : 0;
      if (s.length < w) s = flags.includes('-') ? s.padEnd(w) : flags.includes('0') && !/[sc]/.test(conv) ? (s[0] === '-' ? '-' + s.slice(1).padStart(w - 1, '0') : s.padStart(w, '0')) : s.padStart(w);
      return s;
    });
  }

  // методи String (Arduino), яких немає в JS
  const SP = String.prototype;
  const defs = {
    toInt() { const m = /^\s*[-+]?\d+/.exec(String(this)); return m ? parseInt(m[0], 10) | 0 : 0; },
    toFloat() { const v = parseFloat(String(this)); return isNaN(v) ? 0 : v; },
    toDouble() { return SP.toFloat.call(this); },
    equals(o) { return String(this) === String(o); },
    equalsIgnoreCase(o) { return String(this).toLowerCase() === String(o).toLowerCase(); },
    compareTo(o) { const a = String(this); const b = String(o); return a < b ? -1 : a > b ? 1 : 0; },
    isEmpty() { return String(this).length === 0; },
    reserve() { return 1; },
    __charAt(i) { const s = String(this); return ch(i < s.length ? s.charCodeAt(i) : 0); },
    __toUpperCase() { return String(this).toUpperCase(); },
    __toLowerCase() { return String(this).toLowerCase(); },
    __trim() { return String(this).trim(); },
    __replace(a, b) { return String(this).split(fmt(a)).join(fmt(b)); },
    __remove(idx, count) { const s = String(this); return count == null ? s.slice(0, idx) : s.slice(0, idx) + s.slice(idx + count); },
    __concat(x) { return String(this) + fmt(x); },
    setCharAt(i, c) { void i; void c; },
    getBytes() { },
    toCharArray() { },
  };
  for (const [k, fn] of Object.entries(defs)) {
    if (!Object.prototype.hasOwnProperty.call(SP, k)) Object.defineProperty(SP, k, { value: fn, configurable: true, writable: true });
  }

  function arr(dims, zero) {
    const make = (d) => {
      const n = Math.max(0, num(dims[d]) | 0);
      const a = new Array(n);
      for (let i = 0; i < n; i++) a[i] = d + 1 < dims.length ? make(d + 1) : zero();
      return a;
    };
    return make(0);
  }
  function pad(init, dims, zero) {
    const fill = (a, d) => {
      const n = num(dims[d]) | 0;
      if (!Array.isArray(a)) a = [];
      for (let i = 0; i < n; i++) {
        if (d + 1 < dims.length) a[i] = fill(a[i], d + 1);
        else if (a[i] === undefined) a[i] = zero();
      }
      return a;
    };
    if (typeof init === 'string') return init;
    return fill(init, 0);
  }
  function sizeofArr(a, es) {
    if (typeof a === 'string') return a.length + 1;
    let n = 0;
    const walk = (x) => { if (Array.isArray(x)) x.forEach(walk); else n++; };
    walk(a);
    return n * es;
  }

  // детермінований генератор для randomSeed()
  function mulberry(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------------------------------------------------------------- Runtime
  class Runtime {
    constructor(engine, hooks) {
      this.engine = engine;
      this.hooks = hooks || {};
      this.running = false;
      this.pins = new Map();
      this.runId = 0;
      this.timers = new Set();
      this.lcds = new Map();
      this.i2c = { sda: 0, scl: 0 };
      this.interrupts = new Map();
      this.warnedOnce = new Set();
      this.serialIn = [];
      const ch2 = new MessageChannel();
      this._yq = [];
      ch2.port1.onmessage = () => { const f = this._yq.shift(); if (f) f(); };
      this._yport = ch2.port2;
    }

    get board() { return this.engine.board; }

    warnOnce(key, msg) {
      if (this.warnedOnce.has(key)) return;
      this.warnedOnce.add(key);
      if (this.hooks.log) this.hooks.log(msg, 'warn');
    }

    pin(gpio) {
      let st = this.pins.get(gpio);
      if (!st) {
        st = { mode: 'input', value: 0, duty: null, tone: 0, servo: null, dac: null };
        this.pins.set(gpio, st);
      }
      return st;
    }

    checkPin(gpio, what) {
      const b = this.board;
      if (typeof gpio !== 'number' || !Number.isInteger(gpio) || !b.gpioPins[gpio]) {
        this.warnOnce('nopin' + gpio + what, `${what}: піна ${gpio} не існує на платі ${b.name}`);
        return false;
      }
      return true;
    }

    sleep(ms) {
      return new Promise((res, rej) => {
        if (!this.running) { rej(STOP); return; }
        const t = { rej };
        t.id = setTimeout(() => { this.timers.delete(t); this.lastYield = performance.now(); if (this.running) res(); else rej(STOP); }, ms);
        this.timers.add(t);
      });
    }

    yieldNow() {
      return new Promise((res, rej) => {
        const t = { rej };
        this.timers.add(t);
        this._yq.push(() => { this.timers.delete(t); this.lastYield = performance.now(); if (this.running) res(); else rej(STOP); });
        this._yport.postMessage(0);
      });
    }

    // -------------------------------------------------------------- API
    buildApi() {
      const rt = this;
      const b = this.board;
      const eng = this.engine;
      const Vcc = b.vcc;
      let rnd = Math.random;
      let tickCount = 0;
      let usAcc = 0;
      let adcBits = b.adcBits;
      let pwmRange = (1 << b.pwmBits) - 1;
      let pwmRes8266 = 255;
      let interruptsOn = true;
      rt.interruptsOn = () => interruptsOn;

      const toGpio = (p) => { p = p instanceof CChar ? p.valueOf() : typeof p === 'number' ? p : num(p); return b.pinAlias && b.pinAlias[p] != null ? b.pinAlias[p] : p; };
      const isEsp32 = b.family === 'esp32';
      const isEsp8266 = b.family === 'esp8266';
      const isAvr = b.family === 'avr';

      const api = {};
      Object.assign(api, b.consts);
      Object.assign(api, {
        HIGH, LOW, INPUT: 0, OUTPUT: 1, INPUT_PULLUP: 2,
        RISING: 1, FALLING: 2, CHANGE: 3, NOT_AN_INTERRUPT: -1,
        DEC: 10, HEX: 16, OCT: 8, BIN: 2, LSBFIRST: 0, MSBFIRST: 1,
        PI: Math.PI, HALF_PI: Math.PI / 2, TWO_PI: Math.PI * 2, DEG_TO_RAD: Math.PI / 180, RAD_TO_DEG: 180 / Math.PI, EULER: Math.E,
        true: true, false: false,
      });
      if (b.pulldown) api.INPUT_PULLDOWN = 3;

      // ---------- службові функції транслятора
      api.__tick = () => {
        if (!rt.running) throw STOP;
        if ((++tickCount & 511) !== 0) return undefined;
        if (performance.now() - rt.lastYield > 24) return rt.yieldNow();
        return undefined;
      };
      api.__cv = cv;
      api.__ch = ch;
      api.__char = (x) => ch(cv('i8', x) & 255);
      api.__fl = (x) => new FloatVal(num(x));
      api.__ti = (x) => Math.trunc(num(x));
      api.__strcat = (s, x) => String(s) + (x instanceof CChar ? String.fromCharCode(x.valueOf() & 255) : fmt(x));
      api.__arr = arr;
      api.__pad = pad;
      api.__sizeof = sizeofArr;

      // ---------- цифрові піни
      api.pinMode = (p, mode) => {
        p = toGpio(p);
        if (!rt.checkPin(p, 'pinMode')) return;
        const m = MODES[num(mode)] || 'input';
        if (m === 'output' && b.inputOnly && b.inputOnly.includes(p)) rt.warnOnce('io' + p, `GPIO${p} на ${b.name} працює лише як вхід (не може бути OUTPUT)`);
        if (b.flashPins && b.flashPins.includes(p)) rt.warnOnce('flash' + p, `GPIO${p} на ESP8266 зайнятий флеш-пам'яттю — не використовуйте його`);
        const st = rt.pin(p);
        st.mode = m;
        if (m !== 'output') { st.duty = null; st.tone = 0; st.dac = null; }
        st.configured = true;
        eng.dirty = true;
      };
      api.digitalWrite = (p, v) => {
        p = toGpio(p);
        if (!rt.checkPin(p, 'digitalWrite')) return;
        const st = rt.pin(p);
        const val = num(v) ? 1 : 0;
        if (st.mode === 'output') {
          st.value = val;
          st.duty = null;
          st.dac = null;
          st.tone = 0;
        } else if (isAvr && st.mode !== 'output') {
          st.mode = val ? 'input_pullup' : 'input';
          if (!st.configured) rt.warnOnce('dwin' + p, `digitalWrite(${p}) викликано без pinMode(${p}, OUTPUT) — на AVR-платах (Uno, Micro) це лише вмикає слабкий підтягувальний резистор (світлодіод світитиметься ледь-ледь)`);
        } else {
          rt.warnOnce('dwin' + p, `digitalWrite(${p}) не працює: пін не налаштований як OUTPUT. Додайте pinMode(${p}, OUTPUT) у setup()`);
        }
        eng.dirty = true;
      };
      api.digitalRead = (p) => {
        p = toGpio(p);
        if (!rt.checkPin(p, 'digitalRead')) return 0;
        const st = rt.pin(p);
        if (st.mode === 'output' && st.duty == null) return st.value;
        return eng.readDigital(p);
      };

      // ---------- аналог
      api.analogRead = (p) => {
        p = p instanceof CChar ? p.valueOf() : num(p);
        if (b.analogMap && b.analogMap[p] != null) p = b.analogMap[p];
        if (!rt.checkPin(p, 'analogRead')) return 0;
        if (!b.adcPins.includes(p)) {
          rt.warnOnce('adc' + p, `analogRead(${p}): цей пін не має АЦП на платі ${b.name}`);
          return 0;
        }
        if (b.adc2Pins && b.adc2Pins.includes(p) && api.WiFi && api.WiFi._began) rt.warnOnce('adc2' + p, `GPIO${p} належить до ADC2, який не працює разом з Wi‑Fi на ${b.name}. Використайте піни ADC1.`);
        const V = eng.readVoltage(p);
        const max = (1 << adcBits) - 1;
        let ref = b.adcRef;
        if (isEsp8266) ref = 3.2;
        let r = Math.round((V / ref) * max);
        return Math.max(0, Math.min(max, r));
      };
      api.analogReadResolution = (bits) => { adcBits = Math.max(1, Math.min(16, num(bits))); };
      api.analogReference = () => {};
      api.analogSetAttenuation = () => {};
      api.analogSetPinAttenuation = () => {};
      api.ADC_11db = 3; api.ADC_6db = 2; api.ADC_2_5db = 1; api.ADC_0db = 0; api.DEFAULT = 1; api.INTERNAL = 3; api.EXTERNAL = 0;

      const setDuty = (p, duty) => {
        const st = rt.pin(p);
        st.mode = 'output';
        st.dac = null;
        st.tone = 0;
        st.servo = null;
        if (duty <= 0) { st.duty = null; st.value = 0; }
        else if (duty >= 1) { st.duty = null; st.value = 1; }
        else st.duty = duty;
        eng.dirty = true;
      };
      rt.setDuty = setDuty;
      api.analogWrite = (p, v) => {
        p = toGpio(p);
        if (!rt.checkPin(p, 'analogWrite')) return;
        v = num(v);
        const range = isEsp8266 ? pwmRes8266 : pwmRange;
        if (!b.pwmPins.includes(p)) {
          if (isAvr) rt.warnOnce('nopwm' + p, `Пін ${p} на ${b.name} не підтримує ШІМ (лише ${b.pwmDesc}) — analogWrite працює як digitalWrite`);
          setDuty(p, v >= range / 2 ? 1 : 0);
          return;
        }
        setDuty(p, Math.max(0, Math.min(range, v)) / range);
      };
      api.analogWriteResolution = (bits) => { pwmRange = (1 << num(bits)) - 1; pwmRes8266 = pwmRange; };
      api.analogWriteRange = (r) => { pwmRes8266 = num(r); };
      api.analogWriteFreq = () => {};
      api.analogWriteFrequency = () => {};

      // ---------- ESP32 LEDC / DAC / touch
      if (isEsp32) {
        const chans = new Map();
        const pinLedc = new Map();
        api.ledcSetup = (chn, freq, res) => { chans.set(num(chn), { freq: num(freq), res: num(res), pins: new Set(), duty: 0 }); return num(freq); };
        api.ledcAttachPin = (p, chn) => {
          p = toGpio(p);
          let c = chans.get(num(chn));
          if (!c) { c = { freq: 5000, res: 8, pins: new Set(), duty: 0 }; chans.set(num(chn), c); }
          c.pins.add(p);
          setDuty(p, 0);
        };
        api.ledcDetachPin = (p) => { for (const c of chans.values()) c.pins.delete(toGpio(p)); };
        api.ledcAttach = (p, freq, res) => { p = toGpio(p); pinLedc.set(p, { freq: num(freq), res: num(res) }); setDuty(p, 0); return true; };
        api.ledcAttachChannel = (p, freq, res, chn) => { api.ledcSetup(chn, freq, res); api.ledcAttachPin(p, chn); return true; };
        api.ledcDetach = (p) => { pinLedc.delete(toGpio(p)); return true; };
        api.ledcWrite = (x, duty) => {
          x = toGpio(x);
          duty = num(duty);
          if (pinLedc.has(x)) {
            const max = (1 << pinLedc.get(x).res) - 1;
            setDuty(x, Math.max(0, Math.min(1, duty / max)));
            return true;
          }
          const c = chans.get(x);
          if (!c) { rt.warnOnce('ledc' + x, `ledcWrite(${x}): канал/пін не налаштовано (ledcSetup + ledcAttachPin або ledcAttach)`); return false; }
          const max = (1 << c.res) - 1;
          for (const p of c.pins) setDuty(p, Math.max(0, Math.min(1, duty / max)));
          return true;
        };
        api.ledcWriteTone = (x, freq) => {
          x = toGpio(x);
          const pins = pinLedc.has(x) ? [x] : chans.has(x) ? [...chans.get(x).pins] : [];
          for (const p of pins) { const st = rt.pin(p); st.mode = 'output'; st.tone = num(freq); st.duty = num(freq) > 0 ? 0.5 : null; st.value = 0; }
          eng.dirty = true;
          return num(freq);
        };
        if (b.dacPins && b.dacPins.length) api.dacWrite = (p, v) => {
          p = toGpio(p);
          if (!b.dacPins.includes(p)) { rt.warnOnce('dac' + p, `dacWrite: ЦАП є лише на GPIO${b.dacPins.join(' і GPIO')}`); return; }
          const st = rt.pin(p);
          st.mode = 'output';
          st.duty = null;
          st.dac = (Math.max(0, Math.min(255, num(v))) / 255) * Vcc;
          eng.dirty = true;
        };
        if (b.touch) {
          api.touchRead = () => 60;
          api.hallRead = () => 0;
        }
        api.temperatureRead = () => 45.5;
      }

      // ---------- час
      api.millis = () => Math.floor(performance.now() - rt.t0) >>> 0;
      api.micros = () => Math.floor((performance.now() - rt.t0) * 1000) >>> 0;
      api.delay = (ms) => {
        ms = num(ms);
        if (!(ms > 0)) return rt.yieldNow();
        return rt.sleep(ms);
      };
      api.delayMicroseconds = (us) => {
        usAcc += num(us);
        if (usAcc >= 4000) { const ms = usAcc / 1000; usAcc = 0; return rt.sleep(ms); }
        return api.__tick();
      };
      api.yield = () => rt.yieldNow();

      // ---------- математика
      api.min = (a, b2) => (num(a) < num(b2) ? a : b2);
      api.max = (a, b2) => (num(a) > num(b2) ? a : b2);
      api.abs = (x) => Math.abs(num(x));
      api.constrain = (x, a, b2) => (num(x) < num(a) ? a : num(x) > num(b2) ? b2 : x);
      api.map = (x, inMin, inMax, outMin, outMax) => {
        [x, inMin, inMax, outMin, outMax] = [x, inMin, inMax, outMin, outMax].map(num);
        if (inMax === inMin) return outMin;
        return Math.trunc(((x - inMin) * (outMax - outMin)) / (inMax - inMin)) + outMin;
      };
      api.sq = (x) => num(x) * num(x);
      for (const f of ['sqrt', 'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'exp', 'log', 'log10', 'floor', 'ceil']) api[f] = (x) => Math[f](num(x));
      api.pow = (a, b2) => Math.pow(num(a), num(b2));
      api.atan2 = (a, b2) => Math.atan2(num(a), num(b2));
      api.fabs = (x) => Math.abs(num(x));
      api.fmod = (a, b2) => num(a) % num(b2);
      api.round = (x) => { x = num(x); return x < 0 ? -Math.round(-x) : Math.round(x); };
      api.radians = (d) => (num(d) * Math.PI) / 180;
      api.degrees = (r) => (num(r) * 180) / Math.PI;
      api.isnan = (x) => isNaN(num(x));
      api.isinf = (x) => !isFinite(num(x)) && !isNaN(num(x));
      api.random = (a, b2) => {
        if (b2 === undefined) { b2 = num(a); a = 0; } else { a = num(a); b2 = num(b2); }
        if (b2 <= a) return a;
        return Math.floor(rnd() * (b2 - a)) + a;
      };
      api.randomSeed = (s) => { rnd = mulberry(num(s) || 1); };
      api.esp_random = () => Math.floor(Math.random() * 4294967296) >>> 0;
      api.bitRead = (x, n) => (num(x) >> num(n)) & 1;
      api.bitSet = (x, n) => num(x) | (1 << num(n));
      api.bitClear = (x, n) => num(x) & ~(1 << num(n));
      api.bitWrite = (x, n, v) => (num(v) ? num(x) | (1 << num(n)) : num(x) & ~(1 << num(n)));
      api.bit = (n) => 1 << num(n);
      api.lowByte = (x) => num(x) & 255;
      api.highByte = (x) => (num(x) >> 8) & 255;
      api.word = (h, l) => (l === undefined ? num(h) & 0xffff : ((num(h) & 255) << 8) | (num(l) & 255));
      api.isDigit = (c) => { c = num(c); return c >= 48 && c <= 57; };
      api.isAlpha = (c) => /[A-Za-z]/.test(String.fromCharCode(num(c)));
      api.isAlphaNumeric = (c) => /[A-Za-z0-9]/.test(String.fromCharCode(num(c)));
      api.isSpace = (c) => /\s/.test(String.fromCharCode(num(c)));
      api.isWhitespace = (c) => { c = num(c); return c === 32 || c === 9; };
      api.isUpperCase = (c) => { c = num(c); return c >= 65 && c <= 90; };
      api.isLowerCase = (c) => { c = num(c); return c >= 97 && c <= 122; };
      api.isPunct = (c) => /[!-/:-@[-`{-~]/.test(String.fromCharCode(num(c)));
      api.toUpperCase = (c) => ch(String.fromCharCode(num(c)).toUpperCase().charCodeAt(0));
      api.toLowerCase = (c) => ch(String.fromCharCode(num(c)).toLowerCase().charCodeAt(0));
      // рядки C (char-масиви)
      const cstr = (x) => fmt(x);
      const writeBuf = (buf, str) => {
        if (Array.isArray(buf)) {
          for (let k = 0; k < str.length; k++) buf[k] = str.charCodeAt(k) & 255;
          buf[str.length] = 0;
        }
        return str.length;
      };
      api.sprintf = (buf, f, ...a) => writeBuf(buf, printf(cstr(f), a));
      api.snprintf = (buf, n, f, ...a) => writeBuf(buf, printf(cstr(f), a).slice(0, Math.max(0, num(n) - 1)));
      api.dtostrf = (v, wd, pr, buf) => { writeBuf(buf, num(v).toFixed(num(pr)).padStart(Math.abs(num(wd)))); return buf; };
      api.itoa = (v, buf, base) => { writeBuf(buf, Math.trunc(num(v)).toString(num(base) || 10)); return buf; };
      api.ltoa = api.itoa;
      api.strlen = (x) => cstr(x).length;
      api.strcmp = (a, b2) => { a = cstr(a); b2 = cstr(b2); return a < b2 ? -1 : a > b2 ? 1 : 0; };
      api.strncmp = (a, b2, n) => api.strcmp(cstr(a).slice(0, num(n)), cstr(b2).slice(0, num(n)));
      api.strcpy = (d, src) => { writeBuf(d, cstr(src)); return d; };
      api.strncpy = (d, src, n) => { writeBuf(d, cstr(src).slice(0, num(n))); return d; };
      api.strcat = (d, src) => { writeBuf(d, cstr(d) + cstr(src)); return d; };
      api.atoi = (x) => parseInt(cstr(x), 10) || 0;
      api.atol = api.atoi;
      api.atof = (x) => parseFloat(cstr(x)) || 0;
      api.memset = (d, v, n) => { if (Array.isArray(d)) for (let k = 0; k < Math.min(d.length, num(n)); k++) d[k] = num(v); return d; };
      api.F = (s) => s;
      api.PSTR = (s) => s;
      api.String = (v, f) => {
        if (v === undefined) return '';
        if (typeof v === 'string') return v;
        if (typeof v === 'number' && f != null && !Number.isInteger(v)) return fmtFloat(v, num(f));
        if (v instanceof FloatVal) return fmtFloat(v.v, f == null ? 2 : num(f));
        return fmt(v, f);
      };

      // ---------- звук
      api.tone = (p, freq, dur) => {
        p = toGpio(p);
        if (!rt.checkPin(p, 'tone')) return;
        const st = rt.pin(p);
        st.mode = 'output';
        st.tone = num(freq);
        st.duty = 0.5;
        st.value = 0;
        st.dac = null;
        eng.dirty = true;
        if (st.toneTimer) { clearTimeout(st.toneTimer); st.toneTimer = null; }
        if (dur != null && num(dur) > 0) {
          st.toneTimer = setTimeout(() => { if (st.tone === num(freq)) api.noTone(p); }, num(dur));
        }
      };
      api.noTone = (p) => {
        p = toGpio(p);
        const st = rt.pin(p);
        st.tone = 0;
        st.duty = null;
        st.value = 0;
        eng.dirty = true;
      };

      // ---------- імпульси
      api.pulseIn = async (p, state, timeout) => {
        p = toGpio(p);
        timeout = timeout == null ? 1000000 : num(timeout);
        const echo = eng.echoFor(p);
        if (echo && echo.us > 0 && num(state) === HIGH) {
          if (echo.us > timeout) { await rt.sleep(timeout / 1000); return 0; }
          await rt.sleep(Math.max(1, echo.us / 1000));
          return Math.round(echo.us * (0.995 + Math.random() * 0.01));
        }
        if (echo && echo.reason === 'nopower') rt.warnOnce('usp', 'HC‑SR04 не має живлення — pulseIn() повертає 0');
        await rt.sleep(Math.min(timeout / 1000, 1000));
        return 0;
      };
      api.pulseInLong = api.pulseIn;
      api.shiftOut = () => {};
      api.shiftIn = () => 0;

      // ---------- переривання
      api.digitalPinToInterrupt = (p) => {
        p = toGpio(p);
        if (b.interruptPins) {
          for (const [k, v] of Object.entries(b.interruptPins)) if (v === p) return +k;
          return -1;
        }
        return p;
      };
      api.attachInterrupt = (n, fn, mode) => {
        n = num(n);
        const p = b.interruptPins ? b.interruptPins[n] : n;
        if (p == null || n < 0) { rt.warnOnce('int' + n, `attachInterrupt: на ${b.name} переривання працюють лише на пінах ${Object.values(b.interruptPins || {}).join(', ')}. Використовуйте digitalPinToInterrupt(пін).`); return; }
        if (typeof fn !== 'function') return;
        rt.interrupts.set(p, { fn, mode: num(mode), last: null });
      };
      api.detachInterrupt = (n) => { n = num(n); rt.interrupts.delete(b.interruptPins ? b.interruptPins[n] : n); };
      api.interrupts = () => { interruptsOn = true; };
      api.noInterrupts = () => { interruptsOn = false; };
      api.sei = api.interrupts;
      api.cli = api.noInterrupts;

      // ---------- Serial
      api.Serial = rt.makeSerial(api);
      api.Serial1 = api.Serial;
      if (b.serial2) api.Serial2 = api.Serial;

      // ---------- Wire / I2C
      rt.i2c = { sda: b.sda, scl: b.scl };
      api.Wire = {
        begin(sda, scl) {
          if (sda != null && scl != null && typeof sda === 'number' && !isAvr) rt.i2c = { sda: toGpio(sda), scl: toGpio(scl) };
          rt.wireBegun = true;
          return true;
        },
        setClock() {},
        beginTransmission(a) { this._addr = num(a); },
        write() { return 1; },
        endTransmission() { eng.solveIfDirty(); return eng.i2cDevice(this._addr) ? 0 : 2; },
        requestFrom() { return 0; },
        available() { return 0; },
        read() { return -1; },
      };

      // ---------- класи бібліотек
      api.Servo = class Servo {
        constructor() { this.pin = null; this.angle = 90; this.min = 544; this.max = 2400; }
        attach(p, mn, mx) {
          p = toGpio(p);
          if (!rt.checkPin(p, 'Servo.attach')) return 0;
          this.pin = p;
          if (mn != null) this.min = num(mn);
          if (mx != null) this.max = num(mx);
          const st = rt.pin(p);
          st.mode = 'output';
          st.servo = this.angle;
          st.duty = 0.075;
          st.dac = null;
          eng.dirty = true;
          return 1;
        }
        write(a) {
          a = num(a);
          if (a >= 544) { this.writeMicroseconds(a); return; }
          this.angle = Math.max(0, Math.min(180, a));
          if (this.pin != null) { const st = rt.pin(this.pin); st.servo = this.angle; st.duty = (0.5 + this.angle / 180 * 2) / 20; }
        }
        writeMicroseconds(us) {
          us = Math.max(this.min, Math.min(this.max, num(us)));
          this.write(((us - this.min) / (this.max - this.min)) * 180);
        }
        read() { return Math.round(this.angle); }
        readMicroseconds() { return Math.round(this.min + (this.angle / 180) * (this.max - this.min)); }
        attached() { return this.pin != null; }
        detach() { if (this.pin != null) { const st = rt.pin(this.pin); st.servo = null; st.duty = null; st.value = 0; this.pin = null; eng.dirty = true; } }
        setPeriodHertz() {}
      };

      api.LiquidCrystal_I2C = class LiquidCrystal_I2C {
        constructor(addr, cols, rows) {
          this.addr = num(addr || 0x27);
          this.cols = num(cols || 16);
          this.rows = num(rows || 2);
          this.lines = Array.from({ length: this.rows }, () => ' '.repeat(40));
          this.cx = 0;
          this.cy = 0;
          this._bl = false;
          this._disp = true;
          this.inited = false;
          this.shift = 0;
          rt.lcds.set(this.addr, this);
        }
        init() { this.inited = true; this.clear(); }
        begin(c, r) { if (c) this.cols = num(c); if (r) this.rows = num(r); this.init(); this._bl = true; }
        clear() { this.mem = Array.from({ length: Math.max(2, this.rows) }, () => new Array(40).fill(' ')); this.cx = 0; this.cy = 0; this.shift = 0; this._sync(); }
        home() { this.cx = 0; this.cy = 0; this.shift = 0; this._sync(); }
        setCursor(c, r) { this.cx = Math.max(0, num(c)); this.cy = Math.max(0, Math.min(this.rows - 1, num(r))); }
        noBacklight() { this._bl = false; }
        setBacklight(v) { this._bl = !!num(v); }
        noDisplay() { this._disp = false; }
        cursor() {} noCursor() {} blink() {} noBlink() {} leftToRight() {} rightToLeft() {} autoscroll() {} noAutoscroll() {}
        createChar() {}
        scrollDisplayLeft() { this.shift = (this.shift + 1) % 40; this._sync(); }
        scrollDisplayRight() { this.shift = (this.shift + 39) % 40; this._sync(); }
        _sync() {
          if (!this.mem) this.mem = Array.from({ length: Math.max(2, this.rows) }, () => new Array(40).fill(' '));
          this.lines = this.mem.map((row) => {
            let s = '';
            for (let k = 0; k < this.cols; k++) s += row[(k + this.shift) % 40];
            return s;
          });
        }
        write(c) {
          if (!this.mem) this.clear();
          const code = num(c);
          const chr = code < 8 ? '▓' : String.fromCharCode(code);
          if (this.cx < 40) this.mem[this.cy][this.cx] = chr;
          this.cx++;
          this._sync();
          return 1;
        }
        print(x, f) {
          if (!this.mem) this.clear();
          const s = fmt(x, f);
          for (const chr of s) {
            if (chr === '\n' || chr === '\r') continue;
            if (this.cx < 40) this.mem[this.cy][this.cx] = chr;
            this.cx++;
          }
          this._sync();
          return s.length;
        }
        println(x, f) { return this.print(x, f); }
        printf(f, ...a) { return this.print(printf(f, a)); }
      };
      // backlight()/display() — методи, стан зберігається в _bl/_disp
      api.LiquidCrystal_I2C.prototype.backlight = function () { this._bl = true; };
      api.LiquidCrystal_I2C.prototype.display = function () { this._disp = true; };

      api.IPAddress = class IPAddress {
        constructor(a, b2, c, d) { this.o = [a, b2, c, d].map((x) => num(x) & 255); }
        toString() { return this.o.join('.'); }
      };

      // ---------- WiFi (ESP)
      if (b.wifi) {
        const WL = { WL_IDLE_STATUS: 0, WL_NO_SSID_AVAIL: 1, WL_CONNECTED: 3, WL_CONNECT_FAILED: 4, WL_DISCONNECTED: 6 };
        Object.assign(api, WL, { WIFI_STA: 1, WIFI_AP: 2, WIFI_AP_STA: 3, WIFI_OFF: 0 });
        const ip = new api.IPAddress(192, 168, 1, 42);
        api.WiFi = {
          _began: false,
          _at: 0,
          _ssid: '',
          begin(ssid, pass) {
            this._began = true;
            this._ssid = fmt(ssid);
            this._at = performance.now() + 1500 + Math.random() * 1000;
            void pass;
            if (rt.hooks.log) rt.hooks.log(`📶 Wi‑Fi: підключення до мережі «${this._ssid}» (симуляція — справжнього підключення немає)`, 'info');
            return WL.WL_DISCONNECTED;
          },
          status() { return this._began && performance.now() >= this._at ? WL.WL_CONNECTED : this._began ? WL.WL_DISCONNECTED : WL.WL_IDLE_STATUS; },
          isConnected() { return this.status() === WL.WL_CONNECTED; },
          localIP() { return this.status() === WL.WL_CONNECTED ? ip : new api.IPAddress(0, 0, 0, 0); },
          macAddress() { return b.chip.mac; },
          SSID() { return this._ssid; },
          RSSI() { return -52 - Math.floor(Math.random() * 6); },
          mode() {},
          disconnect() { this._began = false; },
          setHostname() { return true; },
          hostname() {},
          softAP(ssid) { if (rt.hooks.log) rt.hooks.log(`📶 Wi‑Fi: точка доступу «${fmt(ssid)}» (симуляція)`, 'info'); return true; },
          softAPIP() { return new api.IPAddress(192, 168, 4, 1); },
          setAutoReconnect() {},
          persistent() {},
        };
        api.ESP = {
          restart() { if (rt.hooks.restart) setTimeout(() => rt.hooks.restart(), 10); throw STOP; },
          getChipId() { return 0xabcdef; },
          getFreeHeap() { return b.chip.heap; },
          getCpuFreqMHz() { return b.chip.mhz; },
          getChipModel() { return b.chip.model; },
          getEfuseMac() { return 0xefcdab286f24; },
          deepSleep() { throw STOP; },
        };
        if (isEsp32) api.esp_deep_sleep_start = () => { throw STOP; };
      }
      return api;
    }

    makeSerial() {
      const rt = this;
      const out = (s) => {
        if (!rt.serialBaud) {
          rt.warnOnce('serbegin', 'Виведення в Serial не працює: у setup() бракує Serial.begin(9600)');
          return;
        }
        if (rt.hooks.serial) rt.hooks.serial(s);
      };
      const S = {
        _timeout: 1000,
        begin(baud) { rt.serialBaud = num(baud) || 9600; if (rt.hooks.serialBegin) rt.hooks.serialBegin(rt.serialBaud); },
        end() { rt.serialBaud = 0; },
        print(x, f) { const s = fmt(x, f); out(s); return s.length; },
        println(x, f) { const s = (x === undefined ? '' : fmt(x, f)) + '\r\n'; out(s); return s.length; },
        printf(f, ...args) { const s = printf(f, args); out(s); return s.length; },
        write(x, len) {
          if (typeof x === 'string') { out(len != null ? x.slice(0, len) : x); return x.length; }
          if (Array.isArray(x)) { const s = x.slice(0, len == null ? x.length : len).map((c) => String.fromCharCode(num(c))).join(''); out(s); return s.length; }
          out(String.fromCharCode(num(x) & 255));
          return 1;
        },
        flush() {},
        available() { return rt.serialIn.length; },
        availableForWrite() { return 63; },
        read() { return rt.serialIn.length ? rt.serialIn.shift() : -1; },
        peek() { return rt.serialIn.length ? rt.serialIn[0] : -1; },
        setTimeout(t) { this._timeout = num(t); },
        async _waitByte() {
          const t0 = performance.now();
          while (!rt.serialIn.length) {
            if (performance.now() - t0 >= this._timeout) return -1;
            await rt.sleep(5);
          }
          return rt.serialIn.shift();
        },
        async readString() {
          let s = '';
          for (;;) { const c = await this._waitByte(); if (c < 0) break; s += String.fromCharCode(c); }
          return s;
        },
        async readStringUntil(term) {
          const t = num(term);
          let s = '';
          for (;;) { const c = await this._waitByte(); if (c < 0 || c === t) break; s += String.fromCharCode(c); }
          return s;
        },
        async readBytes(buf, len) {
          let n = 0;
          for (; n < num(len); n++) { const c = await this._waitByte(); if (c < 0) break; if (Array.isArray(buf)) buf[n] = c; }
          return n;
        },
        async readBytesUntil(term, buf, len) {
          let n = 0;
          for (; n < num(len); n++) { const c = await this._waitByte(); if (c < 0 || c === num(term)) break; if (Array.isArray(buf)) buf[n] = c; }
          return n;
        },
        async parseInt() {
          let c;
          for (;;) {
            if (!rt.serialIn.length) { const w = await this._waitByte(); if (w < 0) return 0; rt.serialIn.unshift(w); }
            c = rt.serialIn[0];
            if ((c >= 48 && c <= 57) || c === 45) break;
            rt.serialIn.shift();
          }
          let s = '';
          for (;;) {
            if (!rt.serialIn.length) { const w = await this._waitByte(); if (w < 0) break; rt.serialIn.unshift(w); }
            c = rt.serialIn[0];
            if ((c >= 48 && c <= 57) || (c === 45 && s === '')) { s += String.fromCharCode(c); rt.serialIn.shift(); } else break;
          }
          return parseInt(s, 10) || 0;
        },
        async parseFloat() {
          let c;
          for (;;) {
            if (!rt.serialIn.length) { const w = await this._waitByte(); if (w < 0) return 0; rt.serialIn.unshift(w); }
            c = rt.serialIn[0];
            if ((c >= 48 && c <= 57) || c === 45 || c === 46) break;
            rt.serialIn.shift();
          }
          let s = '';
          for (;;) {
            if (!rt.serialIn.length) { const w = await this._waitByte(); if (w < 0) break; rt.serialIn.unshift(w); }
            c = rt.serialIn[0];
            if ((c >= 48 && c <= 57) || c === 46 || (c === 45 && s === '')) { s += String.fromCharCode(c); rt.serialIn.shift(); } else break;
          }
          return parseFloat(s) || 0;
        },
        async find(target) {
          const t = fmt(target);
          let buf = '';
          for (;;) { const c = await this._waitByte(); if (c < 0) return false; buf += String.fromCharCode(c); if (buf.endsWith(t)) return true; }
        },
        async findUntil(target) { return this.find(target); },
      };
      return S;
    }

    serialInput(text) {
      for (const chr of text) {
        const code = chr.charCodeAt(0);
        if (code < 256) this.serialIn.push(code);
        else for (const b of new TextEncoder().encode(chr)) this.serialIn.push(b);
      }
      if (this.serialIn.length > 1024) this.serialIn.splice(0, this.serialIn.length - 1024);
    }

    // викликається рушієм після кожного розв'язку
    checkInterrupts() {
      if (!this.interrupts.size || !this.running) return;
      if (this.interruptsOn && !this.interruptsOn()) return;
      for (const [p, it] of this.interrupts) {
        const st = this.pins.get(p);
        let lvl;
        if (st && st.mode === 'output' && st.duty == null) lvl = st.value;
        else {
          const node = this.engine.gpioNode.get(p);
          if (node == null) lvl = st && st.mode === 'input_pullup' ? 1 : 0;
          else if (node === -1) lvl = 0;
          else lvl = this.engine.V[node] >= 0.5 * this.board.vcc ? 1 : 0;
        }
        if (it.last == null) { it.last = lvl; continue; }
        if (lvl === it.last) continue;
        const prev = it.last;
        it.last = lvl;
        const m = it.mode;
        const fire = m === 3 || (m === 1 && prev === 0 && lvl === 1) || (m === 2 && prev === 1 && lvl === 0) ||
          (m === 0 && lvl === 0) || (m === 4 && lvl === 1);
        if (fire) {
          Promise.resolve().then(() => it.fn()).catch((e) => this.fail(e));
        }
      }
    }

    // ------------------------------------------------------------- запуск
    compile(src) {
      const b = this.board;
      const probe = this.buildApi();
      const names = Object.keys(probe).filter((n) => /^[A-Za-z_$][\w$]*$/.test(n) && n !== 'true' && n !== 'false');
      const boardOnly = {};
      const espOnly = ['WiFi', 'ESP', 'WL_CONNECTED', 'WIFI_STA', 'WIFI_AP', 'IPAddress'];
      const e32Only = ['ledcSetup', 'ledcAttachPin', 'ledcAttach', 'ledcWrite', 'ledcWriteTone', 'dacWrite', 'touchRead', 'hallRead', 'INPUT_PULLDOWN', 'DAC1', 'DAC2'];
      const e8266Only = ['D0', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8', 'analogWriteRange'];
      for (const n of espOnly) if (!probe[n]) boardOnly[n] = `доступно лише на платах ESP8266/ESP32 (поточна плата — ${b.name})`;
      for (const n of e32Only) if (!probe[n]) boardOnly[n] = b.family === 'esp32' ? `на ${b.name} цього немає (немає ЦАП / сенсорних пінів)` : `ця функція є лише на ESP32 (поточна плата — ${b.name})`;
      for (const n of e8266Only) if (!probe[n]) boardOnly[n] = `ця константа є лише на ESP8266 NodeMCU (поточна плата — ${b.name})`;
      const defines = { ARDUINO: 10819 };
      Object.assign(defines, b.defines || {});
      const res = Sim.transpile(src, { int16: b.int16, globals: names, boardOnly, defines });
      res.apiNames = names;
      return res;
    }

    load(res) {
      return new Promise((resolve, reject) => {
        const key = '__simProg' + Date.now() + Math.floor(Math.random() * 1e6);
        const names = res.apiNames.filter((n) => !res.topNames.has(n));
        const full = `window.${key} = async function (__api, __st) { var { ${names.join(', ')} } = __api;\n${res.code}\n;return { setup: typeof setup === 'function' ? setup : null, loop: typeof loop === 'function' ? loop : null };\n};`;
        if (this.blobUrl) URL.revokeObjectURL(this.blobUrl);
        const url = URL.createObjectURL(new Blob([full], { type: 'text/javascript' }));
        this.blobUrl = url;
        let syntaxErr = null;
        const onErr = (ev) => {
          if (ev.filename === url) { syntaxErr = ev; ev.preventDefault(); }
        };
        window.addEventListener('error', onErr);
        const s = document.createElement('script');
        s.src = url;
        s.onload = () => {
          window.removeEventListener('error', onErr);
          s.remove();
          if (syntaxErr) {
            reject(new Sim.CompileError(translateError(syntaxErr.message), Math.max(1, syntaxErr.lineno - 1)));
            return;
          }
          const fn = window[key];
          delete window[key];
          if (!fn) reject(new Sim.CompileError('Не вдалося скомпілювати програму', null));
          else resolve(fn);
        };
        s.onerror = () => { window.removeEventListener('error', onErr); reject(new Sim.CompileError('Не вдалося завантажити програму', null)); };
        document.head.appendChild(s);
      });
    }

    async start(src) {
      this.stop();
      const res = this.compile(src);
      const fn = await this.load(res);
      const id = ++this.runId;
      this.pins = new Map();
      this.lcds = new Map();
      this.interrupts = new Map();
      this.warnedOnce = new Set();
      this.serialIn = [];
      this.serialBaud = 0;
      this.wireBegun = false;
      const api = this.buildApi();
      this.api = api;
      this.running = true;
      this.t0 = performance.now();
      this.lastYield = performance.now();
      this.engine.dirty = true;
      if (this.hooks.state) this.hooks.state(true);
      const st = {};
      (async () => {
        try {
          const prog = await fn(api, st);
          await prog.setup();
          await this.yieldNow();
          while (this.running && this.runId === id) {
            await prog.loop();
            await api.__tick();
            if (performance.now() - this.lastYield > 24) await this.yieldNow();
          }
        } catch (e) {
          if (this.runId === id) this.fail(e);
        }
      })();
      return res;
    }

    fail(e) {
      if (e === STOP || (e && e.stop)) return;
      const msg = translateError(e && e.message ? e.message : String(e));
      let line = null;
      if (e && e.stack && this.blobUrl) {
        const re = new RegExp(this.blobUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ':(\\d+):(\\d+)');
        const m = re.exec(e.stack);
        if (m) line = Math.max(1, +m[1] - 1);
      }
      if (this.hooks.error) this.hooks.error(msg, line);
      if (this.board && this.board.family !== 'avr' && this.hooks.serial && this.serialBaud) {
        this.hooks.serial(`\r\nGuru Meditation Error: Core 1 panic'ed (${msg})\r\nRebooting...\r\n`);
      }
      this.stop();
    }

    stop() {
      const was = this.running;
      this.running = false;
      this.runId++;
      for (const t of this.timers) { if (t.id) clearTimeout(t.id); try { t.rej(STOP); } catch (e) { /* */ } }
      this.timers.clear();
      for (const st of this.pins.values()) if (st.toneTimer) clearTimeout(st.toneTimer);
      this.pins = new Map();
      this.interrupts = new Map();
      this.engine.dirty = true;
      if (was && this.hooks.state) this.hooks.state(false);
    }
  }

  function translateError(m) {
    let r;
    if ((r = /^(?:Uncaught )?ReferenceError: (.+) is not defined/.exec(m) || /^(.+) is not defined$/.exec(m))) return `'${r[1]}' не оголошено`;
    if ((r = /(?:Uncaught )?TypeError: (.+) is not a function/.exec(m))) return `'${r[1].replace(/^\(intermediate value\)\./, '')}' не є функцією (такого методу не існує)`;
    if ((r = /Cannot read propert(?:y|ies) of (undefined|null)(?: \(reading '(.+)'\))?/.exec(m))) return `Звернення до неіснуючого елемента${r[2] ? ` ('${r[2]}')` : ''} — можливо, вихід за межі масиву`;
    if ((r = /Cannot set propert(?:y|ies) of (undefined|null)(?: \(setting '(.+)'\))?/.exec(m))) return `Запис у неіснуючий елемент${r[2] ? ` ('${r[2]}')` : ''} — можливо, вихід за межі масиву`;
    if (/Maximum call stack/.test(m)) return 'Переповнення стеку — можливо, функція нескінченно викликає сама себе';
    if ((r = /Identifier '(.+)' has already been declared/.exec(m))) return `Змінну '${r[1]}' вже оголошено раніше`;
    if ((r = /(?:Uncaught )?SyntaxError: (.+)/.exec(m))) {
      let t = r[1];
      t = t.replace(/Unexpected token '(.+)'/, "неочікуваний символ '$1'").replace(/Unexpected identifier '(.+)'/, "неочікуваний ідентифікатор '$1'")
        .replace('Unexpected end of input', 'несподіваний кінець програми').replace(/Unexpected number/, 'неочікуване число')
        .replace(/Unexpected string/, 'неочікуваний рядок').replace(/Invalid or unexpected token/, 'неправильний символ')
        .replace(/Unexpected identifier/, 'неочікуваний ідентифікатор').replace(/missing \) after argument list/, "бракує ')' після аргументів")
        .replace(/Invalid left-hand side in assignment/, 'неправильна ліва частина присвоєння')
        .replace(/Unexpected strict mode reserved word/, 'зарезервоване слово');
      return 'Синтаксична помилка: ' + t;
    }
    if ((r = /Assignment to constant variable/.exec(m))) return 'Спроба змінити константу';
    if ((r = /(.+) is not a constructor/.exec(m))) return `'${r[1]}' не є класом`;
    return m.replace(/^Uncaught /, '');
  }

  Sim.Runtime = Runtime;
  Sim.rtUtil = { fmt, CChar, ch, FloatVal, cv, printf, translateError };
})(typeof window !== 'undefined' ? window : globalThis);
