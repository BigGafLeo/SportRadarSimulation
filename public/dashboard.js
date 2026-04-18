/* eslint-disable */
// Real-time infrastructure dashboard for SportRadar simulation.
// Polls /admin/stats on an interval and subscribes to `admin:all` WS room.
// Click a sim card → detail panel subscribes to that sim's events.

(function () {
  const POLL_INTERVAL_MS = 1500;
  const MAX_EVENTS = 80;
  const MAX_DETAIL_EVENTS = 40;
  const TOKEN_STORE_KEY = 'dashboard.ownershipTokens';

  const $ = (id) => document.getElementById(id);
  const el = {
    transport: $('mode-transport'),
    persistence: $('mode-persistence'),
    wsDot: $('ws-dot'),
    wsLabel: $('ws-label'),
    pollLabel: $('poll-label'),
    queues: $('queues'),
    workers: $('workers'),
    simulations: $('simulations'),
    simSummary: $('sim-summary'),
    events: $('events'),
    eventsCount: $('events-count'),
    btnNewSim: $('btn-new-sim'),
    detailPanel: $('detail-panel'),
    detailName: $('detail-name'),
    detailProfile: $('detail-profile'),
    detailBody: $('detail-body'),
    detailClose: $('detail-close'),
    newSimModal: $('new-sim-modal'),
    newSimForm: $('new-sim-form'),
    newSimName: $('new-sim-name'),
    newSimSubmit: $('new-sim-submit'),
    newSimError: $('new-sim-error'),
    newSimCancel: $('new-sim-cancel'),
  };

  const state = {
    events: [],
    detailOpenFor: null, // simulationId or null
    detailEvents: [],
    detailSim: null,
  };

  // ------------- ownership token storage -------------

  function loadTokens() {
    try {
      return JSON.parse(localStorage.getItem(TOKEN_STORE_KEY) || '{}');
    } catch {
      return {};
    }
  }
  function saveToken(simulationId, token) {
    const t = loadTokens();
    t[simulationId] = token;
    localStorage.setItem(TOKEN_STORE_KEY, JSON.stringify(t));
  }
  function getToken(simulationId) {
    return loadTokens()[simulationId] ?? null;
  }

  // ------------- polling -------------

  async function poll() {
    const started = performance.now();
    try {
      const res = await fetch('/admin/stats', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const stats = await res.json();
      render(stats);
      const ms = Math.round(performance.now() - started);
      el.pollLabel.textContent = `poll ${ms}ms`;
    } catch (err) {
      el.pollLabel.textContent = `poll err: ${err.message}`;
    }
  }

  setInterval(poll, POLL_INTERVAL_MS);
  poll();

  // ------------- render -------------

  function render(stats) {
    el.transport.textContent = `transport: ${stats.mode.transport}`;
    el.persistence.textContent = `persistence: ${stats.mode.persistence}`;
    renderQueues(stats.queues);
    renderWorkers(stats.queues);
    renderSimulations(stats.simulations);
  }

  function renderQueues(queues) {
    const names = Object.keys(queues);
    if (names.length === 0) {
      el.queues.innerHTML = '<div class="empty">transport is in-memory — no BullMQ queues</div>';
      return;
    }
    el.queues.innerHTML = names
      .map((name) => {
        const q = queues[name];
        const c = q.counts;
        return `
        <div class="queue-row">
          <div class="queue-name">${escape(shortQueue(name))}</div>
          <div class="queue-counts">
            ${chip('waiting', c.waiting)}
            ${chip('active', c.active)}
            ${chip('completed', c.completed)}
            ${chip('failed', c.failed)}
            ${chip('delayed', c.delayed)}
          </div>
        </div>`;
      })
      .join('');
  }

  function renderWorkers(queues) {
    const byId = new Map();
    for (const name of Object.keys(queues)) {
      for (const w of queues[name].workers) {
        const existing = byId.get(w.id) ?? { ...w, queues: [] };
        existing.queues.push(name);
        byId.set(w.id, existing);
      }
    }
    if (byId.size === 0) {
      el.workers.innerHTML = '<div class="empty">no workers registered</div>';
      return;
    }
    el.workers.innerHTML = Array.from(byId.values())
      .sort((a, b) => (workerProfile(a) || 'zzz').localeCompare(workerProfile(b) || 'zzz'))
      .map((w) => {
        const ageSec = Math.floor(w.age);
        const profile = workerProfile(w);
        const profileBadge = profile
          ? `<span class="profile-badge ${profileClass(profile)}">${escape(profile)}</span>`
          : '<span class="profile-badge shared">shared</span>';
        return `
        <div class="worker-row">
          <div class="worker-row-head">
            <span class="worker-id">${escape(shortWorkerId(w.id))}</span>
            ${profileBadge}
          </div>
          <div class="worker-meta">
            ${escape(w.addr || 'unknown')} · age ${ageSec}s · queues: ${w.queues.map(shortQueue).join(', ')}
          </div>
        </div>`;
      })
      .join('');
  }

  function workerProfile(w) {
    const runQueue = w.queues.find((q) => q.startsWith('simulation.run.'));
    return runQueue ? runQueue.replace('simulation.run.', '') : null;
  }

  function profileClass(p) {
    if (p === 'uniform-realtime') return 'uniform';
    if (p === 'poisson-accelerated') return 'poisson';
    if (p === 'fast-markov') return 'markov';
    return 'shared';
  }

  function renderSimulations(sims) {
    el.simSummary.textContent = `${sims.running} running · ${sims.finished} finished`;
    if (sims.list.length === 0) {
      el.simulations.innerHTML =
        '<div class="empty">no simulations yet — click "+ New simulation" above</div>';
      return;
    }
    const now = Date.now();
    const html = sims.list
      .slice()
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
      .map((s) => {
        const startedMs = new Date(s.startedAt).getTime();
        const elapsed = Math.max(0, now - startedMs);
        const pct = Math.min(100, (elapsed / 10_000) * 100);
        const elapsedSec = (elapsed / 1000).toFixed(1);
        const profile = s.profileId || 'unknown';
        return `
        <div class="sim-card" data-sim-id="${escape(s.id)}" tabindex="0" role="button">
          <div class="sim-name">${escape(s.name)}</div>
          <div class="sim-badges">
            <span class="profile-badge ${profileClass(profile)}">${escape(profile)}</span>
            <span class="sim-state ${s.state.toLowerCase()}">${escape(s.state)}</span>
          </div>
          <div class="sim-meta">
            <span><span class="k">id:</span> <span class="v">${escape(s.id.slice(0, 8))}</span></span>
            <span><span class="k">goals:</span> <span class="v">${s.totalGoals}</span></span>
            <span><span class="k">elapsed:</span> <span class="v">${elapsedSec}s</span></span>
            <span><span class="k">handled by:</span> <span class="v">worker-${escape(profileShortName(profile))}</span></span>
          </div>
          ${s.state === 'RUNNING' ? `<div class="sim-progress"><div class="sim-progress-fill" style="width:${pct}%"></div></div>` : ''}
          <div class="sim-actions">
            <button class="btn btn-ghost btn-sm" data-action="finish" data-sim="${escape(s.id)}">Finish</button>
            <button class="btn btn-ghost btn-sm" data-action="restart" data-sim="${escape(s.id)}">Restart</button>
          </div>
        </div>`;
      })
      .join('');
    el.simulations.innerHTML = html;
  }

  function chip(cls, n) {
    return `<span class="count-chip ${cls}">${cls}=<span class="n">${n ?? 0}</span></span>`;
  }

  function shortQueue(name) {
    return name.replace(/^simulation\./, '');
  }

  function profileShortName(p) {
    if (p === 'uniform-realtime') return 'uniform';
    if (p === 'poisson-accelerated') return 'poisson';
    if (p === 'fast-markov') return 'markov';
    return p;
  }

  function shortWorkerId(id) {
    return id && id.length > 16 ? id.slice(0, 16) + '…' : id || '-';
  }

  function escape(s) {
    return String(s).replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
    );
  }

  // ------------- simulation card interaction (click + control buttons) -------------

  el.simulations.addEventListener('click', async (ev) => {
    const btn = ev.target.closest('button[data-action]');
    if (btn) {
      ev.stopPropagation();
      const action = btn.dataset.action;
      const simId = btn.dataset.sim;
      await controlSimulation(simId, action, btn);
      return;
    }
    const card = ev.target.closest('.sim-card');
    if (card && card.dataset.simId) openDetail(card.dataset.simId);
  });

  async function controlSimulation(simId, action, btn) {
    const token = getToken(simId);
    btn.disabled = true;
    const originalText = btn.textContent;
    btn.textContent = action === 'finish' ? 'Finishing…' : 'Restarting…';
    try {
      const headers = {};
      if (token) headers['x-simulation-token'] = token;
      const res = await fetch(`/simulations/${simId}/${action}`, {
        method: 'POST',
        headers,
      });
      if (res.status !== 202) {
        const body = await res.json().catch(() => ({}));
        const msg = body?.error?.message || body?.message || `HTTP ${res.status}`;
        throw new Error(msg);
      }
      showActionResult(simId, `${action} accepted`, false);
      setTimeout(poll, 300);
    } catch (err) {
      showActionResult(simId, `${action} failed: ${err.message}`, true);
      btn.disabled = false;
      btn.textContent = originalText;
    }
  }

  function showActionResult(simId, msg, isError) {
    if (state.detailOpenFor === simId) {
      const status = document.getElementById('detail-action-status');
      if (status) {
        status.textContent = msg;
        status.className = `detail-action-status ${isError ? 'error' : 'ok'}`;
        status.hidden = false;
        clearTimeout(state.actionStatusTimer);
        state.actionStatusTimer = setTimeout(() => {
          status.hidden = true;
        }, 4000);
      }
    }
    if (isError) console.warn(`[sim ${simId.slice(0, 8)}]`, msg);
  }

  // ------------- detail panel -------------

  async function openDetail(simId) {
    if (state.detailOpenFor === simId) return;
    if (state.detailOpenFor) closeDetail();
    state.detailOpenFor = simId;
    state.detailEvents = [];
    el.detailPanel.hidden = false;
    el.detailName.textContent = `${simId.slice(0, 8)}…`;
    el.detailProfile.textContent = '—';
    el.detailProfile.className = 'profile-badge';
    el.detailBody.innerHTML = '<div class="empty">loading…</div>';

    socket.emit('subscribe', { simulationId: simId }, () => {});

    try {
      const res = await fetch(`/simulations/${simId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const sim = await res.json();
      state.detailSim = sim;
      renderDetail(sim);
    } catch (err) {
      el.detailBody.innerHTML = `<div class="empty">failed to load: ${escape(err.message)}</div>`;
    }
  }

  function closeDetail() {
    if (!state.detailOpenFor) return;
    socket.emit('unsubscribe', { simulationId: state.detailOpenFor }, () => {});
    state.detailOpenFor = null;
    state.detailSim = null;
    state.detailEvents = [];
    el.detailPanel.hidden = true;
  }

  el.detailClose.addEventListener('click', closeDetail);
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && state.detailOpenFor) closeDetail();
  });

  function renderDetail(sim) {
    el.detailName.textContent = sim.name;
    el.detailProfile.textContent = sim.profileId;
    el.detailProfile.className = `profile-badge ${profileClass(sim.profileId)}`;

    const startedMs = new Date(sim.startedAt).getTime();
    const elapsed = Math.max(0, Date.now() - startedMs);
    const elapsedSec = (elapsed / 1000).toFixed(1);
    const scoreRows = (sim.score || [])
      .map(
        (m) => `
        <tr>
          <td class="match-id">${escape(m.matchId)}</td>
          <td class="score-num">${m.home}</td>
          <td class="score-sep">:</td>
          <td class="score-num">${m.away}</td>
        </tr>`,
      )
      .join('');

    el.detailBody.innerHTML = `
      <div class="detail-actions">
        <button class="btn btn-ghost btn-sm" data-action="finish" data-sim="${escape(sim.id)}">Finish</button>
        <button class="btn btn-ghost btn-sm" data-action="restart" data-sim="${escape(sim.id)}">Restart</button>
      </div>
      <div class="detail-action-status" id="detail-action-status" hidden></div>
      <div class="detail-stats">
        <div class="detail-stat"><span class="k">State</span><span class="sim-state ${sim.state.toLowerCase()}">${escape(sim.state)}</span></div>
        <div class="detail-stat"><span class="k">Total goals</span><span class="v big">${sim.totalGoals}</span></div>
        <div class="detail-stat"><span class="k">Elapsed</span><span class="v">${elapsedSec}s</span></div>
        <div class="detail-stat"><span class="k">Handled by</span><span class="v">worker-${escape(profileShortName(sim.profileId))}</span></div>
      </div>
      <div class="detail-section-title">Score per match</div>
      <table class="match-score">${scoreRows || '<tr><td colspan="4" class="empty">no matches</td></tr>'}</table>
      <div class="detail-section-title">Live events</div>
      <div class="detail-events" id="detail-events">
        <div class="empty">waiting for events…</div>
      </div>`;
  }

  el.detailBody.addEventListener('click', async (ev) => {
    const btn = ev.target.closest('button[data-action]');
    if (!btn) return;
    ev.stopPropagation();
    await controlSimulation(btn.dataset.sim, btn.dataset.action, btn);
  });

  function updateDetailFromGoal(p) {
    if (!state.detailSim) return;
    state.detailSim.totalGoals = p.totalGoals ?? state.detailSim.totalGoals;
    if (Array.isArray(p.score)) state.detailSim.score = p.score;
    renderDetail(state.detailSim);
    renderDetailEvents();
  }

  function updateDetailFromFinish(p) {
    if (!state.detailSim) return;
    state.detailSim.state = 'FINISHED';
    state.detailSim.totalGoals = p.totalGoals ?? state.detailSim.totalGoals;
    renderDetail(state.detailSim);
    renderDetailEvents();
  }

  function updateDetailFromRestart() {
    if (!state.detailSim) return;
    state.detailSim.state = 'RUNNING';
    state.detailSim.totalGoals = 0;
    state.detailSim.score = (state.detailSim.score || []).map((m) => ({ ...m, home: 0, away: 0 }));
    renderDetail(state.detailSim);
    renderDetailEvents();
  }

  function pushDetailEvent(type, cls, body) {
    const ts = new Date().toISOString().slice(11, 23);
    state.detailEvents.unshift({ ts, type, cls, body });
    state.detailEvents = state.detailEvents.slice(0, MAX_DETAIL_EVENTS);
    renderDetailEvents();
  }

  function renderDetailEvents() {
    const container = document.getElementById('detail-events');
    if (!container) return;
    if (state.detailEvents.length === 0) {
      container.innerHTML = '<div class="empty">waiting for events…</div>';
      return;
    }
    container.innerHTML = state.detailEvents
      .map(
        (e) => `
        <div class="event-row">
          <span class="event-time">${e.ts}</span>
          <span class="event-type ${e.cls}">${e.type}</span>
          <span class="event-body">${e.body}</span>
        </div>`,
      )
      .join('');
  }

  // ------------- new simulation modal -------------

  function profileCountInputs() {
    return Array.from(el.newSimForm.querySelectorAll('input[data-profile]'));
  }
  function readProfileCounts() {
    return profileCountInputs()
      .map((input) => ({
        profile: input.dataset.profile,
        count: Math.max(0, Math.min(50, Number(input.value) || 0)),
      }))
      .filter((p) => p.count > 0);
  }
  function refreshSubmitState() {
    const total = readProfileCounts().reduce((sum, p) => sum + p.count, 0);
    el.newSimSubmit.textContent = `Start ${total}`;
    el.newSimSubmit.disabled = total === 0 || total > 100;
    if (total > 100) el.newSimSubmit.textContent = 'Total > 100';
  }

  el.btnNewSim.addEventListener('click', () => {
    el.newSimError.hidden = true;
    el.newSimError.textContent = '';
    el.newSimName.value = '';
    profileCountInputs().forEach((input) => (input.value = '0'));
    refreshSubmitState();
    if (typeof el.newSimModal.showModal === 'function') el.newSimModal.showModal();
    else el.newSimModal.setAttribute('open', '');
    setTimeout(() => el.newSimName.focus(), 50);
  });
  el.newSimForm.addEventListener('input', (ev) => {
    if (ev.target.matches('input[data-profile]')) refreshSubmitState();
  });
  el.newSimCancel.addEventListener('click', () => el.newSimModal.close());
  el.newSimForm.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const base = el.newSimName.value.trim();
    const buckets = readProfileCounts();
    const total = buckets.reduce((sum, b) => sum + b.count, 0);
    if (total === 0) return;
    el.newSimError.hidden = true;

    const created = [];
    const failed = [];
    el.newSimSubmit.disabled = true;

    let started = 0;
    for (const { profile, count } of buckets) {
      const profileShort = profileShortName(profile);
      for (let i = 1; i <= count; i++) {
        started++;
        const name = `${base} ${profileShort} ${i}`;
        el.newSimSubmit.textContent = `Starting ${started}/${total}…`;
        try {
          const res = await fetch('/simulations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, profile }),
          });
          if (res.status !== 201) {
            const body = await res.json().catch(() => ({}));
            throw new Error(body?.error?.message || body?.message || `HTTP ${res.status}`);
          }
          const data = await res.json();
          saveToken(data.simulationId, data.ownershipToken);
          created.push(data.simulationId);
        } catch (err) {
          failed.push({ name, message: err.message });
        }
      }
    }

    refreshSubmitState();

    if (failed.length === 0) {
      el.newSimModal.close();
      setTimeout(poll, 300);
      if (created.length === 1) openDetail(created[0]);
    } else {
      el.newSimError.innerHTML = `Created ${created.length}/${total}. Failed: ${failed
        .map((f) => `<div>${escape(f.name)} → ${escape(f.message)}</div>`)
        .join('')}`;
      el.newSimError.hidden = false;
      setTimeout(poll, 300);
    }
  });

  // ------------- websocket -------------

  const socket = io('/simulations', { transports: ['websocket'], reconnection: true });

  socket.on('connect', () => {
    el.wsDot.classList.add('on');
    el.wsLabel.textContent = 'live';
    socket.emit('subscribe-all', {}, () => {});
    if (state.detailOpenFor)
      socket.emit('subscribe', { simulationId: state.detailOpenFor }, () => {});
  });

  socket.on('disconnect', () => {
    el.wsDot.classList.remove('on');
    el.wsLabel.textContent = 'disconnected';
  });

  socket.on('simulation-started', (p) => {
    pushEvent('SimulationStarted', 'started', p, `${p.simulationId?.slice(0, 8)} started`);
  });
  socket.on('goal-scored', (p) => {
    pushEvent(
      'GoalScored',
      'goal',
      p,
      `${p.simulationId?.slice(0, 8)} · team=<span class="v">${escape(p.teamId || '?')}</span> · <span class="highlight">⚽ #${p.totalGoals}</span>`,
    );
    if (p.simulationId === state.detailOpenFor) {
      updateDetailFromGoal(p);
      pushDetailEvent(
        'GoalScored',
        'goal',
        `team=<span class="v">${escape(p.teamId || '?')}</span> · <span class="highlight">⚽ #${p.totalGoals}</span>`,
      );
    }
  });
  socket.on('simulation-finished', (p) => {
    pushEvent(
      'SimulationFinished',
      'finished',
      p,
      `${p.simulationId?.slice(0, 8)} finished · reason=<span class="v">${escape(p.reason || '?')}</span> · goals=<span class="v">${p.totalGoals ?? '?'}</span>`,
    );
    if (p.simulationId === state.detailOpenFor) {
      updateDetailFromFinish(p);
      pushDetailEvent(
        'SimulationFinished',
        'finished',
        `reason=<span class="v">${escape(p.reason || '?')}</span> · goals=<span class="v">${p.totalGoals ?? '?'}</span>`,
      );
    }
  });
  socket.on('simulation-restarted', (p) => {
    pushEvent('SimulationRestarted', 'restarted', p, `${p.simulationId?.slice(0, 8)} restarted`);
    if (p.simulationId === state.detailOpenFor) {
      updateDetailFromRestart();
      pushDetailEvent('SimulationRestarted', 'restarted', 'score reset');
    }
  });

  function pushEvent(type, cls, payload, body) {
    const now = new Date();
    const ts = now.toISOString().slice(11, 23);
    const row = document.createElement('div');
    row.className = 'event-row';
    row.innerHTML = `
      <span class="event-time">${ts}</span>
      <span class="event-type ${cls}">${type}</span>
      <span class="event-body">${body}</span>`;
    if (el.events.querySelector('.empty')) el.events.innerHTML = '';
    el.events.prepend(row);
    state.events.unshift({ ts, type, payload });
    while (el.events.childElementCount > MAX_EVENTS) {
      el.events.removeChild(el.events.lastElementChild);
    }
    el.eventsCount.textContent = `${state.events.length} events`;
  }
})();
