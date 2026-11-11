import { ackMessage, acknowledge, cleanName, formatTime, lookupAcknowledgements, parseAckHash } from './verify.js';

const intro = document.getElementById('intro');
const existing = document.getElementById('existing');
const form = document.getElementById('ack-form');
const input = document.getElementById('name');
const button = form.querySelector('button');
const result = document.getElementById('result');

// eslint-disable-next-line import/no-unresolved -- config.js is gitignored and created on the host
const config = await import('./config.js').catch(() => null);

function show(text, status) {
  result.textContent = text;
  result.dataset.status = status;
}

function list(acks) {
  existing.replaceChildren(
    ...acks.map((a) => {
      const li = document.createElement('li');
      li.textContent = `Acknowledged by ${a.name} at ${formatTime(a.at)}.`;
      return li;
    }),
  );
}

const hash = parseAckHash(location.pathname, location.search);
if (!hash) {
  intro.textContent = 'This link is incomplete. Ask the tenant to share it again.';
} else if (!config) {
  intro.textContent = 'This page is not configured yet (config.js is missing).';
} else {
  intro.textContent = `Acknowledge receipt of the inspection report with verification code ${hash.slice(0, 12)}.`;
  const acks = await lookupAcknowledgements(hash, config);
  if (acks) list(acks);
  form.hidden = false;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = cleanName(input.value);
    if (!name) {
      show(ackMessage({ status: 'invalid' }), 'error');
      input.focus();
      return;
    }
    button.disabled = true;
    show('Sending...', 'busy');
    const res = await acknowledge(hash, name, config);
    if (res.status === 'acknowledged') {
      show(ackMessage(res), 'found');
      form.hidden = true;
      list([...(acks ?? []), { name: res.name, at: res.at }]);
    } else {
      show(ackMessage(res), 'error');
      button.disabled = false;
    }
  });
}
