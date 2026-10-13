/**
 * IRONWOOD - heads up display and front end.
 *
 * The 3D-ish parts of the HUD (radar, compass, crosshair, hitmarkers, damage
 * arcs, scope reticle, nametags, objective markers) are drawn on one 2D canvas;
 * text panels, the killfeed, scoreboard and every menu are DOM.
 */

import * as THREE from 'three';
import { TAU, clamp, lerp, saturate, smoothstep, formatTime } from '../core/math.js';

const RADAR_RADIUS = 82;
const RADAR_RANGE = 70;

export class HUD {
  constructor({ world, audio, settings = {}, hooks = {} }) {
    this.world = world;
    this.audio = audio;
    this.settings = settings;
    this.hooks = hooks;
    this.canvas = document.getElementById('hud-canvas');
    this.ctx2d = this.canvas?.getContext('2d');
    this.root = document.getElementById('hud');
    this.menu = document.getElementById('menu');
    this.loading = document.getElementById('loading');
    this.input = null;
    this.dpr = Math.min(1.75, window.devicePixelRatio || 1);
    this.width = 0;
    this.height = 0;
    this.screen = 'main';
    this.currentScreen = 'main';
    this.touchMode = false;
    this.hitMarker = { time: 0, head: false, kill: false };
    this.damageArcs = [];
    this.notifications = [];
    this.killfeedRows = [];
    this.chatRows = [];
    this.chatOpen = false;
    this.flashValue = 0;
    this.scopeAmount = 0;
    this.respawnActive = false;
    this.objectiveBanner = null;
    this.fpsSample = 60;
    this.radarSweep = 0;
    this.stats = { fps: 0, ping: 0 };
    this.multiplayer = { roomCode: null, players: [], mode: null };
    this._tmpVec = new THREE.Vector3();
    this._prevHit = 0;
    this._prevKill = 0;
    this._elements = {};
    this.bind();
  }

  /* ------------------------------------------------------------------ */
  /* Wiring                                                              */
  /* ------------------------------------------------------------------ */

  el(id) {
    if (!this._elements[id]) this._elements[id] = document.getElementById(id);
    return this._elements[id];
  }

  bind() {
    this.menu?.addEventListener('click', (ev) => {
      const btn = ev.target.closest('button[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;
      this.audio?.uiClick();
      this.hooks.onAction?.(action, btn);
    });
    this.menu?.addEventListener('input', (ev) => {
      const target = ev.target;
      if (target.id === 'input-name') this.hooks.onNameChange?.(target.value);
      if (target.id?.startsWith('opt-')) this.hooks.onSettingChange?.(target.id.replace('opt-', ''), target.type === 'checkbox' ? target.checked : target.value);
      if (target.id === 'opt-sens') this.el('val-sens').textContent = Number(target.value).toFixed(4);
      if (target.id === 'opt-fov') this.el('val-fov').textContent = `${target.value}°`;
      if (target.id === 'opt-mastervol') this.el('val-mastervol').textContent = `${Math.round(target.value * 100)}%`;
      if (target.id === 'opt-sfxvol') this.el('val-sfxvol').textContent = `${Math.round(target.value * 100)}%`;
      if (target.id === 'opt-ambvol') this.el('val-ambvol').textContent = `${Math.round(target.value * 100)}%`;
    });
    this.menu?.addEventListener('change', (ev) => {
      const target = ev.target;
      if (target.id?.startsWith('opt-')) this.hooks.onSettingChange?.(target.id.replace('opt-', ''), target.type === 'checkbox' ? target.checked : target.value);
    });
    document.querySelectorAll('#choice-primary button, #choice-secondary button').forEach((btn) => {
      btn.addEventListener('click', () => {
        const group = btn.parentElement;
        group.querySelectorAll('button').forEach((b) => b.classList.remove('selected'));
        btn.classList.add('selected');
        this.audio?.uiClick();
        this.hooks.onLoadoutChange?.({
          primary: document.querySelector('#choice-primary button.selected')?.dataset.weapon,
          secondary: document.querySelector('#choice-secondary button.selected')?.dataset.weapon,
        });
      });
    });
    this.el('tab-host')?.addEventListener('click', () => this.setMpTab('host'));
    this.el('tab-join')?.addEventListener('click', () => this.setMpTab('join'));

    const chatInput = this.el('chat-input');
    chatInput?.addEventListener('keydown', (ev) => {
      ev.stopPropagation();
      if (ev.key === 'Enter') {
        const text = chatInput.value.trim();
        if (text) this.hooks.onChat?.(text);
        chatInput.value = '';
        this.closeChat();
      } else if (ev.key === 'Escape') {
        this.closeChat();
      }
    });
    chatInput?.addEventListener('keyup', (ev) => ev.stopPropagation());

    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.detectTouch();
  }

  attachInput(input) {
    this.input = input;
    this.setupTouch(input);
  }

  detectTouch() {
    const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints ?? 0) > 0;
    this.touchMode = isTouch;
    document.getElementById('touch-controls')?.classList.toggle('on', isTouch);
  }

