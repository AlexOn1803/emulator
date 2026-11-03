/*
 * Готові приклади: схема + скетч.
 * Координати розраховані під розташування пінів у boards.js.
 */
(function (G) {
  'use strict';
  const Sim = (G.Sim = G.Sim || {});
  const c = (id, type, x, y, rot, props) => ({ id, type, x, y, rot: rot || 0, props: props || {} });
  const w = (a, b, color) => ({ a, b, color: color || '#2e7d32' });
  const BLK = '#222222';
  const RED = '#d32f2f';
  const GRN = '#2e7d32';
  const BLU = '#1565c0';
  const YEL = '#f9a825';
  const ORG = '#ef6c00';
  const PUR = '#6a1b9a';

  Sim.Examples = [
    {
      id: 'empty',
      group: 'Початок',
      title: 'Порожній проєкт',
      board: 'uno',
      components: [],
      wires: [],
      code: `
void setup() {
  // цей код виконується один раз при старті
  Serial.begin(9600);
}

void loop() {
  // цей код повторюється безкінечно
}
`,
    },
    {
      id: 'led-resistor',
      group: 'Початок',
      title: 'Світлодіод з резистором (Blink)',
      board: 'uno',
      note: 'Світлодіод підключено до піна 9 через резистор 220 Ом. Мультиметр показує напругу на світлодіоді. Спробуйте змінити опір резистора — яскравість зміниться.',
      components: [
        c('r1', 'resistor', 248, -60, 90, { r: 220 }),
        c('l1', 'led', 258, -140, 0, { color: 'red' }),
        c('m1', 'meter', 400, -150, 0, { mode: 'V' }),
      ],
      wires: [
        w('B:D9', 'r1:B', ORG),
        w('r1:A', 'l1:A', ORG),
        w('l1:K', 'B:GND_T', BLK),
        w('m1:P', 'l1:A', RED),
        w('m1:N', 'l1:K', BLK),
      ],
      code: `
// Блимання світлодіодом, підключеним до піна 9 через резистор 220 Ом
const int LED_PIN = 9;

void setup() {
  pinMode(LED_PIN, OUTPUT);   // пін 9 — вихід
  Serial.begin(9600);
  Serial.println("Старт! Світлодіод блимає.");
}

void loop() {
  digitalWrite(LED_PIN, HIGH);  // увімкнути (5 В)
  delay(500);
  digitalWrite(LED_PIN, LOW);   // вимкнути (0 В)
  delay(500);
}
`,
    },
    {
      id: 'blink-builtin',
      group: 'Початок',
      title: 'Вбудований світлодіод LED_BUILTIN',
      board: 'uno',
      components: [],
      wires: [],
      code: `
// Найпростіша програма: блимаємо світлодіодом, що вже є на платі (пін 13, "L")
void setup() {
  pinMode(LED_BUILTIN, OUTPUT);
}

void loop() {
  digitalWrite(LED_BUILTIN, HIGH);
  delay(1000);
  digitalWrite(LED_BUILTIN, LOW);
  delay(1000);
}
`,
    },
    {
      id: 'button',
      group: 'Входи',
      title: 'Кнопка керує світлодіодом',
      board: 'uno',
      note: 'Кнопка підключена між піном 2 і GND, використовується внутрішній підтягувальний резистор (INPUT_PULLUP): не натиснута — HIGH, натиснута — LOW. Затисніть кнопку мишею.',
      components: [
        c('b1', 'button', 364, -60, 90, { color: '#d33' }),
        c('r1', 'resistor', 184, -60, 90, { r: 220 }),
        c('l1', 'led', 194, -140, 0, { color: 'green' }),
      ],
      wires: [
        w('B:D2', 'b1:B', BLU),
        w('b1:A', 'B:GND_T', BLK),
        w('B:D13', 'r1:B', GRN),
        w('r1:A', 'l1:A', GRN),
        w('l1:K', 'B:GND_T', BLK),
      ],
      code: `
const int BUTTON_PIN = 2;
const int LED_PIN = 13;
int lastState = HIGH;

void setup() {
  pinMode(BUTTON_PIN, INPUT_PULLUP);  // внутрішній резистор до +5 В
  pinMode(LED_PIN, OUTPUT);
  Serial.begin(9600);
}

void loop() {
  int state = digitalRead(BUTTON_PIN);
  // натиснута кнопка з'єднує пін з GND → LOW
  digitalWrite(LED_PIN, state == LOW ? HIGH : LOW);

  if (state != lastState) {
    Serial.println(state == LOW ? "Кнопку натиснуто" : "Кнопку відпущено");
    lastState = state;
    delay(20);  // захист від брязкоту контактів
  }
}
`,
    },
    {
      id: 'interrupt',
      group: 'Входи',
      title: 'Лічильник натискань (переривання)',
      board: 'uno',
      note: 'attachInterrupt викликає функцію при кожному натисканні кнопки, навіть коли loop() зайнятий delay().',
      components: [c('b1', 'button', 364, -60, 90, { color: '#36c' })],
      wires: [w('B:D2', 'b1:B', BLU), w('b1:A', 'B:GND_T', BLK)],
      code: `
volatile int presses = 0;
unsigned long lastPress = 0;

void onPress() {
  // захист від брязкоту: ігноруємо натискання частіше ніж раз на 50 мс
  if (millis() - lastPress > 50) {
    presses++;
    lastPress = millis();
  }
}

void setup() {
  Serial.begin(9600);
  pinMode(2, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(2), onPress, FALLING);
  Serial.println("Натискайте кнопку!");
}

void loop() {
  Serial.print("Натискань: ");
  Serial.println(presses);
  delay(1000);
}
`,
    },
    {
      id: 'pot',
      group: 'Входи',
      title: 'Потенціометр: яскравість і монітор',
      board: 'uno',
      note: 'Крутіть ручку потенціометра (тягніть мишею вгору/вниз або коліщатко). analogRead повертає 0…1023, analogWrite приймає 0…255. Відкрийте вкладку «Плоттер».',
      components: [
        c('p1', 'pot', 300, 380, 180, { r: 10000, pos: 0.35 }),
        c('r1', 'resistor', 248, -60, 90, { r: 220 }),
        c('l1', 'led', 258, -140, 0, { color: 'yellow' }),
        c('m1', 'meter', 430, 420, 0, { mode: 'V' }),
      ],
      wires: [
        w('p1:W', 'B:A0', YEL),
        w('p1:B', 'B:5V', RED),
        w('p1:A', 'B:GND2', BLK),
        w('B:D9', 'r1:B', ORG),
        w('r1:A', 'l1:A', ORG),
        w('l1:K', 'B:GND_T', BLK),
        w('m1:P', 'p1:W', YEL),
        w('m1:N', 'p1:A', BLK),
      ],
      code: `
const int POT_PIN = A0;
const int LED_PIN = 9;   // пін з ШІМ (~)

void setup() {
  pinMode(LED_PIN, OUTPUT);
  Serial.begin(9600);
}

void loop() {
  int value = analogRead(POT_PIN);          // 0..1023
  int brightness = map(value, 0, 1023, 0, 255);
  analogWrite(LED_PIN, brightness);          // 0..255
  float volts = value * 5.0 / 1023;

  Serial.print("АЦП: ");
  Serial.print(value);
  Serial.print("  напруга: ");
  Serial.print(volts);
  Serial.println(" В");
  delay(100);
}
`,
    },
    {
      id: 'ldr',
      group: 'Входи',
      title: 'Нічник з фоторезистором',
      board: 'uno',
      note: 'Фоторезистор і резистор 10 кОм утворюють подільник напруги. Змінюйте освітлення (коліщатко миші над фоторезистором) — у темряві світлодіод вмикається.',
      components: [
        c('ldr', 'ldr', 214, 350, 90, { light: 70 }),
        c('r2', 'resistor', 330, 350, 90, { r: 10000 }),
        c('r1', 'resistor', 248, -60, 90, { r: 220 }),
        c('l1', 'led', 258, -140, 0, { color: 'white' }),
      ],
      wires: [
        w('ldr:A', 'B:5V', RED),
        w('ldr:B', 'B:A0', YEL),
        w('r2:A', 'B:A0', YEL),
        w('r2:B', 'B:GND2', BLK),
        w('B:D9', 'r1:B', ORG),
        w('r1:A', 'l1:A', ORG),
        w('l1:K', 'B:GND_T', BLK),
      ],
      code: `
const int SENSOR = A0;
const int LED_PIN = 9;
const int THRESHOLD = 400;  // поріг "темно"

void setup() {
  pinMode(LED_PIN, OUTPUT);
  Serial.begin(9600);
}

void loop() {
  int light = analogRead(SENSOR);   // більше світла → більше значення
  Serial.print("Освітленість: ");
  Serial.println(light);

  if (light < THRESHOLD) {
    digitalWrite(LED_PIN, HIGH);    // темно — вмикаємо нічник
  } else {
    digitalWrite(LED_PIN, LOW);
  }
  delay(200);
}
`,
    },
    {
      id: 'fade',
      group: 'Світло і звук',
      title: 'Плавне світіння (ШІМ)',
      board: 'uno',
      components: [c('r1', 'resistor', 248, -60, 90, { r: 220 }), c('l1', 'led', 258, -140, 0, { color: 'blue' })],
      wires: [w('B:D9', 'r1:B', BLU), w('r1:A', 'l1:A', BLU), w('l1:K', 'B:GND_T', BLK)],
      code: `
// Плавне наростання і згасання яскравості за допомогою ШІМ
int brightness = 0;
int step = 5;

void setup() {
  pinMode(9, OUTPUT);
}

void loop() {
  analogWrite(9, brightness);
  brightness = brightness + step;
  if (brightness <= 0 || brightness >= 255) {
    step = -step;   // змінюємо напрямок
  }
  delay(30);
}
`,
    },
    {
      id: 'traffic',
      group: 'Світло і звук',
      title: 'Світлофор',
      board: 'uno',
      components: [
        c('r1', 'resistor', 200, -60, 90, { r: 220 }),
        c('r2', 'resistor', 248, -60, 90, { r: 220 }),
        c('r3', 'resistor', 300, -60, 90, { r: 220 }),
        c('l1', 'led', 210, -140, 0, { color: 'red' }),
        c('l2', 'led', 258, -140, 0, { color: 'yellow' }),
        c('l3', 'led', 310, -140, 0, { color: 'green' }),
      ],
      wires: [
        w('B:D12', 'r1:B', RED), w('r1:A', 'l1:A', RED),
        w('B:D9', 'r2:B', YEL), w('r2:A', 'l2:A', YEL),
        w('B:D6', 'r3:B', GRN), w('r3:A', 'l3:A', GRN),
        w('l1:K', 'B:GND_T', BLK), w('l2:K', 'l1:K', BLK), w('l3:K', 'l2:K', BLK),
      ],
      code: `
#define RED_LED    12
#define YELLOW_LED 9
#define GREEN_LED  6

void setLights(int r, int y, int g) {
  digitalWrite(RED_LED, r);
  digitalWrite(YELLOW_LED, y);
  digitalWrite(GREEN_LED, g);
}

void setup() {
  pinMode(RED_LED, OUTPUT);
  pinMode(YELLOW_LED, OUTPUT);
  pinMode(GREEN_LED, OUTPUT);
  Serial.begin(9600);
}

void loop() {
  Serial.println("Червоний — стоп");
  setLights(HIGH, LOW, LOW);
  delay(3000);

  Serial.println("Червоний + жовтий — приготуйтесь");
  setLights(HIGH, HIGH, LOW);
  delay(1000);

  Serial.println("Зелений — їдьте");
  setLights(LOW, LOW, HIGH);
  delay(3000);

  // зелений блимає
  for (int i = 0; i < 3; i++) {
    setLights(LOW, LOW, LOW);
    delay(300);
    setLights(LOW, LOW, HIGH);
    delay(300);
  }

  Serial.println("Жовтий");
  setLights(LOW, HIGH, LOW);
  delay(1000);
}
`,
    },
    {
      id: 'rgb',
      group: 'Світло і звук',
      title: 'RGB світлодіод: веселка',
      board: 'uno',
      components: [
        c('r1', 'resistor', 216, -50, 90, { r: 220 }),
        c('r2', 'resistor', 232, -50, 90, { r: 220 }),
        c('r3', 'resistor', 248, -50, 90, { r: 220 }),
        c('rgb', 'rgbled', 270, -150, 0, {}),
      ],
      wires: [
        w('B:D11', 'r1:B', RED), w('r1:A', 'rgb:R', RED),
        w('B:D10', 'r2:B', GRN), w('r2:A', 'rgb:G', GRN),
        w('B:D9', 'r3:B', BLU), w('r3:A', 'rgb:B', BLU),
        w('rgb:K', 'B:GND_T', BLK),
      ],
      code: `
const int R_PIN = 11, G_PIN = 10, B_PIN = 9;

void setColor(int r, int g, int b) {
  analogWrite(R_PIN, r);
  analogWrite(G_PIN, g);
  analogWrite(B_PIN, b);
}

void setup() {
  pinMode(R_PIN, OUTPUT);
  pinMode(G_PIN, OUTPUT);
  pinMode(B_PIN, OUTPUT);
}

void loop() {
  // плавний перехід кольорів по колу
  for (int i = 0; i < 360; i += 2) {
    float h = i / 60.0;
    int sector = (int)h;
    float f = h - sector;
    int up = f * 255, down = (1 - f) * 255;
    switch (sector) {
      case 0: setColor(255, up, 0); break;
      case 1: setColor(down, 255, 0); break;
      case 2: setColor(0, 255, up); break;
      case 3: setColor(0, down, 255); break;
      case 4: setColor(up, 0, 255); break;
      default: setColor(255, 0, down); break;
    }
    delay(20);
  }
}
`,
    },
    {
      id: 'buzzer',
      group: 'Світло і звук',
      title: "Мелодія на п'єзозумері",
      board: 'uno',
      note: 'Функція tone() генерує звук заданої частоти. Перевірте, що звук у браузері увімкнено (🔊).',
      components: [c('bz', 'buzzer', 274, -80, 0, { kind: 'passive' })],
      wires: [w('B:D8', 'bz:A', ORG), w('bz:B', 'B:GND_T', BLK)],
      code: `
#define NOTE_C4 262
#define NOTE_D4 294
#define NOTE_E4 330
#define NOTE_F4 349
#define NOTE_G4 392
#define NOTE_A4 440

const int BUZZER = 8;
int melody[] = { NOTE_C4, NOTE_C4, NOTE_G4, NOTE_G4, NOTE_A4, NOTE_A4, NOTE_G4, 0,
                 NOTE_F4, NOTE_F4, NOTE_E4, NOTE_E4, NOTE_D4, NOTE_D4, NOTE_C4, 0 };

void setup() {
  Serial.begin(9600);
}

void loop() {
  int notes = sizeof(melody) / sizeof(melody[0]);
  for (int i = 0; i < notes; i++) {
    if (melody[i] > 0) {
      tone(BUZZER, melody[i], 300);
      Serial.println(melody[i]);
    }
    delay(400);
  }
  noTone(BUZZER);
  delay(1000);
}
`,
    },
    {
      id: 'motor-npn',
      group: 'Рух',
      title: 'Моторчик через транзистор (швидкість від потенціометра)',
      board: 'uno',
      note: 'Мотор не можна живити напряму від піна (максимум 40 мА). Пін 3 через резистор 1 кОм відкриває транзистор, а той вмикає мотор від батареї 6 В. Діод захищає транзистор від викидів напруги мотора. Земля батареї з’єднана з GND плати.',
      components: [
        c('rb', 'resistor', 348, -60, 90, { r: 1000 }),
        c('q1', 'npn', 440, -160, 0, { model: '2N2222' }),
        c('m1', 'motor', 560, -170, 0, { vnom: 6 }),
        c('d1', 'diode', 560, -260, 180, { model: '1N4007' }),
        c('bat', 'battery', 680, -60, 0, { v: 6 }),
        c('p1', 'pot', 300, 380, 180, { r: 10000, pos: 0.6 }),
      ],
      wires: [
        w('B:D3', 'rb:B', ORG),
        w('rb:A', 'q1:B', ORG),
        w('q1:E', 'B:GND_T', BLK),
        w('q1:C', 'm1:B', BLU),
        w('bat:P', 'm1:A', RED),
        w('bat:N', 'B:GND_T', BLK),
        w('d1:A', 'm1:B', BLU),
        w('d1:K', 'm1:A', RED),
        w('p1:W', 'B:A0', YEL),
        w('p1:B', 'B:5V', RED),
        w('p1:A', 'B:GND2', BLK),
      ],
      code: `
const int MOTOR_PIN = 3;   // ШІМ-пін → база транзистора через 1 кОм
const int POT_PIN = A0;

void setup() {
  pinMode(MOTOR_PIN, OUTPUT);
  Serial.begin(9600);
}

void loop() {
  int pot = analogRead(POT_PIN);
  int speed = map(pot, 0, 1023, 0, 255);
  analogWrite(MOTOR_PIN, speed);

  Serial.print("Швидкість: ");
  Serial.print(speed * 100 / 255);
  Serial.println("%");
  delay(200);
}
`,
    },
    {
      id: 'servo',
      group: 'Рух',
      title: 'Сервопривід: розгортка 0°–180°',
      board: 'uno',
      components: [c('s1', 'servo', 240, -120, 270, {})],
      wires: [w('s1:SIG', 'B:D9', ORG), w('s1:GND', 'B:GND_T', '#7a4b24'), w('s1:VCC', 'B:5V', RED)],
      code: `
#include <Servo.h>

Servo myServo;

void setup() {
  myServo.attach(9);
  Serial.begin(9600);
}

void loop() {
  for (int angle = 0; angle <= 180; angle += 2) {
    myServo.write(angle);
    delay(15);
  }
  Serial.println("180°");
  delay(500);
  for (int angle = 180; angle >= 0; angle -= 2) {
    myServo.write(angle);
    delay(15);
  }
  Serial.println("0°");
  delay(500);
}
`,
    },
    {
      id: 'ultrasonic',
      group: 'Датчики і дисплеї',
      title: 'Ультразвуковий далекомір HC‑SR04',
      board: 'uno',
      note: 'Аналогові піни A1/A2 використовуються як звичайні цифрові. Змінюйте відстань до перешкоди повзунком у властивостях або коліщатком миші над датчиком.',
      components: [c('us', 'ultrasonic', 300, 390, 180, { distance: 60 })],
      wires: [w('us:VCC', 'B:5V', RED), w('us:GND', 'B:GND2', BLK), w('us:TRIG', 'B:A1', ORG), w('us:ECHO', 'B:A2', YEL)],
      code: `
const int TRIG = A1;
const int ECHO = A2;

void setup() {
  pinMode(TRIG, OUTPUT);
  pinMode(ECHO, INPUT);
  Serial.begin(9600);
}

void loop() {
  // короткий імпульс 10 мкс запускає вимірювання
  digitalWrite(TRIG, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG, LOW);

  long duration = pulseIn(ECHO, HIGH);   // тривалість луни, мкс
  float cm = duration * 0.0343 / 2;      // швидкість звуку 343 м/с

  Serial.print("Відстань: ");
  Serial.print(cm, 1);
  Serial.println(" см");
  delay(300);
}
`,
    },
    {
      id: 'lcd',
      group: 'Датчики і дисплеї',
      title: 'LCD 1602 I2C: текст і лічильник',
      board: 'uno',
      note: 'На Arduino Uno шина I2C — це A4 (SDA) і A5 (SCL).',
      components: [c('lcd', 'lcd', 620, 360, 0, { addr: 0x27 })],
      wires: [w('lcd:GND', 'B:GND2', BLK), w('lcd:VCC', 'B:5V', RED), w('lcd:SDA', 'B:A4', BLU), w('lcd:SCL', 'B:A5', YEL)],
      code: `
#include <Wire.h>
#include <LiquidCrystal_I2C.h>

LiquidCrystal_I2C lcd(0x27, 16, 2);   // адреса 0x27, 16 символів, 2 рядки

void setup() {
  lcd.init();
  lcd.backlight();
  lcd.setCursor(0, 0);
  lcd.print("Hello, Arduino!");
}

void loop() {
  lcd.setCursor(0, 1);
  lcd.print("Time: ");
  lcd.print(millis() / 1000);
  lcd.print(" s   ");
  delay(250);
}
`,
    },
    {
      id: 'serial-cmd',
      group: 'Датчики і дисплеї',
      title: 'Керування через монітор порту',
      board: 'uno',
      note: 'Введіть у полі внизу «on», «off» або число 0–255 і натисніть Enter.',
      components: [c('r1', 'resistor', 248, -60, 90, { r: 220 }), c('l1', 'led', 258, -140, 0, { color: 'green' })],
      wires: [w('B:D9', 'r1:B', GRN), w('r1:A', 'l1:A', GRN), w('l1:K', 'B:GND_T', BLK)],
      code: `
const int LED_PIN = 9;

void setup() {
  pinMode(LED_PIN, OUTPUT);
  Serial.begin(9600);
  Serial.println("Команди: on, off або яскравість 0..255");
}

void loop() {
  if (Serial.available() > 0) {
    String cmd = Serial.readStringUntil('\\n');
    cmd.trim();
    if (cmd == "on") {
      digitalWrite(LED_PIN, HIGH);
      Serial.println("Світлодіод увімкнено");
    } else if (cmd == "off") {
      digitalWrite(LED_PIN, LOW);
      Serial.println("Світлодіод вимкнено");
    } else {
      int value = cmd.toInt();
      analogWrite(LED_PIN, constrain(value, 0, 255));
      Serial.print("Яскравість: ");
      Serial.println(value);
    }
  }
}
`,
    },
    {
      id: 'mistake-led',
      group: 'Помилки (для навчання)',
      title: 'Світлодіод без резистора — перегорить!',
      board: 'uno',
      note: 'Тут світлодіод підключено напряму до піна. Запустіть — і подивіться, що станеться. Потім додайте резистор 220 Ом між піном і світлодіодом.',
      components: [c('l1', 'led', 258, -100, 0, { color: 'red' })],
      wires: [w('B:D9', 'l1:A', ORG), w('l1:K', 'B:GND_T', BLK)],
      code: `
void setup() {
  pinMode(9, OUTPUT);
  digitalWrite(9, HIGH);   // 5 В прямо на світлодіод без резистора...
}

void loop() {
}
`,
    },
    {
      id: 'mistake-float',
      group: 'Помилки (для навчання)',
      title: 'Кнопка без підтягувального резистора',
      board: 'uno',
      note: 'Пін налаштовано як INPUT без резистора — коли кнопка відпущена, вхід «плаває» і читає випадкові значення. Виправлення: INPUT_PULLUP.',
      components: [c('b1', 'button', 364, -60, 90, {})],
      wires: [w('B:D2', 'b1:B', BLU), w('b1:A', 'B:GND_T', BLK)],
      code: `
void setup() {
  pinMode(2, INPUT);        // помилка: має бути INPUT_PULLUP
  Serial.begin(9600);
}

void loop() {
  Serial.println(digitalRead(2));   // відпущена кнопка дає випадкові 0 і 1
  delay(200);
}
`,
    },
    {
      id: 'esp32-fade',
      group: 'ESP32',
      title: 'ESP32: плавне світіння (LEDC)',
      board: 'esp32',
      note: 'На ESP32 ШІМ формує модуль LEDC. ledcAttach(пін, частота, розрядність) — API ядра Arduino-ESP32 3.x; для старого ядра 2.x використовуйте ledcSetup + ledcAttachPin.',
      components: [c('r1', 'resistor', 314, -50, 90, { r: 220 }), c('l1', 'led', 324, -130, 0, { color: 'red' })],
      wires: [w('B:G13', 'r1:B', ORG), w('r1:A', 'l1:A', ORG), w('l1:K', 'B:GND_A', BLK)],
      code: `
const int LED_PIN = 13;
const int FREQ = 5000;
const int RESOLUTION = 8;   // 8 біт: 0..255

void setup() {
  Serial.begin(115200);
  ledcAttach(LED_PIN, FREQ, RESOLUTION);
  Serial.println("ESP32 LEDC fade");
}

void loop() {
  for (int duty = 0; duty <= 255; duty += 5) {
    ledcWrite(LED_PIN, duty);
    delay(20);
  }
  for (int duty = 255; duty >= 0; duty -= 5) {
    ledcWrite(LED_PIN, duty);
    delay(20);
  }
}
`,
    },
    {
      id: 'esp32-motor',
      group: 'ESP32',
      title: 'ESP32: мотор через MOSFET і кнопка',
      board: 'esp32',
      note: 'Логіка ESP32 — 3.3 В, тому потрібен MOSFET «логічного рівня» (IRLZ44N). Спробуйте замінити його на IRF520 у властивостях — мотор ледве крутитиметься. Кнопка вмикає/вимикає мотор.',
      components: [
        c('q1', 'mosfet', 250, -110, 0, { model: 'IRLZ44N' }),
        c('m1', 'motor', 330, -200, 0, { vnom: 6 }),
        c('d1', 'diode', 330, -290, 180, { model: '1N5819' }),
        c('bat', 'battery', 470, -110, 0, { v: 6 }),
        c('b1', 'button', 270, 220, 90, { color: '#2a2' }),
      ],
      wires: [
        w('B:G26', 'q1:G', ORG),
        w('q1:S', 'B:GND_A', BLK),
        w('q1:D', 'm1:B', BLU),
        w('bat:P', 'm1:A', RED),
        w('bat:N', 'B:GND_A', BLK),
        w('d1:A', 'm1:B', BLU),
        w('d1:K', 'm1:A', RED),
        w('b1:A', 'B:G4', GRN),
        w('b1:B', 'B:GND_B', BLK),
      ],
      code: `
const int MOTOR_PIN = 26;
const int BUTTON_PIN = 4;

bool motorOn = false;
int lastButton = HIGH;

void setup() {
  Serial.begin(115200);
  pinMode(BUTTON_PIN, INPUT_PULLUP);
  pinMode(MOTOR_PIN, OUTPUT);
  Serial.println("Натисніть кнопку, щоб увімкнути мотор");
}

void loop() {
  int b = digitalRead(BUTTON_PIN);
  if (b == LOW && lastButton == HIGH) {
    motorOn = !motorOn;
    Serial.println(motorOn ? "Мотор: УВІМК (плавний розгін)" : "Мотор: ВИМК");
    if (motorOn) {
      for (int s = 0; s <= 255; s += 5) {   // плавний розгін
        analogWrite(MOTOR_PIN, s);
        delay(20);
      }
    } else {
      analogWrite(MOTOR_PIN, 0);
    }
  }
  lastButton = b;
  delay(10);
}
`,
    },
    {
      id: 'esp32-lcd-pot',
      group: 'ESP32',
      title: 'ESP32: потенціометр і LCD',
      board: 'esp32',
      note: 'АЦП ESP32 12-бітний (0…4095). LCD живиться від VIN (5 В), I2C — GPIO21 (SDA) і GPIO22 (SCL).',
      components: [
        c('p1', 'pot', 160, -100, 0, { r: 10000, pos: 0.5 }),
        c('lcd', 'lcd', 330, 300, 0, { addr: 0x27 }),
      ],
      wires: [
        w('p1:W', 'B:G34', YEL),
        w('p1:A', 'B:GND_A', BLK),
        w('p1:B', 'B:3V3', RED),
        w('lcd:GND', 'B:GND_B', BLK),
        w('lcd:VCC', 'B:VIN', RED),
        w('lcd:SDA', 'B:G21', BLU),
        w('lcd:SCL', 'B:G22', YEL),
      ],
      code: `
#include <Wire.h>
#include <LiquidCrystal_I2C.h>

LiquidCrystal_I2C lcd(0x27, 16, 2);
const int POT = 34;

void setup() {
  Serial.begin(115200);
  lcd.init();
  lcd.backlight();
  lcd.print("ESP32 ADC demo");
}

void loop() {
  int raw = analogRead(POT);        // 0..4095
  float volts = raw * 3.3 / 4095;
  lcd.setCursor(0, 1);
  lcd.printf("%4d  %.2f V   ", raw, volts);
  Serial.printf("raw=%d volts=%.2f\\n", raw, volts);
  delay(200);
}
`,
    },
    {
      id: 'esp8266-wifi',
      group: 'ESP8266',
      title: 'ESP8266: Wi‑Fi і світлодіод',
      board: 'esp8266',
      note: 'Wi‑Fi лише імітується: WiFi.status() стає WL_CONNECTED через 1–2 секунди. Зверніть увагу: вбудований світлодіод на NodeMCU вмикається рівнем LOW.',
      components: [c('r1', 'resistor', 190, -50, 90, { r: 220 }), c('l1', 'led', 200, -130, 0, { color: 'green' })],
      wires: [w('B:D5', 'r1:B', GRN), w('r1:A', 'l1:A', GRN), w('l1:K', 'B:GND_A', BLK)],
      code: `
#include <ESP8266WiFi.h>

const char* ssid = "MyHomeWiFi";
const char* password = "12345678";

void setup() {
  Serial.begin(115200);
  pinMode(D5, OUTPUT);
  pinMode(LED_BUILTIN, OUTPUT);

  WiFi.begin(ssid, password);
  Serial.print("Підключення до Wi-Fi");
  while (WiFi.status() != WL_CONNECTED) {
    digitalWrite(LED_BUILTIN, !digitalRead(LED_BUILTIN));  // блимаємо під час підключення
    delay(250);
    Serial.print(".");
  }
  Serial.println();
  Serial.print("Підключено! IP: ");
  Serial.println(WiFi.localIP());
  digitalWrite(LED_BUILTIN, HIGH);   // HIGH = вимкнено (інверсна логіка)
}

void loop() {
  digitalWrite(D5, HIGH);
  delay(700);
  digitalWrite(D5, LOW);
  delay(700);
}
`,
    },
    {
      id: 'esp8266-pot',
      group: 'ESP8266',
      title: 'ESP8266: аналоговий вхід A0',
      board: 'esp8266',
      note: 'У ESP8266 лише один аналоговий вхід — A0. На платі NodeMCU він вимірює 0…3.3 В.',
      components: [
        c('p1', 'pot', 60, 250, 180, { r: 10000, pos: 0.4 }),
        c('r1', 'resistor', 190, -50, 90, { r: 220 }),
        c('l1', 'led', 200, -130, 0, { color: 'red' }),
      ],
      wires: [
        w('p1:W', 'B:A0', YEL),
        w('p1:A', 'B:GND_C', BLK),
        w('p1:B', 'B:3V3_C', RED),
        w('B:D5', 'r1:B', ORG), w('r1:A', 'l1:A', ORG), w('l1:K', 'B:GND_A', BLK),
      ],
      code: `
void setup() {
  Serial.begin(115200);
  pinMode(D5, OUTPUT);
}

void loop() {
  int value = analogRead(A0);              // 0..1023
  analogWrite(D5, map(value, 0, 1023, 0, 255));
  Serial.println(value);
  delay(100);
}
`,
    },
  ];
})(typeof window !== 'undefined' ? window : globalThis);
