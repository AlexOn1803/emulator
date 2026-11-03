/*
 * Головний модуль: інтерфейс, редактор коду, монітор порту, плоттер,
 * повідомлення, збереження проєкту.
 */
(function (G) {
  'use strict';
  const Sim = G.Sim;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => [...(r || document).querySelectorAll(s)];
  const esc = Sim.fmt.esc;
  const STORE = 'arduino-esp-sim-project-v1';
  const WIRE_COLORS = ['#2e7d32', '#1565c0', '#f9a825', '#6a1b9a', '#ef6c00', '#00838f', '#ad1457', '#5d4037'];
  const ALL_WIRE_COLORS = ['#222222', '#d32f2f', ...WIRE_COLORS, '#9e9e9e', '#ffffff'];

  // ------------------------------------------------------------- редактор
  function makeEditor(textarea) {
    if (G.CodeMirror) {
      const CM = G.CodeMirror;
      const kw = 'if else for while do switch case default break continue return goto sizeof struct class enum typedef const static volatile unsigned signed long short extern inline true false NULL nullptr new delete this'.split(' ');
      const types = 'void int char float double bool boolean byte word String size_t uint8_t int8_t uint16_t int16_t uint32_t int32_t uint64_t int64_t auto Servo LiquidCrystal_I2C IPAddress'.split(' ');
      const builtin = 'setup loop pinMode digitalWrite digitalRead analogRead analogWrite delay delayMicroseconds millis micros map constrain min max abs random randomSeed tone noTone pulseIn attachInterrupt detachInterrupt digitalPinToInterrupt Serial Wire WiFi ESP ledcSetup ledcAttachPin ledcAttach ledcWrite dacWrite touchRead analogReadResolution analogWriteResolution analogWriteRange sqrt pow sin cos bitRead bitWrite F'.split(' ');
      const atoms = 'HIGH LOW INPUT OUTPUT INPUT_PULLUP INPUT_PULLDOWN LED_BUILTIN A0 A1 A2 A3 A4 A5 A6 A7 D0 D1 D2 D3 D4 D5 D6 D7 D8 RISING FALLING CHANGE HEX DEC BIN OCT PI WL_CONNECTED WIFI_STA true false'.split(' ');
      const words = (a) => a.reduce((o, w) => { o[w] = true; return o; }, {});
      CM.defineMIME('text/x-arduino', {
        name: 'clike', keywords: words(kw), types: words(types), builtin: words(builtin), atoms: words(atoms),
        blockKeywords: words('case do else for if switch while struct enum'.split(' ')), defKeywords: words('struct enum class'.split(' ')),
        typeFirstDefinitions: true, hooks: { '#': (stream) => { stream.skipToEnd(); return 'meta'; } },
      });
      const cm = CM.fromTextArea(textarea, {
        mode: 'text/x-arduino', theme: 'material-darker', lineNumbers: true, indentUnit: 2, tabSize: 2,
        matchBrackets: true, autoCloseBrackets: true, styleActiveLine: true, lineWrapping: false,
        extraKeys: {
          'Ctrl-Space': 'autocomplete', 'Ctrl-/': 'toggleComment', 'Cmd-/': 'toggleComment',
          Tab: (c) => (c.somethingSelected() ? c.indentSelection('add') : c.replaceSelection('  ')),
        },
        hintOptions: { completeSingle: false },
      });
      const allWords = [...new Set([...builtin, ...atoms, ...types, ...kw, 'Serial.begin', 'Serial.println', 'Serial.print', 'Serial.available', 'Serial.read', 'Serial.readStringUntil', 'Serial.parseInt', 'Serial.printf'])];
      if (CM.registerHelper) {
        CM.registerHelper('hint', 'arduinoHint', (ed) => {
          const cur = ed.getCursor();
          const line = ed.getLine(cur.line);
          let start = cur.ch;
          while (start > 0 && /[\w.]/.test(line[start - 1])) start--;
          const word = line.slice(start, cur.ch);
          if (!word) return null;
          const docWords = new Set(ed.getValue().match(/[A-Za-z_]\w{2,}/g) || []);
          const list = [...new Set([...allWords, ...docWords])].filter((w) => w.startsWith(word) && w !== word).sort().slice(0, 40);
          return { list, from: CM.Pos(cur.line, start), to: CM.Pos(cur.line, cur.ch) };
        });
        cm.setOption('hintOptions', { hint: CM.helpers.hint.arduinoHint[0], completeSingle: false });
        cm.on('inputRead', (ed, ch) => {
          if (ch.text[0] && /[\w.]/.test(ch.text[0]) && ed.showHint) {
            const cur = ed.getCursor();
            const line = ed.getLine(cur.line);
            let s = cur.ch;
            while (s > 0 && /[\w]/.test(line[s - 1])) s--;
            if (cur.ch - s >= 3 || ch.text[0] === '.') ed.showHint({ completeSingle: false });
          }
        });
      }
      let marks = [];
      return {
        cm,
        get: () => cm.getValue(),
        set: (v) => { cm.setValue(v); cm.clearHistory(); },
        onChange: (fn) => cm.on('change', fn),
        mark(line, cls) {
          if (line == null || line < 1 || line > cm.lineCount()) return;
          const h = cm.addLineClass(line - 1, 'background', cls || 'cm-error-line');
          marks.push([h, cls || 'cm-error-line']);
        },
        clear() { for (const [h, cls] of marks) cm.removeLineClass(h, 'background', cls); marks = []; },
        goto(line) { if (!line) return; cm.focus(); cm.setCursor({ line: line - 1, ch: 0 }); cm.scrollIntoView({ line: line - 1, ch: 0 }, 120); },
        refresh: () => cm.refresh(),
        hasFocus: () => cm.hasFocus(),
      };
    }
    // запасний варіант без CodeMirror
    textarea.classList.add('plain-editor');
    return {
      get: () => textarea.value,
      set: (v) => { textarea.value = v; },
      onChange: (fn) => textarea.addEventListener('input', fn),
      mark() {},
      clear() {},
      goto(line) {
        const lines = textarea.value.split('\n');
        let pos = 0;
        for (let i = 0; i < line - 1 && i < lines.length; i++) pos += lines[i].length + 1;
        textarea.focus();
        textarea.setSelectionRange(pos, pos + (lines[line - 1] || '').length);
      },
      refresh() {},
      hasFocus: () => document.activeElement === textarea,
    };
  }

  // ----------------------------------------------------------------- звук
  class Sound {
    constructor() { this.ctx = null; this.osc = new Map(); this.muted = false; }
    unlock() {
      if (!this.ctx) {
        const AC = G.AudioContext || G.webkitAudioContext;
        if (AC) this.ctx = new AC();
      }
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    }
    set(id, f) {
      if (!this.ctx || this.muted) f = 0;
      let o = this.osc.get(id);
      if (!f) {
        if (o) { try { o.g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.01); o.o.stop(this.ctx.currentTime + 0.05); } catch (e) { /* */ } this.osc.delete(id); }
        return;
      }
      if (!o) {
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = 'square';
        g.gain.value = 0;
        osc.connect(g).connect(this.ctx.destination);
        osc.start();
        g.gain.setTargetAtTime(0.04, this.ctx.currentTime, 0.01);
        o = { o: osc, g, f: 0 };
        this.osc.set(id, o);
      }
      if (o.f !== f) { o.o.frequency.setValueAtTime(Math.max(20, Math.min(20000, f)), this.ctx.currentTime); o.f = f; }
    }
    stopAll() { for (const id of [...this.osc.keys()]) this.set(id, 0); }
  }

  // -------------------------------------------------------------- плоттер
  class Plotter {
    constructor(canvas, legend) {
      this.c = canvas;
      this.legend = legend;
      this.series = new Map();
      this.dirty = true;
      this.max = 500;
      this.colors = ['#4fc3f7', '#ff8a65', '#aed581', '#ffd54f', '#ba68c8', '#f06292', '#4db6ac', '#e0e0e0'];
    }
    clear() { this.series.clear(); this.dirty = true; }
    line(s) {
      s = s.trim();
      if (!s) return;
      const pairs = [];
      const re = /([^\s:=,;\t][^:=,;\t]*?)\s*[:=]\s*(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;
      let m;
      while ((m = re.exec(s))) pairs.push([m[1].trim(), parseFloat(m[2])]);
      if (!pairs.length) {
        let idx = 0;
        for (const p of s.split(/[\s,;\t]+/)) {
          const v = parseFloat(p);
          if (/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(p) && isFinite(v)) pairs.push(['Значення ' + ++idx, v]);
        }
      }
      for (const [name, val] of pairs) {
        let sr = this.series.get(name);
        if (!sr) { sr = []; this.series.set(name, sr); }
        sr.push(val);
        if (sr.length > this.max) sr.shift();
      }
      if (pairs.length) this.dirty = true;
    }
    draw() {
      if (!this.dirty) return;
      const c = this.c;
      const r = c.getBoundingClientRect();
      if (r.width < 10 || r.height < 10) return;
      this.dirty = false;
      const dpr = G.devicePixelRatio || 1;
      if (c.width !== Math.round(r.width * dpr) || c.height !== Math.round(r.height * dpr)) {
        c.width = Math.round(r.width * dpr);
        c.height = Math.round(r.height * dpr);
      }
      const g = c.getContext('2d');
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      const W = r.width;
      const H = r.height;
      g.fillStyle = '#16181d';
      g.fillRect(0, 0, W, H);
      let lo = Infinity;
      let hi = -Infinity;
      for (const sr of this.series.values()) for (const v of sr) { if (v < lo) lo = v; if (v > hi) hi = v; }
      if (!isFinite(lo)) {
        g.fillStyle = '#778';
        g.font = '13px system-ui, sans-serif';
        g.fillText('Виводьте числа через Serial.println(значення) — тут з’явиться графік.', 16, 28);
        g.fillText('Кілька графіків: Serial.print("t:"); Serial.print(t); Serial.print(" h:"); Serial.println(h);', 16, 50);
        this.legend.innerHTML = '';
        return;
      }
      if (hi - lo < 1e-9) { hi += 1; lo -= 1; }
      const padv = (hi - lo) * 0.08;
      hi += padv;
      lo -= padv;
      const L = 52;
      g.strokeStyle = '#2a2e36';
      g.fillStyle = '#8a90a0';
      g.font = '11px monospace';
      g.lineWidth = 1;
      for (let k = 0; k <= 5; k++) {
        const y = 10 + ((H - 20) * k) / 5;
        const v = hi - ((hi - lo) * k) / 5;
        g.beginPath(); g.moveTo(L, y); g.lineTo(W - 6, y); g.stroke();
        g.fillText(Math.abs(v) >= 1000 ? v.toFixed(0) : v.toFixed(Math.abs(v) < 10 ? 2 : 1), 4, y + 4);
      }
      let ci = 0;
      const legend = [];
      for (const [name, sr] of this.series) {
        const col = this.colors[ci++ % this.colors.length];
        legend.push(`<span><i style="background:${col}"></i>${esc(name)}: ${sr.length ? +sr[sr.length - 1].toFixed(3) : ''}</span>`);
        g.strokeStyle = col;
        g.lineWidth = 1.6;
        g.beginPath();
        const n = sr.length;
        sr.forEach((v, i) => {
          const x = L + ((W - L - 6) * (i + this.max - n)) / (this.max - 1);
          const y = 10 + ((H - 20) * (hi - v)) / (hi - lo);
          if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
        });
        g.stroke();
      }
      this.legend.innerHTML = legend.join('');
    }
  }

  // ------------------------------------------------------------- застосунок
  const App = {
    init() {
      this.engine = new Sim.Engine();
      this.sound = new Sound();
      this.engine.onSound = (id, f) => this.sound.set(id, f);
      this.engine.logFn = (m, k) => this.log(m, k);
      this.runtime = new Sim.Runtime(this.engine, {
        serial: (s) => this.serialOut(s),
        serialBegin: (baud) => this.onSerialBegin(baud),
        log: (m, k) => this.log(m, k),
        error: (m, line) => this.onRuntimeError(m, line),
        state: (on) => this.onRunState(on),
        restart: () => this.run(),
      });
      this.engine.runtime = this.runtime;
      this.editor = makeEditor($('#code'));
      this.schem = new Sim.Schematic($('#schem'), this);
      this.plotter = new Plotter($('#plot'), $('#plotLegend'));
      this.serialBuf = '';
      this.serialLineBuf = '';
      this.logs = [];
      this.history = [];
      this.hidx = -1;
      this.buildPalette();
      this.buildExamples();
      this.bindUi();
      this.loadInitial();
      this.loop();
    },

    // --------------------------------------------------------- проєкт
    loadInitial() {
      let p = null;
      try { p = JSON.parse(localStorage.getItem(STORE) || 'null'); } catch (e) { p = null; }
      const hash = location.hash.match(/example=([\w-]+)/);
      if (hash) {
        const ex = Sim.Examples.find((e) => e.id === hash[1]);
        if (ex) p = this.fromExample(ex);
      }
      if (!p || !p.board || !Sim.Boards[p.board]) p = this.fromExample(Sim.Examples[1]);
      this.setProject(p, true);
    },

    fromExample(ex) {
      const p = JSON.parse(JSON.stringify({ board: ex.board, boardPos: ex.boardPos || { x: 0, y: 0 }, components: ex.components, wires: ex.wires, code: ex.code.replace(/^\n/, '') }));
      let n = 0;
      for (const c of p.components) {
        const def = Sim.Components[c.type];
        c.props = Object.assign({}, def.defaults, c.props || {});
        c.rot = c.rot || 0;
        n++;
      }
      p.wires.forEach((w, i) => { if (!w.id) w.id = 'w' + (i + 1); });
      p.nextId = n + p.wires.length + 10;
      for (const c of p.components) if (!c.name) c.name = this.newName(c.type, p);
      p.example = ex.id;
      return p;
    },

    setProject(p, initial) {
      this.runtime.stop();
      this.project = p;
      p.components.forEach((c) => {
        const def = Sim.Components[c.type];
        c.props = Object.assign({}, def ? def.defaults : {}, c.props || {});
      });
      this.engine.setProject(p);
      this.engine.resetStates();
      $('#board').value = p.board;
      this.editor.set(p.code || '');
      this.editor.clear();
      this.schem.sel = null;
      this.schem.render();
      this.onSelect(null);
      this.history = [this.snapshot()];
      this.hidx = 0;
      requestAnimationFrame(() => this.schem.fit());
      if (!initial) this.save();
      this.updateBoardInfo();
    },

    snapshot() {
      const p = this.project;
      return JSON.stringify({ board: p.board, boardPos: p.boardPos, components: p.components, wires: p.wires, nextId: p.nextId });
    },

    restore(snap) {
      const s = JSON.parse(snap);
      Object.assign(this.project, s);
      this.engine.setProject(this.project);
      $('#board').value = this.project.board;
      this.schem.sel = null;
      this.schem.render();
      this.onSelect(null);
      this.save();
      this.updateBoardInfo();
    },

    undo() { if (this.hidx > 0) { this.hidx--; this.restore(this.history[this.hidx]); this.toast('Скасовано'); } },
    redo() { if (this.hidx < this.history.length - 1) { this.hidx++; this.restore(this.history[this.hidx]); this.toast('Повторено'); } },

    changed(topology) {
      if (topology) this.engine.topoDirty = true;
      this.engine.dirty = true;
      const snap = this.snapshot();
      if (this.history[this.hidx] !== snap) {
        this.history = this.history.slice(0, this.hidx + 1);
        this.history.push(snap);
        if (this.history.length > 80) this.history.shift();
        this.hidx = this.history.length - 1;
      }
      this.save();
    },

    save() {
      clearTimeout(this._saveT);
      this._saveT = setTimeout(() => {
        try {
          this.project.code = this.editor.get();
          localStorage.setItem(STORE, JSON.stringify(this.project));
        } catch (e) { /* */ }
      }, 300);
    },

    compById(id) { return this.project.components.find((c) => c.id === id); },
    newId(prefix) { this.project.nextId = (this.project.nextId || 100) + 1; return prefix + this.project.nextId; },
    newName(type, p) {
      p = p || this.project;
      const pre = Sim.Components[type].prefix;
      const used = new Set(p.components.map((c) => c.name));
      for (let i = 1; ; i++) if (!used.has(pre + i)) return pre + i;
    },

    pickWireColor(a, b) {
      const kindOf = (ref) => {
        if (!ref.startsWith('B:')) return null;
        const pin = Sim.Boards[this.project.board].pinById[ref.slice(2)];
        return pin && pin.kind;
      };
      const ka = kindOf(a);
      const kb = kindOf(b);
      if (ka === 'gnd' || kb === 'gnd') return '#222222';
      if (/^(v5|vin|v33)$/.test(ka || '') || /^(v5|vin|v33)$/.test(kb || '')) return '#d32f2f';
      const idx = (this.project.wires.length) % WIRE_COLORS.length;
      return WIRE_COLORS[idx];
    },

    findFreeSpot() {
      const r = this.schem.svg.getBoundingClientRect();
      const v = this.schem.view;
      const cx = v.x + r.width / v.s / 2;
      const cy = v.y + r.height / v.s / 2;
      const p = this.project;
      const b = Sim.Boards[p.board];
      const bp = p.boardPos || { x: 0, y: 0 };
      const free = (x, y) => {
        if (x > bp.x - 50 && x < bp.x + b.width + 50 && y > bp.y - 60 && y < bp.y + b.height + 60) return false;
        return p.components.every((c) => Math.abs(c.x - x) > 70 || Math.abs(c.y - y) > 70);
      };
      // не під панеллю властивостей (праворуч) і не біля нижнього краю
      const rightPad = (r.width > 700 ? 300 : 60) / v.s;
      const inView = (x, y) => x > v.x + 60 / v.s && x < v.x + r.width / v.s - rightPad && y > v.y + 60 / v.s && y < v.y + r.height / v.s - 70 / v.s;
      const noComp = (x, y) => p.components.every((c) => Math.abs(c.x - x) > 60 || Math.abs(c.y - y) > 60);
      for (const ok of [free, noComp]) {
        for (let ring = 0; ring < 12; ring++) {
          const cand = [];
          for (let dx = -ring; dx <= ring; dx++) for (let dy = -ring; dy <= ring; dy++) if (Math.max(Math.abs(dx), Math.abs(dy)) === ring) cand.push([cx + dx * 70, cy + dy * 70]);
          cand.sort((a, c) => (a[1] - c[1]) || (Math.abs(a[0] - cx) - Math.abs(c[0] - cx)));
          for (const [x, y] of cand) if (ok(x, y) && inView(x, y)) return [Math.round(x / 10) * 10, Math.round(y / 10) * 10];
        }
      }
      const n = p.components.length;
      return [Math.round((cx + (n % 4) * 30) / 10) * 10, Math.round((cy + (n % 3) * 30) / 10) * 10];
    },

    addComponent(type) {
      const def = Sim.Components[type];
      const [x, y] = this.findFreeSpot();
      const c = {
        id: this.newId('c'),
        type,
        name: this.newName(type),
        x,
        y,
        rot: 0,
        props: JSON.parse(JSON.stringify(def.defaults || {})),
      };
      this.project.components.push(c);
      this.schem.renderComp(c);
      this.schem.refreshPins();
      this.schem.select({ type: 'comp', id: c.id });
      this.changed(true);
    },

    deleteSelection() {
      const sel = this.schem.sel;
      if (!sel) return;
      const p = this.project;
      if (sel.type === 'comp') {
        p.components = p.components.filter((c) => c.id !== sel.id);
        p.wires = p.wires.filter((w) => !w.a.startsWith(sel.id + ':') && !w.b.startsWith(sel.id + ':'));
        this.engine.states.delete(sel.id);
        this.sound.set(sel.id, 0);
      } else if (sel.type === 'wire') {
        p.wires = p.wires.filter((w) => w.id !== sel.id);
      } else return;
      this.schem.sel = null;
      this.schem.render();
      this.onSelect(null);
      this.changed(true);
    },

    rotateSelection(dir) {
      const sel = this.schem.sel;
      if (!sel || sel.type !== 'comp') return;
      const c = this.compById(sel.id);
      c.rot = (((c.rot || 0) + (dir || 90)) % 360 + 360) % 360;
      this.schem.placeComp(c);
      this.schem.updateWiresFor(c.id);
      this.schem.refreshPins();
      this.changed(false);
    },

    changeBoard(id) {
      const p = this.project;
      if (id === p.board) return;
      const ob = Sim.Boards[p.board];
      const nb = Sim.Boards[id];
      const map = (ref) => {
        if (!ref.startsWith('B:')) return ref;
        const pin = ob.pinById[ref.slice(2)];
        if (!pin) return null;
        let np = null;
        if (pin.gpio != null) np = nb.gpioPins[pin.gpio];
        else if (pin.kind === 'gnd') np = nb.pins.find((x) => x.kind === 'gnd');
        else if (pin.kind === 'v5' || pin.kind === 'vin') np = nb.pins.find((x) => x.kind === 'v5') || nb.pins.find((x) => x.kind === 'vin');
        else if (pin.kind === 'v33') np = nb.pins.find((x) => x.kind === 'v33');
        return np ? 'B:' + np.id : null;
      };
      let lost = 0;
      const wires = [];
      for (const w of p.wires) {
        const a = map(w.a);
        const b = map(w.b);
        if (a && b) wires.push(Object.assign({}, w, { a, b })); else lost++;
      }
      if (lost && !confirm(`Після зміни плати ${lost} дрот(ів) не матимуть відповідного піна і будуть видалені. Продовжити?`)) {
        $('#board').value = p.board;
        return;
      }
      this.runtime.stop();
      p.board = id;
      p.wires = wires;
      this.engine.setProject(p);
      this.schem.render();
      this.onSelect(null);
      this.changed(true);
      this.updateBoardInfo();
      requestAnimationFrame(() => this.schem.fit());
      this.toast(`Плата: ${nb.name}. Номери пінів збережено там, де це можливо.`);
    },

    updateBoardInfo() {
      const b = Sim.Boards[this.project.board];
      $('#boardInfo').textContent = b.mcu;
    },

    // ----------------------------------------------------- властивості
    onSelect(sel) {
      this.renderProps(sel);
    },

    renderProps(sel) {
      const box = $('#props');
      sel = sel === undefined ? this.schem.sel : sel;
      if (!sel) { box.hidden = true; box.innerHTML = ''; return; }
      box.hidden = false;
      let h = '';
      if (sel.type === 'comp') {
        const c = this.compById(sel.id);
        if (!c) { box.hidden = true; return; }
        const def = Sim.Components[c.type];
        h += `<div class="props-head"><span class="props-icon">${Sim.componentIcons[c.type] || ''}</span><div><b>${esc(c.name)}</b><div class="props-sub">${esc(def.title)}</div></div><button class="icon-btn" data-a="close" title="Закрити">✕</button></div>`;
        for (const pd of def.props || []) {
          const v = c.props[pd.key];
          h += `<label class="prop"><span>${esc(pd.label)}</span>`;
          if (pd.type === 'select') {
            h += `<select data-k="${pd.key}">${pd.options.map(([ov, ol]) => `<option value="${esc(ov)}" ${String(ov) === String(v) ? 'selected' : ''}>${esc(ol)}</option>`).join('')}</select>`;
          } else if (pd.type === 'resistance') {
            h += `<input data-k="${pd.key}" data-t="r" list="rlist-${pd.key}" value="${esc(Sim.fmt.fmtR(v).replace(' Ом', '').replace(' кОм', 'k').replace(' МОм', 'M'))}" placeholder="напр. 220, 4.7k, 1M"><datalist id="rlist-${pd.key}">${pd.options.map((o) => `<option value="${Sim.fmt.fmtR(o).replace(' Ом', '').replace(' кОм', 'k').replace(' МОм', 'M')}">${Sim.fmt.fmtR(o)}</option>`).join('')}</datalist>`;
          } else if (pd.type === 'range') {
            h += `<span class="range-row"><input type="range" data-k="${pd.key}" min="${pd.min}" max="${pd.max}" step="${pd.step}" value="${v}"><output>${pd.fmt ? pd.fmt(v) : v}</output></span>`;
          } else if (pd.type === 'checkbox') {
            h += `<input type="checkbox" data-k="${pd.key}" ${v ? 'checked' : ''}>`;
          } else {
            h += `<input data-k="${pd.key}" value="${esc(v)}">`;
          }
          h += '</label>';
        }
        h += `<div class="props-live" id="propsLive"></div>`;
        h += `<div class="props-actions"><button data-a="rot">⟳ Повернути <kbd>R</kbd></button><button data-a="del" class="danger">🗑 Видалити <kbd>Del</kbd></button></div>`;
      } else if (sel.type === 'wire') {
        const w = this.project.wires.find((x) => x.id === sel.id);
        if (!w) { box.hidden = true; return; }
        const nm = (ref) => {
          const p = this.schem.pinPos(ref);
          if (!p) return ref;
          return p.owner === 'B' ? `${Sim.Boards[this.project.board].name}: ${p.pin.label}` : `${p.owner.name}: ${p.pin.name}`;
        };
        h += `<div class="props-head"><b>Дріт</b><button class="icon-btn" data-a="close">✕</button></div>`;
        h += `<div class="props-sub wire-ends">${esc(nm(w.a))}<br>↔ ${esc(nm(w.b))}</div>`;
        h += `<div class="swatches">${ALL_WIRE_COLORS.map((col) => `<button class="sw ${col === w.color ? 'on' : ''}" data-color="${col}" style="background:${col}" title="${col}"></button>`).join('')}</div>`;
        h += `<div class="props-actions"><button data-a="del" class="danger">🗑 Видалити дріт <kbd>Del</kbd></button></div>`;
      } else if (sel.type === 'board') {
        const b = Sim.Boards[this.project.board];
        h += `<div class="props-head"><b>${esc(b.name)}</b><button class="icon-btn" data-a="close">✕</button></div>`;
        h += `<div class="props-sub">${esc(b.mcu)}</div><ul class="board-facts">
          <li>Логічний рівень: <b>${b.vcc} В</b></li>
          <li>Макс. струм піна: <b>${b.pinMaxmA} мА</b></li>
          <li>ШІМ (analogWrite): ${b.pwmDesc}</li>
          <li>АЦП: ${b.adcBits} біт (0–${(1 << b.adcBits) - 1}), ${b.adcDesc}</li>
          <li>I2C: SDA — ${b.pinName(b.sda)}, SCL — ${b.pinName(b.scl)}</li>
          <li>LED_BUILTIN: ${b.pinName(b.led.gpio)}${b.led.activeLow ? ' (вмикається LOW!)' : ''}</li>
        </ul><div class="props-sub">Наведіть мишу на пін, щоб побачити його можливості та напругу.</div>`;
      }
      box.innerHTML = h;
      this.refreshProps();
    },

    refreshProps() {
      const sel = this.schem.sel;
      if (!sel || sel.type !== 'comp') return;
      const c = this.compById(sel.id);
      if (!c) return;
      const def = Sim.Components[c.type];
      const live = $('#propsLive');
      if (live && def.info) live.textContent = def.info(c, this.engine.state(c)).replace(/^[^:]+:\s*/, '');
      for (const pd of def.props || []) {
        if (pd.type !== 'range') continue;
        const inp = $(`#props input[data-k="${pd.key}"]`);
        if (inp && document.activeElement !== inp) {
          inp.value = c.props[pd.key];
          inp.nextElementSibling.textContent = pd.fmt ? pd.fmt(c.props[pd.key]) : c.props[pd.key];
        }
      }
    },

    onPropInput(e, final) {
      const t = e.target;
      const k = t.getAttribute('data-k');
      if (!k) return;
      const sel = this.schem.sel;
      const c = sel && sel.type === 'comp' && this.compById(sel.id);
      if (!c) return;
      const def = Sim.Components[c.type];
      const pd = def.props.find((x) => x.key === k);
      let v;
      if (pd.type === 'checkbox') v = t.checked;
      else if (pd.type === 'range') { v = parseFloat(t.value); t.nextElementSibling.textContent = pd.fmt ? pd.fmt(v) : v; }
      else if (pd.type === 'resistance') {
        v = Sim.fmt.parseR(t.value);
        if (!(v > 0)) { if (final) this.toast('Неправильне значення опору. Приклади: 220, 4.7k, 1M'); return; }
        if (!final) return;
      } else if (pd.type === 'select') {
        const opt = pd.options.find(([ov]) => String(ov) === t.value);
        v = opt ? opt[0] : t.value;
      } else v = t.value;
      c.props[k] = v;
      if (pd.type === 'range' && !final) {
        this.schem.placeComp(c);
        this.engine.dirty = true;
        return;
      }
      const e2 = this.schem.compEls.get(c.id);
      if (e2) {
        e2.body.innerHTML = def.svg(c);
        e2.body._q = null;
        for (const pin of def.pins) {
          const ci = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
          ci.setAttribute('cx', pin.x); ci.setAttribute('cy', pin.y); ci.setAttribute('r', 3.4); ci.setAttribute('class', 'cpin');
          e2.body.appendChild(ci);
        }
      }
      this.schem.placeComp(c);
      this.engine.dirty = true;
      this.changed(false);
    },

    // ----------------------------------------------------------- UI
    buildPalette() {
      const pal = $('#palette');
      let h = '';
      for (const type of Sim.componentOrder) {
        const def = Sim.Components[type];
        h += `<button class="pal-item" data-type="${type}" title="${esc(def.title)} — клацніть, щоб додати"><span class="pal-ico">${Sim.componentIcons[type] || ''}</span><span class="pal-name">${esc(def.title.replace(' (I2C)', '').replace('Ультразвуковий датчик ', '').replace('Сервопривід ', 'Серво '))}</span></button>`;
      }
      pal.innerHTML = h;
      pal.addEventListener('click', (e) => {
        const b = e.target.closest('.pal-item');
        if (b) this.addComponent(b.getAttribute('data-type'));
      });
    },

    buildExamples() {
      const sel = $('#examples');
      const groups = {};
      for (const ex of Sim.Examples) (groups[ex.group] = groups[ex.group] || []).push(ex);
      let h = '<option value="">📚 Приклади…</option>';
      for (const [g, list] of Object.entries(groups)) {
        h += `<optgroup label="${esc(g)}">${list.map((ex) => `<option value="${ex.id}">${esc(ex.title)}</option>`).join('')}</optgroup>`;
      }
      sel.innerHTML = h;
      sel.addEventListener('change', () => {
        const ex = Sim.Examples.find((x) => x.id === sel.value);
        sel.value = '';
        if (!ex) return;
        if (!confirm(`Відкрити приклад «${ex.title}»? Поточний проєкт буде замінено (збережіть його у файл, якщо потрібно).`)) return;
        this.setProject(this.fromExample(ex));
        this.clearLogs();
        if (ex.note) this.log('📘 ' + ex.note, 'info');
        this.toast(`Приклад «${ex.title}» відкрито. Натисніть ▶ Запуск`);
      });
    },

    bindUi() {
      $('#btnRun').addEventListener('click', () => this.run());
      $('#btnStop').addEventListener('click', () => this.stop());
      $('#btnVerify').addEventListener('click', () => this.verify());
      $('#board').addEventListener('change', (e) => this.changeBoard(e.target.value));
      $('#btnNew').addEventListener('click', () => {
        if (!confirm('Створити новий порожній проєкт? Поточну схему та код буде замінено.')) return;
        this.setProject(this.fromExample(Sim.Examples.find((e) => e.id === 'empty')));
      });
      $('#btnSave').addEventListener('click', () => this.saveFile());
      $('#btnOpen').addEventListener('click', () => $('#fileInput').click());
      $('#fileInput').addEventListener('change', (e) => this.openFile(e.target.files[0]));
      $('#btnHelp').addEventListener('click', () => { $('#help').hidden = false; });
      $('#help').addEventListener('click', (e) => { if (e.target.id === 'help' || e.target.closest('[data-a="close-help"]')) $('#help').hidden = true; });
      $('#btnMute').addEventListener('click', () => {
        this.sound.muted = !this.sound.muted;
        $('#btnMute').textContent = this.sound.muted ? '🔇' : '🔊';
        if (this.sound.muted) this.sound.stopAll();
      });
      $('#zoomIn').addEventListener('click', () => this.schem.zoomAt(null, 1.25));
      $('#zoomOut').addEventListener('click', () => this.schem.zoomAt(null, 0.8));
      $('#zoomFit').addEventListener('click', () => this.schem.fit());

      const props = $('#props');
      props.addEventListener('input', (e) => this.onPropInput(e, false));
      props.addEventListener('change', (e) => this.onPropInput(e, true));
      props.addEventListener('click', (e) => {
        const a = e.target.closest('[data-a]');
        const sw = e.target.closest('[data-color]');
        if (sw) {
          const w = this.project.wires.find((x) => x.id === this.schem.sel.id);
          if (w) { w.color = sw.getAttribute('data-color'); this.schem.placeWire(w); this.renderProps(); this.changed(false); }
          return;
        }
        if (!a) return;
        const act = a.getAttribute('data-a');
        if (act === 'del') this.deleteSelection();
        else if (act === 'rot') this.rotateSelection(90);
        else if (act === 'close') this.schem.select(null);
      });

      // вкладки
      $$('.tab').forEach((t) => t.addEventListener('click', () => this.showTab(t.getAttribute('data-tab'))));

      // монітор порту
      const send = () => {
        const inp = $('#serialIn');
        const end = { nl: '\n', cr: '\r', both: '\r\n', none: '' }[$('#lineEnd').value];
        if (!this.runtime.running) { this.toast('Спочатку запустіть програму ▶'); return; }
        this.runtime.serialInput(inp.value + end);
        inp.value = '';
      };
      $('#serialSend').addEventListener('click', send);
      $('#serialIn').addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });
      $('#serialClear').addEventListener('click', () => { $('#serialOut').textContent = ''; this.plotter.clear(); });
      $('#baud').addEventListener('change', () => this.checkBaud());

      // клавіатура
      document.addEventListener('keydown', (e) => {
        const inField = e.target.closest && (e.target.closest('input, select, textarea, .CodeMirror'));
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); this.run(); return; }
        if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) { e.preventDefault(); this.project.code = this.editor.get(); this.save(); this.toast('Проєкт збережено в браузері. Для файлу — кнопка «Зберегти».'); return; }
        if (inField) return;
        if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); if (e.shiftKey) this.redo(); else this.undo(); return; }
        if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'Y')) { e.preventDefault(); this.redo(); return; }
        if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); this.deleteSelection(); }
        else if (e.key === 'r' || e.key === 'R' || e.key === 'к' || e.key === 'К') this.rotateSelection(e.shiftKey ? -90 : 90);
        else if (e.key === 'Escape') { this.schem.cancelWire(); this.schem.select(null); $('#help').hidden = true; }
      });

      this.editor.onChange(() => { this.editor.clear(); this.save(); });
      this.initSplitters();
      window.addEventListener('beforeunload', () => { try { this.project.code = this.editor.get(); localStorage.setItem(STORE, JSON.stringify(this.project)); } catch (e) { /* */ } });
    },

    initSplitters() {
      const main = $('main');
      const vs = $('#splitter');
      const hs = $('#hsplit');
      const startDrag = (e, onMove) => {
        e.preventDefault();
        const move = (ev) => onMove(ev);
        const upf = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', upf); document.body.classList.remove('resizing'); this.schem.applyView(); this.editor.refresh(); this.plotter.dirty = true; };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', upf);
        document.body.classList.add('resizing');
      };
      vs.addEventListener('pointerdown', (e) => startDrag(e, (ev) => {
        const r = main.getBoundingClientRect();
        const pct = Math.max(18, Math.min(70, ((ev.clientX - r.left) / r.width) * 100));
        main.style.setProperty('--code-w', pct + '%');
        this.schem.applyView();
      }));
      hs.addEventListener('pointerdown', (e) => startDrag(e, (ev) => {
        const r = $('#rightPane').getBoundingClientRect();
        const h = Math.max(90, Math.min(r.height - 160, r.bottom - ev.clientY));
        $('#rightPane').style.setProperty('--bottom-h', h + 'px');
        this.schem.applyView();
      }));
    },

    showTab(name) {
      $$('.tab').forEach((t) => t.classList.toggle('on', t.getAttribute('data-tab') === name));
      $$('.tabpane').forEach((p) => { p.hidden = p.id !== 'tab-' + name; });
      if (name === 'msgs') { this.unread = 0; this.updateBadge(); }
      if (name === 'plot') this.plotter.dirty = true;
    },

    toast(msg) {
      const t = $('#toast');
      t.textContent = msg;
      t.classList.add('show');
      clearTimeout(this._toastT);
      this._toastT = setTimeout(() => t.classList.remove('show'), 2600);
    },

    showTip(e, html) {
      if (!html) { this.hideTip(); return; }
      const tip = $('#tip');
      if (tip._h !== html) { tip.innerHTML = html; tip._h = html; }
      tip.hidden = false;
      const r = $('#circuit').getBoundingClientRect();
      let x = e.clientX - r.left + 14;
      let y = e.clientY - r.top + 16;
      const tw = tip.offsetWidth;
      const th = tip.offsetHeight;
      if (x + tw > r.width - 6) x = e.clientX - r.left - tw - 10;
      if (y + th > r.height - 6) y = e.clientY - r.top - th - 10;
      tip.style.transform = `translate(${Math.max(4, x)}px, ${Math.max(4, y)}px)`;
      this._tipEvt = e;
    },
    hideTip() { $('#tip').hidden = true; $('#tip')._h = null; },

    // ------------------------------------------------- компіляція/запуск
    compileErrorShow(e) {
      this.editor.clear();
      const where = e.line ? ` (рядок ${e.line})` : '';
      this.log(`❌ Помилка компіляції${where}: ${e.message}`, 'error', e.line);
      if (e.line) { this.editor.mark(e.line); this.editor.goto(e.line); }
      this.showTab('msgs');
      this.setStatus('error', 'Помилка компіляції');
    },

    async verify() {
      this.project.code = this.editor.get();
      this.editor.clear();
      try {
        const res = this.runtime.compile(this.project.code);
        await this.runtime.load(res);
        for (const w of res.warnings) this.log(`⚠ Рядок ${w.line}: ${w.msg}`, 'warn', w.line);
        this.log(`✅ Компіляція успішна (${Sim.Boards[this.project.board].name}). Скетч готовий до запуску.`, 'ok');
        this.toast('✅ Компіляція успішна');
        if (!this.runtime.running) this.setStatus('idle', 'Перевірено ✓');
      } catch (e) {
        if (e instanceof Sim.CompileError) this.compileErrorShow(e);
        else { this.log('❌ ' + e.message, 'error'); console.error(e); }
      }
    },

    async run() {
      this.sound.unlock();
      this.project.code = this.editor.get();
      this.save();
      this.editor.clear();
      this.engine.resetStates();
      this.clearLiveWarnings();
      $('#serialOut').textContent = '';
      this.serialLineBuf = '';
      this.plotter.clear();
      try {
        const res = await this.runtime.start(this.project.code);
        for (const w of res.warnings) this.log(`⚠ Рядок ${w.line}: ${w.msg}`, 'warn', w.line);
        this.startTime = performance.now();
        this.log(`▶ Програму запущено на ${Sim.Boards[this.project.board].name}`, 'info');
      } catch (e) {
        if (e instanceof Sim.CompileError) this.compileErrorShow(e);
        else { this.log('❌ ' + e.message, 'error'); console.error(e); }
      }
    },

    stop() {
      if (this.runtime.running) this.log('■ Програму зупинено', 'info');
      this.runtime.stop();
      this.sound.stopAll();
    },

    onRunState(on) {
      $('#btnRun').classList.toggle('running', on);
      $('#btnStop').disabled = !on;
      document.body.classList.toggle('is-running', on);
      if (on) this.setStatus('run', 'Виконується');
      else { this.setStatus('idle', 'Зупинено'); this.sound.stopAll(); }
    },

    setStatus(kind, text) {
      const s = $('#status');
      s.className = 'status ' + kind;
      s.innerHTML = `<i></i><span>${esc(text)}</span>`;
    },

    onRuntimeError(msg, line) {
      this.log(`💥 Помилка під час виконання${line ? ` (рядок ${line})` : ''}: ${msg}`, 'error', line);
      if (line) this.editor.mark(line);
      this.showTab('msgs');
    },

    // -------------------------------------------------------- Serial
    onSerialBegin(baud) {
      this.serialBaud = baud;
      const sel = $('#baud');
      if (+sel.value !== baud) {
        if (![...sel.options].some((o) => +o.value === baud)) sel.add(new Option(String(baud), String(baud)));
        sel.value = String(baud);
        this.log(`🖥 Монітор порту автоматично переключено на ${baud} бод (як у Serial.begin)`, 'info');
      }
      this.checkBaud();
    },
    checkBaud() {
      const mon = +$('#baud').value;
      const ok = !this.runtime.running || !this.runtime.serialBaud || mon === this.runtime.serialBaud || Sim.Boards[this.project.board].usbCdc;
      $('#baud').classList.toggle('mismatch', !ok);
      if (!ok) this.log(`⚠ Швидкість монітора (${mon}) не збігається з Serial.begin(${this.runtime.serialBaud}) — замість тексту будуть «кракозябри». Виберіть ${this.runtime.serialBaud} бод.`, 'warn');
    },
    serialOut(s) {
      const mon = +$('#baud').value;
      if (this.runtime.serialBaud && mon !== this.runtime.serialBaud && !Sim.Boards[this.project.board].usbCdc) {
        s = s.replace(/[^\n]/g, () => '⸮�ÿ~x'[Math.floor(Math.random() * 5)]);
      }
      this.serialBuf += s;
      if (this.serialBuf.length > 200000) this.serialBuf = this.serialBuf.slice(-100000);
    },
    flushSerial() {
      if (!this.serialBuf) return;
      const out = $('#serialOut');
      const chunk = this.serialBuf.replace(/\r\n?/g, '\n');
      this.serialBuf = '';
      // плоттер
      const all = this.serialLineBuf + chunk;
      const lines = all.split('\n');
      this.serialLineBuf = lines.pop();
      for (const l of lines) this.plotter.line(l);
      if (this.serialLineBuf.length > 2000) this.serialLineBuf = '';
      const atBottom = out.scrollTop + out.clientHeight >= out.scrollHeight - 30;
      out.textContent += chunk;
      if (out.textContent.length > 60000) out.textContent = out.textContent.slice(-40000);
      if ($('#autoscroll').checked && atBottom !== null) out.scrollTop = out.scrollHeight;
    },

    // ------------------------------------------------------ повідомлення
    log(msg, kind, line) {
      const last = this.logs[this.logs.length - 1];
      if (last && last.msg === msg) { last.n = (last.n || 1) + 1; this.renderLogs(); return; }
      this.logs.push({ msg, kind: kind || 'info', line, t: new Date() });
      if (this.logs.length > 300) this.logs.shift();
      if (kind === 'error' || kind === 'warn') { this.unread = (this.unread || 0) + 1; this.updateBadge(); }
      this.renderLogs();
    },
    clearLogs() { this.logs = []; this.renderLogs(); },
    renderLogs() {
      const box = $('#logList');
      box.innerHTML = this.logs.map((l, i) => `<div class="log ${l.kind}" data-i="${i}" ${l.line ? 'data-line="' + l.line + '" title="Перейти до рядка ' + l.line + '"' : ''}><time>${l.t.toLocaleTimeString()}</time><span>${esc(l.msg)}${l.n > 1 ? ` <b class="cnt">×${l.n}</b>` : ''}</span></div>`).join('') || '<div class="log empty">Тут з’являтимуться повідомлення компілятора та підказки.</div>';
      box.scrollTop = box.scrollHeight;
      box.onclick = (e) => {
        const d = e.target.closest('[data-line]');
        if (d) this.editor.goto(+d.getAttribute('data-line'));
      };
    },
    clearLiveWarnings() { this._liveKey = ''; $('#liveWarn').innerHTML = ''; },
    updateLiveWarnings() {
      const ws = [...this.engine.warnings.values()];
      const key = ws.map((w) => w.msg).join('|');
      if (key === this._liveKey) return;
      const prev = new Set((this._liveKey || '').split('|'));
      this._liveKey = key;
      $('#liveWarn').innerHTML = ws.map((w) => `<div class="live-w">⚠ ${esc(w.msg)}</div>`).join('');
      const fresh = ws.filter((w) => !prev.has(w.msg));
      if (fresh.length) { this.unread = (this.unread || 0) + fresh.length; this.updateBadge(); }
      $('#circuitWarn').innerHTML = ws.slice(0, 3).map((w) => `<div>⚠ ${esc(w.msg)}</div>`).join('');
      $('#circuitWarn').hidden = !ws.length;
    },
    updateBadge() {
      const b = $('#msgBadge');
      b.textContent = this.unread ? String(this.unread) : '';
      b.hidden = !this.unread;
    },

    // ------------------------------------------------------ файли
    saveFile() {
      this.project.code = this.editor.get();
      const data = JSON.stringify(Object.assign({ format: 'arduino-esp-sim', version: 1 }, this.project), null, 2);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
      a.download = (this.project.example || 'proekt') + '.sim.json';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
      this.toast('Проєкт збережено у файл');
    },
    openFile(file) {
      if (!file) return;
      const rd = new FileReader();
      rd.onload = () => {
        const txt = String(rd.result);
        try {
          if (/\.ino$|\.cpp$|\.c$|\.txt$/i.test(file.name)) {
            this.editor.set(txt);
            this.project.code = txt;
            this.save();
            this.toast(`Скетч ${file.name} відкрито`);
          } else {
            const p = JSON.parse(txt);
            if (!p.board || !Array.isArray(p.components)) throw new Error('bad');
            this.setProject(p);
            this.toast(`Проєкт ${file.name} відкрито`);
          }
        } catch (e) {
          alert('Не вдалося відкрити файл: це не проєкт симулятора (.sim.json) і не скетч (.ino)');
        }
        $('#fileInput').value = '';
      };
      rd.readAsText(file);
    },

    // ------------------------------------------------------ цикл кадрів
    loop() {
      let last = performance.now();
      let acc = 0;
      const frame = (t) => {
        const dt = Math.min(0.1, (t - last) / 1000);
        last = t;
        try {
          this.engine.frame(dt);
          this.schem.refresh();
        } catch (e) { console.error(e); }
        this.flushSerial();
        this.plotter.draw();
        acc += dt;
        if (acc > 0.2) {
          acc = 0;
          this.updateLiveWarnings();
          this.refreshProps();
          if (this.runtime.running && this.startTime) {
            const sec = Math.floor((performance.now() - this.startTime) / 1000);
            const txt = `Виконується · ${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
            const sp = $('#status span');
            if (sp && sp.textContent !== txt) sp.textContent = txt;
          }
          if (this._tipEvt && !$('#tip').hidden) {
            // оновлюємо значення в підказці
            const e = this._tipEvt;
            const target = document.elementFromPoint(e.clientX, e.clientY);
            if (target && target.closest('#schem')) target.dispatchEvent(new PointerEvent('pointermove', { clientX: e.clientX, clientY: e.clientY, bubbles: true }));
          }
        }
        requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    },
  };

  Sim.App = App;
  window.addEventListener('DOMContentLoaded', () => App.init());
})(window);