  resize() {
    this.dpr = Math.min(1.75, window.devicePixelRatio || 1);
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    if (!this.canvas) return;
    this.canvas.width = Math.floor(this.width * this.dpr);
    this.canvas.height = Math.floor(this.height * this.dpr);
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    this.ctx2d?.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  /* ------------------------------------------------------------------ */
  /* Loading screen                                                      */
  /* ------------------------------------------------------------------ */

  setLoadingProgress(fraction, label) {
    const fill = this.el('loading-bar-fill');
    if (fill) fill.style.width = `${Math.round(saturate(fraction) * 100)}%`;
    if (label) {
      const labelEl = this.el('loading-label');
      if (labelEl) labelEl.textContent = label;
    }
  }

  hideLoading() {
    this.loading?.classList.add('hidden');
  }

  showLoadingWarning(html) {
    const warn = this.el('loading-warning');
    if (!warn) return;
    warn.innerHTML = html;
    warn.classList.add('show');
  }

  /* ------------------------------------------------------------------ */
  /* Screens                                                             */
  /* ------------------------------------------------------------------ */

  showMenu(screen) {
    this.screen = screen;
    this.menu?.classList.remove('hidden');
    const screens = ['main', 'sp', 'mp', 'loadout', 'settings', 'pause', 'end'];
    for (const name of screens) {
      document.getElementById(`screen-${name}`)?.classList.toggle('active', name === screen);
    }
    this.menu?.classList.toggle('hidden', !screen);
    if (!screen) this.menu?.classList.add('hidden');
    this.currentScreen = screen;
  }

  hideMenu() {
    this.menu?.classList.add('hidden');
    this.screen = null;
  }

  setMpTab(tab) {
    this.el('tab-host')?.classList.toggle('active', tab === 'host');
    this.el('tab-join')?.classList.toggle('active', tab === 'join');
    this.el('card-host-code')?.classList.toggle('hidden', tab !== 'host');
    this.el('card-join')?.classList.toggle('hidden', tab !== 'join');
    const card = this.el('card-host-code');
    if (card) card.style.display = tab === 'host' ? '' : 'none';
    const join = this.el('card-join');
    if (join) join.style.display = tab === 'join' ? '' : 'none';
  }

  setHudVisible(visible) {
    this.root?.classList.toggle('active', visible);
  }

  setHostStatus(text) {
    const el = this.el('host-status');
    if (el) el.textContent = text;
  }
  setJoinStatus(text) {
    const el = this.el('join-status');
    if (el) el.textContent = text;
  }
  setInviteCode(code) {
    const el = this.el('host-invite');
    if (el) el.value = code || '';
  }
  setAnswerCode(code) {
    const el = this.el('join-answer');
    if (el) el.value = code || '';
  }
  getHostAnswer() {
    return this.el('host-answer')?.value?.trim() ?? '';
  }
  getJoinInvite() {
    return this.el('join-invite')?.value?.trim() ?? '';
  }
  getJoinCode() {
    return this.el('join-code')?.value?.trim() ?? '';
  }
  setTransport(transport) {
    const sel = this.el('opt-transport');
    if (sel) sel.value = transport;
  }
  getTransport() {
    return this.el('opt-transport')?.value ?? 'tab';
  }
  setPartyInfo({ roomCode, players }) {
    this.multiplayer.roomCode = roomCode ?? this.multiplayer.roomCode;
    this.multiplayer.players = players ?? this.multiplayer.players;
    const codeEl = this.el('host-room-code');
    if (codeEl) codeEl.textContent = roomCode ?? '—';
    const countEl = this.el('host-player-count');
    if (countEl) countEl.textContent = String(this.multiplayer.players.length);
    const listEl = this.el('host-players');
    if (listEl) {
      listEl.innerHTML = this.multiplayer.players.length
        ? this.multiplayer.players.map((p) => `• ${p.name}${p.isHost ? ' (host)' : ''}`).join('<br>')
        : 'Nobody yet.';
    }
  }

  setSettingValues(settings) {
    const set = (id, value) => {
      const el = this.el(id);
      if (!el) return;
      if (el.type === 'checkbox') el.checked = !!value;
      else el.value = value;
    };
    set('opt-sens', settings.sensitivity);
    set('opt-fov', settings.fov);
    set('opt-invert', settings.invertY);
    set('opt-quality', settings.quality);
    set('opt-mastervol', settings.masterVolume);
    set('opt-sfxvol', settings.sfxVolume);
    set('opt-ambvol', settings.ambienceVolume);
    const nameEl = this.el('input-name');
    if (nameEl) nameEl.value = settings.name;
    const valSens = this.el('val-sens');
    if (valSens) valSens.textContent = Number(settings.sensitivity).toFixed(4);
    const valFov = this.el('val-fov');
    if (valFov) valFov.textContent = `${settings.fov}°`;
    const vm = this.el('val-mastervol');
    if (vm) vm.textContent = `${Math.round(settings.masterVolume * 100)}%`;
    const vs = this.el('val-sfxvol');
    if (vs) vs.textContent = `${Math.round(settings.sfxVolume * 100)}%`;
    const va = this.el('val-ambvol');
    if (va) va.textContent = `${Math.round(settings.ambienceVolume * 100)}%`;
  }

  /* ------------------------------------------------------------------ */
  /* In-match feedback                                                   */
  /* ------------------------------------------------------------------ */

  notify(text, opts = {}) {
    const el = document.createElement('div');
    el.className = `notif ${opts.type ?? ''}`;
    el.textContent = text;
    this.el('notifications')?.appendChild(el);
    setTimeout(() => {
      el.style.transition = 'opacity 0.4s';
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 420);
    }, opts.duration ?? 2600);
  }

