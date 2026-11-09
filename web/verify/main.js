import { isValidCode, lookup, message, parseCode, toHex } from './verify.js';

const form = document.getElementById('code-form');
const input = document.getElementById('code');
const fileInput = document.getElementById('photo');
const drop = document.getElementById('drop');
const result = document.getElementById('result');

// eslint-disable-next-line import/no-unresolved -- config.js is gitignored and created on the host
const config = await import('./config.js').catch(() => null);

function show(text, status) {
  result.textContent = text;
  result.dataset.status = status;
}

async function check(kind, hash) {
  if (!config) return show('This page is not configured yet (config.js is missing).', 'error');
  show('Checking...', 'busy');
  const res = await lookup(hash, config);
  show(message(kind, res), res.status);
}

async function checkFile(file) {
  if (!file) return;
  show('Hashing the photo on this device...', 'busy');
  const hash = toHex(await crypto.subtle.digest('SHA-256', await file.arrayBuffer()));
  await check('photo', hash);
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const code = input.value.trim().toLowerCase();
  if (!isValidCode(code)) {
    show('Enter a verification code or SHA-256: 12 to 64 characters, 0-9 and a-f only.', 'error');
    input.focus();
    return;
  }
  check(code.length === 64 ? 'photo' : 'code', code);
});

fileInput.addEventListener('change', () => checkFile(fileInput.files[0]));
drop.addEventListener('dragover', (e) => {
  e.preventDefault();
  drop.classList.add('over');
});
drop.addEventListener('dragleave', () => drop.classList.remove('over'));
drop.addEventListener('drop', (e) => {
  e.preventDefault();
  drop.classList.remove('over');
  checkFile(e.dataTransfer.files[0]);
});

const code = parseCode(location.pathname, location.search);
if (code) {
  input.value = code;
  check('code', code);
}
