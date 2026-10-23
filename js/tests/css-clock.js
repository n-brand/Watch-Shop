// Test 01: the Lumen display in HTML/CSS. CSS draws the segments and decides which light up (data-d);
// this script only builds the seven segment elements per digit and sets the digits once per second.

const WEEKDAYS = ['SO', 'MO', 'DI', 'MI', 'DO', 'FR', 'SA'];
const lcd = document.getElementById('lcd');
const slots = {};

for (const digit of lcd.querySelectorAll('[data-slot]')) {
  digit.innerHTML = [...'abcdefg'].map((s) => `<span class="s ${s}"></span>`).join('');
  slots[digit.dataset.slot] = digit;
}

const two = (n) => String(n).padStart(2, '0');

function set(prefix, value) {
  const [a, b] = two(value);
  slots[`${prefix}1`].dataset.d = a;
  slots[`${prefix}2`].dataset.d = b;
}

function tick() {
  const now = new Date();
  set('h', now.getHours());
  set('i', now.getMinutes());
  set('s', now.getSeconds());
  set('d', now.getDate());
  set('m', now.getMonth() + 1);
  lcd.querySelector('[data-day]').textContent = WEEKDAYS[now.getDay()];
  lcd.setAttribute('aria-label', `Digitale Uhrzeit ${two(now.getHours())}:${two(now.getMinutes())}`);
  // Next update right after the full second, so the seconds never lag
  setTimeout(tick, 1000 - now.getMilliseconds() + 5);
}

// The colon animation runs for 2 s (lit, then dark); start it in phase so it is lit on even seconds
const now = new Date();
lcd.style.setProperty('--blink-delay', `${-((now.getSeconds() % 2) + now.getMilliseconds() / 1000)}s`);
tick();

// LIGHT: backlight for three seconds, like pressing the pusher on the watch
const lightButton = document.querySelector('[data-light]');
let lightTimer = 0;
lightButton.addEventListener('click', () => {
  lcd.dataset.light = '';
  lightButton.setAttribute('aria-pressed', 'true');
  clearTimeout(lightTimer);
  lightTimer = setTimeout(() => {
    delete lcd.dataset.light;
    lightButton.setAttribute('aria-pressed', 'false');
  }, 3000);
});