  showBanner(text, duration = 3200) {
    const el = this.el('objective-banner');
    if (!el) return;
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(this._bannerTimer);
    this._bannerTimer = setTimeout(() => el.classList.remove('show'), duration);
  }

  addKillfeed(entry) {
    const row = document.createElement('div');
    row.className = `kf-row${entry.attackerTeam === 'us' && entry.attacker === 'You' ? ' mine' : ''}`;
    const hs = entry.headshot ? ' <span class="hs">HEADSHOT</span>' : '';
    row.innerHTML = `<span class="att">${escapeHtml(entry.attacker)}</span> <span class="wep">[${escapeHtml(entry.weapon)}]</span> <span class="vic">${escapeHtml(entry.victim)}</span>${hs}`;
    const feed = this.el('killfeed');
    feed?.appendChild(row);
    this.killfeedRows.push({ el: row, time: performance.now() });
    setTimeout(() => {
      row.style.transition = 'opacity 0.5s';
      row.style.opacity = '0';
      setTimeout(() => row.remove(), 520);
    }, 6500);
    if (this.killfeedRows.length > 6) {
      const old = this.killfeedRows.shift();
      old?.el.remove();
    }
  }

  showHitMarker(headshot = false, kill = false) {
    this.hitMarker.time = performance.now() / 1000;
    this.hitMarker.head = headshot;
    this.hitMarker.kill = kill;
    if (kill) this.hitMarker.killTime = performance.now() / 1000;
  }

  addDamageArc(worldDirection, playerYaw) {
    const angle = Math.atan2(worldDirection.x, worldDirection.z);
    this.damageArcs.push({ angle, yaw: playerYaw, time: performance.now() / 1000 });
    if (this.damageArcs.length > 8) this.damageArcs.shift();
  }

  setFlash(value) {
    this.flashValue = value;
  }

  showRespawn(seconds, killer) {
    this.respawnActive = true;
    const overlay = this.el('respawn-overlay');
    overlay?.classList.add('show');
    const sub = this.el('respawn-sub');
    if (sub) sub.textContent = killer ? `Killed by ${killer}` : 'You are down';
    const timer = this.el('respawn-timer');
    if (timer) timer.textContent = String(Math.max(0, Math.ceil(seconds)));
  }

  updateRespawnTimer(seconds) {
    const timer = this.el('respawn-timer');
    if (timer) timer.textContent = String(Math.max(0, Math.ceil(seconds)));
  }

  hideRespawn() {
    this.respawnActive = false;
    this.el('respawn-overlay')?.classList.remove('show');
  }

  setScoreboard(visible, rows = [], scores = { us: 0, opfor: 0 }) {
    const el = this.el('scoreboard');
    el?.classList.toggle('show', visible);
    if (!visible || !rows.length) return;
    const body = this.el('scoreboard-body');
    if (body) {
      body.innerHTML = rows.map((r) => `
        <tr class="${r.isLocal ? 'me' : ''}">
          <td>${escapeHtml(r.name)}${r.isBot ? ' <span style="opacity:.5">bot</span>' : ''}</td>
          <td class="${r.team === 'us' ? 'team-us' : 'team-opfor'}">${r.team === 'us' ? 'US' : 'OPFOR'}</td>
          <td>${r.kills}</td>
          <td>${r.deaths}</td>
          <td>${r.ping ? `${Math.round(r.ping)}ms` : '—'}</td>
        </tr>`).join('');
    }
    const us = this.el('sb-us');
    if (us) us.textContent = `US ${scores.us}`;
    const op = this.el('sb-opfor');
    if (op) op.textContent = `${scores.opfor} OPFOR`;
  }

  addChat(name, text, isLocal = false) {
    const row = document.createElement('div');
    row.className = 'chat-line';
    row.innerHTML = `<b style="color:${isLocal ? '#ffd9a5' : '#9fd46a'}">${escapeHtml(name)}</b>: ${escapeHtml(text)}`;
    const log = this.el('chat-log');
    log?.appendChild(row);
    this.chatRows.push(row);
    if (this.chatRows.length > 5) this.chatRows.shift()?.remove();
    setTimeout(() => {
      row.style.transition = 'opacity 0.6s';
      row.style.opacity = '0';
    }, 8000);
  }

