/*
 * Редактор схеми на SVG: плата, компоненти, дроти, масштабування,
 * перетягування, інтерактивні елементи (кнопки, потенціометри...).
 */
(function (G) {
  'use strict';
  const Sim = (G.Sim = G.Sim || {});
  const NS = 'http://www.w3.org/2000/svg';
  const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  const SNAP = 10;
  const snap = (v) => Math.round(v / SNAP) * SNAP;

  function el(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }

  function rot(x, y, deg) {
    const r = (deg * Math.PI) / 180;
    const c = Math.round(Math.cos(r) * 1e6) / 1e6;
    const s = Math.round(Math.sin(r) * 1e6) / 1e6;
    return [x * c - y * s, x * s + y * c];
  }

  class Schematic {
    constructor(svg, app) {
      this.svg = svg;
      this.app = app;
      this.view = { x: -60, y: -260, s: 1 };
      this.sel = null;
      this.wiring = null;
      this.compEls = new Map();
      this.wireEls = new Map();
      this.pinsCache = [];
      this.build();
      this.bind();
    }

    get project() { return this.app.project; }
    get engine() { return this.app.engine; }

    build() {
      const svg = this.svg;
      svg.innerHTML = '';
      const defs = el('defs', null, svg);
      defs.innerHTML = `
        <filter id="glow" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="6"/></filter>
        <filter id="selglow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="0" stdDeviation="3" flood-color="#2f8cff" flood-opacity="0.9"/></filter>
        <filter id="warnglow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="0" stdDeviation="4" flood-color="#ff3b30" flood-opacity="0.95"/></filter>
        <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse"><circle cx="10" cy="10" r="1" class="griddot"/></pattern>
        <pattern id="mesh" width="3" height="3" patternUnits="userSpaceOnUse"><rect width="3" height="3" fill="#777"/><circle cx="1.5" cy="1.5" r="0.9" fill="#444"/></pattern>`;
      this.gBg = el('rect', { x: -10000, y: -10000, width: 20000, height: 20000, fill: 'url(#grid)', class: 'bg' }, svg);
      this.gBoard = el('g', { class: 'layer-board' }, svg);
      this.gParts = el('g', { class: 'layer-parts' }, svg);
      this.gWires = el('g', { class: 'layer-wires' }, svg);
      this.gLabels = el('g', { class: 'layer-labels' }, svg);
      this.gOver = el('g', { class: 'layer-over' }, svg);
      this.preview = el('path', { class: 'wire-preview', d: '' }, this.gOver);
      this.hoverRing = el('circle', { class: 'pin-hover', r: 7, cx: -9999, cy: -9999 }, this.gOver);
      this.applyView();
    }

    applyView() {
      const r = this.svg.getBoundingClientRect();
      const w = Math.max(10, r.width) / this.view.s;
      const h = Math.max(10, r.height) / this.view.s;
      this.svg.setAttribute('viewBox', `${this.view.x} ${this.view.y} ${w} ${h}`);
    }

    toWorld(e) {
      const r = this.svg.getBoundingClientRect();
      return { x: this.view.x + (e.clientX - r.left) / this.view.s, y: this.view.y + (e.clientY - r.top) / this.view.s };
    }

    // ------------------------------------------------------------ рендер
    render() {
      const p = this.project;
      const board = Sim.Boards[p.board];
      this.gBoard.innerHTML = '';
      this.gParts.innerHTML = '';
      this.gWires.innerHTML = '';
      this.gLabels.innerHTML = '';
      this.compEls.clear();
      this.wireEls.clear();
      // плата
      const bp = p.boardPos || { x: 0, y: 0 };
      const bg = el('g', { class: 'board', transform: `translate(${bp.x},${bp.y})` }, this.gBoard);
      bg.innerHTML = board.svg();
      for (const pin of board.pins) {
        const nc = pin.kind === 'nc';
        const g = el('g', { class: 'bpin' + (nc ? ' nc' : '') }, bg);
        el('rect', { x: pin.x - 5, y: pin.y - 5, width: 10, height: 10, rx: 1.5, class: 'bpin-sq' }, g);
        el('circle', { cx: pin.x, cy: pin.y, r: 2.4, class: 'bpin-hole' }, g);
        const ty = pin.dir === 'up' ? pin.y + 10 : pin.y - 10;
        const t = el('text', {
          x: pin.x, y: ty, class: 'bpin-label' + (pin.kind === 'gnd' ? ' gnd' : pin.kind === 'v5' || pin.kind === 'v33' || pin.kind === 'vin' ? ' pwr' : ''),
          transform: `rotate(-90 ${pin.x} ${ty})`, 'text-anchor': pin.dir === 'up' ? 'end' : 'start', 'dominant-baseline': 'middle',
        }, g);
        t.textContent = pin.label;
      }
      if (board.led) {
        this.boardLed = el('circle', { cx: board.led.x, cy: board.led.y, r: 4, class: 'board-led' }, bg);
        this.boardLedGlow = el('circle', { cx: board.led.x, cy: board.led.y, r: 10, fill: board.id === 'uno' ? '#ffb020' : '#3a8bff', opacity: 0, filter: 'url(#glow)' }, bg);
      }
      this.boardEl = bg;
      // компоненти
      for (const c of p.components) this.renderComp(c);
      for (const w of p.wires) this.renderWire(w);
      this.refreshPins();
      this.markSelection();
    }

    renderComp(c) {
      const def = Sim.Components[c.type];
      if (!def) return;
      const g = el('g', { class: 'comp', 'data-id': c.id }, this.gParts);
      const body = el('g', { class: 'cbody' }, g);
      body.innerHTML = def.svg(c);
      for (const pin of def.pins) {
        el('circle', { cx: pin.x, cy: pin.y, r: 3.4, class: 'cpin' }, body);
      }
      const label = el('text', { class: 'clabel' }, this.gLabels);
      this.compEls.set(c.id, { g, body, label, def });
      this.placeComp(c);
    }

    placeComp(c) {
      const e = this.compEls.get(c.id);
      if (!e) return;
      e.body.setAttribute('transform', `translate(${c.x},${c.y}) rotate(${c.rot || 0})`);
      const [lx, ly, anchor] = this.labelPos(c, e.def);
      e.label.setAttribute('x', lx);
      e.label.setAttribute('y', ly);
      e.label.setAttribute('text-anchor', anchor);
      const val = e.def.label ? e.def.label(c) : '';
      e.label.textContent = c.name + (val ? ' · ' + val : '');
    }

    labelPos(c, def) {
      const r = ((c.rot || 0) % 360 + 360) % 360;
      const ly = def.labelY || 30;
      const hh = def.halfH || 10;
      if (r === 0 && def.labelSide) return [c.x + def.labelSide[0], c.y + def.labelSide[1], 'start'];
      if (r === 0) return [c.x, c.y + ly, 'middle'];
      if (r === 180) return [c.x, c.y - ly + 8, 'middle'];
      return [c.x - hh - 6, c.y + 4, 'end'];
    }

    renderWire(w) {
      const g = el('g', { class: 'wire', 'data-id': w.id }, this.gWires);
      const under = el('path', { class: 'wire-under' }, g);
      const path = el('path', { class: 'wire-path', stroke: w.color || '#2e7d32' }, g);
      const hit = el('path', { class: 'wire-hit' }, g);
      const ends = [el('circle', { r: 2.6, class: 'wire-end' }, g), el('circle', { r: 2.6, class: 'wire-end' }, g)];
      this.wireEls.set(w.id, { g, under, path, hit, ends });
      this.placeWire(w);
    }

    placeWire(w) {
      const e = this.wireEls.get(w.id);
      if (!e) return;
      const a = this.pinPos(w.a);
      const b = this.pinPos(w.b);
      if (!a || !b) { e.g.style.display = 'none'; return; }
      e.g.style.display = '';
      const d = this.wireD(a, b);
      e.under.setAttribute('d', d);
      e.path.setAttribute('d', d);
      e.hit.setAttribute('d', d);
      e.path.setAttribute('stroke', w.color || '#2e7d32');
      e.ends[0].setAttribute('cx', a.x); e.ends[0].setAttribute('cy', a.y);
      e.ends[1].setAttribute('cx', b.x); e.ends[1].setAttribute('cy', b.y);
    }

    wireD(a, b) {
      const dist = Math.hypot(b.x - a.x, b.y - a.y);
      const k = Math.max(18, Math.min(90, dist * 0.45));
      const da = DIRS[a.dir] || [0, 0];
      const db = DIRS[b.dir] || [0, 0];
      const c1 = [a.x + da[0] * k, a.y + da[1] * k];
      const c2 = [b.x + db[0] * k, b.y + db[1] * k];
      return `M${a.x},${a.y} C${c1[0]},${c1[1]} ${c2[0]},${c2[1]} ${b.x},${b.y}`;
    }

    // позиція виводу за посиланням "B:D13" або "c3:A"
    pinPos(ref) {
      const i = ref.indexOf(':');
      const owner = ref.slice(0, i);
      const pid = ref.slice(i + 1);
      if (owner === 'B') {
        const board = Sim.Boards[this.project.board];
        const pin = board.pinById[pid];
        if (!pin || pin.kind === 'nc') return null;
        const bp = this.project.boardPos || { x: 0, y: 0 };
        return { x: bp.x + pin.x, y: bp.y + pin.y, dir: pin.dir, pin, owner: 'B' };
      }
      const c = this.app.compById(owner);
      if (!c) return null;
      const def = Sim.Components[c.type];
      const pin = def.pins.find((p) => p.id === pid);
      if (!pin) return null;
      const [rx, ry] = rot(pin.x, pin.y, c.rot || 0);
      const dv = DIRS[pin.dir];
      const [dx, dy] = rot(dv[0], dv[1], c.rot || 0);
      let dir = 'down';
      if (Math.abs(dx) > Math.abs(dy)) dir = dx > 0 ? 'right' : 'left';
      else dir = dy > 0 ? 'down' : 'up';
      return { x: c.x + rx, y: c.y + ry, dir, pin, owner: c };
    }

    refreshPins() {
      const list = [];
      const board = Sim.Boards[this.project.board];
      for (const pin of board.pins) {
        if (pin.kind === 'nc') continue;
        const ref = 'B:' + pin.id;
        const p = this.pinPos(ref);
        list.push({ ref, x: p.x, y: p.y });
      }
      for (const c of this.project.components) {
        const def = Sim.Components[c.type];
        if (!def) continue;
        for (const pin of def.pins) {
          const ref = c.id + ':' + pin.id;
          const p = this.pinPos(ref);
          if (p) list.push({ ref, x: p.x, y: p.y });
        }
      }
      this.pinsCache = list;
    }

    hitPin(pt) {
      let best = null;
      let bd = 8 / Math.min(1.4, Math.max(0.6, this.view.s)) + 1;
      for (const p of this.pinsCache) {
        const d = Math.hypot(p.x - pt.x, p.y - pt.y);
        if (d < bd) { bd = d; best = p; }
      }
      return best;
    }

    updateWiresFor(ownerId) {
      for (const w of this.project.wires) {
        if (!ownerId || w.a.startsWith(ownerId + ':') || w.b.startsWith(ownerId + ':')) this.placeWire(w);
      }
    }

    // --------------------------------------------------------- вибір
    select(sel) {
      this.sel = sel;
      this.markSelection();
      this.app.onSelect(sel);
    }

    markSelection() {
      for (const [id, e] of this.compEls) e.g.classList.toggle('selected', !!(this.sel && this.sel.type === 'comp' && this.sel.id === id));
      for (const [id, e] of this.wireEls) e.g.classList.toggle('selected', !!(this.sel && this.sel.type === 'wire' && this.sel.id === id));
      if (this.boardEl) this.boardEl.classList.toggle('selected', !!(this.sel && this.sel.type === 'board'));
    }

    // ------------------------------------------------------- події
    bind() {
      const svg = this.svg;
      let drag = null;

      svg.addEventListener('pointerdown', (e) => {
        if (e.button === 2) return;
        const pt = this.toWorld(e);
        svg.setPointerCapture(e.pointerId);
        this.app.hideTip();
        const pin = this.hitPin(pt);
        const actEl = e.target.closest && e.target.closest('[data-act]');
        const compEl = e.target.closest && e.target.closest('.comp');
        // інтерактивні частини мають пріоритет над виводами
        if (actEl && compEl && !(pin && Math.hypot(pin.x - pt.x, pin.y - pt.y) < 4)) {
          const c = this.app.compById(compEl.getAttribute('data-id'));
          const def = Sim.Components[c.type];
          const act = def.act && def.act[actEl.getAttribute('data-act')];
          if (act) {
            const s = this.engine.state(c);
            if (act.down) act.down(c, s);
            if (act.click && act.click(c, s)) { this.placeComp(c); this.app.changed(false); }
            this.engine.dirty = true;
            drag = { kind: 'act', c, s, act, last: pt };
            this.select({ type: 'comp', id: c.id });
            e.preventDefault();
            return;
          }
        }
        if (pin) {
          if (this.wiring) { this.finishWire(pin.ref); drag = null; return; }
          this.wiring = { from: pin.ref, start: pt, moved: false };
          this.updatePreview(pt);
          drag = { kind: 'wire', start: pt };
          return;
        }
        if (this.wiring) { this.cancelWire(); }
        const wireEl = e.target.closest && e.target.closest('.wire');
        if (wireEl) {
          this.select({ type: 'wire', id: wireEl.getAttribute('data-id') });
          drag = null;
          return;
        }
        if (compEl) {
          const c = this.app.compById(compEl.getAttribute('data-id'));
          this.select({ type: 'comp', id: c.id });
          drag = { kind: 'comp', c, off: { x: pt.x - c.x, y: pt.y - c.y }, start: pt, moved: false };
          compEl.parentNode.appendChild(compEl);
          return;
        }
        if (e.target.closest && e.target.closest('.board')) {
          const bp = this.project.boardPos || (this.project.boardPos = { x: 0, y: 0 });
          this.select({ type: 'board' });
          drag = { kind: 'board', off: { x: pt.x - bp.x, y: pt.y - bp.y }, moved: false };
          return;
        }
        this.select(null);
        drag = { kind: 'pan', sx: e.clientX, sy: e.clientY, vx: this.view.x, vy: this.view.y };
        svg.classList.add('panning');
      });

      svg.addEventListener('pointermove', (e) => {
        const pt = this.toWorld(e);
        if (this.wiring) {
          this.updatePreview(pt);
          if (drag && drag.kind === 'wire' && Math.hypot(pt.x - drag.start.x, pt.y - drag.start.y) > 6) this.wiring.moved = true;
        }
        if (drag) {
          if (drag.kind === 'pan') {
            this.view.x = drag.vx - (e.clientX - drag.sx) / this.view.s;
            this.view.y = drag.vy - (e.clientY - drag.sy) / this.view.s;
            this.applyView();
            return;
          }
          if (drag.kind === 'comp') {
            const nx = snap(pt.x - drag.off.x);
            const ny = snap(pt.y - drag.off.y);
            if (nx !== drag.c.x || ny !== drag.c.y) {
              drag.c.x = nx;
              drag.c.y = ny;
              drag.moved = true;
              this.placeComp(drag.c);
              this.updateWiresFor(drag.c.id);
            }
            return;
          }
          if (drag.kind === 'board') {
            const bp = this.project.boardPos;
            const nx = snap(pt.x - drag.off.x);
            const ny = snap(pt.y - drag.off.y);
            if (nx !== bp.x || ny !== bp.y) {
              bp.x = nx;
              bp.y = ny;
              drag.moved = true;
              this.boardEl.setAttribute('transform', `translate(${bp.x},${bp.y})`);
              this.updateWiresFor('B');
            }
            return;
          }
          if (drag.kind === 'act' && drag.act.drag) {
            const dy = (pt.y - drag.last.y) * this.view.s;
            drag.last = pt;
            if (drag.act.drag(drag.c, drag.s, dy)) {
              this.placeComp(drag.c);
              this.engine.dirty = true;
              this.app.refreshProps();
            }
            return;
          }
        }
        // підсвітка виводу та підказка
        const pin = this.hitPin(pt);
        if (pin) {
          this.hoverRing.setAttribute('cx', pin.x);
          this.hoverRing.setAttribute('cy', pin.y);
          this.app.showTip(e, this.pinTip(pin.ref));
          svg.style.cursor = 'crosshair';
        } else {
          this.hoverRing.setAttribute('cx', -9999);
          svg.style.cursor = '';
          const compEl = e.target.closest && e.target.closest('.comp');
          if (compEl) {
            const c = this.app.compById(compEl.getAttribute('data-id'));
            const def = c && Sim.Components[c.type];
            if (def && def.info) this.app.showTip(e, def.info(c, this.engine.state(c)));
            else this.app.hideTip();
          } else this.app.hideTip();
        }
      });

      const up = (e) => {
        const pt = this.toWorld(e);
        if (drag && drag.kind === 'wire' && this.wiring && this.wiring.moved) {
          const pin = this.hitPin(pt);
          if (pin && pin.ref !== this.wiring.from) this.finishWire(pin.ref);
        }
        if (drag && drag.kind === 'act') {
          if (drag.act.up) drag.act.up(drag.c, drag.s);
          this.engine.dirty = true;
          if (drag.act.drag) this.app.changed(false);
        }
        if (drag && (drag.kind === 'comp' || drag.kind === 'board') && drag.moved) {
          this.refreshPins();
          this.app.changed(false);
        }
        svg.classList.remove('panning');
        drag = null;
      };
      svg.addEventListener('pointerup', up);
      svg.addEventListener('pointercancel', up);
      svg.addEventListener('pointerleave', () => { this.app.hideTip(); });

      svg.addEventListener('wheel', (e) => {
        e.preventDefault();
        const compEl = e.target.closest && e.target.closest('.comp');
        if (compEl && !e.ctrlKey) {
          const c = this.app.compById(compEl.getAttribute('data-id'));
          const def = Sim.Components[c.type];
          if (def.wheel) {
            if (def.wheel(c, this.engine.state(c), Math.sign(e.deltaY))) {
              this.placeComp(c);
              this.engine.dirty = true;
              this.app.refreshProps();
              this.app.changed(false);
              if (def.info) this.app.showTip(e, def.info(c, this.engine.state(c)));
            }
            return;
          }
        }
        const f = Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0015));
        this.zoomAt(e, f);
      }, { passive: false });

      svg.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        if (this.wiring) this.cancelWire();
      });

      window.addEventListener('resize', () => this.applyView());
      if (window.ResizeObserver) new ResizeObserver(() => this.applyView()).observe(svg);
    }

    zoomAt(e, f) {
      const r = this.svg.getBoundingClientRect();
      const cx = e ? e.clientX - r.left : r.width / 2;
      const cy = e ? e.clientY - r.top : r.height / 2;
      const wx = this.view.x + cx / this.view.s;
      const wy = this.view.y + cy / this.view.s;
      this.view.s = Math.max(0.25, Math.min(4, this.view.s * f));
      this.view.x = wx - cx / this.view.s;
      this.view.y = wy - cy / this.view.s;
      this.applyView();
    }

    fit() {
      const p = this.project;
      const board = Sim.Boards[p.board];
      const bp = p.boardPos || { x: 0, y: 0 };
      let x0 = bp.x - 30;
      let y0 = bp.y - (p.components.length ? 30 : 200);
      let x1 = bp.x + board.width + 30;
      let y1 = bp.y + board.height + 30;
      for (const c of p.components) {
        const e = this.compEls.get(c.id);
        if (!e) continue;
        try {
          const bb = e.body.getBBox();
          const pts = [[bb.x, bb.y], [bb.x + bb.width, bb.y], [bb.x, bb.y + bb.height], [bb.x + bb.width, bb.y + bb.height]].map(([x, y]) => rot(x, y, c.rot || 0));
          for (const [x, y] of pts) {
            x0 = Math.min(x0, c.x + x - 20); x1 = Math.max(x1, c.x + x + 20);
            y0 = Math.min(y0, c.y + y - 20); y1 = Math.max(y1, c.y + y + 30);
          }
        } catch (err) { /* */ }
      }
      const r = this.svg.getBoundingClientRect();
      const s = Math.min(r.width / (x1 - x0), r.height / (y1 - y0), 1.15);
      this.view.s = Math.max(0.25, s);
      this.view.x = x0 - (r.width / this.view.s - (x1 - x0)) / 2;
      this.view.y = y0 - (r.height / this.view.s - (y1 - y0)) / 2;
      this.applyView();
    }

    // ------------------------------------------------------- дроти
    updatePreview(pt) {
      if (!this.wiring) { this.preview.setAttribute('d', ''); return; }
      const a = this.pinPos(this.wiring.from);
      const hp = this.hitPin(pt);
      const b = hp ? this.pinPos(hp.ref) : { x: pt.x, y: pt.y, dir: null };
      this.preview.setAttribute('d', this.wireD(a, b));
    }

    finishWire(to) {
      const from = this.wiring.from;
      this.wiring = null;
      this.preview.setAttribute('d', '');
      if (from === to) return;
      const exists = this.project.wires.some((w) => (w.a === from && w.b === to) || (w.a === to && w.b === from));
      if (exists) return;
      const w = { id: this.app.newId('w'), a: from, b: to, color: this.app.pickWireColor(from, to) };
      this.project.wires.push(w);
      this.renderWire(w);
      this.select({ type: 'wire', id: w.id });
      this.app.changed(true);
    }

    cancelWire() {
      this.wiring = null;
      this.preview.setAttribute('d', '');
    }

    pinTip(ref) {
      const p = this.pinPos(ref);
      if (!p) return '';
      const eng = this.engine;
      let name;
      if (p.owner === 'B') {
        const board = Sim.Boards[this.project.board];
        const pin = p.pin;
        name = `<b>${pin.label}</b>`;
        if (pin.gpio != null) {
          const bits = [];
          if (board.id !== 'uno') bits.push('GPIO' + pin.gpio);
          if (board.pwmPins.includes(pin.gpio)) bits.push('ШІМ');
          if (board.adcPins.includes(pin.gpio)) bits.push('АЦП');
          if (board.inputOnly && board.inputOnly.includes(pin.gpio)) bits.push('лише вхід');
          if (board.dacPins && board.dacPins.includes(pin.gpio)) bits.push('ЦАП');
          if (pin.gpio === board.sda) bits.push('I2C SDA');
          if (pin.gpio === board.scl) bits.push('I2C SCL');
          if (bits.length) name += ` <span class="tip-dim">(${bits.join(', ')})</span>`;
          const rt = this.app.runtime;
          const st = rt.running ? rt.pins.get(pin.gpio) : null;
          let mode = 'вхід';
          if (st) {
            if (st.mode === 'output') {
              if (st.servo != null) mode = `серво ${Math.round(st.servo)}°`;
              else if (st.tone) mode = `tone ${st.tone} Гц`;
              else if (st.dac != null) mode = `ЦАП ${st.dac.toFixed(2)} В`;
              else if (st.duty != null) mode = `ШІМ ${Math.round(st.duty * 100)}%`;
              else mode = st.value ? 'вихід HIGH' : 'вихід LOW';
            } else if (st.mode === 'input_pullup') mode = 'вхід з підтяжкою';
            else if (st.mode === 'input_pulldown') mode = 'вхід зі стяжкою';
          }
          name += `<br>Режим: ${rt.running ? mode : 'програма не запущена'}`;
        } else if (pin.kind === 'gnd') name += ' <span class="tip-dim">— земля (0 В)</span>';
        else if (pin.kind === 'v5' || pin.kind === 'vin') name += ' <span class="tip-dim">— живлення 5 В (USB)</span>';
        else if (pin.kind === 'v33') name += ' <span class="tip-dim">— живлення 3.3 В</span>';
      } else {
        name = `<b>${p.owner.name}</b>: ${p.pin.name}`;
      }
      if (eng.topoDirty) eng.buildTopology();
      const node = eng.nodeOf(ref);
      let v = '';
      if (node === -1) v = '0.00 В';
      else if (node != null) v = Sim.fmt.fmtV(eng.V[node] || 0);
      else v = 'не підключено';
      return `${name}<br>Напруга: <b>${v}</b>`;
    }

    // ------------------------------------------------- оновлення кадру
    refresh() {
      const eng = this.engine;
      const warnIds = new Set();
      for (const w of eng.warnings.values()) if (w.compId) warnIds.add(w.compId);
      for (const c of this.project.components) {
        const e = this.compEls.get(c.id);
        if (!e) continue;
        const s = eng.state(c);
        if (e.def.refresh) e.def.refresh(c, s, e.body);
        const warn = warnIds.has(c.id) || s.burnt;
        if (e._warn !== warn) { e.g.classList.toggle('warn', warn); e._warn = warn; }
      }
      // світлодіод на платі
      const board = Sim.Boards[this.project.board];
      if (board.led && this.boardLed) {
        const rt = this.app.runtime;
        let b = 0;
        if (rt.running) {
          const st = rt.pins.get(board.led.gpio);
          if (st && st.mode === 'output') {
            let lvl = st.duty != null ? st.duty : st.value;
            if (board.led.activeLow) lvl = 1 - lvl;
            b = lvl;
          } else if (st && st.mode === 'input_pullup' && !board.led.activeLow) b = 0.08;
          if (board.led.activeLow && (!st || st.mode !== 'output')) b = 0;
        }
        this.boardLedGlow.setAttribute('opacity', (Math.sqrt(b) * 0.9).toFixed(2));
        this.boardLed.setAttribute('fill', b > 0.02 ? (board.id === 'uno' ? '#ffcc33' : '#6aa8ff') : (board.id === 'uno' ? '#7a5a1a' : '#24406e'));
      }
    }
  }

  Sim.Schematic = Schematic;
  Sim.rot = rot;
})(typeof window !== 'undefined' ? window : globalThis);
