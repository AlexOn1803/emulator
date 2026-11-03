/*
 * Бібліотека компонентів.
 * Кожен компонент описує: виводи, властивості, електричну модель
 * (stamp/update/measure), анімацію та малюнок SVG.
 */
(function (G) {
  'use strict';
  const Sim = (G.Sim = G.Sim || {});
  const C = (Sim.Components = {});

  // ---------------------------------------------------------------- утиліти
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

  function fmtR(r) {
    if (r >= 1e6) return +(r / 1e6).toFixed(2) + ' МОм';
    if (r >= 1e3) return +(r / 1e3).toFixed(2) + ' кОм';
    return +(+r).toFixed(2) + ' Ом';
  }
  function fmtI(a) {
    const ma = a * 1000;
    if (Math.abs(ma) >= 1000) return (a).toFixed(2) + ' А';
    if (Math.abs(ma) >= 10) return ma.toFixed(0) + ' мА';
    if (Math.abs(ma) >= 0.1) return ma.toFixed(1) + ' мА';
    return (ma * 1000).toFixed(0) + ' мкА';
  }
  function fmtV(v) { return (Math.abs(v) < 0.005 ? 0 : v).toFixed(2) + ' В'; }
  function parseR(str) {
    if (typeof str === 'number') return str;
    const m = /^\s*([\d.,]+)\s*([kкmмKКMМ]?)/.exec(String(str));
    if (!m) return NaN;
    let v = parseFloat(m[1].replace(',', '.'));
    const s = m[2].toLowerCase();
    if (s === 'k' || s === 'к') v *= 1e3;
    if (s === 'm' || s === 'м') v *= 1e6;
    return v;
  }
  Sim.fmt = { fmtR, fmtI, fmtV, parseR, esc };

  const leg = (x1, y1, x2, y2, cls) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="leg ${cls || ''}"/>`;
  const q = (el, sel) => {
    const c = el._q || (el._q = {});
    if (!(sel in c)) c[sel] = el.querySelector(sel);
    return c[sel];
  };

  // кусково-лінійний діод
  function dStamp(m, on, a, k, vf, rs) { if (on) m.addVS(a, k, vf, rs); else m.addG(a, k, 1e-9); }
  function dUpdate(st, key, vd, vf) {
    const on = st[key];
    if (!on && vd > vf + 1e-6) { st[key] = true; return true; }
    if (on && vd < vf - 1e-6) { st[key] = false; return true; }
    return false;
  }
  function dCurrent(on, vd, vf, rs) { return on ? (vd - vf) / rs : vd * 1e-9; }

  const BAND = ['#111', '#7a3d0f', '#d42020', '#f07c00', '#f2d20c', '#2a9d2a', '#2457d6', '#8a2bd8', '#8a8a8a', '#f4f4f4'];
  function bands(r) {
    if (!(r > 0)) r = 1;
    let exp = Math.floor(Math.log10(r)) - 1;
    let dd = Math.round(r / Math.pow(10, exp));
    if (dd >= 100) { dd = Math.round(dd / 10); exp++; }
    const d1 = Math.floor(dd / 10) % 10;
    const d2 = dd % 10;
    const mult = exp === -1 ? '#c9a227' : exp === -2 ? '#c0c0c0' : BAND[clamp(exp, 0, 9)];
    return [BAND[d1], BAND[d2], mult, '#c9a227'];
  }

  // ------------------------------------------------------------- Резистор
  C.resistor = {
    halfH: 7,
    title: 'Резистор',
    cat: 'Пасивні',
    prefix: 'R',
    pins: [
      { id: 'A', x: -30, y: 0, dir: 'left', name: 'вивід 1' },
      { id: 'B', x: 30, y: 0, dir: 'right', name: 'вивід 2' },
    ],
    defaults: { r: 220 },
    props: [{ key: 'r', label: 'Опір', type: 'resistance', options: [10, 47, 100, 150, 220, 330, 470, 680, 1000, 2200, 4700, 10000, 22000, 47000, 100000, 1000000] }],
    labelY: 18,
    label: (c) => fmtR(c.props.r),
    stamp(c, s, m, nd) { m.addG(nd.A, nd.B, 1 / Math.max(0.01, c.props.r)); },
    measure(c, s, ctx, nd) {
      const v = ctx.v(nd.A) - ctx.v(nd.B);
      const I = v / Math.max(0.01, c.props.r);
      return { I, V: v, P: I * I * c.props.r };
    },
    check(c, s, ctx) {
      if (s.m.P > 0.25) ctx.warn('rp' + c.id, `Резистор ${c.name} перегрівається: ${(s.m.P).toFixed(2)} Вт (звичайний резистор розрахований на 0.25 Вт)`, c.id);
    },
    svg(c) {
      const b = bands(c.props.r);
      return `${leg(-30, 0, -15, 0)}${leg(15, 0, 30, 0)}
        <rect x="-17" y="-6.5" width="34" height="13" rx="6" fill="#e3c393" stroke="#9c7b4c" class="rbody"/>
        <rect x="-11" y="-6.5" width="3.2" height="13" fill="${b[0]}" class="b0"/>
        <rect x="-5" y="-6.5" width="3.2" height="13" fill="${b[1]}" class="b1"/>
        <rect x="1" y="-6.5" width="3.2" height="13" fill="${b[2]}" class="b2"/>
        <rect x="9" y="-6.5" width="3.2" height="13" fill="${b[3]}"/>`;
    },
    refresh(c, s, el) {
      const hot = clamp(((s.m.P || 0) - 0.25) / 0.5, 0, 1);
      const body = q(el, '.rbody');
      if (body) body.setAttribute('fill', hot > 0 ? `rgb(${227 + 28 * hot | 0},${195 - 120 * hot | 0},${147 - 120 * hot | 0})` : '#e3c393');
    },
    info: (c, s) => `${c.name}: ${fmtR(c.props.r)} · ${fmtI(Math.abs(s.m.I || 0))} · ${fmtV(Math.abs(s.m.V || 0))}`,
  };

  // ----------------------------------------------------------- Світлодіод
  const LED = {
    red: { vf: 1.8, glow: '#ff2020', body: '#e33', dark: '#7a1515', name: 'Червоний' },
    green: { vf: 2.1, glow: '#30ff50', body: '#3c3', dark: '#155a1a', name: 'Зелений' },
    yellow: { vf: 2.0, glow: '#ffe020', body: '#ec3', dark: '#6e5c10', name: 'Жовтий' },
    blue: { vf: 2.9, glow: '#3a8bff', body: '#37d', dark: '#16306a', name: 'Синій' },
    white: { vf: 3.0, glow: '#ffffff', body: '#eee', dark: '#8a8a8a', name: 'Білий' },
  };
  const LED_RS = 15;
  C.led = {
    halfH: 14,
    labelSide: [17, -6],
    title: 'Світлодіод',
    cat: 'Світло і звук',
    prefix: 'LED',
    pins: [
      { id: 'A', x: -10, y: 30, dir: 'down', name: 'анод (+, довга ніжка)' },
      { id: 'K', x: 10, y: 30, dir: 'down', name: 'катод (−, коротка ніжка)' },
    ],
    defaults: { color: 'red' },
    props: [{ key: 'color', label: 'Колір', type: 'select', options: Object.entries(LED).map(([k, v]) => [k, v.name]) }],
    labelY: 44,
    label: (c) => LED[c.props.color].name,
    init: () => ({ on: false, burnt: false, over: 0, bright: 0 }),
    stamp(c, s, m, nd) { if (!s.burnt) dStamp(m, s.on, nd.A, nd.K, LED[c.props.color].vf, LED_RS); },
    update(c, s, ctx, nd) { return s.burnt ? false : dUpdate(s, 'on', ctx.v(nd.A) - ctx.v(nd.K), LED[c.props.color].vf); },
    measure(c, s, ctx, nd) {
      if (s.burnt) return { I: 0 };
      return { I: dCurrent(s.on, ctx.v(nd.A) - ctx.v(nd.K), LED[c.props.color].vf, LED_RS) };
    },
    check(c, s, ctx, nd) {
      if (!s.burnt && s.m.I > 0.025) ctx.warn('ledI' + c.id, `Світлодіод ${c.name}: струм ${fmtI(s.m.I)} — забагато (норма 5–20 мА). Додайте резистор 220–330 Ом.`, c.id);
    },
    animate(c, s, dt, ctx) {
      const I = s.m.I || 0;
      if (!s.burnt && I > 0.045) {
        s.over += dt;
        if (s.over > 0.25) {
          s.burnt = true;
          ctx.log(`💥 Світлодіод ${c.name} перегорів (струм ${fmtI(I)})! Світлодіод завжди вмикають через резистор. Натисніть «Запуск» ще раз, щоб замінити його.`, 'error');
          ctx.engine.dirty = true;
        }
      } else s.over = Math.max(0, s.over - dt);
      s.bright = clamp(I / 0.012, 0, 1);
    },
    svg(c) {
      const col = LED[c.props.color];
      return `${leg(-10, 6, -10, 30)}${leg(10, 6, 10, 24)}${leg(10, 24, 10, 30)}
        <circle class="glow" cx="0" cy="-6" r="20" fill="${col.glow}" opacity="0" filter="url(#glow)"/>
        <path class="dome" d="M-12,6 L-12,-6 A12,12 0 0 1 12,-6 L12,6 Z" fill="${col.dark}" stroke="rgba(0,0,0,.35)" fill-opacity="0.92"/>
        <rect x="-14" y="5" width="28" height="4" rx="1" fill="${col.dark}" class="rim"/>
        <path d="M-6,-8 A6,6 0 0 1 0,-14" stroke="rgba(255,255,255,.55)" stroke-width="2" fill="none"/>
        <text x="-15" y="26" font-size="9" fill="#c00" font-weight="700">+</text>
        <g class="burnt" visibility="hidden"><path d="M-7,-12 L7,2 M7,-12 L-7,2" stroke="#222" stroke-width="2.5"/></g>`;
    },
    refresh(c, s, el) {
      const col = LED[c.props.color];
      const b = s.burnt ? 0 : s.bright;
      q(el, '.glow').setAttribute('opacity', (Math.sqrt(b) * 0.95).toFixed(3));
      const fill = s.burnt ? '#444' : b > 0.02 ? col.body : col.dark;
      q(el, '.dome').setAttribute('fill', fill);
      q(el, '.rim').setAttribute('fill', fill);
      q(el, '.burnt').setAttribute('visibility', s.burnt ? 'visible' : 'hidden');
    },
    info: (c, s) => `${c.name} (${LED[c.props.color].name.toLowerCase()}): ${s.burnt ? 'ПЕРЕГОРІВ' : fmtI(s.m.I || 0)}`,
  };

  // --------------------------------------------------------------- RGB LED
  const RGB_VF = { R: 1.9, G: 2.7, B: 2.8 };
  C.rgbled = {
    halfH: 16,
    labelSide: [19, -8],
    title: 'RGB світлодіод',
    cat: 'Світло і звук',
    prefix: 'RGB',
    pins: [
      { id: 'R', x: -21, y: 34, dir: 'down', name: 'червоний (+)' },
      { id: 'K', x: -7, y: 34, dir: 'down', name: 'спільний катод (−)' },
      { id: 'G', x: 7, y: 34, dir: 'down', name: 'зелений (+)' },
      { id: 'B', x: 21, y: 34, dir: 'down', name: 'синій (+)' },
    ],
    defaults: {},
    props: [],
    labelY: 48,
    label: () => 'спільний катод',
    init: () => ({ R: false, G: false, B: false, col: [0, 0, 0] }),
    stamp(c, s, m, nd) { for (const k of ['R', 'G', 'B']) dStamp(m, s[k], nd[k], nd.K, RGB_VF[k], 20); },
    update(c, s, ctx, nd) {
      let ch = false;
      for (const k of ['R', 'G', 'B']) if (dUpdate(s, k, ctx.v(nd[k]) - ctx.v(nd.K), RGB_VF[k])) ch = true;
      return ch;
    },
    measure(c, s, ctx, nd) {
      const r = {};
      for (const k of ['R', 'G', 'B']) r[k] = dCurrent(s[k], ctx.v(nd[k]) - ctx.v(nd.K), RGB_VF[k], 20);
      return r;
    },
    check(c, s, ctx) {
      for (const k of ['R', 'G', 'B']) if (s.m[k] > 0.03) ctx.warn('rgb' + k + c.id, `RGB світлодіод ${c.name}: струм каналу ${k} ${fmtI(s.m[k])} — потрібен резистор`, c.id);
    },
    animate(c, s) { s.col = ['R', 'G', 'B'].map((k) => clamp((s.m[k] || 0) / 0.012, 0, 1)); },
    svg() {
      return `${leg(-21, 4, -21, 34)}${leg(-7, 4, -7, 34)}${leg(7, 4, 7, 34)}${leg(21, 4, 21, 34)}
        <circle class="glow" cx="0" cy="-8" r="22" fill="#000" opacity="0" filter="url(#glow)"/>
        <path class="dome" d="M-14,6 L-14,-8 A14,14 0 0 1 14,-8 L14,6 Z" fill="#ddd" stroke="rgba(0,0,0,.35)" fill-opacity="0.9"/>
        <rect x="-16" y="5" width="32" height="4" rx="1" fill="#ccc"/>
        <text x="-24" y="30" font-size="7" fill="#c00">R</text><text x="4" y="30" font-size="7" fill="#080">G</text><text x="18" y="30" font-size="7" fill="#00c">B</text>`;
    },
    refresh(c, s, el) {
      const [r, g, b] = s.col;
      const mx = Math.max(r, g, b);
      const col = `rgb(${Math.round(255 * Math.sqrt(r))},${Math.round(255 * Math.sqrt(g))},${Math.round(255 * Math.sqrt(b))})`;
      const glow = q(el, '.glow');
      glow.setAttribute('fill', col);
      glow.setAttribute('opacity', (Math.sqrt(mx) * 0.95).toFixed(3));
      q(el, '.dome').setAttribute('fill', mx > 0.02 ? col : '#ddd');
    },
    info: (c, s) => `${c.name}: R ${fmtI(s.m.R || 0)}, G ${fmtI(s.m.G || 0)}, B ${fmtI(s.m.B || 0)}`,
  };

  // ------------------------------------------------------------------ Діод
  C.diode = {
    halfH: 7,
    title: 'Діод',
    cat: 'Напівпровідники',
    prefix: 'D',
    pins: [
      { id: 'A', x: -30, y: 0, dir: 'left', name: 'анод (+)' },
      { id: 'K', x: 30, y: 0, dir: 'right', name: 'катод (−, смужка)' },
    ],
    defaults: { model: '1N4007' },
    props: [{ key: 'model', label: 'Модель', type: 'select', options: [['1N4007', '1N4007 (випрямний, 0.7 В)'], ['1N5819', '1N5819 (Шотткі, 0.3 В)']] }],
    labelY: 18,
    label: (c) => c.props.model,
    init: () => ({ on: false }),
    vf: (c) => (c.props.model === '1N5819' ? 0.3 : 0.7),
    stamp(c, s, m, nd) { dStamp(m, s.on, nd.A, nd.K, this.vf(c), 0.2); },
    update(c, s, ctx, nd) { return dUpdate(s, 'on', ctx.v(nd.A) - ctx.v(nd.K), this.vf(c)); },
    measure(c, s, ctx, nd) { return { I: dCurrent(s.on, ctx.v(nd.A) - ctx.v(nd.K), this.vf(c), 0.2) }; },
    check(c, s, ctx) { if (s.m.I > 1) ctx.warn('dI' + c.id, `Діод ${c.name}: струм ${fmtI(s.m.I)} — перевищено допустимий 1 А`, c.id); },
    svg() {
      return `${leg(-30, 0, -14, 0)}${leg(14, 0, 30, 0)}
        <rect x="-14" y="-6" width="28" height="12" rx="2" fill="#222"/>
        <rect x="7" y="-6" width="4" height="12" fill="#ccc"/>
        <path d="M-6,-3 L2,0 L-6,3 Z M2,-3 L2,3" stroke="#888" fill="#888" stroke-width="1"/>`;
    },
    info: (c, s) => `${c.name} ${c.props.model}: ${fmtI(s.m.I || 0)} ${s.on ? '(відкритий)' : '(закритий)'}`,
  };

  // --------------------------------------------------------------- Кнопка
  C.button = {
    halfH: 18,
    title: 'Кнопка',
    cat: 'Керування',
    prefix: 'BTN',
    pins: [
      { id: 'A', x: -30, y: 0, dir: 'left', name: 'вивід 1' },
      { id: 'B', x: 30, y: 0, dir: 'right', name: 'вивід 2' },
    ],
    defaults: { color: '#d33' },
    props: [{ key: 'color', label: 'Колір ковпачка', type: 'select', options: [['#d33', 'Червоний'], ['#333', 'Чорний'], ['#36c', 'Синій'], ['#2a2', 'Зелений'], ['#eb3', 'Жовтий']] }],
    labelY: 30,
    label: () => 'натисніть',
    init: () => ({ pressed: false }),
    stamp(c, s, m, nd) { m.addG(nd.A, nd.B, s.pressed ? 100 : 1e-9); },
    svg(c) {
      return `${leg(-30, 0, -18, 0)}${leg(18, 0, 30, 0)}
        <rect x="-18" y="-18" width="36" height="36" rx="3" fill="#2b2b2b" stroke="#111"/>
        <circle cx="-13" cy="-13" r="2" fill="#555"/><circle cx="13" cy="-13" r="2" fill="#555"/>
        <circle cx="-13" cy="13" r="2" fill="#555"/><circle cx="13" cy="13" r="2" fill="#555"/>
        <circle class="cap" data-act="press" cx="0" cy="0" r="11" fill="${c.props.color}" stroke="rgba(0,0,0,.4)" stroke-width="2" style="cursor:pointer"/>`;
    },
    refresh(c, s, el) {
      const cap = q(el, '.cap');
      cap.setAttribute('r', s.pressed ? 9.5 : 11);
      cap.setAttribute('stroke-width', s.pressed ? 4 : 2);
    },
    act: {
      press: {
        down(c, s) { s.pressed = true; },
        up(c, s) { s.pressed = false; },
      },
    },
    info: (c, s) => `${c.name}: ${s.pressed ? 'натиснута' : 'відпущена'} (утримуйте мишею)`,
  };

  // ---------------------------------------------------------- Перемикач
  C.switch = {
    halfH: 11,
    title: 'Перемикач',
    cat: 'Керування',
    prefix: 'SW',
    pins: [
      { id: 'A', x: -30, y: 0, dir: 'left', name: 'вивід 1' },
      { id: 'B', x: 30, y: 0, dir: 'right', name: 'вивід 2' },
    ],
    defaults: { on: false },
    props: [{ key: 'on', label: 'Увімкнено', type: 'checkbox' }],
    labelY: 24,
    label: (c) => (c.props.on ? 'УВІМК' : 'ВИМК'),
    stamp(c, s, m, nd) { m.addG(nd.A, nd.B, c.props.on ? 100 : 1e-9); },
    svg() {
      return `${leg(-30, 0, -22, 0)}${leg(22, 0, 30, 0)}
        <rect x="-22" y="-11" width="44" height="22" rx="3" fill="#2f5fa8" stroke="#1d3c6c"/>
        <rect x="-16" y="-6" width="32" height="12" rx="2" fill="#162a4a" data-act="toggle" style="cursor:pointer"/>
        <rect class="knob" data-act="toggle" x="-15" y="-5" width="14" height="10" rx="2" fill="#eee" style="cursor:pointer"/>`;
    },
    refresh(c, s, el) { q(el, '.knob').setAttribute('x', c.props.on ? 1 : -15); },
    act: { toggle: { click(c) { c.props.on = !c.props.on; return true; } } },
    info: (c) => `${c.name}: ${c.props.on ? 'увімкнено' : 'вимкнено'} (клацніть)`,
  };

  // ------------------------------------------------------- Потенціометр
  C.pot = {
    halfH: 26,
    title: 'Потенціометр',
    cat: 'Керування',
    prefix: 'POT',
    pins: [
      { id: 'A', x: -20, y: 42, dir: 'down', name: 'крайній вивід 1' },
      { id: 'W', x: 0, y: 42, dir: 'down', name: 'середній вивід (повзунок)' },
      { id: 'B', x: 20, y: 42, dir: 'down', name: 'крайній вивід 2' },
    ],
    defaults: { r: 10000, pos: 0.5 },
    props: [
      { key: 'pos', label: 'Положення', type: 'range', min: 0, max: 1, step: 0.005, live: true, fmt: (v) => Math.round(v * 100) + '%' },
      { key: 'r', label: 'Опір', type: 'resistance', options: [1000, 5000, 10000, 50000, 100000] },
    ],
    labelY: 56,
    label: (c) => fmtR(c.props.r) + ' · ' + Math.round(c.props.pos * 100) + '%',
    stamp(c, s, m, nd) {
      const r = c.props.r;
      const p = clamp(c.props.pos, 0, 1);
      m.addG(nd.A, nd.W, 1 / Math.max(1, r * p));
      m.addG(nd.W, nd.B, 1 / Math.max(1, r * (1 - p)));
    },
    svg() {
      return `${leg(-20, 18, -20, 42)}${leg(0, 22, 0, 42)}${leg(20, 18, 20, 42)}
        <rect x="-26" y="-26" width="52" height="46" rx="5" fill="#2766b8" stroke="#1a4580"/>
        <circle cx="0" cy="-4" r="17" fill="#dcdcdc" stroke="#999" data-act="knob" style="cursor:ns-resize"/>
        <g class="knob" data-act="knob" style="cursor:ns-resize"><circle cx="0" cy="-4" r="12" fill="#f4f4f4" stroke="#aaa"/>
        <rect x="-1.8" y="-15" width="3.6" height="11" rx="1.5" fill="#333"/></g>`;
    },
    refresh(c, s, el) {
      const ang = -135 + 270 * clamp(c.props.pos, 0, 1);
      q(el, '.knob').setAttribute('transform', `rotate(${ang.toFixed(1)} 0 -4)`);
    },
    act: { knob: { drag(c, s, dy) { c.props.pos = clamp(c.props.pos - dy / 150, 0, 1); return true; } } },
    wheel(c, s, d) { c.props.pos = clamp(c.props.pos - d * 0.02, 0, 1); return true; },
    info: (c) => `${c.name}: ${Math.round(c.props.pos * 100)}% (тягніть ручку або крутіть коліщатко миші)`,
  };

  // --------------------------------------------------------- Фоторезистор
  C.ldr = {
    halfH: 14,
    title: 'Фоторезистор',
    cat: 'Датчики',
    prefix: 'LDR',
    pins: [
      { id: 'A', x: -30, y: 0, dir: 'left', name: 'вивід 1' },
      { id: 'B', x: 30, y: 0, dir: 'right', name: 'вивід 2' },
    ],
    defaults: { light: 50 },
    props: [{ key: 'light', label: 'Освітлення', type: 'range', min: 0, max: 100, step: 1, live: true, fmt: (v) => v + '%' }],
    labelY: 24,
    label: (c) => '☀ ' + c.props.light + '% · ' + fmtR(C.ldr.res(c)),
    res: (c) => Math.pow(10, 6 - 3.3 * clamp(c.props.light, 0, 100) / 100),
    stamp(c, s, m, nd) { m.addG(nd.A, nd.B, 1 / this.res(c)); },
    svg() {
      return `${leg(-30, 0, -14, 0)}${leg(14, 0, 30, 0)}
        <circle class="sun" cx="0" cy="-24" r="7" fill="#ffd21f" opacity=".5"/>
        <circle cx="0" cy="0" r="14" fill="#c9832e" stroke="#7a4b14"/>
        <circle cx="0" cy="0" r="11" fill="#f1e2c4"/>
        <path d="M-8,-5 h12 a2,2 0 0 1 0,4 h-8 a2,2 0 0 0 0,4 h8 a2,2 0 0 1 0,4 h-8" fill="none" stroke="#b5492b" stroke-width="1.6"/>`;
    },
    refresh(c, s, el) { q(el, '.sun').setAttribute('opacity', (0.1 + 0.9 * c.props.light / 100).toFixed(2)); },
    wheel(c, s, d) { c.props.light = clamp(Math.round(c.props.light - d * 2), 0, 100); return true; },
    info: (c) => `${c.name}: освітлення ${c.props.light}%, опір ${fmtR(C.ldr.res(c))} (коліщатко миші змінює світло)`,
  };

  // ---------------------------------------------------------------- Мотор
  C.motor = {
    halfH: 26,
    title: 'DC моторчик',
    cat: 'Рух',
    prefix: 'M',
    pins: [
      { id: 'A', x: -15, y: 46, dir: 'down', name: 'вивід + (червоний)' },
      { id: 'B', x: 15, y: 46, dir: 'down', name: 'вивід − (чорний)' },
    ],
    defaults: { vnom: 5 },
    props: [{ key: 'vnom', label: 'Номінальна напруга', type: 'select', options: [[3, '3 В'], [5, '5 В'], [6, '6 В'], [12, '12 В']] }],
    labelY: 60,
    label: (c) => c.props.vnom + ' В',
    init: () => ({ speed: 0, ang: 0 }),
    R: (c) => 1.6 * c.props.vnom,
    stamp(c, s, m, nd) { m.addG(nd.A, nd.B, 1 / this.R(c)); },
    measure(c, s, ctx, nd) {
      const v = ctx.v(nd.A) - ctx.v(nd.B);
      return { V: v, I: v / this.R(c) };
    },
    animate(c, s, dt) {
      const v = s.m.V || 0;
      const vn = c.props.vnom;
      let target = Math.abs(v) < 0.12 * vn ? 0 : v / vn;
      target = clamp(target, -1.6, 1.6);
      s.speed += (target - s.speed) * Math.min(1, dt * 3);
      if (Math.abs(s.speed) < 0.002 && target === 0) s.speed = 0;
      s.ang = (s.ang + s.speed * 1300 * dt) % 360;
    },
    svg() {
      return `${leg(-15, 24, -15, 46, 'red')}${leg(15, 24, 15, 46, 'blk')}
        <rect x="-24" y="-6" width="48" height="32" rx="6" fill="#b9bfc6" stroke="#7e858d"/>
        <rect x="-24" y="12" width="48" height="10" fill="#9aa1a8"/>
        <circle cx="0" cy="-6" r="5" fill="#666"/>
        <g class="rotor"><path d="M0,-6 L-5,-40 Q0,-44 5,-40 Z" fill="#3aa0ff" opacity=".9"/>
        <path d="M0,-6 L-5,-40 Q0,-44 5,-40 Z" fill="#3aa0ff" opacity=".9" transform="rotate(120 0 -6)"/>
        <path d="M0,-6 L-5,-40 Q0,-44 5,-40 Z" fill="#3aa0ff" opacity=".9" transform="rotate(240 0 -6)"/>
        <circle cx="0" cy="-6" r="4" fill="#245"/></g>
        <text x="0" y="17" font-size="10" text-anchor="middle" fill="#334" font-weight="700">M</text>
        <text class="rpm" x="30" y="6" font-size="9" fill="#345"></text>`;
    },
    refresh(c, s, el) {
      q(el, '.rotor').setAttribute('transform', `rotate(${s.ang.toFixed(1)} 0 -6)`);
      const rpm = Math.round(Math.abs(s.speed) * 9000);
      q(el, '.rpm').textContent = rpm > 0 ? `${rpm} об/хв${s.speed < 0 ? ' ⟲' : ''}` : '';
    },
    info: (c, s) => `${c.name}: ${fmtV(s.m.V || 0)}, ${fmtI(Math.abs(s.m.I || 0))}, ${Math.round(Math.abs(s.speed) * 9000)} об/хв`,
  };

  // ------------------------------------------------------- Сервопривід
  C.servo = {
    halfH: 22,
    title: 'Сервопривід SG90',
    cat: 'Рух',
    prefix: 'SERVO',
    pins: [
      { id: 'GND', x: -62, y: -15, dir: 'left', name: 'GND (коричневий)' },
      { id: 'VCC', x: -62, y: 0, dir: 'left', name: 'живлення +5 В (червоний)' },
      { id: 'SIG', x: -62, y: 15, dir: 'left', name: 'сигнал (помаранчевий)' },
    ],
    defaults: {},
    props: [],
    labelY: 34,
    label: () => '',
    init: () => ({ ang: 90, target: 90 }),
    stamp(c, s, m, nd) { m.addG(nd.VCC, nd.GND, 1 / 500); m.addG(nd.SIG, nd.GND, 1e-6); },
    measure(c, s, ctx, nd) { return { V: ctx.v(nd.VCC) - ctx.v(nd.GND) }; },
    check(c, s, ctx) {
      if (s.m.V > 0.5 && s.m.V < 4.2) ctx.warn('srv' + c.id, `Сервоприводу ${c.name} бракує живлення (${fmtV(s.m.V)}). Підключіть червоний провід до 5V (VIN на ESP).`, c.id);
      if (s.m.V > 7) ctx.warn('srvh' + c.id, `На сервопривід ${c.name} подано ${fmtV(s.m.V)} — більше за 6 В!`, c.id);
    },
    animate(c, s, dt, ctx, nd) {
      const rt = ctx.runtime;
      let target = null;
      if (rt && rt.running && nd) {
        for (const g of ctx.gpiosOn(nd.SIG)) {
          const st = rt.pins.get(g);
          if (st && st.servo != null) target = st.servo;
        }
      }
      if (target != null && (s.m.V || 0) > 3) s.target = target;
      const d = s.target - s.ang;
      const step = 400 * dt * ((s.m.V || 0) > 4.2 ? 1 : 0.4);
      s.ang += clamp(d, -step, step);
    },
    svg() {
      return `${leg(-62, -15, -40, -6, 'brn')}${leg(-62, 0, -40, 0, 'red')}${leg(-62, 15, -40, 6, 'org')}
        <rect x="-40" y="-20" width="80" height="40" rx="3" fill="#2a63c7" stroke="#183e80"/>
        <rect x="-50" y="-4" width="10" height="8" fill="#2a63c7" stroke="#183e80"/>
        <rect x="40" y="-4" width="10" height="8" fill="#2a63c7" stroke="#183e80"/>
        <text x="-12" y="6" font-size="10" fill="#cfe0ff" text-anchor="middle" font-weight="700">SG90</text>
        <circle cx="20" cy="0" r="11" fill="#eaeaea" stroke="#999"/>
        <g class="arm"><path d="M20,-5 L52,-3 Q56,0 52,3 L20,5 Z" fill="#f7f7f7" stroke="#999"/><circle cx="20" cy="0" r="6" fill="#fff" stroke="#aaa"/></g>
        <text class="deg" x="20" y="32" font-size="9" text-anchor="middle" fill="#345"></text>`;
    },
    refresh(c, s, el) {
      q(el, '.arm').setAttribute('transform', `rotate(${(s.ang - 90).toFixed(1)} 20 0)`);
      q(el, '.deg').textContent = Math.round(s.ang) + '°';
    },
    info: (c, s) => `${c.name}: кут ${Math.round(s.ang)}°, живлення ${fmtV(s.m.V || 0)}`,
  };

  // ---------------------------------------------------------------- Зумер
  C.buzzer = {
    halfH: 20,
    labelSide: [24, 0],
    title: "П'єзозумер",
    cat: 'Світло і звук',
    prefix: 'BZ',
    pins: [
      { id: 'A', x: -10, y: 34, dir: 'down', name: '+' },
      { id: 'B', x: 10, y: 34, dir: 'down', name: '−' },
    ],
    defaults: { kind: 'passive' },
    props: [{ key: 'kind', label: 'Тип', type: 'select', options: [['passive', 'Пасивний (потрібен tone())'], ['active', 'Активний (пищить від HIGH)']] }],
    labelY: 48,
    label: (c) => (c.props.kind === 'active' ? 'активний' : 'пасивний'),
    init: () => ({ freq: 0 }),
    stamp(c, s, m, nd) { m.addG(nd.A, nd.B, c.props.kind === 'active' ? 1 / 200 : 1 / 2000); },
    measure(c, s, ctx, nd) { return { V: ctx.v(nd.A) - ctx.v(nd.B) }; },
    animate(c, s, dt, ctx, nd) {
      let f = 0;
      const rt = ctx.runtime;
      if (c.props.kind === 'active') {
        if ((s.m.V || 0) > 2) f = 2300;
      } else if (rt && rt.running && nd && Math.abs(s.m.V || 0) > 0.5) {
        for (const g of [...ctx.gpiosOn(nd.A), ...ctx.gpiosOn(nd.B)]) {
          const st = rt.pins.get(g);
          if (st && st.tone) f = st.tone;
        }
      }
      s.freq = f;
      if (ctx.engine.onSound) ctx.engine.onSound(c.id, f);
    },
    svg() {
      return `${leg(-10, 14, -10, 34)}${leg(10, 14, 10, 34)}
        <circle class="wave" cx="0" cy="-2" r="30" fill="none" stroke="#f90" stroke-width="2" opacity="0"/>
        <circle cx="0" cy="-2" r="20" fill="#1c1c1c" stroke="#000"/>
        <circle cx="0" cy="-2" r="4" fill="#444"/>
        <text x="-17" y="-12" font-size="9" fill="#ddd">+</text>`;
    },
    refresh(c, s, el) {
      const w = q(el, '.wave');
      w.setAttribute('opacity', s.freq ? (0.3 + 0.5 * Math.abs(Math.sin(Date.now() / 90))).toFixed(2) : 0);
    },
    info: (c, s) => `${c.name}: ${s.freq ? s.freq + ' Гц' : 'тиша'}`,
  };

  // ------------------------------------------------------ NPN транзистор
  C.npn = {
    halfH: 16,
    labelSide: [18, -4],
    title: 'NPN транзистор',
    cat: 'Напівпровідники',
    prefix: 'Q',
    pins: [
      { id: 'E', x: -20, y: 36, dir: 'down', name: 'емітер (E)' },
      { id: 'B', x: 0, y: 36, dir: 'down', name: 'база (B)' },
      { id: 'C', x: 20, y: 36, dir: 'down', name: 'колектор (C)' },
    ],
    defaults: { model: '2N2222' },
    props: [{ key: 'model', label: 'Модель', type: 'select', options: [['2N2222', '2N2222 (до 0.8 А)'], ['BC547', 'BC547 (до 0.1 А)']] }],
    labelY: 50,
    label: (c) => c.props.model,
    init: () => ({ be: false, ce: 'off' }),
    beta: 120,
    rb: 30,
    stamp(c, s, m, nd) {
      dStamp(m, s.be, nd.B, nd.E, 0.65, this.rb);
      if (s.ce === 'active') m.addVCCS(nd.C, nd.E, nd.B, nd.E, this.beta / this.rb, 0.65);
      else if (s.ce === 'sat') m.addVS(nd.C, nd.E, 0.12, 0.4);
      else m.addG(nd.C, nd.E, 1e-9);
    },
    update(c, s, ctx, nd) {
      let ch = dUpdate(s, 'be', ctx.v(nd.B) - ctx.v(nd.E), 0.65);
      const vce = ctx.v(nd.C) - ctx.v(nd.E);
      const ib = s.be ? (ctx.v(nd.B) - ctx.v(nd.E) - 0.65) / this.rb : 0;
      let ns = s.ce;
      if (!s.be) ns = 'off';
      else if (s.ce === 'off') ns = 'active';
      else if (s.ce === 'active' && vce < 0.12) ns = 'sat';
      else if (s.ce === 'sat' && (vce - 0.12) / 0.4 > this.beta * ib * 1.0001) ns = 'active';
      if (ns !== s.ce) { s.ce = ns; ch = true; }
      return ch;
    },
    measure(c, s, ctx, nd) {
      const vbe = ctx.v(nd.B) - ctx.v(nd.E);
      const vce = ctx.v(nd.C) - ctx.v(nd.E);
      const ib = dCurrent(s.be, vbe, 0.65, this.rb);
      let ic = 0;
      if (s.ce === 'active') ic = this.beta * ib;
      else if (s.ce === 'sat') ic = (vce - 0.12) / 0.4;
      return { Ib: ib, Ic: ic, Vce: vce, sat: s.ce === 'sat' ? 1 : 0 };
    },
    check(c, s, ctx) {
      const max = c.props.model === 'BC547' ? 0.1 : 0.8;
      if (s.m.Ic > max) ctx.warn('qI' + c.id, `Транзистор ${c.name}: струм колектора ${fmtI(s.m.Ic)} > ${fmtI(max)}`, c.id);
      if (s.m.Ib > 0.05) ctx.warn('qB' + c.id, `Транзистор ${c.name}: завеликий струм бази ${fmtI(s.m.Ib)}. Додайте резистор 1 кОм до бази.`, c.id);
    },
    svg(c) {
      return `${leg(-12, 12, -20, 22)}${leg(-20, 22, -20, 36)}${leg(0, 12, 0, 36)}${leg(12, 12, 20, 22)}${leg(20, 22, 20, 36)}
        <path d="M-15,12 L-15,-4 A15,15 0 0 1 15,-4 L15,12 Z" fill="#1d1d1d"/>
        <text x="0" y="0" font-size="7" fill="#bbb" text-anchor="middle">${esc(c.props.model)}</text>
        <text x="0" y="9" font-size="7" fill="#888" text-anchor="middle">NPN</text>
        <text x="-26" y="34" font-size="7" fill="#556">E</text><text x="3" y="34" font-size="7" fill="#556">B</text><text x="23" y="34" font-size="7" fill="#556">C</text>`;
    },
    info: (c, s) => `${c.name}: Ib ${fmtI(s.m.Ib || 0)}, Ic ${fmtI(s.m.Ic || 0)}, Vce ${fmtV(s.m.Vce || 0)} — ${s.ce === 'sat' ? 'насичення (ключ відкритий)' : s.ce === 'active' ? 'активний режим' : 'закритий'}`,
  };

  // ---------------------------------------------------------- MOSFET
  const FET = {
    IRLZ44N: { vth: 1.2, vfull: 2.6, rpart: 1, ron: 0.03, name: 'IRLZ44N (логічний рівень)' },
    IRF520: { vth: 3.0, vfull: 7, rpart: 4, ron: 0.3, name: 'IRF520 (потрібно 10 В на затвор)' },
  };
  // опір каналу залежно від Vgs (квантований, щоб ітерації сходилися)
  function fetR(f, vgs) {
    if (vgs < f.vth) return 1e9;
    if (vgs >= f.vfull) return f.ron;
    const r = Math.max(f.ron, Math.min(1e5, f.rpart * Math.pow((f.vfull - f.vth) / (vgs - f.vth), 2)));
    return Math.exp(Math.round(Math.log(r) * 20) / 20);
  }
  C.mosfet = {
    title: 'N‑MOSFET',
    cat: 'Напівпровідники',
    prefix: 'Q',
    halfH: 18,
    labelSide: [21, -10],
    pins: [
      { id: 'G', x: -20, y: 44, dir: 'down', name: 'затвор (G)' },
      { id: 'D', x: 0, y: 44, dir: 'down', name: 'стік (D)' },
      { id: 'S', x: 20, y: 44, dir: 'down', name: 'витік (S)' },
    ],
    defaults: { model: 'IRLZ44N' },
    props: [{ key: 'model', label: 'Модель', type: 'select', options: Object.entries(FET).map(([k, v]) => [k, v.name]) }],
    labelY: 58,
    label: (c) => c.props.model,
    init: () => ({ r: 1e9, bd: false }),
    stamp(c, s, m, nd) {
      m.addG(nd.D, nd.S, 1 / s.r);
      dStamp(m, s.bd, nd.S, nd.D, 0.7, 0.1);
      m.addG(nd.G, nd.S, 1e-9);
    },
    update(c, s, ctx, nd) {
      const nr = fetR(FET[c.props.model], ctx.v(nd.G) - ctx.v(nd.S));
      let ch = nr !== s.r;
      s.r = nr;
      if (dUpdate(s, 'bd', ctx.v(nd.S) - ctx.v(nd.D), 0.7)) ch = true;
      return ch;
    },
    measure(c, s, ctx, nd) {
      const id = (ctx.v(nd.D) - ctx.v(nd.S)) / s.r;
      return { Id: id, Vgs: ctx.v(nd.G) - ctx.v(nd.S), P: id * id * s.r };
    },
    check(c, s, ctx) {
      const f = FET[c.props.model];
      if (s.r > f.ron * 1.01 && s.r < 1e8 && Math.abs(s.m.Id || 0) > 0.02) ctx.warn('fet' + c.id, `MOSFET ${c.name} відкритий не повністю (Vgs = ${fmtV(s.m.Vgs)}, опір ${fmtR(s.r)}) і грітиметься (${(s.m.P || 0).toFixed(2)} Вт). Для 3.3/5 В логіки беріть IRLZ44N.`, c.id);
    },
    svg(c) {
      return `${leg(-12, 18, -20, 30)}${leg(-20, 30, -20, 44)}${leg(0, 18, 0, 44)}${leg(12, 18, 20, 30)}${leg(20, 30, 20, 44)}
        <rect x="-18" y="-40" width="36" height="16" rx="2" fill="#c3c7cc" stroke="#8a9096"/>
        <circle cx="0" cy="-32" r="4" fill="#8a9096"/>
        <rect x="-18" y="-26" width="36" height="44" rx="2" fill="#1f1f1f"/>
        <text x="0" y="-8" font-size="6.5" fill="#bbb" text-anchor="middle">${esc(c.props.model)}</text>
        <text x="0" y="4" font-size="7" fill="#888" text-anchor="middle">N‑FET</text>
        <text x="-27" y="42" font-size="7" fill="#556">G</text><text x="3" y="42" font-size="7" fill="#556">D</text><text x="23" y="42" font-size="7" fill="#556">S</text>`;
    },
    info: (c, s) => `${c.name}: Vgs ${fmtV(s.m.Vgs || 0)}, Id ${fmtI(s.m.Id || 0)} — ${s.r >= 1e8 ? 'закритий' : s.r <= FET[c.props.model].ron * 1.01 ? 'відкритий' : 'відкритий частково (' + fmtR(s.r) + ')'}`,
  };

  // ------------------------------------------------------------- Батарея
  C.battery = {
    halfH: 24,
    title: 'Батарея',
    cat: 'Живлення',
    prefix: 'BAT',
    pins: [
      { id: 'P', x: -12, y: -46, dir: 'up', name: 'плюс (+)' },
      { id: 'N', x: 12, y: -46, dir: 'up', name: 'мінус (−)' },
    ],
    defaults: { v: 9 },
    props: [{ key: 'v', label: 'Напруга', type: 'select', options: [[1.5, '1.5 В (АА)'], [3, '3 В (2×АА)'], [3.7, '3.7 В (Li‑ion)'], [4.5, '4.5 В (3×АА)'], [6, '6 В (4×АА)'], [7.4, '7.4 В (2S Li‑ion)'], [9, '9 В (Крона)'], [12, '12 В']] }],
    labelY: 44,
    label: (c) => c.props.v + ' В',
    stamp(c, s, m, nd) { m.addVS(nd.P, nd.N, +c.props.v, 0.4); },
    measure(c, s, ctx, nd) { return { I: (c.props.v - (ctx.v(nd.P) - ctx.v(nd.N))) / 0.4 }; },
    check(c, s, ctx) {
      if (s.m.I > 4) ctx.warn('bat' + c.id, `Батарея ${c.name}: коротке замикання! Струм ${fmtI(s.m.I)}`, c.id);
    },
    svg(c) {
      return `${leg(-12, -46, -12, -36)}${leg(12, -46, 12, -36)}
        <rect x="-20" y="-38" width="16" height="6" rx="1" fill="#bbb"/><rect x="4" y="-38" width="16" height="6" rx="1" fill="#bbb"/>
        <rect x="-24" y="-32" width="48" height="64" rx="4" fill="#2b2b2b" stroke="#111"/>
        <rect x="-24" y="-10" width="48" height="20" fill="#e2b024"/>
        <text x="0" y="4" font-size="11" font-weight="700" text-anchor="middle" fill="#222">${esc(c.props.v)}V</text>
        <text x="-16" y="-18" font-size="11" fill="#f55" font-weight="700">+</text><text x="9" y="-18" font-size="11" fill="#9cf" font-weight="700">−</text>`;
    },
    info: (c, s) => `${c.name}: ${c.props.v} В, струм ${fmtI(s.m.I || 0)}`,
  };

  // ---------------------------------------------------------- LCD 1602 I2C
  C.lcd = {
    title: 'LCD 1602 (I2C)',
    cat: 'Дисплеї',
    prefix: 'LCD',
    pins: [
      { id: 'GND', x: -162, y: -30, dir: 'left', name: 'GND' },
      { id: 'VCC', x: -162, y: -10, dir: 'left', name: 'VCC (5 В)' },
      { id: 'SDA', x: -162, y: 10, dir: 'left', name: 'SDA (дані I2C)' },
      { id: 'SCL', x: -162, y: 30, dir: 'left', name: 'SCL (такт I2C)' },
    ],
    defaults: { addr: 0x27 },
    props: [{ key: 'addr', label: 'Адреса I2C', type: 'select', options: [[0x27, '0x27'], [0x3f, '0x3F']] }],
    labelY: 62,
    label: (c) => 'адреса 0x' + (+c.props.addr).toString(16).toUpperCase(),
    i2c: true,
    i2cAddr: (c) => +c.props.addr,
    i2cOk(c, s, eng) {
      const rt = eng.runtime;
      if (!rt || !s.m || !(s.m.V > 2.5)) return false;
      return eng.sameNet(c.id + ':SDA', 'B:' + eng.board.gpioPins[rt.i2c.sda].id) && eng.sameNet(c.id + ':SCL', 'B:' + eng.board.gpioPins[rt.i2c.scl].id);
    },
    stamp(c, s, m, nd) { m.addG(nd.VCC, nd.GND, 1 / 220); m.addG(nd.SDA, nd.GND, 1e-7); m.addG(nd.SCL, nd.GND, 1e-7); },
    measure(c, s, ctx, nd) { return { V: ctx.v(nd.VCC) - ctx.v(nd.GND) }; },
    check(c, s, ctx) {
      if (s.m.V > 2 && s.m.V < 4.3) ctx.warn('lcdv' + c.id, `LCD ${c.name} живиться від ${fmtV(s.m.V)} — для дисплея 1602 потрібно 5 В (на ESP — пін VIN), інакше текст ледь видно.`, c.id);
    },
    animate(c, s, dt, ctx) {
      const eng = ctx.engine;
      const rt = ctx.runtime;
      s.ok = !!(rt && rt.running && this.i2cOk(c, s, eng));
      s.dev = s.ok ? rt.lcds.get(+c.props.addr) : null;
      if (rt && rt.running && s.m.V > 2.5 && !s.ok && rt.lcds.size) {
        ctx.warn('lcdw' + c.id, `LCD ${c.name}: SDA/SCL не під'єднані до пінів I2C плати (${eng.board.pinName(rt.i2c.sda)} — SDA, ${eng.board.pinName(rt.i2c.scl)} — SCL)`, c.id);
      } else if (rt && rt.running && s.ok && rt.lcds.size && !s.dev) {
        ctx.warn('lcda' + c.id, `LCD ${c.name}: у коді вказано іншу адресу I2C, ніж у дисплея (0x${(+c.props.addr).toString(16)})`, c.id);
      }
    },
    svg() {
      let cells = '';
      for (let r = 0; r < 2; r++) {
        for (let k = 0; k < 16; k++) {
          cells += `<rect x="${-118 + k * 14.5}" y="${-26 + r * 28}" width="13" height="24" class="cell" rx="1"/>`;
        }
      }
      let txt = '';
      for (let r = 0; r < 2; r++) txt += `<text class="row${r}" x="-117" y="${-6 + r * 28}" font-family="'Courier New', monospace" font-size="21" font-weight="700" textLength="232" lengthAdjust="spacing"></text>`;
      return `
        <rect x="-150" y="-50" width="300" height="100" rx="5" fill="#1b5f2c" stroke="#0e3a19"/>
        <circle cx="-140" cy="-40" r="4" fill="#0e3a19"/><circle cx="140" cy="-40" r="4" fill="#0e3a19"/>
        <circle cx="-140" cy="40" r="4" fill="#0e3a19"/><circle cx="140" cy="40" r="4" fill="#0e3a19"/>
        <rect x="-162" y="-38" width="16" height="76" rx="2" fill="#1c1c1c"/>
        <text x="-142" y="-27" font-size="6" fill="#cfe">GND</text><text x="-142" y="-7" font-size="6" fill="#cfe">VCC</text>
        <text x="-142" y="13" font-size="6" fill="#cfe">SDA</text><text x="-142" y="33" font-size="6" fill="#cfe">SCL</text>
        <rect x="-126" y="-34" width="252" height="68" rx="3" fill="#111"/>
        <rect class="screen" x="-122" y="-30" width="244" height="60" fill="#3d4a1c"/>
        <g class="cells">${cells}</g>${txt}`;
    },
    refresh(c, s, el) {
      const powered = (s.m.V || 0) > 2.5;
      const dev = s.dev;
      const bl = powered && (!dev || dev._bl);
      q(el, '.screen').setAttribute('fill', !powered ? '#2f3a18' : bl ? '#9fd13b' : '#55702a');
      const cellFill = !powered ? 'rgba(0,0,0,0.05)' : 'rgba(0,40,0,0.10)';
      const cells = q(el, '.cells');
      if (cells._f !== cellFill) { cells.setAttribute('fill', cellFill); cells._f = cellFill; }
      for (let r = 0; r < 2; r++) {
        const t = q(el, '.row' + r);
        let str = '';
        if (powered && dev && dev.inited && dev._disp !== false) str = dev.lines[r] || '';
        else if (powered && (!dev || !dev.inited) && r === 0 && s.m.V > 4) str = '█'.repeat(16);
        str = str.padEnd(16, ' ').slice(0, 16).replace(/ /g, ' ');
        if (t._s !== str) { t.textContent = str; t._s = str; }
        t.setAttribute('fill', !dev || !dev.inited ? 'rgba(10,30,0,0.35)' : '#10220a');
      }
    },
    info: (c, s) => `${c.name}: живлення ${fmtV(s.m.V || 0)}${s.ok ? ', I2C підключено' : ''}`,
  };

  // ------------------------------------------------------------ HC-SR04
  C.ultrasonic = {
    title: 'Ультразвуковий датчик HC‑SR04',
    cat: 'Датчики',
    prefix: 'US',
    pins: [
      { id: 'VCC', x: -30, y: 44, dir: 'down', name: 'VCC (5 В)' },
      { id: 'TRIG', x: -10, y: 44, dir: 'down', name: 'TRIG (запуск)' },
      { id: 'ECHO', x: 10, y: 44, dir: 'down', name: 'ECHO (відлуння)' },
      { id: 'GND', x: 30, y: 44, dir: 'down', name: 'GND' },
    ],
    defaults: { distance: 50 },
    props: [{ key: 'distance', label: 'Відстань до перешкоди', type: 'range', min: 2, max: 400, step: 1, live: true, fmt: (v) => v + ' см' }],
    labelY: 58,
    label: (c) => 'перешкода: ' + c.props.distance + ' см',
    stamp(c, s, m, nd) { m.addG(nd.VCC, nd.GND, 1 / 330); m.addG(nd.TRIG, nd.GND, 1e-7); m.addG(nd.ECHO, nd.GND, 1e-6); },
    measure(c, s, ctx, nd) { return { V: ctx.v(nd.VCC) - ctx.v(nd.GND) }; },
    check(c, s, ctx) {
      if (s.m.V > 1 && s.m.V < 4.5) ctx.warn('usv' + c.id, `HC‑SR04 ${c.name}: живлення ${fmtV(s.m.V)}, потрібно 5 В`, c.id);
    },
    svg() {
      const eye = (x) => `<circle cx="${x}" cy="-6" r="20" fill="#c9cdd2" stroke="#8a9096"/><circle cx="${x}" cy="-6" r="15" fill="#555"/>
        <circle cx="${x}" cy="-6" r="12" fill="url(#mesh)"/>`;
      return `${leg(-30, 26, -30, 44)}${leg(-10, 26, -10, 44)}${leg(10, 26, 10, 44)}${leg(30, 26, 30, 44)}
        <rect x="-64" y="-32" width="128" height="58" rx="3" fill="#1e56b0" stroke="#123a7a"/>
        ${eye(-34)}${eye(34)}
        <rect x="-10" y="-26" width="20" height="10" fill="#c7c7c7"/>
        <text x="0" y="16" font-size="8" fill="#dbe8ff" text-anchor="middle">HC‑SR04</text>
        <text x="-30" y="24" font-size="5.5" fill="#dbe8ff" text-anchor="middle">VCC</text><text x="-10" y="24" font-size="5.5" fill="#dbe8ff" text-anchor="middle">TRIG</text>
        <text x="10" y="24" font-size="5.5" fill="#dbe8ff" text-anchor="middle">ECHO</text><text x="30" y="24" font-size="5.5" fill="#dbe8ff" text-anchor="middle">GND</text>
        <g class="obst"><rect x="-40" y="-60" width="80" height="6" rx="2" fill="#a77" opacity=".8"/></g>`;
    },
    refresh(c, s, el) {
      const y = -46 - Math.min(1, c.props.distance / 400) * 70;
      q(el, '.obst').setAttribute('transform', `translate(0 ${(y + 46).toFixed(1)})`);
    },
    wheel(c, s, d) { c.props.distance = clamp(Math.round(c.props.distance - d * 3), 2, 400); return true; },
    info: (c, s) => `${c.name}: відстань ${c.props.distance} см, живлення ${fmtV(s.m.V || 0)} (коліщатко миші змінює відстань)`,
  };

  // ------------------------------------------------------------ Мультиметр
  C.meter = {
    title: 'Мультиметр',
    cat: 'Вимірювання',
    prefix: 'MM',
    pins: [
      { id: 'N', x: -18, y: 66, dir: 'down', name: 'COM (−, чорний щуп)' },
      { id: 'P', x: 18, y: 66, dir: 'down', name: 'V/mA (+, червоний щуп)' },
    ],
    defaults: { mode: 'V' },
    props: [{ key: 'mode', label: 'Режим', type: 'select', options: [['V', 'Вольтметр (паралельно)'], ['A', 'Амперметр (послідовно)']] }],
    labelY: 80,
    label: (c) => (c.props.mode === 'V' ? 'вольтметр' : 'амперметр'),
    stamp(c, s, m, nd) { m.addG(nd.P, nd.N, c.props.mode === 'A' ? 1 / 0.1 : 1e-7); },
    measure(c, s, ctx, nd) {
      const v = ctx.v(nd.P) - ctx.v(nd.N);
      return { V: v, I: c.props.mode === 'A' ? v / 0.1 : 0 };
    },
    svg() {
      return `${leg(-18, 44, -18, 66, 'blk')}${leg(18, 44, 18, 66, 'red')}
        <rect x="-42" y="-56" width="84" height="104" rx="9" fill="#f2c230" stroke="#b58c12"/>
        <rect x="-34" y="-48" width="68" height="30" rx="3" fill="#bfd8b4" stroke="#7c9474"/>
        <text class="val" x="30" y="-26" font-family="'Courier New', monospace" font-size="16" font-weight="700" text-anchor="end" fill="#1f2a1c">0.00</text>
        <text class="unit" x="0" y="-4" font-size="10" text-anchor="middle" fill="#333">В</text>
        <circle cx="0" cy="18" r="13" fill="#333" data-act="mode" style="cursor:pointer"/>
        <rect class="sel" x="-2" y="5" width="4" height="12" fill="#eee" data-act="mode" style="cursor:pointer"/>
        <circle cx="-18" cy="40" r="5" fill="#111"/><circle cx="18" cy="40" r="5" fill="#c11"/>`;
    },
    refresh(c, s, el) {
      const isA = c.props.mode === 'A';
      let txt;
      if (isA) {
        const ma = (s.m.I || 0) * 1000;
        txt = Math.abs(ma) >= 100 ? ma.toFixed(0) : ma.toFixed(1);
      } else txt = (Math.abs(s.m.V || 0) < 0.005 ? 0 : s.m.V || 0).toFixed(2);
      const v = q(el, '.val');
      if (v._t !== txt) { v.textContent = txt; v._t = txt; }
      q(el, '.unit').textContent = isA ? 'мА' : 'В';
      q(el, '.sel').setAttribute('transform', `rotate(${isA ? 60 : -60} 0 18)`);
    },
    act: { mode: { click(c) { c.props.mode = c.props.mode === 'A' ? 'V' : 'A'; return true; } } },
    info: (c, s) => `${c.name}: ${c.props.mode === 'A' ? fmtI(s.m.I || 0) : fmtV(s.m.V || 0)}`,
  };

  Sim.componentOrder = ['resistor', 'led', 'rgbled', 'button', 'switch', 'pot', 'ldr', 'diode', 'npn', 'mosfet', 'motor', 'servo', 'buzzer', 'ultrasonic', 'lcd', 'battery', 'meter'];
  Sim.componentIcons = {
    resistor: '<svg viewBox="-34 -12 68 24"><line x1="-32" y1="0" x2="32" y2="0" stroke="#999" stroke-width="2"/><rect x="-16" y="-7" width="32" height="14" rx="6" fill="#e3c393"/><rect x="-10" y="-7" width="3" height="14" fill="#d42020"/><rect x="-4" y="-7" width="3" height="14" fill="#d42020"/><rect x="2" y="-7" width="3" height="14" fill="#7a3d0f"/></svg>',
    led: '<svg viewBox="-16 -20 32 40"><line x1="-6" y1="6" x2="-6" y2="20" stroke="#999" stroke-width="2"/><line x1="6" y1="6" x2="6" y2="16" stroke="#999" stroke-width="2"/><path d="M-11,6 L-11,-6 A11,11 0 0 1 11,-6 L11,6 Z" fill="#e33"/></svg>',
    rgbled: '<svg viewBox="-16 -20 32 40"><path d="M-11,6 L-11,-6 A11,11 0 0 1 11,-6 L11,6 Z" fill="url(#ig)"/><defs><linearGradient id="ig"><stop offset="0" stop-color="#f33"/><stop offset=".5" stop-color="#3c3"/><stop offset="1" stop-color="#36f"/></linearGradient></defs><line x1="-8" y1="6" x2="-8" y2="20" stroke="#999" stroke-width="2"/><line x1="-3" y1="6" x2="-3" y2="20" stroke="#999" stroke-width="2"/><line x1="3" y1="6" x2="3" y2="20" stroke="#999" stroke-width="2"/><line x1="8" y1="6" x2="8" y2="20" stroke="#999" stroke-width="2"/></svg>',
    button: '<svg viewBox="-20 -20 40 40"><rect x="-17" y="-17" width="34" height="34" rx="3" fill="#2b2b2b"/><circle r="10" fill="#d33"/></svg>',
    switch: '<svg viewBox="-24 -12 48 24"><rect x="-22" y="-10" width="44" height="20" rx="3" fill="#2f5fa8"/><rect x="0" y="-5" width="14" height="10" rx="2" fill="#eee"/></svg>',
    pot: '<svg viewBox="-24 -24 48 48"><rect x="-22" y="-22" width="44" height="44" rx="5" fill="#2766b8"/><circle r="14" fill="#eee"/><rect x="-2" y="-13" width="4" height="10" fill="#333" transform="rotate(40)"/></svg>',
    ldr: '<svg viewBox="-16 -16 32 32"><circle r="13" fill="#c9832e"/><circle r="10" fill="#f1e2c4"/><path d="M-7,-4 h10 a2,2 0 0 1 0,4 h-7 a2,2 0 0 0 0,4 h7" fill="none" stroke="#b5492b" stroke-width="1.6"/></svg>',
    diode: '<svg viewBox="-30 -10 60 20"><line x1="-28" y1="0" x2="28" y2="0" stroke="#999" stroke-width="2"/><rect x="-14" y="-6" width="28" height="12" rx="2" fill="#222"/><rect x="7" y="-6" width="4" height="12" fill="#ccc"/></svg>',
    npn: '<svg viewBox="-18 -18 36 40"><path d="M-14,10 L-14,-4 A14,14 0 0 1 14,-4 L14,10 Z" fill="#1d1d1d"/><line x1="-8" y1="10" x2="-8" y2="22" stroke="#999" stroke-width="2"/><line x1="0" y1="10" x2="0" y2="22" stroke="#999" stroke-width="2"/><line x1="8" y1="10" x2="8" y2="22" stroke="#999" stroke-width="2"/></svg>',
    mosfet: '<svg viewBox="-20 -42 40 70"><rect x="-18" y="-40" width="36" height="16" rx="2" fill="#c3c7cc"/><rect x="-18" y="-26" width="36" height="40" rx="2" fill="#1f1f1f"/><line x1="-10" y1="14" x2="-10" y2="28" stroke="#999" stroke-width="3"/><line x1="0" y1="14" x2="0" y2="28" stroke="#999" stroke-width="3"/><line x1="10" y1="14" x2="10" y2="28" stroke="#999" stroke-width="3"/></svg>',
    motor: '<svg viewBox="-26 -44 52 72"><rect x="-24" y="-6" width="48" height="32" rx="6" fill="#b9bfc6"/><path d="M0,-6 L-5,-40 Q0,-44 5,-40 Z" fill="#3aa0ff"/><path d="M0,-6 L-5,-40 Q0,-44 5,-40 Z" fill="#3aa0ff" transform="rotate(120 0 -6)"/><path d="M0,-6 L-5,-40 Q0,-44 5,-40 Z" fill="#3aa0ff" transform="rotate(240 0 -6)"/></svg>',
    servo: '<svg viewBox="-44 -22 100 44"><rect x="-40" y="-18" width="80" height="36" rx="3" fill="#2a63c7"/><circle cx="20" r="10" fill="#eee"/><path d="M20,-5 L52,-3 Q56,0 52,3 L20,5 Z" fill="#f7f7f7" stroke="#999"/></svg>',
    buzzer: '<svg viewBox="-22 -22 44 44"><circle r="19" fill="#1c1c1c"/><circle r="4" fill="#555"/></svg>',
    ultrasonic: '<svg viewBox="-64 -32 128 60"><rect x="-62" y="-30" width="124" height="56" rx="3" fill="#1e56b0"/><circle cx="-32" cy="-4" r="19" fill="#c9cdd2"/><circle cx="32" cy="-4" r="19" fill="#c9cdd2"/><circle cx="-32" cy="-4" r="13" fill="#555"/><circle cx="32" cy="-4" r="13" fill="#555"/></svg>',
    lcd: '<svg viewBox="-150 -50 300 100"><rect x="-150" y="-50" width="300" height="100" rx="5" fill="#1b5f2c"/><rect x="-122" y="-30" width="244" height="60" fill="#9fd13b"/><text x="-110" y="-2" font-size="26" font-family="monospace" font-weight="700" fill="#1a2a0a">Hello!</text></svg>',
    battery: '<svg viewBox="-26 -40 52 76"><rect x="-20" y="-38" width="14" height="6" fill="#bbb"/><rect x="6" y="-38" width="14" height="6" fill="#bbb"/><rect x="-24" y="-32" width="48" height="64" rx="4" fill="#2b2b2b"/><rect x="-24" y="-10" width="48" height="20" fill="#e2b024"/></svg>',
    meter: '<svg viewBox="-44 -58 88 108"><rect x="-42" y="-56" width="84" height="104" rx="9" fill="#f2c230"/><rect x="-34" y="-48" width="68" height="30" rx="3" fill="#bfd8b4"/><circle cy="18" r="13" fill="#333"/></svg>',
  };
})(typeof window !== 'undefined' ? window : globalThis);