  openChat() {
    this.chatOpen = true;
    const row = this.el('chat-input-row');
    row?.classList.add('show');
    const input = this.el('chat-input');
    input?.focus();
  }

  closeChat() {
    this.chatOpen = false;
    this.el('chat-input-row')?.classList.remove('show');
    this.el('chat-input')?.blur();
  }

  showEndScreen(summary, rows = []) {
    const title = this.el('end-title');
    const localTeam = this.hooks.localTeam?.() ?? 'us';
    if (title) {
      if (!summary) title.textContent = 'Match over';
      else if (summary.winner === 'draw') title.textContent = 'Draw';
      else title.textContent = summary.winner === localTeam ? 'Victory' : 'Defeat';
    }
    const sub = this.el('end-sub');
    if (sub && summary) {
      sub.textContent = `${summary.reason === 'score' ? 'Score limit' : 'Time limit'} · US ${summary.scores.us} — ${summary.scores.opfor} OPFOR · ${summary.killCount} kills`;
    }
    const stats = this.el('end-stats');
    if (stats) {
      const best = rows.slice(0, 6);
      stats.innerHTML = best.map((r) => `<div class="kv"><span>${escapeHtml(r.name)}${r.isLocal ? ' (you)' : ''}</span><span>${r.kills} / ${r.deaths}</span></div>`).join('') || '<div class="hint">No stats.</div>';
    }
    this.showMenu('end');
  }

  /* ------------------------------------------------------------------ */
  /* Per-frame update                                                    */
  /* ------------------------------------------------------------------ */

  update(dt, ctx) {
    const { player, weapon, match, camera } = ctx;
    this.stats.fps = ctx.fps ?? this.stats.fps;
    this.stats.ping = ctx.ping ?? 0;

    // fps / net readout
    this.fpsSample = lerp(this.fpsSample, ctx.fps ?? 60, 0.08);
    const fpsEl = this.el('fps');
    if (fpsEl) fpsEl.textContent = `${Math.round(this.fpsSample)} FPS`;
    const pingEl = this.el('ping');
    if (pingEl) pingEl.textContent = ctx.net ? `${Math.round(ctx.net.ping)}ms` : '';
    const modeEl = this.el('netmode');
    if (modeEl) {
      modeEl.textContent = ctx.net
        ? ctx.net.isHost
          ? `HOST · ${ctx.net.peers.size + 1} players`
          : `GUEST · host ${Math.round(ctx.net.ping)}ms`
        : '';
    }

    // top bar
    if (match) {
      const us = this.el('score-us');
      if (us) us.textContent = String(match.scores.us);
      const op = this.el('score-opfor');
      if (op) op.textContent = String(match.scores.opfor);
      const timer = this.el('match-timer');
      if (timer) timer.textContent = formatTime(match.timeLeft);
    }

    // health / stamina / stance
    if (player) {
      const hp = Math.max(0, Math.round(player.health));
      const hv = this.el('health-value');
      if (hv) hv.textContent = String(hp);
      const fill = this.el('health-bar-fill');
      if (fill) {
        fill.style.width = `${hp}%`;
        fill.classList.toggle('low', hp < 40);
      }
      const sf = this.el('stamina-bar-fill');
      if (sf) sf.style.width = `${Math.round(player.stamina * 100)}%`;
      document.querySelectorAll('#stance-icons span').forEach((span) => {
        span.classList.toggle('on', span.dataset.stance === player.stance);
      });
    }

    // weapon panel
    if (weapon) {
      const state = weapon.ammoState();
      const nameEl = this.el('weapon-name');
      if (nameEl) nameEl.textContent = state.name ?? '';
      const magEl = this.el('ammo-mag');
      if (magEl) magEl.textContent = String(state.mag);
      const resEl = this.el('ammo-reserve');
      if (resEl) resEl.textContent = ` / ${state.reserve}`;
      this.el('ammo-line')?.classList.toggle('low', state.mag <= Math.max(3, Math.round((state.magSize ?? 30) * 0.25)));
      const modeEl2 = this.el('fire-mode');
      if (modeEl2) {
        const def = weapon.def;
        const mode = def.modes ? def.modes[weapon.fireMode % def.modes.length] : def.kind;
        modeEl2.textContent = `${mode.toUpperCase()}${weapon.reloading ? ' · RELOADING' : ''}`;
      }
      for (const kind of ['frag', 'flash']) {
        const dots = this.el(`dots-${kind}`);
        if (!dots) continue;
        const count = weapon.grenades[kind] ?? 0;
        dots.innerHTML = Array.from({ length: Math.max(2, count) }, (_, i) => `<span class="dot${i < count ? ' on' : ''}"></span>`).join('');
      }
    }

    // streak banner
    const streakEl = this.el('streak-icons');
    if (streakEl && match) {
      const uav = (match.uav[player?.team ?? 'us'] ?? 0) > 0;
      streakEl.textContent = uav ? `RECON UAV ACTIVE · ${Math.ceil(match.uav[player?.team ?? 'us'])}s` : '';
    }

    this.drawCanvas(dt, ctx);
  }

