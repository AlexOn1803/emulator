/*
 * Описи плат: розташування пінів, номери GPIO, електричні параметри,
 * константи для коду (A0, D1, LED_BUILTIN ...) та малюнок у SVG.
 */
(function (G) {
  'use strict';
  const Sim = (G.Sim = G.Sim || {});

  // Створює ряд пінів. spec: [id, label, gpio|null, kind, extra]
  function row(list, x0, step, y, dir) {
    return list.map((p, idx) => {
      const [id, label, gpio, kind, extra] = p;
      return Object.assign({ id, label, gpio: gpio == null ? null : gpio, kind: kind || 'gpio', x: x0 + idx * step, y, dir }, extra || {});
    });
  }

  // ------------------------------------------------------------- Arduino Uno
  const unoPins = [].concat(
    row([
      ['SCL', 'SCL', 19, 'gpio', { alias: true }], ['SDA', 'SDA', 18, 'gpio', { alias: true }],
      ['AREF', 'AREF', null, 'nc'], ['GND_T', 'GND', null, 'gnd'],
      ['D13', '13', 13], ['D12', '12', 12], ['D11', '~11', 11], ['D10', '~10', 10], ['D9', '~9', 9], ['D8', '8', 8],
    ], 120, 16, 14, 'up'),
    row([
      ['D7', '7', 7], ['D6', '~6', 6], ['D5', '~5', 5], ['D4', '4', 4], ['D3', '~3', 3], ['D2', '2', 2],
      ['D1', 'TX→1', 1], ['D0', 'RX←0', 0],
    ], 284, 16, 14, 'up'),
    row([
      ['IOREF', 'IOREF', null, 'nc'], ['RESET', 'RESET', null, 'nc'], ['3V3', '3.3V', null, 'v33'],
      ['5V', '5V', null, 'v5'], ['GND1', 'GND', null, 'gnd'], ['GND2', 'GND', null, 'gnd'], ['VIN', 'VIN', null, 'vin'],
    ], 166, 16, 276, 'down'),
    row([
      ['A0', 'A0', 14], ['A1', 'A1', 15], ['A2', 'A2', 16], ['A3', 'A3', 17], ['A4', 'A4', 18], ['A5', 'A5', 19],
    ], 284, 16, 276, 'down'),
  );

  const uno = {
    id: 'uno',
    family: 'avr',
    name: 'Arduino Uno',
    analogMap: { 0: 14, 1: 15, 2: 16, 3: 17, 4: 18, 5: 19 },
    v33maxA: 0.15,
    pwmDesc: '3, 5, 6, 9, 10, 11',
    adcDesc: 'A0–A5',
    defines: { ARDUINO_AVR_UNO: 1, ARDUINO_ARCH_AVR: 1, __AVR__: 1, __AVR_ATmega328P__: 1 },
    mcu: 'ATmega328P · 16 МГц · 5 В',
    width: 420,
    height: 290,
    vcc: 5,
    rout: 25,
    pinMaxmA: 40,
    pullup: 35000,
    int16: true,
    adcBits: 10,
    adcRef: 5,
    pwmBits: 8,
    pwmPins: [3, 5, 6, 9, 10, 11],
    adcPins: [14, 15, 16, 17, 18, 19],
    led: { gpio: 13, activeLow: false, x: 186, y: 58, label: 'L', color: '#ffb020' },
    sda: 18,
    scl: 19,
    pins: unoPins,
    consts: { LED_BUILTIN: 13, A0: 14, A1: 15, A2: 16, A3: 17, A4: 18, A5: 19, SDA: 18, SCL: 19 },
    interruptPins: { 0: 2, 1: 3 },
    svg() {
      return `
      <rect x="0" y="0" width="420" height="290" rx="14" fill="#0f6e7a" stroke="#0a4d55" stroke-width="2"/>
      <rect x="6" y="6" width="408" height="278" rx="10" fill="none" stroke="#2a8f9b" stroke-width="1"/>
      <rect x="-14" y="38" width="62" height="56" rx="3" fill="#c9ced4" stroke="#8a9096"/>
      <rect x="-14" y="44" width="56" height="44" rx="2" fill="#aeb4ba"/>
      <rect x="-8" y="196" width="54" height="56" rx="4" fill="#1b1b1b" stroke="#000"/>
      <circle cx="19" cy="224" r="12" fill="#333"/>
      <rect x="110" y="4" width="166" height="20" rx="2" fill="#1d1d1d"/>
      <rect x="276" y="4" width="132" height="20" rx="2" fill="#1d1d1d"/>
      <rect x="156" y="266" width="116" height="20" rx="2" fill="#1d1d1d"/>
      <rect x="276" y="266" width="98" height="20" rx="2" fill="#1d1d1d"/>
      <rect x="196" y="176" width="190" height="38" rx="3" fill="#1e1e1e" stroke="#000"/>
      <g fill="#bbb">${Array.from({ length: 14 }, (_, k) => `<rect x="${203 + k * 13}" y="171" width="5" height="5"/><rect x="${203 + k * 13}" y="214" width="5" height="5"/>`).join('')}</g>
      <text x="291" y="200" fill="#9aa" font-size="10" text-anchor="middle" font-family="monospace">ATMEGA328P</text>
      <rect x="120" y="110" width="22" height="10" rx="2" fill="#c0c0c0"/>
      <rect x="70" y="130" width="34" height="24" rx="2" fill="#c8c8c8" stroke="#999"/>
      <text x="300" y="120" fill="#e6f6f8" font-size="30" font-weight="700" text-anchor="middle" font-family="Arial, sans-serif">UNO</text>
      <text x="300" y="142" fill="#bfe6ea" font-size="11" text-anchor="middle" font-family="Arial, sans-serif">Arduino-сумісна плата</text>
      <text x="168" y="64" fill="#e6f6f8" font-size="9" font-family="Arial">L</text>
      <text x="350" y="64" fill="#e6f6f8" font-size="9" font-family="Arial">TX RX</text>
      <circle cx="380" cy="244" r="5" fill="#22ff66" class="power-led"/>
      <text x="370" y="262" fill="#e6f6f8" font-size="9" font-family="Arial">ON</text>
      <text x="196" y="238" fill="#bfe6ea" font-size="10" font-family="Arial">POWER</text>
      <text x="300" y="238" fill="#bfe6ea" font-size="10" font-family="Arial">ANALOG IN</text>
      <text x="260" y="50" fill="#bfe6ea" font-size="10" font-family="Arial">DIGITAL (PWM ~)</text>
      <circle cx="60" cy="20" r="9" fill="#e8e8e8" stroke="#888"/><circle cx="60" cy="20" r="5" fill="#d33"/>
      <text x="45" y="38" fill="#e6f6f8" font-size="8" font-family="Arial">RESET</text>`;
    },
  };

  // ---------------------------------------------------------- ESP8266 NodeMCU
  const nmTop = [
    ['D0', 'D0', 16], ['D1', 'D1', 5], ['D2', 'D2', 4], ['D3', 'D3', 0], ['D4', 'D4', 2],
    ['3V3_A', '3V3', null, 'v33'], ['GND_A', 'GND', null, 'gnd'],
    ['D5', 'D5', 14], ['D6', 'D6', 12], ['D7', 'D7', 13], ['D8', 'D8', 15],
    ['RX', 'RX', 3], ['TX', 'TX', 1], ['GND_B', 'GND', null, 'gnd'], ['3V3_B', '3V3', null, 'v33'],
  ];
  const nmBot = [
    ['A0', 'A0', 17], ['RSV1', 'RSV', null, 'nc'], ['RSV2', 'RSV', null, 'nc'], ['SD3', 'SD3', null, 'nc'],
    ['SD2', 'SD2', null, 'nc'], ['SD1', 'SD1', null, 'nc'], ['CMD', 'CMD', null, 'nc'], ['SD0', 'SD0', null, 'nc'],
    ['CLK', 'CLK', null, 'nc'], ['GND_C', 'GND', null, 'gnd'], ['3V3_C', '3V3', null, 'v33'], ['EN', 'EN', null, 'nc'],
    ['RST', 'RST', null, 'nc'], ['GND_D', 'GND', null, 'gnd'], ['VIN', 'VIN', null, 'vin'],
  ];
  const esp8266 = {
    id: 'esp8266',
    family: 'esp8266',
    name: 'ESP8266 NodeMCU',
    analogMap: { 0: 17 },
    pwmDesc: 'D1–D8 (усі, крім D0)',
    adcDesc: 'лише A0 (0–3.3 В)',
    defines: { ESP8266: 1, ARDUINO_ARCH_ESP8266: 1, ARDUINO_ESP8266_NODEMCU: 1 },
    flashPins: [6, 7, 8, 9, 10, 11],
    chip: { model: 'ESP8266EX', mhz: 80, heap: 41000, mac: 'A4:CF:12:AB:CD:EF' },
    mcu: 'ESP8266 · 80 МГц · 3.3 В · Wi‑Fi',
    width: 380,
    height: 150,
    vcc: 3.3,
    rout: 40,
    pinMaxmA: 12,
    pullup: 47000,
    int16: false,
    adcBits: 10,
    adcRef: 3.3,
    pwmBits: 8,
    pwmPins: [0, 1, 2, 3, 4, 5, 12, 13, 14, 15],
    adcPins: [17],
    led: { gpio: 2, activeLow: true, x: 92, y: 52, label: 'LED', color: '#3a8bff' },
    sda: 4,
    scl: 5,
    maxSafeV: 3.6,
    pins: [].concat(row(nmTop, 36, 22, 12, 'up'), row(nmBot, 36, 22, 138, 'down')),
    consts: {
      LED_BUILTIN: 2, A0: 17, D0: 16, D1: 5, D2: 4, D3: 0, D4: 2, D5: 14, D6: 12, D7: 13, D8: 15,
      RX: 3, TX: 1, SDA: 4, SCL: 5, BUILTIN_LED: 2,
    },
    wifi: true,
    svg() {
      return `
      <rect x="0" y="0" width="380" height="150" rx="8" fill="#23272e" stroke="#111" stroke-width="2"/>
      <rect x="22" y="2" width="336" height="20" rx="2" fill="#151515"/>
      <rect x="22" y="128" width="336" height="20" rx="2" fill="#151515"/>
      <rect x="10" y="34" width="150" height="82" rx="3" fill="#2f3b52"/>
      <rect x="40" y="40" width="114" height="70" rx="2" fill="#b8bec6" stroke="#8b9097"/>
      <text x="97" y="72" fill="#555" font-size="11" text-anchor="middle" font-family="Arial" font-weight="700">ESP8266</text>
      <text x="97" y="88" fill="#666" font-size="8" text-anchor="middle" font-family="Arial">Wi‑Fi модуль</text>
      <path d="M14 42 h20 v8 h-14 v8 h14 v8 h-14 v8 h14 v8 h-14 v8 h14" fill="none" stroke="#c9a74a" stroke-width="2"/>
      <rect x="352" y="56" width="36" height="38" rx="3" fill="#c9ced4" stroke="#888"/>
      <rect x="176" y="52" width="34" height="34" rx="2" fill="#1b1b1b"/>
      <text x="193" y="72" fill="#888" font-size="6" text-anchor="middle" font-family="monospace">CP2102</text>
      <rect x="292" y="62" width="18" height="12" rx="2" fill="#ddd" stroke="#888"/><text x="301" y="84" fill="#ccc" font-size="7" text-anchor="middle">RST</text>
      <rect x="322" y="62" width="18" height="12" rx="2" fill="#ddd" stroke="#888"/><text x="331" y="84" fill="#ccc" font-size="7" text-anchor="middle">FLASH</text>
      <text x="250" y="80" fill="#9fb3c8" font-size="13" text-anchor="middle" font-family="Arial" font-weight="700">NodeMCU</text>
      <text x="250" y="96" fill="#7a8a9a" font-size="9" text-anchor="middle" font-family="Arial">ESP‑12E</text>`;
    },
  };

  // ------------------------------------------------------------- ESP32 DevKit
  const e32Top = [
    ['EN', 'EN', null, 'nc'], ['VP', 'VP 36', 36], ['VN', 'VN 39', 39], ['G34', 'D34', 34], ['G35', 'D35', 35],
    ['G32', 'D32', 32], ['G33', 'D33', 33], ['G25', 'D25', 25], ['G26', 'D26', 26], ['G27', 'D27', 27],
    ['G14', 'D14', 14], ['G12', 'D12', 12], ['G13', 'D13', 13], ['GND_A', 'GND', null, 'gnd'], ['VIN', 'VIN', null, 'vin'],
  ];
  const e32Bot = [
    ['G23', 'D23', 23], ['G22', 'D22', 22], ['TX0', 'TX0', 1], ['RX0', 'RX0', 3], ['G21', 'D21', 21],
    ['G19', 'D19', 19], ['G18', 'D18', 18], ['G5', 'D5', 5], ['TX2', 'TX2', 17], ['RX2', 'RX2', 16],
    ['G4', 'D4', 4], ['G2', 'D2', 2], ['G15', 'D15', 15], ['GND_B', 'GND', null, 'gnd'], ['3V3', '3V3', null, 'v33'],
  ];
  const esp32 = {
    id: 'esp32',
    family: 'esp32',
    name: 'ESP32 DevKit V1',
    pwmDesc: 'майже всі GPIO (крім 34–39)',
    adcDesc: 'GPIO32–39 (ADC1), а також ADC2 (не працює з Wi‑Fi)',
    defines: { ESP32: 1, ARDUINO_ARCH_ESP32: 1, ARDUINO_ESP32_DEV: 1, CONFIG_IDF_TARGET_ESP32: 1 },
    chip: { model: 'ESP32-D0WDQ6', mhz: 240, heap: 291000, mac: '24:6F:28:AB:CD:EF' },
    touch: true,
    serial2: true,
    mcu: 'ESP32 · 240 МГц · 3.3 В · Wi‑Fi + Bluetooth',
    width: 420,
    height: 150,
    vcc: 3.3,
    rout: 30,
    pinMaxmA: 28,
    pullup: 45000,
    int16: false,
    adcBits: 12,
    adcRef: 3.3,
    pwmBits: 8,
    pwmPins: [0, 1, 2, 3, 4, 5, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 23, 25, 26, 27, 32, 33],
    adcPins: [32, 33, 34, 35, 36, 39, 0, 2, 4, 12, 13, 14, 15, 25, 26, 27],
    adc2Pins: [0, 2, 4, 12, 13, 14, 15, 25, 26, 27],
    inputOnly: [34, 35, 36, 39],
    dacPins: [25, 26],
    led: { gpio: 2, activeLow: false, x: 356, y: 60, label: 'IO2', color: '#3a8bff' },
    sda: 21,
    scl: 22,
    maxSafeV: 3.6,
    pulldown: true,
    pins: [].concat(row(e32Top, 50, 22, 12, 'up'), row(e32Bot, 50, 22, 138, 'down')),
    consts: {
      LED_BUILTIN: 2, A0: 36, A3: 39, A4: 32, A5: 33, A6: 34, A7: 35, A10: 4, A11: 0, A12: 2, A13: 15,
      A14: 13, A15: 12, A16: 14, A17: 27, A18: 25, A19: 26, DAC1: 25, DAC2: 26, SDA: 21, SCL: 22,
      T0: 4, T1: 0, T2: 2, T3: 15, T4: 13, T5: 12, T6: 14, T7: 27, T8: 33, T9: 32, TX: 1, RX: 3, BUILTIN_LED: 2,
    },
    wifi: true,
    svg() {
      return `
      <rect x="0" y="0" width="420" height="150" rx="8" fill="#1f1f24" stroke="#0c0c0e" stroke-width="2"/>
      <rect x="36" y="2" width="358" height="20" rx="2" fill="#141414"/>
      <rect x="36" y="128" width="358" height="20" rx="2" fill="#141414"/>
      <rect x="-24" y="30" width="200" height="90" rx="3" fill="#2a2f3a"/>
      <path d="M-18 40 h16 v10 h-12 v10 h12 v10 h-12 v10 h12 v10 h-12 v10 h12" fill="none" stroke="#c9a74a" stroke-width="2"/>
      <rect x="12" y="36" width="156" height="78" rx="2" fill="#b9bfc7" stroke="#8a9098"/>
      <text x="90" y="72" fill="#444" font-size="12" text-anchor="middle" font-family="Arial" font-weight="700">ESP32‑WROOM‑32</text>
      <text x="90" y="90" fill="#666" font-size="9" text-anchor="middle" font-family="Arial">Wi‑Fi + Bluetooth</text>
      <rect x="402" y="56" width="34" height="38" rx="3" fill="#c9ced4" stroke="#888"/>
      <rect x="230" y="50" width="34" height="34" rx="2" fill="#151515"/>
      <rect x="284" y="58" width="20" height="13" rx="2" fill="#ddd" stroke="#888"/><text x="294" y="80" fill="#ccc" font-size="7" text-anchor="middle">EN</text>
      <rect x="314" y="58" width="20" height="13" rx="2" fill="#ddd" stroke="#888"/><text x="324" y="80" fill="#ccc" font-size="7" text-anchor="middle">BOOT</text>
      <circle cx="372" cy="60" r="3" fill="#ff3030" class="power-led"/><text x="372" y="76" fill="#aaa" font-size="7" text-anchor="middle">PWR</text>
      <text x="356" y="76" fill="#aaa" font-size="7" text-anchor="middle">IO2</text>
      <text x="300" y="98" fill="#8899aa" font-size="10" text-anchor="middle" font-family="Arial" font-weight="700">ESP32 DEVKIT V1</text>`;
    },
  };

  // ------------------------------------------------------------ Arduino Micro
  const microTop = [
    ['D13', '~13', 13], ['3V3', '3V3', null, 'v33'], ['AREF', 'AREF', null, 'nc'],
    ['A0', 'A0', 18], ['A1', 'A1', 19], ['A2', 'A2', 20], ['A3', 'A3', 21], ['A4', 'A4', 22], ['A5', 'A5', 23],
    ['NC1', 'NC', null, 'nc'], ['NC2', 'NC', null, 'nc'], ['5V', '5V', null, 'v5'], ['RST1', 'RST', null, 'nc'],
    ['GND1', 'GND', null, 'gnd'], ['VIN', 'VIN', null, 'vin'], ['MISO', 'MISO', 14], ['SCK', 'SCK', 15],
  ];
  const microBot = [
    ['D12', '12', 12], ['D11', '~11', 11], ['D10', '~10', 10], ['D9', '~9', 9], ['D8', '8', 8], ['D7', '7', 7],
    ['D6', '~6', 6], ['D5', '~5', 5], ['D4', '4', 4], ['D3', '~3 SCL', 3], ['D2', '2 SDA', 2], ['GND2', 'GND', null, 'gnd'],
    ['RST2', 'RST', null, 'nc'], ['D0', 'RX 0', 0], ['D1', 'TX 1', 1], ['SS', 'SS', 17], ['MOSI', 'MOSI', 16],
  ];
  const micro = {
    id: 'micro',
    family: 'avr',
    name: 'Arduino Micro',
    mcu: 'ATmega32U4 · 16 МГц · 5 В · вбудований USB',
    width: 330,
    height: 130,
    vcc: 5,
    rout: 25,
    pinMaxmA: 40,
    pullup: 35000,
    int16: true,
    adcBits: 10,
    adcRef: 5,
    pwmBits: 8,
    pwmPins: [3, 5, 6, 9, 10, 11, 13],
    pwmDesc: '3, 5, 6, 9, 10, 11, 13',
    adcPins: [18, 19, 20, 21, 22, 23, 4, 6, 8, 9, 10, 12],
    adcDesc: 'A0–A5, а також A6–A11 на D4, D6, D8, D9, D10, D12',
    // analogRead(0..11) і константи A6..A11 (24..29) → фізичні піни
    analogMap: { 0: 18, 1: 19, 2: 20, 3: 21, 4: 22, 5: 23, 6: 4, 7: 6, 8: 8, 9: 9, 10: 10, 11: 12, 24: 4, 25: 6, 26: 8, 27: 9, 28: 10, 29: 12 },
    pinAlias: { 24: 4, 25: 6, 26: 8, 27: 9, 28: 10, 29: 12 },
    v33maxA: 0.15,
    usbCdc: true,
    led: { gpio: 13, activeLow: false, x: 96, y: 65, label: 'L', color: '#ffb020' },
    sda: 2,
    scl: 3,
    interruptPins: { 0: 3, 1: 2, 2: 0, 3: 1, 4: 7 },
    pins: [].concat(row(microTop, 40, 16, 12, 'up'), row(microBot, 40, 16, 118, 'down')),
    consts: {
      LED_BUILTIN: 13, A0: 18, A1: 19, A2: 20, A3: 21, A4: 22, A5: 23,
      A6: 24, A7: 25, A8: 26, A9: 27, A10: 28, A11: 29, SDA: 2, SCL: 3,
      MISO: 14, SCK: 15, MOSI: 16, SS: 17,
    },
    defines: { ARDUINO_AVR_MICRO: 1, ARDUINO_ARCH_AVR: 1, __AVR__: 1, __AVR_ATmega32U4__: 1, USBCON: 1 },
    svg() {
      return `
      <rect x="0" y="0" width="330" height="130" rx="6" fill="#0f6e7a" stroke="#0a4d55" stroke-width="2"/>
      <rect x="30" y="2" width="276" height="20" rx="2" fill="#1d1d1d"/>
      <rect x="30" y="108" width="276" height="20" rx="2" fill="#1d1d1d"/>
      <rect x="-12" y="49" width="34" height="32" rx="3" fill="#c9ced4" stroke="#8a9096"/>
      <rect x="-8" y="55" width="26" height="20" rx="2" fill="#aeb4ba"/>
      <rect x="146" y="53" width="24" height="24" rx="2" fill="#1e1e1e" stroke="#000" transform="rotate(45 158 65)"/>
      <text x="158" y="68" fill="#9aa" font-size="6" text-anchor="middle" font-family="monospace">32U4</text>
      <circle cx="66" cy="65" r="7" fill="#e8e8e8" stroke="#888"/><circle cx="66" cy="65" r="4" fill="#d33"/>
      <text x="92" y="80" fill="#e6f6f8" font-size="7" font-family="Arial">L</text>
      <circle cx="116" cy="58" r="2.5" fill="#7a5a1a"/><circle cx="116" cy="72" r="2.5" fill="#7a5a1a"/>
      <text x="122" y="60" fill="#cfe" font-size="5.5" font-family="Arial">TX</text><text x="122" y="74" fill="#cfe" font-size="5.5" font-family="Arial">RX</text>
      <circle cx="296" cy="65" r="3" fill="#22ff66" class="power-led"/><text x="296" y="77" fill="#cfe" font-size="6" text-anchor="middle">ON</text>
      <text x="236" y="65" fill="#e6f6f8" font-size="15" font-weight="700" text-anchor="middle" font-family="Arial">MICRO</text>
      <text x="236" y="77" fill="#bfe6ea" font-size="7" text-anchor="middle" font-family="Arial">Arduino-сумісна</text>`;
    },
  };

  // ------------------------------------------------------- ESP32-C3 Super Mini
  const c3Top = [
    ['5V', '5V', null, 'v5'], ['GND', 'GND', null, 'gnd'], ['3V3', '3V3', null, 'v33'],
    ['G4', '4', 4], ['G3', '3', 3], ['G2', '2', 2], ['G1', '1', 1], ['G0', '0', 0],
  ];
  const c3Bot = [
    ['G5', '5', 5], ['G6', '6', 6], ['G7', '7', 7], ['G8', '8 SDA', 8], ['G9', '9 SCL', 9],
    ['G10', '10', 10], ['G20', '20 RX', 20], ['G21', '21 TX', 21],
  ];
  const esp32c3 = {
    id: 'esp32c3',
    family: 'esp32',
    name: 'ESP32‑C3 Super Mini',
    mcu: 'ESP32‑C3 (RISC‑V) · 160 МГц · 3.3 В · Wi‑Fi + BLE',
    width: 196,
    height: 140,
    vcc: 3.3,
    rout: 30,
    pinMaxmA: 28,
    pullup: 45000,
    int16: false,
    adcBits: 12,
    adcRef: 3.3,
    pwmBits: 8,
    pwmPins: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 20, 21],
    pwmDesc: 'усі GPIO (0–10, 20, 21)',
    adcPins: [0, 1, 2, 3, 4, 5],
    adc2Pins: [5],
    adcDesc: 'GPIO0–4 (ADC1), GPIO5 (ADC2 — не працює з Wi‑Fi)',
    inputOnly: [],
    dacPins: [],
    pulldown: true,
    usbCdc: true,
    maxSafeV: 3.6,
    led: { gpio: 8, activeLow: true, x: 150, y: 74, label: 'LED', color: '#3a8bff' },
    sda: 8,
    scl: 9,
    pins: [].concat(row(c3Top, 36, 18, 12, 'up'), row(c3Bot, 36, 18, 128, 'down')),
    consts: { LED_BUILTIN: 8, BUILTIN_LED: 8, A0: 0, A1: 1, A2: 2, A3: 3, A4: 4, A5: 5, SDA: 8, SCL: 9, SS: 7, MOSI: 6, MISO: 5, SCK: 4, RX: 20, TX: 21 },
    defines: { ESP32: 1, ARDUINO_ARCH_ESP32: 1, ARDUINO_ESP32C3_DEV: 1, CONFIG_IDF_TARGET_ESP32C3: 1 },
    chip: { model: 'ESP32-C3', mhz: 160, heap: 250000, mac: '34:85:18:AB:CD:EF' },
    wifi: true,
    svg() {
      return `
      <rect x="0" y="0" width="196" height="140" rx="8" fill="#1c1d22" stroke="#0b0b0d" stroke-width="2"/>
      <rect x="26" y="2" width="146" height="20" rx="2" fill="#121212"/>
      <rect x="26" y="118" width="146" height="20" rx="2" fill="#121212"/>
      <rect x="-14" y="52" width="32" height="36" rx="6" fill="#c9ced4" stroke="#8a9096"/>
      <rect x="-10" y="60" width="24" height="20" rx="4" fill="#7d838a"/>
      <rect x="60" y="52" width="36" height="36" rx="2" fill="#2a2a2e" stroke="#000"/>
      <text x="78" y="68" fill="#999" font-size="6" text-anchor="middle" font-family="monospace">ESP32</text>
      <text x="78" y="77" fill="#999" font-size="6" text-anchor="middle" font-family="monospace">-C3</text>
      <rect x="172" y="48" width="18" height="44" rx="2" fill="#d7cfb8" stroke="#9a927c"/>
      <text x="181" y="72" fill="#665" font-size="5" text-anchor="middle" transform="rotate(-90 181 72)">ANT</text>
      <rect x="28" y="50" width="14" height="10" rx="2" fill="#ddd" stroke="#888"/><text x="35" y="67" fill="#aaa" font-size="5.5" text-anchor="middle">BOOT</text>
      <rect x="28" y="76" width="14" height="10" rx="2" fill="#ddd" stroke="#888"/><text x="35" y="93" fill="#aaa" font-size="5.5" text-anchor="middle">RST</text>
      <circle cx="130" cy="74" r="2.5" fill="#ff3030" class="power-led"/>
      <text x="130" y="86" fill="#aaa" font-size="5.5" text-anchor="middle">PWR</text>
      <text x="150" y="86" fill="#aaa" font-size="5.5" text-anchor="middle">IO8</text>
      <text x="136" y="58" fill="#8899aa" font-size="7" text-anchor="middle" font-family="Arial" font-weight="700">SUPER MINI</text>`;
    },
  };

  Sim.Boards = { uno, micro, esp8266, esp32, esp32c3 };

  for (const b of Object.values(Sim.Boards)) {
    b.pinById = {};
    b.gpioPins = {};
    for (const p of b.pins) {
      b.pinById[p.id] = p;
      if (p.gpio != null && !p.alias) b.gpioPins[p.gpio] = p;
    }
    for (const p of b.pins) if (p.gpio != null && !b.gpioPins[p.gpio]) b.gpioPins[p.gpio] = p;
    b.pinName = function (gpio) {
      const p = this.gpioPins[gpio];
      if (!p) return 'GPIO' + gpio;
      if (this.family === 'avr') return /^A\d/.test(p.id) ? p.id : 'D' + gpio;
      if (this.family === 'esp8266') return p.label + ' (GPIO' + gpio + ')';
      return 'GPIO' + gpio;
    };

  }
})(typeof window !== 'undefined' ? window : globalThis);
