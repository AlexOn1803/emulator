/*
 * Транслятор Arduino C++ → JavaScript.
 *
 * Це не повноцінний компілятор C++, а перетворювач токенів, який покриває
 * підмножину мови, що найчастіше використовується у скетчах Arduino:
 * змінні, масиви, функції, цикли, #define, enum, static-змінні, приведення
 * типів, цілочисельна арифметика (переповнення int/byte), char-літерали,
 * String, класи бібліотек (Servo, LiquidCrystal_I2C ...).
 *
 * Усі функції користувача стають async, а виклики — await, щоб delay()
 * не блокував браузер. У тіло кожного циклу вставляється await __tick(),
 * тож навіть while(true){} не "вішає" сторінку.
 */
(function (G) {
  'use strict';
  const Sim = (G.Sim = G.Sim || {});

  class CompileError extends Error {
    constructor(msg, line, pos) {
      super(msg);
      this.name = 'CompileError';
      this.line = line;
      this.pos = pos;
    }
  }

  const KEYWORDS = new Set([
    'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'default', 'break', 'continue',
    'return', 'goto', 'sizeof', 'struct', 'class', 'enum', 'union', 'typedef', 'template',
    'namespace', 'using', 'new', 'delete', 'this', 'true', 'false', 'try', 'catch', 'throw',
    'public', 'private', 'protected', 'virtual', 'operator', 'typename', 'static_cast',
    'const_cast', 'reinterpret_cast', 'dynamic_cast', 'nullptr', 'NULL',
  ]);
  const QUALS = new Set([
    'const', 'static', 'volatile', 'extern', 'inline', 'constexpr', 'register', 'mutable',
    'PROGMEM', 'IRAM_ATTR', 'ICACHE_RAM_ATTR', 'DRAM_ATTR',
  ]);
  const TYPE_WORDS = new Set([
    'void', 'int', 'char', 'float', 'double', 'bool', 'boolean', 'byte', 'word', 'String',
    'size_t', 'auto', 'uint8_t', 'int8_t', 'uint16_t', 'int16_t', 'uint32_t', 'int32_t',
    'uint64_t', 'int64_t', 'unsigned', 'signed', 'long', 'short', 'uint', 'ulong', 'ushort',
  ]);
  const INT_KINDS = new Set(['i8', 'u8', 'i16', 'u16', 'i32', 'u32', 'i64']);
  const SMALL_KINDS = new Set(['i8', 'u8', 'i16', 'u16', 'char']);
  const ASSIGN_OPS = new Set(['=', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '<<=', '>>=']);
  const OPS3 = ['>>=', '<<=', '...', '->*'];
  const OPS2 = ['->', '++', '--', '<<', '>>', '<=', '>=', '==', '!=', '&&', '||', '+=', '-=',
    '*=', '/=', '%=', '&=', '|=', '^=', '::'];
  const ASYNC_API = new Set(['delay', 'delayMicroseconds', 'yield', 'pulseIn', 'pulseInLong']);
  const ASYNC_MEMBERS = new Set(['readString', 'readStringUntil', 'parseInt', 'parseFloat',
    'readBytes', 'readBytesUntil', 'find', 'findUntil']);
  const SERIAL_OBJS = new Set(['Serial', 'Serial1', 'Serial2']);
  const FLOAT_FUNCS = new Set(['sqrt', 'pow', 'sin', 'cos', 'tan', 'asin', 'acos', 'atan',
    'atan2', 'exp', 'log', 'log10', 'fabs', 'fmod', 'toFloat', 'parseFloat', 'temperatureRead',
    'radians', 'degrees']);
  const INT_FUNCS = new Set(['millis', 'micros', 'analogRead', 'digitalRead', 'map', 'random',
    'pulseIn', 'toInt', 'parseInt', 'available', 'read', 'length', 'touchRead']);
  const INPLACE_STR = new Set(['toUpperCase', 'toLowerCase', 'trim', 'replace', 'remove', 'concat']);
  const LIBS = {
    'Arduino.h': 1, 'Servo.h': 1, 'ESP32Servo.h': 1, 'Wire.h': 1, 'LiquidCrystal_I2C.h': 1,
    'WiFi.h': 1, 'ESP8266WiFi.h': 1, 'SPI.h': 1, 'math.h': 1, 'stdlib.h': 1, 'string.h': 1,
    'avr/pgmspace.h': 1, 'pgmspace.h': 1, 'stdint.h': 1,
  };

  // ---------------------------------------------------------------- токенізатор
  function tokenize(src, base, state) {
    const toks = [];
    const n = src.length;
    let i = 0;
    let pre = '';
    let lineStart = true;
    const push = (t, v, extra) => {
      const tk = { t, v, pre, before: '', after: '', out: null, pos: base + i };
      if (extra) Object.assign(tk, extra);
      toks.push(tk);
      pre = '';
      lineStart = false;
      return tk;
    };
    while (i < n) {
      const c = src[i];
      if (state && lineStart && state.cond.length && !condActive(state)) {
        let k = i;
        while (k < n && (src[k] === ' ' || src[k] === '\t' || src[k] === '\r')) k++;
        if (src[k] !== '#') {
          let e = src.indexOf('\n', i);
          if (e < 0) e = n;
          pre += '//' + src.slice(i, e);
          i = e;
          if (i < n) { pre += '\n'; i++; }
          continue;
        }
      }
      if (c === '\n') { pre += c; i++; lineStart = true; continue; }
      if (c === ' ' || c === '\t' || c === '\r' || c === '\f' || c === '\v') { pre += c; i++; continue; }
      if (c === '/' && src[i + 1] === '/') {
        let j = src.indexOf('\n', i);
        if (j < 0) j = n;
        pre += src.slice(i, j);
        i = j;
        continue;
      }
      if (c === '/' && src[i + 1] === '*') {
        let j = src.indexOf('*/', i + 2);
        j = j < 0 ? n : j + 2;
        pre += src.slice(i, j);
        i = j;
        continue;
      }
      if (c === '#' && lineStart && state) {
        // директива препроцесора (з урахуванням перенесення рядків "\")
        let j = i;
        let text = '';
        while (j < n) {
          const e = src.indexOf('\n', j);
          const end = e < 0 ? n : e;
          const seg = src.slice(j, end);
          if (seg.endsWith('\\')) { text += seg.slice(0, -1) + '\n'; j = end + 1; } else { text += seg; j = end; break; }
        }
        const startPos = base + i;
        const m = /^#\s*(\w*)\s*([\s\S]*)$/.exec(text);
        const dir = m ? m[1] : '';
        const rest = m ? m[2] : '';
        const asComment = '//' + text.replace(/\n/g, '\n//');
        if (dir === 'if' || dir === 'ifdef' || dir === 'ifndef' || dir === 'elif' || dir === 'else' || dir === 'endif') {
          const st = state.cond;
          const name = (rest.match(/^\s*(\w+)/) || [])[1];
          if (dir === 'if' || dir === 'ifdef' || dir === 'ifndef') {
            const parent = condActive(state);
            let val = false;
            if (parent) val = dir === 'ifdef' ? state.defines.has(name) : dir === 'ifndef' ? !state.defines.has(name) : evalCond(rest, state);
            st.push({ active: val, taken: val, parent, pos: startPos });
          } else {
            const f = st[st.length - 1];
            if (!f) throw new CompileError(`#${dir} без відповідного #if`, null, startPos);
            if (dir === 'elif') {
              if (f.taken || !f.parent) f.active = false;
              else { f.active = evalCond(rest, state); f.taken = f.active; }
            } else if (dir === 'else') {
              f.active = f.parent && !f.taken;
              f.taken = true;
            } else st.pop();
          }
          pre += asComment;
          i = j;
          continue;
        }
        if (state.cond.length && !condActive(state)) {
          pre += asComment;
          i = j;
          continue;
        }
        if (dir === 'undef') {
          state.defines.delete((rest.match(/^\s*(\w+)/) || [])[1]);
          pre += asComment;
          i = j;
          continue;
        }
        if (dir === 'error') throw new CompileError('#error ' + rest.trim(), null, startPos);
        if (dir === 'define') {
          const dm = /^([A-Za-z_]\w*)(\([^)]*\))?([\s\S]*)$/.exec(rest);
          if (!dm) throw new CompileError('Неправильна директива #define', null, startPos);
          const name = dm[1];
          const params = dm[2];
          let body = dm[3].replace(/\/\/[^\n]*$/gm, '').trim();
          state.defines.set(name, body);
          i = startPos - base;
          push('raw', 'let ', { fromPP: true });
          push('id', name, { declName: true, defineName: true, fromPP: true, top: true });
          if (params) {
            const plist = params.slice(1, -1).split(',').map((s) => s.trim()).filter(Boolean);
            plist.forEach((p) => state.macroParams.add(p));
            state.macroFuncs.add(name);
            push('raw', ` = async (${plist.join(', ')}) => (`, { fromPP: true });
          } else {
            push('raw', ' = ', { fromPP: true });
          }
          if (!body) body = '1';
          const sub = tokenize(body, startPos, null);
          for (const st of sub) {
            if (st.t === 'eof') break;
            st.fromPP = true;
            st.pre = st.pre.replace(/\n/g, ' ');
            toks.push(st);
          }
          if (params) push('raw', ')', { fromPP: true });
          push('op', ';', { fromPP: true, synthetic: true });
          // зберігаємо переноси рядків для відповідності номерів рядків
          pre = '\n'.repeat((text.match(/\n/g) || []).length);
          i = j;
          continue;
        }
        if (dir === 'include') {
          const lib = rest.trim().replace(/^[<"]|[>"]$/g, '').trim();
          state.includes.push({ lib, pos: startPos });
        }
        pre += asComment;
        i = j;
        continue;
      }
      // raw string R"delim(...)delim"
      if (c === 'R' && src[i + 1] === '"') {
        const open = src.indexOf('(', i + 2);
        const delim = src.slice(i + 2, open);
        const close = src.indexOf(')' + delim + '"', open);
        if (open < 0 || close < 0) throw new CompileError('Незакритий raw-рядок R"(...)"', null, base + i);
        const content = src.slice(open + 1, close);
        const tk = push('str', JSON.stringify(content));
        tk.raw = true;
        i = close + delim.length + 2;
        continue;
      }
      if (c === '"') {
        let j = i + 1;
        while (j < n && src[j] !== '"') {
          if (src[j] === '\\') j++;
          if (src[j] === '\n') throw new CompileError('Незакритий рядок (відсутня лапка ")', null, base + i);
          j++;
        }
        if (j >= n) throw new CompileError('Незакритий рядок (відсутня лапка ")', null, base + i);
        const v = src.slice(i, j + 1);
        const tk = push('str', v);
        i = j + 1;
        tk.pos = base + j;
        continue;
      }
      if (c === "'") {
        let j = i + 1;
        while (j < n && src[j] !== "'") {
          if (src[j] === '\\') j++;
          if (src[j] === '\n') break;
          j++;
        }
        if (j >= n || src[j] !== "'") throw new CompileError("Незакритий символьний літерал (відсутня лапка ')", null, base + i);
        const body = src.slice(i + 1, j);
        const code = decodeChar(body);
        if (code === null) throw new CompileError(`Неправильний символьний літерал '${body}'`, null, base + i);
        push('char', src.slice(i, j + 1), { code });
        i = j + 1;
        continue;
      }
      if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] || ''))) {
        const rest = src.slice(i);
        const m = /^(0[xX][0-9a-fA-F']+|0[bB][01']+|(?:\d[\d']*\.?[\d']*|\.\d[\d']*)(?:[eE][+-]?\d+)?)([uUlLfF]*)/.exec(rest);
        let num = m[1].replace(/'/g, '');
        const suf = m[2];
        const isHex = /^0[xX]/.test(num);
        const isFloat = !isHex && !/^0[bB]/.test(num) && (/[.eE]/.test(num) || /[fF]/.test(suf));
        if (!isHex && !isFloat && /^0\d+$/.test(num)) num = '0o' + num.slice(1); // вісімкова
        if (num.startsWith('.')) num = '0' + num;
        if (num.endsWith('.')) num = num + '0';
        push('num', m[0], { clean: num, isFloat });
        i += m[0].length;
        continue;
      }
      if (/[A-Za-z_]/.test(c)) {
        let j = i + 1;
        while (j < n && /[A-Za-z0-9_]/.test(src[j])) j++;
        push('id', src.slice(i, j));
        i = j;
        continue;
      }
      let op = null;
      for (const o of OPS3) if (src.startsWith(o, i)) { op = o; break; }
      if (!op) for (const o of OPS2) if (src.startsWith(o, i)) { op = o; break; }
      if (!op) op = c;
      if (!/[{}()[\];,.<>+\-*/%=!&|^~?:\\]/.test(op[0])) {
        throw new CompileError(`Неочікуваний символ '${c}'`, null, base + i);
      }
      push('op', op);
      i += op.length;
    }
    if (state && state.cond.length) throw new CompileError('Бракує #endif для цього #if', null, state.cond[state.cond.length - 1].pos);
    toks.push({ t: 'eof', v: '', pre, before: '', after: '', out: null, pos: base + n });
    return toks;
  }

  function condActive(state) {
    return state.cond.every((f) => f.active);
  }

  function evalCond(expr, state) {
    let e = expr.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    e = e.replace(/defined\s*\(\s*(\w+)\s*\)|defined\s+(\w+)/g, (m, a, b) => (state.defines.has(a || b) ? '1' : '0'));
    e = e.replace(/\b[A-Za-z_]\w*\b/g, (id) => {
      const v = state.defines.get(id);
      if (v == null) return '0';
      return /^\s*-?\d+\s*$/.test(v) ? v.trim() : '1';
    });
    e = e.replace(/(\d+)[uUlL]+/g, '$1');
    if (!/^[\d\s()!&|<>=+\-*/%~^?:]*$/.test(e) || !e.trim()) return false;
    try {
      return !!Function('"use strict"; return (' + e + ');')();
    } catch (err) {
      return false;
    }
  }

  function decodeChar(body) {
    if (body.length === 1) return body.charCodeAt(0);
    if (body[0] !== '\\') {
      // багатобайтові символи (наприклад кирилиця) — беремо перший
      return body.length ? body.codePointAt(0) : null;
    }
    const e = body.slice(1);
    const map = { n: 10, t: 9, r: 13, '0': 0, '\\': 92, "'": 39, '"': 34, a: 7, b: 8, f: 12, v: 11, '?': 63 };
    if (e.length === 1 && e in map) return map[e];
    if (/^x[0-9a-fA-F]{1,2}$/.test(e)) return parseInt(e.slice(1), 16);
    if (/^[0-7]{1,3}$/.test(e)) return parseInt(e, 8) & 255;
    return null;
  }

  function levenshtein(a, b) {
    const m = a.length;
    const n = b.length;
    if (Math.abs(m - n) > 3) return 99;
    const d = Array.from({ length: m + 1 }, (_, i) => [i]);
    for (let j = 1; j <= n; j++) d[0][j] = j;
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
    }
    return d[m][n];
  }

  // ---------------------------------------------------------------- транслятор
  class Transpiler {
    constructor(src, opts) {
      this.src = src;
      this.opts = opts || {};
      this.int16 = !!this.opts.int16;
      this.globals = new Set(this.opts.globals || []);
      this.boardOnly = this.opts.boardOnly || {};
      this.classTypes = new Set(this.opts.classTypes || ['Servo', 'LiquidCrystal_I2C', 'IPAddress']);
      this.enumTypes = new Set();
      this.state = { macroParams: new Set(), macroFuncs: new Set(), includes: [], cond: [], defines: new Map(Object.entries(this.opts.defines || {}).map(([k, v]) => [k, String(v)])) };
      this.lineStarts = [0];
      for (let k = 0; k < src.length; k++) if (src[k] === '\n') this.lineStarts.push(k + 1);
      this.warnings = [];
      this.userFuncs = new Set();
      this.userFuncKinds = {};
      this.allDecl = new Set();
      this.topNames = new Set();
      this.scopes = [new Map()];
      this.pending = [];
      this.funcStack = [];
      this.ternary = 0;
      this.caseLabel = false;
      this.forHeaders = [];
      this.controlClose = new Set();
    }

    lineOf(pos) {
      const ls = this.lineStarts;
      let lo = 0;
      let hi = ls.length - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (ls[mid] <= pos) lo = mid; else hi = mid - 1;
      }
      return lo + 1;
    }

    err(msg, tk) {
      return new CompileError(msg, tk ? this.lineOf(tk.pos) : null);
    }

    run() {
      this.T = tokenize(this.src, 0, this.state);
      const T = this.T;
      this.computeMatches();
      this.checkIncludes();
      this.prescan();
      if (!this.userFuncs.has('setup')) throw new CompileError("Не знайдено функцію void setup() — вона обов'язкова у скетчі", null);
      if (!this.userFuncs.has('loop')) throw new CompileError("Не знайдено функцію void loop() — вона обов'язкова у скетчі", null);

      let stmtStart = true;
      for (let i = 0; i < T.length; i++) {
        const tk = T[i];
        if (tk.t === 'eof') break;
        if (tk.dead) { continue; }
        if (tk.t === 'raw') continue;
        let next = false;
        if (tk.t === 'id') next = this.handleId(i, stmtStart);
        else if (tk.t === 'op') next = this.handleOp(i);
        else if (tk.t === 'num') tk.out = tk.clean;
        else if (tk.t === 'str') {
          const p = this.prevSig(i);
          if (p >= 0 && T[p].t === 'str') tk.before = '+' + tk.before;
        } else if (tk.t === 'char') {
          tk.out = this.caseLabel ? String(tk.code) : `__ch(${tk.code})`;
        }
        const fh = this.forHeaders[this.forHeaders.length - 1];
        if (fh && i + 1 === fh.start) next = true;
        if (fh && i >= fh.end) this.forHeaders.pop();
        stmtStart = next;
      }
      this.checkSemicolons();
      this.checkUnknown();
      this.awaitPass();

      let out = '';
      for (const t of T) out += t.pre + t.before + (t.out != null ? t.out : t.v) + t.after;
      return {
        code: out,
        userFuncs: this.userFuncs,
        topNames: this.topNames,
        includes: this.state.includes.map((x) => x.lib),
        warnings: this.warnings,
      };
    }

    computeMatches() {
      const T = this.T;
      const match = new Array(T.length);
      const stack = [];
      const pairs = { ')': '(', ']': '[', '}': '{' };
      for (let i = 0; i < T.length; i++) {
        const t = T[i];
        if (t.t !== 'op') continue;
        if (t.v === '(' || t.v === '[' || t.v === '{') stack.push(i);
        else if (t.v === ')' || t.v === ']' || t.v === '}') {
          const o = stack.pop();
          if (o === undefined) throw this.err(`Зайва дужка '${t.v}'`, t);
          if (T[o].v !== pairs[t.v]) throw this.err(`Дужка '${T[o].v}' закрита неправильною '${t.v}'`, t);
          match[o] = i;
          match[i] = o;
        }
      }
      if (stack.length) {
        const o = T[stack[stack.length - 1]];
        const close = { '(': ')', '[': ']', '{': '}' }[o.v];
        throw this.err(`Не закрита дужка '${o.v}' (бракує '${close}')`, o);
      }
      this.match = match;
    }

    checkIncludes() {
      for (const inc of this.state.includes) {
        if (!LIBS[inc.lib]) {
          this.warnings.push({ line: this.lineOf(inc.pos), msg: `Бібліотека <${inc.lib}> не підтримується симулятором і буде проігнорована` });
        }
      }
    }

    prevSig(i) {
      for (let k = i - 1; k >= 0; k--) if (!this.T[k].dead && this.T[k].t !== 'raw') return k;
      return -1;
    }

    isTypeWord(v) {
      return TYPE_WORDS.has(v) || this.classTypes.has(v) || this.enumTypes.has(v);
    }

    prescan() {
      const T = this.T;
      let depth = 0;
      for (let i = 0; i < T.length; i++) {
        const t = T[i];
        if (t.t === 'op') {
          if (t.v === '{') depth++;
          else if (t.v === '}') depth--;
          continue;
        }
        if (t.t !== 'id') continue;
        if ((t.v === 'if' || t.v === 'while' || t.v === 'for' || t.v === 'switch') && T[i + 1].v === '(') {
          this.controlClose.add(this.match[i + 1]);
        }
        if (depth !== 0) continue;
        if (t.v === 'enum') {
          let j = i + 1;
          if (T[j].v === 'class') j++;
          if (T[j].t === 'id' && T[j + 1].v !== ',') this.enumTypes.add(T[j].v);
          continue;
        }
        if (t.defineName) { this.topNames.add(t.v); continue; }
        const pv = i > 0 ? T[i - 1] : null;
        if (pv && pv.t === 'id' && (QUALS.has(pv.v) || this.isTypeWord(pv.v))) continue;
        if (!(QUALS.has(t.v) || this.isTypeWord(t.v))) continue;
        let j = i;
        const words = [];
        while (T[j].t === 'id' && (QUALS.has(T[j].v) || this.isTypeWord(T[j].v))) { words.push(T[j].v); j++; }
        while (T[j].v === '*' || T[j].v === '&') j++;
        if (T[j].t !== 'id' || KEYWORDS.has(T[j].v)) continue;
        if (T[j + 1].v === '(' && this.looksLikeParams(j + 1)) {
          const name = T[j].v;
          this.userFuncs.add(name);
          this.topNames.add(name);
          this.userFuncKinds[name] = this.kindOf(words, false);
        }
      }
      for (const m of this.state.macroFuncs) this.userFuncs.add(m);
      this.asyncNames = new Set([...this.userFuncs, ...ASYNC_API]);
    }

    looksLikeParams(open) {
      const T = this.T;
      const close = this.match[open];
      if (close === open + 1) return true;
      const f = T[open + 1];
      return f.t === 'id' && (this.isTypeWord(f.v) || QUALS.has(f.v));
    }

    kindOf(words, ptr) {
      if (ptr) return 'ptr';
      const has = (w) => words.includes(w);
      const cls = words.find((w) => this.classTypes.has(w));
      if (cls) return 'class:' + cls;
      if (words.some((w) => this.enumTypes.has(w))) return 'i32';
      if (has('float') || has('double')) return 'float';
      if (has('bool') || has('boolean')) return 'bool';
      if (has('String')) return 'str';
      if (has('void')) return 'void';
      if (has('auto')) return 'auto';
      const uns = has('unsigned') || has('uint') || has('ulong') || has('ushort');
      if (has('char')) return uns ? 'u8' : 'char';
      if (has('byte') || has('uint8_t')) return 'u8';
      if (has('int8_t')) return 'i8';
      if (has('int64_t') || has('uint64_t')) return 'i64';
      if (has('uint32_t')) return 'u32';
      if (has('int32_t')) return 'i32';
      if (has('uint16_t')) return 'u16';
      if (has('int16_t')) return 'i16';
      const longs = words.filter((w) => w === 'long').length;
      if (longs >= 2) return 'i64';
      if (longs === 1 || has('ulong')) return uns ? 'u32' : 'i32';
      if (has('short') || has('ushort')) return uns ? 'u16' : 'i16';
      if (has('word')) return this.int16 ? 'u16' : 'u32';
      if (has('size_t')) return this.int16 ? 'u16' : 'u32';
      return this.int16 ? (uns ? 'u16' : 'i16') : (uns ? 'u32' : 'i32');
    }

    zeroOf(kind) {
      if (kind === 'str') return '""';
      if (kind === 'bool') return 'false';
      if (kind === 'char') return '__ch(0)';
      if (kind === 'ptr') return 'null';
      if (kind.startsWith('class:')) return `new ${kind.slice(6)}()`;
      return '0';
    }

    sizeOfKind(kind) {
      if (kind === 'i8' || kind === 'u8' || kind === 'char' || kind === 'bool') return 1;
      if (kind === 'i16' || kind === 'u16') return 2;
      if (kind === 'i64') return 8;
      if (kind === 'ptr') return this.int16 ? 2 : 4;
      if (kind === 'str') return 6;
      return 4;
    }

    wrapper(kind) {
      if (INT_KINDS.has(kind)) return [`__cv("${kind}", `, ')'];
      if (kind === 'char') return ['__char(', ')'];
      if (kind === 'str') return ['String(', ')'];
      return null;
    }

    wrap(s, e, kind) {
      const w = this.wrapper(kind);
      if (!w || e < s) return;
      this.T[s].before += w[0];
      this.T[e].after += w[1];
    }

    declare(name, info, tokIdx) {
      this.allDecl.add(name);
      const fh = this.forHeaders[this.forHeaders.length - 1];
      if (fh && tokIdx > fh.start - 1 && tokIdx < fh.end) {
        this.pending.push([name, info]);
        return;
      }
      this.scopes[this.scopes.length - 1].set(name, info);
      if (this.funcStack.length === 0) this.topNames.add(name);
    }

    lookup(name) {
      for (let k = this.scopes.length - 1; k >= 0; k--) {
        const v = this.scopes[k].get(name);
        if (v) return v;
      }
      return null;
    }

    isMember(i) {
      const p = this.prevSig(i);
      return p >= 0 && (this.T[p].v === '.' || this.T[p].v === '->' || this.T[p].v === '::');
    }

    exprEnd(s) {
      const T = this.T;
      let d = 0;
      for (let k = s; ; k++) {
        const t = T[k];
        if (t.t === 'eof') return k;
        if (t.t !== 'op') continue;
        const v = t.v;
        if (v === '(' || v === '[' || v === '{') d++;
        else if (v === ')' || v === ']' || v === '}') {
          if (d === 0) return k;
          d--;
        } else if (d === 0 && (v === ',' || v === ';')) return k;
      }
    }

    splitArgs(s, e) {
      const T = this.T;
      const res = [];
      let st = s;
      let d = 0;
      for (let k = s; k < e; k++) {
        const v = T[k].t === 'op' ? T[k].v : null;
        if (v === '(' || v === '[' || v === '{') d++;
        else if (v === ')' || v === ']' || v === '}') d--;
        else if (v === ',' && d === 0) { res.push([st, k]); st = k + 1; }
      }
      res.push([st, e]);
      return res;
    }

    text(s, e) {
      let r = '';
      for (let k = s; k < e; k++) {
        const t = this.T[k];
        r += (k > s ? t.pre.replace(/\s+/g, ' ') : '') + (t.t === 'num' ? t.clean : t.t === 'char' ? String(t.code) : t.v);
      }
      return r;
    }

    // ---------------------------------------------------------- ідентифікатори
    handleId(i, stmtStart) {
      const T = this.T;
      const tk = T[i];
      const v = tk.v;

      if (stmtStart && !tk.declName) {
        if (v === 'enum') { this.handleEnum(i); return false; }
        if (v === 'struct' || v === 'class' || v === 'union') {
          throw this.err(`'${v}' поки не підтримується симулятором. Використайте окремі змінні або масиви.`, tk);
        }
        if (v === 'typedef' || v === 'template' || v === 'namespace') {
          throw this.err(`'${v}' не підтримується симулятором`, tk);
        }
        if (v === 'using') {
          // using namespace std; — ігноруємо
          const e = this.exprEnd(i);
          for (let k = i; k <= e; k++) { T[k].out = ''; T[k].dead = true; }
          return true;
        }
        if (QUALS.has(v) || this.isTypeWord(v)) {
          if (this.tryDecl(i)) return false;
        } else if (T[i + 1].t === 'id' && !KEYWORDS.has(v) && !KEYWORDS.has(T[i + 1].v) &&
          !this.lookup(v) && !this.globals.has(v) && !this.userFuncs.has(v) && /^[A-Z]/.test(v) &&
          (T[i + 2].v === ';' || T[i + 2].v === '(' || T[i + 2].v === '=')) {
          throw this.err(`Невідомий тип '${v}'. Можливо, ця бібліотека не підтримується симулятором.`, tk);
        }
      }

      switch (v) {
        case 'else':
        case 'do':
          if (v === 'do') {
            const b = i + 1;
            if (T[b].v === '{') {
              T[b].after += ' await __tick();';
              const close = this.match[b];
              if (T[close + 1] && T[close + 1].v === 'while') T[close + 1].doTail = true;
            }
          }
          return true;
        case 'for':
        case 'while': {
          if (T[i + 1].v !== '(') throw this.err(`Після '${v}' очікувалась '('`, tk);
          const close = this.match[i + 1];
          if (v === 'for') this.forHeaders.push({ start: i + 2, end: close });
          if (!tk.doTail) this.insertTick(close + 1);
          return false;
        }
        case 'switch': {
          if (T[i + 1].v === '(') {
            T[i + 1].after += '+(';
            T[this.match[i + 1]].before += ')';
          }
          return false;
        }
        case 'case':
          this.caseLabel = true;
          return false;
        case 'NULL':
        case 'nullptr':
          tk.out = 'null';
          return false;
        case 'sizeof':
          this.handleSizeof(i);
          return false;
        case 'static_cast':
        case 'reinterpret_cast':
        case 'const_cast':
          throw this.err(`'${v}' не підтримується, використайте (int)x`, tk);
        default:
          break;
      }

      if (/^B[01]{1,8}$/.test(v) && !this.lookup(v)) { tk.out = '0b' + v.slice(1); tk.declName = true; return false; }

      const member = this.isMember(i);
      const nx = T[i + 1];

      // функціональне приведення типу: int(x), byte(x), float(x)
      if (!member && nx.v === '(' && TYPE_WORDS.has(v) && v !== 'String') {
        const kind = this.kindOf([v], false);
        const close = this.match[i + 1];
        tk.out = '';
        if (kind === 'bool') T[i + 1].before += '!!';
        else {
          const w = this.wrapper(kind);
          if (w) { T[i + 1].before += w[0]; T[close].after += w[1]; }
        }
        return false;
      }

      // static-змінні та звичайні змінні
      let info = null;
      if (!member && !tk.declName) {
        info = this.lookup(v);
        if (info && info.rename) tk.out = info.rename;
      }

      // присвоєння змінним цілих типів, char, String
      if (!member && !tk.declName && nx.t === 'op' && ASSIGN_OPS.has(nx.v) && info && !info.isArray) {
        const s = i + 2;
        const e = this.exprEnd(s);
        const name = info.rename || v;
        if (nx.v === '=') this.wrap(s, e - 1, info.kind);
        else if (info.kind === 'str' && nx.v === '+=') {
          nx.out = '=';
          T[s].before += `__strcat(${name}, `;
          T[e - 1].after += ')';
        } else if (INT_KINDS.has(info.kind) || info.kind === 'char') {
          const op = nx.v.slice(0, -1);
          const w = this.wrapper(info.kind);
          nx.out = '=';
          T[s].before += `${w[0]}${name} ${op} (`;
          T[e - 1].after += `)${w[1]}`;
        }
      }

      // x++ / ++x окремою інструкцією для типів з переповненням (byte, char, int на Uno)
      if (!member && !tk.declName && info && !info.isArray && SMALL_KINDS.has(info.kind)) {
        const name = info.rename || v;
        const w = this.wrapper(info.kind);
        const nx2 = T[i + 2];
        const endOk = (t) => t && t.t === 'op' && (t.v === ';' || t.v === ')' || t.v === ',');
        const p = this.prevSig(i);
        const pv = p >= 0 ? T[p] : null;
        if (stmtStart && nx.t === 'op' && (nx.v === '++' || nx.v === '--') && endOk(nx2)) {
          nx.out = ` = ${w[0]}${name} ${nx.v[0]} 1${w[1]}`;
        } else if (pv && pv.t === 'op' && (pv.v === '++' || pv.v === '--') && endOk(nx)) {
          const pp = this.prevSig(p);
          if (pp < 0 || (T[pp].t === 'op' && [';', '{', '}'].includes(T[pp].v) && !T[pp].arr)) {
            pv.out = '';
            tk.after += ` = ${w[0]}${name} ${pv.v[0]} 1${w[1]}`;
          }
        }
      }

      // методи String, що змінюють рядок на місці: s.toUpperCase();
      if (stmtStart && !member && nx.v === '.' && T[i + 2].t === 'id' && INPLACE_STR.has(T[i + 2].v) &&
        T[i + 3].v === '(' && info && info.kind === 'str') {
        const close = this.match[i + 3];
        if (T[close + 1].v === ';') {
          tk.before += `${info.rename || v} = `;
          T[i + 2].out = '__' + T[i + 2].v;
        }
      }

      if (member) {
        if (v === 'length' && nx.v === '(' && T[i + 2].v === ')') { nx.out = ''; T[i + 2].out = ''; }
        else if (v === 'c_str' && nx.v === '(' && T[i + 2].v === ')') {
          T[this.prevSig(i)].out = '';
          tk.out = '';
          nx.out = '';
          T[i + 2].out = '';
        } else if (v === 'charAt') tk.out = '__charAt';
        if ((v === 'print' || v === 'println') && nx.v === '(') this.wrapNumericArg(i + 1);
      } else if (v === 'String' && nx.v === '(') {
        this.wrapNumericArg(i + 1);
      }
      return false;
    }

    handleEnum(i) {
      const T = this.T;
      let j = i + 1;
      if (T[j].v === 'class' || T[j].v === 'struct') throw this.err("'enum class' не підтримується, використайте звичайний enum", T[j]);
      if (T[j].t === 'id') {
        this.enumTypes.add(T[j].v);
        T[j].out = '';
        T[j].declName = true;
        j++;
      }
      if (T[j].v === ':') {
        T[j].out = '';
        j++;
        while (T[j].t === 'id') { T[j].out = ''; T[j].declName = true; j++; }
      }
      if (T[j].v !== '{') {
        throw this.err('Оголошення змінних з ключовим словом enum не підтримується. Напишіть просто: ІмʼяТипу змінна;', T[i]);
      }
      const close = this.match[j];
      T[i].out = 'const';
      T[j].out = '';
      T[j].enumBrace = true;
      T[close].out = '';
      T[close].enumBrace = true;
      let prevName = null;
      const items = this.splitArgs(j + 1, close);
      items.forEach(([s, e], idx) => {
        if (s >= e) {
          // кінцева кома
          if (idx > 0) T[s - 1].out = '';
          return;
        }
        const nt = T[s];
        if (nt.t !== 'id') throw this.err('Очікувалось імʼя елемента enum', nt);
        nt.declName = true;
        this.declare(nt.v, { kind: 'i32', isConst: true }, s);
        if (T[s + 1].v !== '=') nt.after += ` = ${prevName ? prevName + ' + 1' : '0'}`;
        prevName = nt.v;
      });
      if (items.length === 1 && items[0][0] >= items[0][1]) throw this.err('Порожній enum', T[i]);
      if (T[close + 1].t === 'id') throw this.err('Оголошення змінної разом з enum не підтримується', T[close + 1]);
    }

    handleSizeof(i) {
      const T = this.T;
      const open = i + 1;
      if (T[open].v !== '(') throw this.err('Очікувалось sizeof(...)', T[i]);
      const close = this.match[open];
      let size = this.int16 ? 2 : 4;
      const a = T[open + 1];
      const words = [];
      let allTypes = true;
      let ptr = false;
      for (let k = open + 1; k < close; k++) {
        if (T[k].t === 'id' && (TYPE_WORDS.has(T[k].v) || QUALS.has(T[k].v) || this.enumTypes.has(T[k].v))) words.push(T[k].v);
        else if (T[k].v === '*') ptr = true;
        else { allTypes = false; break; }
      }
      if (allTypes && words.length) size = String(this.sizeOfKind(this.kindOf(words, ptr)));
      else if (a.t === 'id') {
        const info = this.lookup(a.v);
        if (info) {
          const name = info.rename || a.v;
          const es = this.sizeOfKind(info.kind);
          if (info.isArray && close === open + 2) size = `__sizeof(${name}, ${es})`;
          else if (info.isArray && T[open + 2].v === '[') {
            const c2 = this.match[open + 2];
            size = c2 + 1 === close ? (info.dims > 1 ? `__sizeof(${name}[0], ${es})` : String(es)) : String(es);
          } else if (info.kind === 'str' && info.isCharArr) size = `(${name}.length + 1)`;
          else size = String(es);
        }
      }
      T[i].out = String(size);
      for (let k = open; k <= close; k++) { T[k].out = ''; T[k].dead = true; }
    }

    tryDecl(i) {
      const T = this.T;
      let j = i;
      const words = [];
      const typeToks = [];
      let hasType = false;
      while (T[j].t === 'id' && (QUALS.has(T[j].v) || this.isTypeWord(T[j].v))) {
        if (!QUALS.has(T[j].v)) hasType = true;
        words.push(T[j].v);
        typeToks.push(j);
        j++;
      }
      if (!hasType) return false;
      let ptr = false;
      const ptrToks = [];
      while (T[j].v === '*' || T[j].v === '&') {
        if (T[j].v === '*') ptr = true;
        ptrToks.push(j);
        j++;
      }
      while (T[j].t === 'id' && QUALS.has(T[j].v)) { ptrToks.push(j); j++; }
      if (T[j].t !== 'id' || KEYWORDS.has(T[j].v) || this.isTypeWord(T[j].v)) return false;
      const nameIdx = j;
      const kind = this.kindOf(words, ptr);
      const topLevel = this.funcStack.length === 0;
      if (T[j + 1].v === '(' && topLevel && this.looksLikeParams(j + 1)) {
        return this.funcDecl(typeToks, ptrToks, nameIdx, kind);
      }
      if (T[j + 1].v === '(' && !topLevel && this.looksLikeParams(j + 1) && T[this.match[j + 1] + 1].v === '{') {
        throw this.err('Не можна оголошувати функцію всередині іншої функції (можливо, бракує "}" вище?)', T[j]);
      }
      return this.varDecl(typeToks, ptrToks, nameIdx, kind, words);
    }

    funcDecl(typeToks, ptrToks, nameIdx, kind) {
      const T = this.T;
      const open = nameIdx + 1;
      const close = this.match[open];
      let after = close + 1;
      while (T[after].t === 'id' && (T[after].v === 'const' || T[after].v === 'override' || T[after].v === 'noexcept')) {
        T[after].out = '';
        after++;
      }
      const name = T[nameIdx].v;
      if (T[after].v === ';') {
        // прототип функції — просто прибираємо
        for (let k = typeToks[0]; k <= after; k++) { T[k].out = ''; T[k].dead = true; }
        return true;
      }
      if (T[after].v !== '{') throw this.err(`Очікувалось '{' після заголовка функції ${name}()`, T[after]);
      typeToks.forEach((k, idx) => { T[k].out = idx === 0 ? 'async function' : ''; });
      ptrToks.forEach((k) => { T[k].out = ''; });
      T[nameIdx].isDef = true;
      T[nameIdx].declName = true;
      const pend = [];
      if (close > open + 1) {
        for (const [s, e] of this.splitArgs(open + 1, close)) {
          if (e - s === 1 && T[s].v === 'void') { T[s].out = ''; continue; }
          if (s >= e) continue;
          let eq = -1;
          for (let k = s; k < e; k++) if (T[k].v === '=') { eq = k; break; }
          const end = eq < 0 ? e : eq;
          let nk = -1;
          const pwords = [];
          let pptr = false;
          let isArr = false;
          let dims = 0;
          for (let k = s; k < end; k++) {
            const t = T[k];
            if (t.t === 'id' && !QUALS.has(t.v) && !this.isTypeWord(t.v)) nk = k;
            else if (t.t === 'id') pwords.push(t.v);
            else if (t.v === '*') pptr = true;
            else if (t.v === '[') { isArr = true; dims++; }
          }
          if (nk < 0) throw this.err('Очікувалось імʼя параметра функції', T[s]);
          for (let k = s; k < end; k++) if (k !== nk) T[k].out = '';
          T[nk].declName = true;
          let pk = this.kindOf(pwords, false);
          if (pptr && pk !== 'char') pk = 'ptr';
          if (pptr && pk === 'char') pk = 'ptr';
          pend.push([T[nk].v, { kind: pk, isArray: isArr || (pptr && pk !== 'ptr'), dims }]);
          this.allDecl.add(T[nk].v);
          if (eq >= 0) T[nk].noAssign = true;
        }
      }
      T[after].funcName = name;
      T[after].funcParams = pend;
      return true;
    }

    varDecl(typeToks, ptrToks, nameIdx, kind, words) {
      const T = this.T;
      const fn = this.funcStack.length ? this.funcStack[this.funcStack.length - 1] : null;
      const isStatic = words.includes('static') && !!fn;
      const isConst = words.includes('const') || words.includes('constexpr');
      typeToks.forEach((k, idx) => { T[k].out = idx === 0 && !isStatic ? 'let' : ''; });
      ptrToks.forEach((k) => { T[k].out = ''; });
      let j = nameIdx;
      for (;;) {
        let localPtr = false;
        while (T[j].v === '*' || T[j].v === '&') { if (T[j].v === '*') localPtr = true; T[j].out = ''; j++; }
        const nameTok = T[j];
        if (nameTok.t !== 'id' || KEYWORDS.has(nameTok.v)) throw this.err('Очікувалось імʼя змінної', nameTok);
        const name = nameTok.v;
        nameTok.declName = true;
        let k = j + 1;
        const dims = [];
        while (T[k].v === '[') {
          const c = this.match[k];
          dims.push(this.text(k + 1, c));
          for (let q = k; q <= c; q++) { T[q].out = ''; T[q].dead = true; }
          k = c + 1;
        }
        while (T[k].t === 'id' && QUALS.has(T[k].v)) { T[k].out = ''; k++; }
        let vkind = localPtr && kind !== 'ptr' ? 'ptr' : kind;
        const info = { kind: vkind, isArray: dims.length > 0, dims: dims.length, isConst };
        if (vkind === 'char' && dims.length) info.isCharArr = true;
        if (isStatic) {
          const emit = `__st.${fn}_${name}`;
          info.rename = emit;
          nameTok.out = `if (${emit} === undefined) ${emit}`;
        }
        this.declare(name, info, j);
        const zero = this.zeroOf(vkind);
        if (T[k].v === '=') {
          const s = k + 1;
          const e = this.exprEnd(s);
          if (s >= e) throw this.err(`Бракує значення після '=' для змінної ${name}`, T[k]);
          if (T[s].v === '{') {
            this.markArrayInit(s, this.match[s]);
            info.isArray = true;
            if (!info.dims) info.dims = 1;
            if (dims.length && dims[0]) {
              T[s].before += '__pad(';
              T[e - 1].after += `, [${dims.join(', ')}], () => ${zero})`;
            }
          } else if (info.isCharArr && T[s].t === 'str') {
            info.kind = 'str';
            info.isArray = false;
          } else if (!dims.length) {
            this.wrap(s, e - 1, vkind);
          }
          k = e;
        } else if (T[k].v === '(' && !dims.length) {
          const c = this.match[k];
          if (vkind.startsWith('class:')) nameTok.after += ` = new ${vkind.slice(6)}`;
          else {
            nameTok.after += ' = ';
            const w = this.wrapper(vkind);
            if (w) { T[k].before += w[0]; T[c].after += w[1]; }
          }
          k = c + 1;
        } else if (dims.length) {
          if (dims.some((d) => !d)) throw this.err(`Розмір масиву ${name}[] не вказано`, nameTok);
          nameTok.after += ` = __arr([${dims.join(', ')}], () => ${zero})`;
        } else {
          nameTok.after += ` = ${zero}`;
        }
        if (T[k].v === ',') {
          if (isStatic) T[k].out = ';';
          j = k + 1;
          continue;
        }
        if (T[k].v !== ';' && T[k].v !== ')' && T[k].v !== ':') {
          throw this.err(`Очікувалось ';' після оголошення змінної ${name}`, T[k]);
        }
        break;
      }
      return true;
    }

    markArrayInit(s, e) {
      const T = this.T;
      for (let k = s; k <= e; k++) {
        if (T[k].t !== 'op') continue;
        if (T[k].v === '{') { T[k].out = '['; T[k].arr = true; }
        else if (T[k].v === '}') { T[k].out = ']'; T[k].arr = true; }
      }
    }

    insertTick(b) {
      const T = this.T;
      const tk = T[b];
      if (tk.v === '{') { tk.after += ' await __tick();'; return; }
      if (tk.v === ';') { tk.out = '{ await __tick(); }'; return; }
      if (tk.t === 'id' && ['if', 'for', 'while', 'do', 'switch'].includes(tk.v)) return;
      const e = this.exprEnd(b);
      if (T[e].v === ';') {
        tk.before += '{ await __tick(); ';
        T[e].after += ' }';
      }
    }

    castInfo(open) {
      const T = this.T;
      const close = this.match[open];
      if (close == null || close <= open + 1) return null;
      const words = [];
      let ptr = false;
      for (let k = open + 1; k < close; k++) {
        const t = T[k];
        if (t.t === 'id' && (TYPE_WORDS.has(t.v) || QUALS.has(t.v) || this.enumTypes.has(t.v))) words.push(t.v);
        else if (t.v === '*') ptr = true;
        else return null;
      }
      if (!words.some((w) => TYPE_WORDS.has(w) || this.enumTypes.has(w))) return null;
      const p = this.prevSig(open);
      const prev = p >= 0 ? T[p] : null;
      if (prev && prev.t === 'id' && !KEYWORDS.has(prev.v)) return null;
      const nx = T[close + 1];
      const ok = nx.t === 'id' || nx.t === 'num' || nx.t === 'char' || nx.t === 'str' ||
        (nx.t === 'op' && ['(', '-', '!', '~', '+', '++', '--', '*', '&'].includes(nx.v));
      if (!ok) return null;
      return { close, kind: this.kindOf(words, ptr), opStart: close + 1 };
    }

    operandEnd(k) {
      const T = this.T;
      while (T[k].t === 'op' && ['-', '+', '!', '~', '*', '&', '++', '--'].includes(T[k].v)) k++;
      if (T[k].v === '(' && T[k].t === 'op') {
        const ci = this.castInfo(k);
        if (ci) return this.operandEnd(ci.close + 1);
        k = this.match[k];
      } else if (T[k].t === 'op') return k;
      for (;;) {
        const nx = T[k + 1];
        if (nx.t === 'op' && (nx.v === '.' || nx.v === '->')) { k += 2; continue; }
        if (nx.t === 'op' && (nx.v === '(' || nx.v === '[')) { k = this.match[k + 1]; continue; }
        if (nx.t === 'op' && (nx.v === '++' || nx.v === '--')) { k++; continue; }
        break;
      }
      return k;
    }

    wrapNumericArg(open) {
      const T = this.T;
      const close = this.match[open];
      if (close === open + 1) return;
      const s = open + 1;
      const e = this.exprEnd(s);
      let isFloat = false;
      let hasDiv = false;
      let allInt = true;
      if (T[s].v === '(' && this.castInfo(s)) {
        const ci = this.castInfo(s);
        if (ci.close + 1 >= e || INT_KINDS.has(ci.kind)) return;
      }
      for (let k = s; k < e; k++) {
        const t = T[k];
        if (t.t === 'str' || t.t === 'char') return;
        if (t.t === 'num') { if (t.isFloat) isFloat = true; continue; }
        if (t.t === 'op') { if (t.v === '/') hasDiv = true; continue; }
        if (t.t === 'id') {
          const mem = this.isMember(k);
          if (T[k + 1].v === '(') {
            if (FLOAT_FUNCS.has(t.v) || this.userFuncKinds[t.v] === 'float') isFloat = true;
            else if (!(INT_FUNCS.has(t.v) || INT_KINDS.has(this.userFuncKinds[t.v]))) allInt = false;
            continue;
          }
          if (mem) { allInt = false; continue; }
          const info = this.lookup(t.v);
          if (info && info.kind === 'float') isFloat = true;
          else if (!info || !(INT_KINDS.has(info.kind))) {
            if (!(this.globals.has(t.v) && /^[A-Z_0-9]+$/.test(t.v))) allInt = false;
          }
        }
      }
      if (isFloat) { T[s].before += '__fl('; T[e - 1].after += ')'; }
      else if (hasDiv && allInt) { T[s].before += '__ti('; T[e - 1].after += ')'; }
    }

    // ------------------------------------------------------------ оператори
    handleOp(i) {
      const T = this.T;
      const tk = T[i];
      const v = tk.v;
      switch (v) {
        case '{': {
          if (tk.arr || tk.enumBrace) return false;
          const sc = new Map(this.pending);
          this.pending = [];
          if (tk.funcParams) for (const [n, inf] of tk.funcParams) sc.set(n, inf);
          this.scopes.push(sc);
          if (tk.funcName) this.funcStack.push(tk.funcName);
          return true;
        }
        case '}': {
          if (tk.arr || tk.enumBrace) return false;
          if (this.scopes.length <= 1) throw this.err("Зайва '}'", tk);
          this.scopes.pop();
          const open = T[this.match[i]];
          if (open.funcName) this.funcStack.pop();
          return true;
        }
        case ';':
          this.ternary = 0;
          this.caseLabel = false;
          return true;
        case '?':
          this.ternary++;
          return false;
        case ':':
          if (this.caseLabel) { this.caseLabel = false; return true; }
          if (this.ternary > 0) { this.ternary--; return false; }
          return true;
        case '(': {
          const ci = this.castInfo(i);
          if (ci) {
            for (let k = i; k <= ci.close; k++) T[k].out = '';
            let w = this.wrapper(ci.kind);
            if (ci.kind === 'bool') w = ['!!(', ')'];
            if (ci.kind === 'str') w = null;
            if (w) {
              const e = this.operandEnd(ci.opStart);
              T[ci.opStart].before += w[0];
              T[e].after += w[1];
            }
          }
          return false;
        }
        case '[': {
          const close = this.match[i];
          const p = this.prevSig(i);
          if (p >= 0 && T[p].t === 'id' && !this.isMember(p)) {
            const info = this.lookup(T[p].v);
            if (info && info.kind === 'str' && !info.isArray && !(T[close + 1].t === 'op' && ASSIGN_OPS.has(T[close + 1].v))) {
              tk.out = '.__charAt(';
              T[close].out = ')';
              return false;
            }
          }
          // індекс масиву з діленням: a[i / 2] → ціле
          for (let k = i + 1; k < close; k++) {
            if (T[k].t === 'op' && T[k].v === '/') {
              T[i].after += '__ti(';
              T[close].before += ')';
              break;
            }
          }
          return false;
        }
        case '->':
          tk.out = '.';
          return false;
        case '::':
          throw this.err("Оператор '::' не підтримується симулятором", tk);
        default:
          return false;
      }
    }

    // --------------------------------------------------------------- перевірки
    checkSemicolons() {
      const T = this.T;
      let paren = 0;
      let arr = 0;
      for (let i = 0; i < T.length - 1; i++) {
        const tk = T[i];
        if (tk.t === 'op') {
          if (tk.v === '(' || tk.v === '[') paren++;
          else if (tk.v === ')' || tk.v === ']') paren--;
          else if (tk.v === '{' && (tk.arr || tk.enumBrace)) arr++;
          else if (tk.v === '}' && (tk.arr || tk.enumBrace)) arr--;
        }
        if (paren > 0 || arr > 0) continue;
        const nx = T[i + 1];
        if (nx.t === 'eof' || tk.t === 'raw' || tk.fromPP || nx.fromPP) continue;
        if (!nx.pre.includes('\n')) continue;
        let endTok = false;
        if (tk.t === 'id') endTok = !KEYWORDS.has(tk.v) && !TYPE_WORDS.has(tk.v) && !QUALS.has(tk.v) || ['true', 'false', 'this', 'NULL', 'nullptr'].includes(tk.v);
        else if (tk.t === 'num' || tk.t === 'str' || tk.t === 'char') endTok = true;
        else if (tk.t === 'op') endTok = tk.v === ')' || tk.v === ']' || tk.v === '++' || tk.v === '--';
        if (!endTok) continue;
        if (tk.v === ')' && this.controlClose.has(i)) continue;
        if (tk.v === ')' && T[i + 1].v === '{') continue;
        const startTok = nx.t === 'id' || nx.t === 'num' || nx.t === 'char' || (nx.t === 'str' && tk.t !== 'str');
        if (!startTok) continue;
        if (nx.t === 'id' && (nx.v === 'else')) continue;
        throw this.err(`Очікувалось ';' в кінці рядка (перед '${nx.v}')`, tk);
      }
    }

    checkUnknown() {
      const T = this.T;
      const known = (n) => this.allDecl.has(n) || this.userFuncs.has(n) || this.globals.has(n) ||
        this.state.macroParams.has(n) || this.classTypes.has(n) || this.enumTypes.has(n) ||
        TYPE_WORDS.has(n) || QUALS.has(n) || KEYWORDS.has(n) || this.topNames.has(n);
      for (let i = 0; i < T.length; i++) {
        const tk = T[i];
        if (tk.t !== 'id' || tk.dead || tk.declName || tk.out === '') continue;
        if (known(tk.v)) continue;
        if (this.isMember(i)) continue;
        if (T[i + 1].v === ':' && T[i + 1].t === 'op') continue;
        let msg = `'${tk.v}' не оголошено`;
        const only = this.boardOnly[tk.v];
        if (only) msg += ` — ${only}`;
        else {
          const cands = [...this.globals, ...this.allDecl, ...this.userFuncs];
          let best = null;
          let bd = 3;
          const low = tk.v.toLowerCase();
          for (const c of cands) {
            if (c.startsWith('__')) continue;
            if (c.toLowerCase() === low) { best = c; bd = 0; break; }
            const d = levenshtein(tk.v, c);
            if (d < bd && d <= Math.max(1, Math.floor(tk.v.length / 4))) { bd = d; best = c; }
          }
          if (best) msg += `. Можливо, ви мали на увазі '${best}'?`;
          else msg += ' (перевірте написання або оголосіть змінну)';
        }
        throw this.err(msg, tk);
      }
    }

    awaitPass() {
      const T = this.T;
      for (let i = 0; i < T.length; i++) {
        const tk = T[i];
        if (tk.t !== 'id' || tk.dead || tk.isDef || tk.out === '') continue;
        if (T[i + 1].v !== '(' || T[i + 1].t !== 'op') continue;
        const p = this.prevSig(i);
        const member = p >= 0 && T[p].v === '.';
        let start = i;
        if (member) {
          const o = this.prevSig(p);
          if (!(o >= 0 && SERIAL_OBJS.has(T[o].v) && ASYNC_MEMBERS.has(tk.v))) continue;
          start = o;
        } else if (!this.asyncNames.has(tk.v)) continue;
        T[start].before += '(await ';
        T[this.match[i + 1]].after += ')';
      }
    }
  }

  Sim.CompileError = CompileError;
  Sim.transpile = function (src, opts) {
    const tr = new Transpiler(src, opts);
    try {
      return tr.run();
    } catch (e) {
      if (e instanceof CompileError && e.line == null && typeof e.pos === 'number') e.line = tr.lineOf(e.pos);
      throw e;
    }
  };
  Sim._Transpiler = Transpiler;
})(typeof window !== 'undefined' ? window : globalThis);