  /* ------------------------------------------------------------------ */
  /* Canvas layer                                                        */
  /* ------------------------------------------------------------------ */

  drawCanvas(dt, ctx) {
    const g = this.ctx2d;
    if (!g) return;
    const W = this.width;
    const H = this.height;
    g.clearRect(0, 0, W, H);
    if (!ctx.player) return;

    this.drawRadar(g, ctx);
    this.drawCompass(g, ctx);
    if (!ctx.dead) {
      if (ctx.scope > 0.55) this.drawScope(g, ctx);
      else this.drawCrosshair(g, ctx);
    }
    this.drawHitMarker(g, ctx);
    this.drawDamageArcs(g, ctx);
    this.drawWorldMarkers(g, ctx);
    this.radarSweep += dt * 0.9;
  }

  drawRadar(g, ctx) {
    const { player, minimap, blips = [], mates = [], objectives = [] } = ctx;
    if (!minimap) return;
    const cx = 22 + RADAR_RADIUS;
    const cy = 22 + RADAR_RADIUS;
    const r = RADAR_RADIUS;
    g.save();
    // frame
    g.beginPath();
    g.arc(cx, cy, r, 0, TAU);
    g.fillStyle = 'rgba(6,10,7,0.62)';
    g.fill();
    g.strokeStyle = 'rgba(255,180,87,0.35)';
    g.lineWidth = 1.5;
    g.stroke();
    g.clip();

    const scale = r / RADAR_RANGE;
    const yaw = player.yaw;
    const cos = Math.cos(-yaw + Math.PI);
    const sin = Math.sin(-yaw + Math.PI);
    const toScreen = (wx, wz) => {
      const dx = (wx - player.position.x) * scale;
      const dz = (wz - player.position.z) * scale;
      // rotate so the player's facing is up
      const rx = dx * Math.cos(-yaw) - dz * Math.sin(-yaw);
      const ry = dx * Math.sin(-yaw) + dz * Math.cos(-yaw);
      return { x: cx + rx, y: cy + ry };
    };
    void cos;
    void sin;

    // terrain wash: river + roads
    g.strokeStyle = 'rgba(90,130,150,0.4)';
    g.lineWidth = Math.max(3, minimap.riverWidth * scale);
    g.beginPath();
    minimap.river.forEach((p, i) => {
      const s = toScreen(p.x, p.z);
      if (i === 0) g.moveTo(s.x, s.y);
      else g.lineTo(s.x, s.y);
    });
    g.stroke();

    g.strokeStyle = 'rgba(190,170,130,0.45)';
    g.lineWidth = 2.5;
    for (const path of minimap.paths) {
      g.beginPath();
      path.forEach((p, i) => {
        const s = toScreen(p.x, p.z);
        if (i === 0) g.moveTo(s.x, s.y);
        else g.lineTo(s.x, s.y);
      });
      g.stroke();
    }

    // buildings
    g.fillStyle = 'rgba(210,205,190,0.22)';
    for (const b of minimap.buildings) {
      const s = toScreen(b.x, b.z);
      if (Math.hypot(s.x - cx, s.y - cy) > r + 10) continue;
      g.save();
      g.translate(s.x, s.y);
      g.rotate(-yaw);
      const w = Math.max(2, b.w * scale * 0.5);
      const d = Math.max(2, b.d * scale * 0.5);
      g.fillRect(-w, -d, w * 2, d * 2);
      g.restore();
    }

    // objectives
    for (const obj of objectives) {
      const s = toScreen(obj.x, obj.z);
      if (Math.hypot(s.x - cx, s.y - cy) > r - 4) continue;
      g.fillStyle = 'rgba(255,180,87,0.85)';
      g.beginPath();
      g.arc(s.x, s.y, 3.4, 0, TAU);
      g.fill();
      g.fillStyle = 'rgba(0,0,0,0.75)';
      g.font = 'bold 6px ui-monospace, monospace';
      g.textAlign = 'center';
      g.fillText(obj.name?.[0] ?? 'A', s.x, s.y + 2.2);
    }

    // mates (green arrows)
    for (const mate of mates) {
      const s = toScreen(mate.x, mate.z);
      if (Math.hypot(s.x - cx, s.y - cy) > r - 3) continue;
      g.save();
      g.translate(s.x, s.y);
      g.rotate(-yaw + (mate.yaw ?? 0) + Math.PI);
      g.fillStyle = mate.alive === false ? 'rgba(120,160,110,0.4)' : 'rgba(140,220,110,0.95)';
      g.beginPath();
      g.moveTo(0, -4.6);
      g.lineTo(3.2, 3.6);
      g.lineTo(0, 2.1);
      g.lineTo(-3.2, 3.6);
      g.closePath();
      g.fill();
      g.restore();
    }

    // spotted enemies (red)
    for (const blip of blips) {
      const s = toScreen(blip.x, blip.z);
      if (Math.hypot(s.x - cx, s.y - cy) > r - 3) continue;
      g.fillStyle = 'rgba(240,70,52,0.95)';
      g.beginPath();
      g.arc(s.x, s.y, 3.2, 0, TAU);
      g.fill();
    }

    // sweep + player arrow
    const sweepA = this.radarSweep % TAU;
    const grad = g.createLinearGradient(cx, cy, cx + Math.sin(sweepA) * r, cy - Math.cos(sweepA) * r);
    grad.addColorStop(0, 'rgba(150,255,180,0.16)');
    grad.addColorStop(1, 'rgba(150,255,180,0)');
    g.strokeStyle = grad;
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(cx, cy);
    g.lineTo(cx + Math.sin(sweepA) * r, cy - Math.cos(sweepA) * r);
    g.stroke();

    g.fillStyle = 'rgba(255,255,255,0.95)';
    g.beginPath();
    g.moveTo(cx, cy - 6);
    g.lineTo(cx + 4.5, cy + 5);
    g.lineTo(cx, cy + 2.5);
    g.lineTo(cx - 4.5, cy + 5);
    g.closePath();
    g.fill();

    g.restore();

    // radar label
    g.fillStyle = 'rgba(255,180,87,0.55)';
    g.font = '9px ui-monospace, monospace';
    g.textAlign = 'left';
    g.fillText('VINH LONG', cx - r + 4, cy + r + 12);
  }

