// Demo script — uruchamia różne scenariusze żeby zobaczyć ruch przez queues i workery.
// Wymaga uruchomionego `docker compose up`. Node 20+ (native fetch).
//
// Użycie:
//   node scripts/demo.mjs single       # 1 symulacja, czekaj na auto-finish
//   node scripts/demo.mjs load         # 5 symulacji co 6s (load-balance między workerami)
//   node scripts/demo.mjs burst        # 3 symulacje w szybkiej sekwencji (zobacz throttle)
//   node scripts/demo.mjs finish       # start + manual finish po 3s
//   node scripts/demo.mjs restart      # start → auto-finish → restart → auto-finish
//   node scripts/demo.mjs validate     # złe nazwy (400)
//   node scripts/demo.mjs ws           # WS observer + start + live goal events
//   node scripts/demo.mjs all          # wszystko po kolei

import { io } from 'socket.io-client';
import { setTimeout as sleep } from 'node:timers/promises';

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const WS_URL = `${BASE}/simulations`;

const COLOR = {
  reset: '\x1b[0m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  gray: '\x1b[90m',
};
const c = (color, msg) => `${COLOR[color]}${msg}${COLOR.reset}`;
const log = (...args) => console.log(c('gray', `[${new Date().toISOString().slice(11, 23)}]`), ...args);

async function post(path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['x-simulation-token'] = token;
  const res = await fetch(`${BASE}${path}`, { method: 'POST', headers, body: JSON.stringify(body ?? {}) });
  const text = await res.text();
  let parsed;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  return { status: res.status, body: parsed };
}

async function get(path) {
  const res = await fetch(`${BASE}${path}`);
  return { status: res.status, body: await res.json() };
}

// === SCENARIOS ===

async function single() {
  log(c('cyan', '── SINGLE SIMULATION ──'));
  const { status, body } = await post('/simulations', { name: 'Single Demo' });
  log(`POST /simulations → ${status}`, c('green', body.simulationId));
  const id = body.simulationId;

  log('Czekam 11s na 9 goli + auto-finish...');
  await sleep(11_000);

  const final = await get(`/simulations/${id}`);
  log(`GET ${id} → ${final.status}`, c('green', `state=${final.body.state} totalGoals=${final.body.totalGoals}`));
}

async function load() {
  log(c('cyan', '── LOAD: 6 sim co 6s, rotujac po 3 profilach ──'));
  const profiles = ['uniform-realtime', 'poisson-accelerated', 'fast-markov'];
  let token;
  const ids = [];
  for (let i = 1; i <= 6; i++) {
    const profile = profiles[(i - 1) % profiles.length];
    const { status, body } = await post(
      '/simulations',
      { name: `Load Test ${i}`, profile },
      token,
    );
    if (status !== 201) {
      log(c('red', `POST #${i} (${profile}) → ${status}`), body);
      break;
    }
    token = body.ownershipToken;
    ids.push({ id: body.simulationId, profile });
    log(`POST #${i} → ${status}`, c('green', body.simulationId.slice(0, 8)), c('gray', profile));
    if (i < 6) await sleep(6_000);
  }
  log('Czekam 11s żeby ostatnia skończyła...');
  await sleep(11_000);
  for (const { id, profile } of ids) {
    const r = await get(`/simulations/${id}`);
    log(
      `${id.slice(0, 8)} (${c('gray', profile)}) →`,
      c('green', r.body.state),
      `goals=${r.body.totalGoals}`,
    );
  }
}

async function burst() {
  log(c('cyan', '── BURST: 3 sim w szybkiej sekwencji (throttle 429) ──'));
  let token;
  for (let i = 1; i <= 3; i++) {
    const { status, body } = await post('/simulations', { name: `Burst ${i}` }, token);
    if (status === 201) {
      token = body.ownershipToken;
      log(`POST #${i} → ${c('green', `${status}`)} ${body.simulationId.slice(0, 8)}`);
    } else {
      log(`POST #${i} → ${c('yellow', `${status}`)} ${body?.error?.code ?? ''}`);
    }
    await sleep(500);
  }
}

async function finishDemo() {
  log(c('cyan', '── FINISH: start + manual finish po 3s ──'));
  const { body } = await post('/simulations', { name: 'Finish Demo' });
  const { simulationId, ownershipToken } = body;
  log(`Start → ${c('green', simulationId.slice(0, 8))}`);

  await sleep(3_000);
  const f = await post(`/simulations/${simulationId}/finish`, null, ownershipToken);
  log(`Finish → ${c(f.status === 202 ? 'green' : 'red', `${f.status}`)}`);

  await sleep(2_000);
  const final = await get(`/simulations/${simulationId}`);
  log(`Final: ${c('green', final.body.state)} goals=${final.body.totalGoals} (manual cut-off)`);
}

async function restartDemo() {
  log(c('cyan', '── RESTART: start → auto-finish → restart → finish ──'));
  const { body } = await post('/simulations', { name: 'Restart Demo' });
  const { simulationId, ownershipToken } = body;
  log(`Start #1 → ${c('green', simulationId.slice(0, 8))}`);

  log('Czekam 11s na auto-finish...');
  await sleep(11_000);
  const after1 = await get(`/simulations/${simulationId}`);
  log(`Po #1: ${c('green', after1.body.state)} goals=${after1.body.totalGoals}`);

  const r = await post(`/simulations/${simulationId}/restart`, null, ownershipToken);
  log(`Restart → ${c(r.status === 202 ? 'green' : 'red', `${r.status}`)}`);

  log('Czekam 11s na auto-finish #2...');
  await sleep(11_000);
  const after2 = await get(`/simulations/${simulationId}`);
  log(`Po #2: ${c('green', after2.body.state)} goals=${after2.body.totalGoals}`);
}

async function validate() {
  log(c('cyan', '── VALIDATE: złe nazwy (oczekuj 400) ──'));
  const cases = [
    ['Short', 'za krótka'],
    ['Katar-2023', 'znaki specjalne'],
    ['A'.repeat(31), 'za długa'],
    ['Katar 2023 ', 'trailing whitespace'],
  ];
  for (const [name, label] of cases) {
    const { status, body } = await post('/simulations', { name });
    log(`${label.padEnd(22)} → ${c(status === 400 ? 'green' : 'red', `${status}`)} ${body?.error?.code ?? ''}`);
  }
}

async function wsDemo() {
  log(c('cyan', '── WS OBSERVER + start ──'));

  const { body } = await post('/simulations', { name: 'WS Demo' });
  const simId = body.simulationId;
  log(`Start → ${c('green', simId.slice(0, 8))}`);

  const socket = io(WS_URL, { transports: ['websocket'], reconnection: false });
  await new Promise((resolve, reject) => {
    socket.on('connect', resolve);
    socket.on('connect_error', reject);
  });
  log('WS connected');

  let goals = 0;
  socket.on('goal-scored', (p) => {
    goals++;
    log(c('green', `⚽ goal #${p.totalGoals}`), `team=${p.teamId}`);
  });
  socket.on('simulation-finished', (p) => {
    log(c('green', `🏁 finished`), `reason=${p.reason} totalGoals=${p.totalGoals}`);
  });

  await new Promise((resolve, reject) => {
    socket.emit('subscribe', { simulationId: simId }, (ack) => {
      if (ack?.ok) resolve();
      else reject(new Error('subscribe nack'));
    });
  });
  log(`Subscribed do simulation:${simId.slice(0, 8)}, czekam na eventy...`);

  await sleep(11_000);
  socket.disconnect();
  log(`Koniec WS. Odebrano ${goals} goli.`);
}

async function all() {
  await single();
  await sleep(6_000); // cooldown
  await load();
  await sleep(6_000);
  await burst();
  await sleep(6_000);
  await finishDemo();
  await sleep(6_000);
  await restartDemo();
  await sleep(6_000);
  await validate();
  await sleep(6_000);
  await wsDemo();
}

const SCENARIOS = { single, load, burst, finish: finishDemo, restart: restartDemo, validate, ws: wsDemo, all };

const scenario = process.argv[2] ?? 'single';
const fn = SCENARIOS[scenario];
if (!fn) {
  console.error(c('red', `Unknown scenario: ${scenario}`));
  console.error(`Available: ${Object.keys(SCENARIOS).join(', ')}`);
  process.exit(1);
}

log(c('cyan', `🚀 SportRadar demo — scenariusz: ${scenario}`));
log(c('gray', `BASE=${BASE}`));
try {
  await fn();
  log(c('green', '✔ Gotowe'));
  process.exit(0);
} catch (err) {
  log(c('red', '✘ Error'), err);
  process.exit(1);
}