  drawCompass(g, ctx) {
    const { player } = ctx;
    const W = this.width;
    const cx = W / 2;
    const y = 46;
    const width = Math.min(340, W * 0.42);
    g.save();
    g.fillStyle = 'rgba(6,10,7,0.5)';
    g.fillRect(cx - width / 2, y - 11, width, 20);
    g.strokeStyle = 'rgba(255,180,87,0.2)';
    g.strokeRect(cx - width / 2, y - 11, width, 20);
    g.beginPath();
    g.rect(cx - width / 2, y - 11, width, 20);
    g.clip();

    const heading = ((-player.yaw * 180) / Math.PI + 360) % 360;
    const pxPerDeg = width / 120;
    const drawTick = (deg, label, major) => {
      let delta = ((deg - heading + 540) % 360) - 180;
      if (Math.abs(delta) > 62) return;
      const x = cx + delta * pxPerDeg;
      g.strokeStyle = major ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.35)';
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(x, y - 8);
      g.lineTo(x, y + (major ? 3 : -2));
      g.stroke();
      if (label) {
        g.fillStyle = 'rgba(255,255,255,0.9)';
        g.font = 'bold 10px ui-monospace, monospace';
        g.textAlign = 'center';
        g.fillText(label, x, y + 12);
      }
    };
    for (let deg = 0; deg < 360; deg += 15) {
      const label = deg === 0 ? 'N' : deg === 90 ? 'E' : deg === 180 ? 'S' : deg === 270 ? 'W' : null;
      drawTick(deg, label, !!label || deg % 45 === 0);
    }
    // objective markers on the strip
    for (const obj of ctx.objectives || []) {
      const dx = obj.x - player.position.x;
      const dz = obj.z - player.position.z;
      const worldAngle = Math.atan2(dx, -dz);
      const bearing = ((worldAngle * 180) / Math.PI + 360) % 360;
      let delta = ((bearing - heading + 540) % 360) - 180;
      if (Math.abs(delta) > 62) continue;
      const x = cx + delta * pxPerDeg;
      g.fillStyle = 'rgba(255,180,87,0.95)';
      g.beginPath();
      g.moveTo(x, y - 14);
      g.lineTo(x + 4, y - 9);
      g.lineTo(x, y - 4);
      g.lineTo(x - 4, y - 9);
      g.closePath();
      g.fill();
    }
    g.restore();

    g.fillStyle = 'rgba(255,255,255,0.9)';
    g.font = 'bold 11px ui-monospace, monospace';
    g.textAlign = 'center';
    g.fillText(`${Math.round(heading)}°`, cx, y + 1);
  }

  drawCrosshair(g, ctx) {
    const cx = this.width / 2;
    const cy = this.height / 2;
    const spread = ctx.spread ?? 0.004;
    // map spread (radians) to pixels: roughly fovRad / height
    const fov = (ctx.fov ?? 62) * (Math.PI / 180);
    const px = clamp((spread / fov) * this.height * 1.15, 5, 90);
    const len = 7;
    g.save();
    g.strokeStyle = 'rgba(255,255,255,0.86)';
    g.lineWidth = 1.7;
    g.beginPath();
    g.moveTo(cx - px - len, cy); g.lineTo(cx - px, cy);
    g.moveTo(cx + px, cy); g.lineTo(cx + px + len, cy);
    g.moveTo(cx, cy - px - len); g.lineTo(cx, cy - px);
    g.moveTo(cx, cy + px); g.lineTo(cx, cy + px + len);
    g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.9)';
    g.fillRect(cx - 1, cy - 1, 2, 2);
    g.restore();
  }

  drawScope(g, ctx) {
    const cx = this.width / 2;
    const cy = this.height / 2;
    const aspect = this.width / this.height;
    const radius = Math.min(this.width * 0.335 / (aspect > 1 ? 1 : 1), this.height * 0.335);
    const spread = ctx.spread ?? 0;
    g.save();
    // reticle
    g.strokeStyle = 'rgba(10,12,10,0.92)';
    g.lineWidth = 1.4;
    g.beginPath();
    g.moveTo(cx - radius, cy); g.lineTo(cx - radius * 0.08, cy);
    g.moveTo(cx + radius * 0.08, cy); g.lineTo(cx + radius, cy);
    g.moveTo(cx, cy - radius); g.lineTo(cx, cy - radius * 0.08);
    g.moveTo(cx, cy + radius * 0.08); g.lineTo(cx, cy + radius);
    g.stroke();
    // mil dots on the horizontal + vertical stadia
    g.fillStyle = 'rgba(10,12,10,0.9)';
    for (let i = 1; i <= 4; i++) {
      const off = (radius * 0.16) * i;
      g.beginPath(); g.arc(cx - off, cy, 1.7, 0, TAU); g.fill();
      g.beginPath(); g.arc(cx + off, cy, 1.7, 0, TAU); g.fill();
      g.beginPath(); g.arc(cx, cy + off, 1.7, 0, TAU); g.fill();
    }
    // live spread indicator
    const fov = (ctx.fov ?? 9) * (Math.PI / 180);
    const px = clamp((spread / Math.max(fov, 0.001)) * this.height * 0.55, 2, radius * 0.6);
    g.strokeStyle = 'rgba(255,180,87,0.55)';
    g.lineWidth = 1;
    g.beginPath();
    g.arc(cx, cy, px, 0, TAU);
    g.stroke();
    g.restore();
  }

  drawHitMarker(g, ctx) {
    const now = performance.now() / 1000;
    const age = now - (this.hitMarker.time ?? 0);
    const killAge = now - (this.hitMarker.killTime ?? -99);
    const cx = this.width / 2;
    const cy = this.height / 2;
    if (age < 0.14) {
      const a = 1 - age / 0.14;
      const size = this.hitMarker.head ? 15 : 12;
      g.save();
      g.strokeStyle = this.hitMarker.head ? `rgba(255,90,70,${a})` : `rgba(255,255,255,${a})`;
      g.lineWidth = 2.4;
      g.beginPath();
      for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        g.moveTo(cx + sx * size * 0.45, cy + sy * size * 0.45);
        g.lineTo(cx + sx * size, cy + sy * size);
      }
      g.stroke();
      g.restore();
    }
    if (killAge < 0.5) {
      const a = 1 - killAge / 0.5;
      g.save();
      g.strokeStyle = `rgba(255,80,60,${a * 0.9})`;
      g.lineWidth = 3;
      const size = 18;
      g.beginPath();
      for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        g.moveTo(cx + sx * size * 0.4, cy + sy * size * 0.4);
        g.lineTo(cx + sx * size, cy + sy * size);
      }
      g.stroke();
      g.restore();
    }
  }

  drawDamageArcs(g, ctx) {
    const now = performance.now() / 1000;
    const cx = this.width / 2;
    const cy = this.height / 2;
    const radius = Math.min(this.width, this.height) * 0.32;
    this.damageArcs = this.damageArcs.filter((arc) => now - arc.time < 1.4);
    g.save();
    for (const arc of this.damageArcs) {
      const age = now - arc.time;
      const alpha = (1 - age / 1.4) * 0.85;
      const rel = arc.angle - ctx.player.yaw;
      const screenAngle = -rel + Math.PI;
      g.strokeStyle = `rgba(232,58,42,${alpha})`;
      g.lineWidth = 5;
      g.beginPath();
      g.arc(cx, cy, radius, screenAngle - 0.32, screenAngle + 0.32);
      g.stroke();
    }
    g.restore();
  }

  /** Teammate tags, spotted enemies and objective markers in 3D space. */
  drawWorldMarkers(g, ctx) {
    const { camera, mates = [], blips = [], objectives = [] } = ctx;
    if (!camera) return;
    const project = (x, y, z) => {
      this._tmpVec.set(x, y, z).project(camera);
      if (this._tmpVec.z > 1) return null;
      return {
        x: (this._tmpVec.x * 0.5 + 0.5) * this.width,
        y: (-this._tmpVec.y * 0.5 + 0.5) * this.height,
        z: this._tmpVec.z,
      };
    };
    const cy = this.height / 2;
    g.save();
    for (const mate of mates) {
      const p = project(mate.x, mate.y + 1.95, mate.z);
      if (!p || p.z > 0.999) continue;
      const dist = Math.hypot(mate.x - ctx.player.position.x, mate.z - ctx.player.position.z);
      const alpha = clamp(1 - dist / 90, 0.15, 0.9);
      g.globalAlpha = alpha;
      g.fillStyle = 'rgba(140,220,110,0.9)';
      g.beginPath();
      g.moveTo(p.x, p.y - 6);
      g.lineTo(p.x + 4.5, p.y + 1);
      g.lineTo(p.x - 4.5, p.y + 1);
      g.closePath();
      g.fill();
      if (dist < 60) {
        g.fillStyle = 'rgba(190,240,170,0.85)';
        g.font = '9px ui-monospace, monospace';
        g.textAlign = 'center';
        g.fillText(`${mate.name} ${Math.round(dist)}m`, p.x, p.y + 12);
      }
      g.globalAlpha = 1;
    }
    for (const blip of blips) {
      const p = project(blip.x, blip.y ?? (ctx.player.position.y + 1.2), blip.z);
      if (!p || p.z > 0.999) continue;
      g.fillStyle = 'rgba(240,70,52,0.85)';
      g.beginPath();
      g.moveTo(p.x, p.y - 7);
      g.lineTo(p.x + 5, p.y + 2);
      g.lineTo(p.x - 5, p.y + 2);
      g.closePath();
      g.fill();
    }
    for (const obj of objectives) {
      const p = project(obj.x, (obj.y ?? 0) + 12, obj.z);
      if (!p || p.z > 0.999) continue;
      g.globalAlpha = 0.85;
      g.fillStyle = 'rgba(255,180,87,0.95)';
      g.beginPath();
      g.moveTo(p.x, p.y - 9);
      g.lineTo(p.x + 8, p.y);
      g.lineTo(p.x, p.y + 9);
      g.lineTo(p.x - 8, p.y);
      g.closePath();
      g.fill();
      g.fillStyle = 'rgba(0,0,0,0.7)';
      g.font = 'bold 9px ui-monospace, monospace';
      g.textAlign = 'center';
      g.fillText(obj.name?.[0] ?? 'A', p.x, p.y + 3);
      g.globalAlpha = 1;
    }
    void cy;
    g.restore();
  }

  /* ------------------------------------------------------------------ */
  /* Touch controls                                                      */
  /* ------------------------------------------------------------------ */

  setupTouch(input) {
    const stick = (elId, knobId, onMove, onEnd) => {
      const el = this.el(elId) || document.getElementById(elId);
      const knob = this.el(knobId) || document.getElementById(knobId);
      if (!el || !knob) return;
      let active = false;
      let id = null;
      const rect = () => el.getBoundingClientRect();
      const handle = (ev) => {
        const r = rect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        let dx = ev.clientX - cx;
        let dy = ev.clientY - cy;
        const max = r.width * 0.36;
        const len = Math.hypot(dx, dy);
        if (len > max) {
          dx = (dx / len) * max;
          dy = (dy / len) * max;
        }
        knob.style.transform = `translate(${dx}px, ${dy}px)`;
        onMove(dx / max, dy / max);
      };
      el.addEventListener('pointerdown', (ev) => {
        active = true;
        id = ev.pointerId;
        el.setPointerCapture(id);
        handle(ev);
        ev.preventDefault();
      });
      el.addEventListener('pointermove', (ev) => {
        if (!active || ev.pointerId !== id) return;
        handle(ev);
        ev.preventDefault();
      });
      const end = (ev) => {
        if (ev.pointerId !== id) return;
        active = false;
        id = null;
        knob.style.transform = 'translate(0,0)';
        onEnd();
      };
      el.addEventListener('pointerup', end);
      el.addEventListener('pointercancel', end);
    };

    stick('stick-left', 'knob-left', (x, y) => {
      input.touch.active = true;
      input.touch.moveX = x;
      input.touch.moveY = y;
      input.touch.sprint = Math.abs(y) > 0.75 && y < 0;
    }, () => {
      input.touch.moveX = 0;
      input.touch.moveY = 0;
      input.touch.sprint = false;
    });

    stick('stick-right', 'knob-right', (x, y) => {
      input.touch.active = true;
      input.touch.lookDX += x * 26;
      input.touch.lookDY += y * 26;
    }, () => {});

    const button = (id, onDown, onUp) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('pointerdown', (ev) => {
        input.touch.active = true;
        el.classList.add('on');
        onDown();
        ev.preventDefault();
      });
      const up = () => {
        el.classList.remove('on');
        onUp?.();
      };
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
      el.addEventListener('pointerleave', up);
    };
    button('tb-fire', () => { input.touch.fire = true; }, () => { input.touch.fire = false; });
    button('tb-ads', () => { input.touch.ads = true; }, () => { input.touch.ads = false; });
    button('tb-jump', () => { input.touch.jump = true; }, () => { input.touch.jump = false; });
    button('tb-crouch', () => { input.touch.crouch = !input.touch.crouch; });
    button('tb-reload', () => { input.touch.reload = true; setTimeout(() => { input.touch.reload = false; }, 120); });
    button('tb-swap', () => {
      input.touch.active = true;
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE' }));
      setTimeout(() => window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyE' })), 60);
    });
  }
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

export { RADAR_RANGE, smoothstep as _smoothstep };
