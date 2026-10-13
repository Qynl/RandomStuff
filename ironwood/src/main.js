/**
 * IRONWOOD - application entry point.
 *
 * Boots the renderer, bakes the art, generates the map, wires menus, the match,
 * the network sessions and runs the loop (fixed 60 Hz simulation, rendered with
 * interpolation and the full post processing chain).
 */

import * as THREE from 'three';
import { Input } from './core/input.js';
import { Audio } from './core/audio.js';
import { createHost, createClient, MSG, multiplayerSupport } from './core/net.js';
import { TextureLibrary } from './render/textures.js';
import { PostFX } from './render/postfx.js';
import { Sky } from './render/sky.js';
import { World } from './world/map.js';
import { FX } from './game/fx.js';
import { Viewmodel, WeaponSystem, WEAPONS } from './game/weapon.js';
import { Match } from './game/match.js';
import { HUD } from './game/hud.js';
import { clamp, lerp, damp } from './core/math.js';

const DEFAULT_SETTINGS = {
  name: 'Operator',
  sensitivity: 0.0022,
  fov: 78,
  invertY: false,
  quality: 'high',
  masterVolume: 0.8,
  sfxVolume: 1.0,
  ambienceVolume: 0.55,
  difficulty: 'regular',
  bots: 6,
  primary: 'm4a1',
  secondary: 'm9',
};

const FIXED_DT = 1 / 60;
const QUALITY_LEVELS = ['low', 'medium', 'high', 'ultra'];
const DIFFICULTY_IDS = ['recruit', 'regular', 'hardened', 'veteran'];

class Game {
  constructor() {
    this.settings = this.loadSettings();
    // URL overrides: ?quality= &bots= &difficulty= &autostart=1 &diag=1 &photo=1
    this.applyUrlParams();
    this.canvas = document.getElementById('game-canvas');
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.textures = null;
    this.sky = null;
    this.postfx = null;
    this.world = null;
    this.fx = null;
    this.audio = new Audio({ volume: this.settings.masterVolume });
    this.input = null;
    this.hud = null;
    this.match = null;
    this.weapon = null;
    this.viewmodel = null;
    this.net = null;
    this.netRole = null;          // 'host' | 'guest' | null
    this.hostHandles = null;
    this.accumulator = 0;
    this.lastTime = performance.now();
    this.running = false;
    this.inMatch = false;
    this.paused = false;
    this.fps = 60;
    this.frameTimes = [];
    this.scopeAmount = 0;
    this.flashAmount = 0;
    this.damageAmount = 0;
    this.suppressAmount = 0;
    this.sunScreen = { x: 0.5, y: 0.9 };
    this.tmp = new THREE.Vector3();
    this.tmpEuler = new THREE.Euler(0, 0, 0, 'YXZ');
    this.spreadRadians = 0.004;
    this.camDir = new THREE.Vector3();
    this.loadout = { primary: this.settings.primary, secondary: this.settings.secondary };
    this.scoreboardVisible = false;
    this.pointerLockRequested = false;
    this.wantRematch = null;
  }

  /* ------------------------------------------------------------------ */
  /* Settings                                                            */
  /* ------------------------------------------------------------------ */

  loadSettings() {
    try {
      const raw = localStorage.getItem('ironwood.settings');
      if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    } catch (err) {
      void err;
    }
    return { ...DEFAULT_SETTINGS };
  }

  /**
   * Query-string overrides so a link can configure the whole match:
   * index.html?quality=high&bots=8&difficulty=veteran&autostart=1&diag=1
   */
  applyUrlParams() {
    let params;
    try {
      params = new URLSearchParams(location.search);
    } catch (err) {
      void err;
      return;
    }
    const quality = params.get('quality');
    if (quality && QUALITY_LEVELS.includes(quality)) this.settings.quality = quality;
    const bots = Number(params.get('bots'));
    if (Number.isFinite(bots) && bots >= 0 && bots <= 12) this.settings.bots = Math.round(bots);
    const difficulty = params.get('difficulty');
    if (difficulty && DIFFICULTY_IDS.includes(difficulty)) this.settings.difficulty = difficulty;
    const fov = Number(params.get('fov'));
    if (Number.isFinite(fov) && fov >= 60 && fov <= 110) this.settings.fov = fov;
    const sens = Number(params.get('sens'));
    if (Number.isFinite(sens) && sens > 0) this.settings.sensitivity = sens;
    const volume = Number(params.get('volume'));
    if (Number.isFinite(volume)) this.settings.masterVolume = clamp(volume, 0, 1);
    const name = params.get('name');
    if (name) this.settings.name = name.slice(0, 15);
    if (params.get('adapt') === '0') this.settings.adapt = false;
    this.autoStart = params.get('autostart') === '1' || params.get('play') === '1';
    this.photoMode = params.get('photo') === '1';
    this.diagMode = params.get('diag') === '1' || this.photoMode;
  }

  /**
   * Console + on-screen diagnostics. Everything here exists so a problem in a
   * real browser is visible and reportable instead of a black screen:
   *   window.ironwood.diag()      -> a JSON-able snapshot of the render state
   *   window.ironwood.teleport()  -> place the player for screenshots
   *   window.ironwood.setSimulate(false) -> freeze the match, keep rendering
   */
  setupDiagnostics() {
    this.errors = [];
    const record = (kind, message, stack) => {
      const entry = { kind, message: String(message).slice(0, 500), stack: String(stack || '').slice(0, 1200), at: Date.now() };
      this.errors.push(entry);
      if (this.errors.length > 40) this.errors.shift();
      const box = document.getElementById('iw-error-box');
      if (box) {
        box.style.display = 'block';
        box.textContent = `⚠ ${kind}: ${entry.message}`;
      }
    };
    window.addEventListener('error', (ev) => record('error', ev.message ?? ev.error, ev.error?.stack));
    window.addEventListener('unhandledrejection', (ev) => record('promise', ev.reason?.message ?? ev.reason, ev.reason?.stack));

    // a lost GL context (driver reset, software renderer dying, tab throttling)
    // used to look like a frozen black screen - now it is loud and recoverable
    const canvas = document.getElementById('game-canvas');
    if (canvas) {
      canvas.addEventListener('webglcontextlost', (ev) => {
        ev.preventDefault();
        this.contextLost = true;
        record('webgl', 'graphics context lost - the renderer needs to reload');
        const warn = document.getElementById('loading-warning');
        if (warn) {
          warn.innerHTML = '<b>Graphics context lost.</b><br>Your GPU driver reset (or the browser dropped the context). Reload the page to continue.';
          warn.classList.add('show');
        }
      }, false);
      canvas.addEventListener('webglcontextrestored', () => {
        this.contextLost = false;
        this.hud?.notify('Graphics context restored');
      }, false);
    }

    if (typeof document === 'undefined') return;
    const style = document.createElement('style');
    style.textContent = `
      #iw-error-box{position:fixed;left:10px;right:10px;bottom:10px;z-index:9000;display:none;
        font:12px/1.4 ui-monospace,Menlo,Consolas,monospace;color:#ffd9d9;background:rgba(70,12,12,.92);
        border:1px solid rgba(255,120,120,.5);border-radius:8px;padding:8px 10px;white-space:pre-wrap;pointer-events:none}
      #iw-diag{position:fixed;left:10px;top:10px;z-index:9001;font:11px/1.5 ui-monospace,Menlo,Consolas,monospace;
        color:#cfe8ff;background:rgba(8,14,20,.72);border:1px solid rgba(140,200,255,.25);border-radius:8px;
        padding:7px 9px;white-space:pre;pointer-events:none;letter-spacing:.2px}`;
    document.head.appendChild(style);
    const err = document.createElement('div');
    err.id = 'iw-error-box';
    document.body.appendChild(err);
    if (this.diagMode) {
      const diag = document.createElement('div');
      diag.id = 'iw-diag';
      diag.textContent = 'diagnostics…';
      document.body.appendChild(diag);
      this.diagEl = diag;
    }
    if (this.photoMode) {
      this.simulateEnabled = false;
      setTimeout(() => this.hud?.setHudVisible(false), 2000);
    }
  }

  /** Snapshot of everything worth knowing when something looks wrong. */
  diag() {
    const info = this.renderer?.info;
    const player = this.match?.local;
    const gl = this.renderer?.getContext?.();
    let gpu = 'n/a';
    try {
      const dbg = gl?.getExtension('WEBGL_debug_renderer_info');
      gpu = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl?.getParameter(gl.RENDERER);
    } catch (err) {
      void err;
    }
    return {
      ready: !!window.__IRONWOOD_READY__,
      quality: this.settings.quality,
      fps: Math.round(this.fps * 10) / 10,
      inMatch: this.inMatch,
      paused: this.paused,
      simulate: this.simulateEnabled !== false,
      contextLost: !!this.contextLost,
      gpu: String(gpu).slice(0, 120),
      softwareRenderer: !!this.rendererClass?.software,
      webgl2: !!gl,
      draws: info?.render.calls ?? 0,
      triangles: info?.render.triangles ?? 0,
      programs: info?.programs?.length ?? 0,
      textures: info?.memory?.textures ?? 0,
      geometries: info?.memory?.geometries ?? 0,
      player: player ? { x: +player.position.x.toFixed(2), y: +player.position.y.toFixed(2), z: +player.position.z.toFixed(2), yaw: +player.yaw.toFixed(2), pitch: +player.pitch.toFixed(2), hp: player.health, alive: player.alive, stance: player.stance } : null,
      bots: this.match ? [...this.match.bots.values()].map((b) => `${b.team}:${b.state}:${b.alive ? 'up' : 'down'}`).join(',') : '',
      scores: this.match ? { ...this.match.scores } : null,
      colliders: this.world?.colliders?.length ?? 0,
      walkways: this.world?.walkways?.length ?? 0,
      errors: this.errors.slice(-8),
    };
  }

  /** Place the player (and camera) - used by the screenshot harness. */
  teleport(x, z, yaw = 0, pitch = 0, height = 1.0) {
    const player = this.match?.local;
    if (!player) return null;
    const y = (this.world?.supportHeight(x, z, 400) ?? 0) + 0.02;
    player.position.set(x, y + height * 0, z);
    player.velocity.set(0, 0, 0);
    player.yaw = yaw;
    player.pitch = pitch;
    return { x, y, z };
  }

  setSimulate(on) {
    this.simulateEnabled = !!on;
  }

  /** Aim the local soldier (radians) - handy for scripted screenshots. */
  setLook(yaw, pitch = 0) {
    const player = this.match?.local;
    if (!player) return false;
    if (Number.isFinite(yaw)) player.yaw = yaw;
    if (Number.isFinite(pitch)) player.pitch = clamp(pitch, -1.5, 1.5);
    return true;
  }

  /** Point the soldier's yaw at a world position. */
  lookAt(x, z, pitch = 0) {
    const player = this.match?.local;
    if (!player) return false;
    const dx = x - player.position.x;
    const dz = z - player.position.z;
    // the game's forward is -Z rotated by yaw
    return this.setLook(Math.atan2(-dx, -dz), pitch);
  }

  updateDiagBadge() {
    if (!this.diagEl) return;
    const d = this.diag();
    this.diagEl.textContent = [
      `${d.fps.toFixed(0)} fps · ${d.quality} · ${d.inMatch ? 'match' : 'menu'}`,
      `${d.draws} draws · ${(d.triangles / 1000).toFixed(0)}k tris · ${d.programs} prog`,
      `errors: ${this.errors.length}${d.errors.length ? ' ⚠ ' + d.errors[d.errors.length - 1].message.slice(0, 60) : ''}`,
    ].join('\n');
  }

  saveSettings() {
    try {
      localStorage.setItem('ironwood.settings', JSON.stringify(this.settings));
    } catch (err) {
      void err;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Boot                                                                */
  /* ------------------------------------------------------------------ */

  async init() {
    this.setupDiagnostics();
    const hudHooks = {
      onAction: (action) => this.handleMenuAction(action),
      onSettingChange: (key, value) => this.applySetting(key, value),
      onNameChange: (value) => {
        this.settings.name = value.slice(0, 15) || 'Operator';
        this.saveSettings();
      },
      onLoadoutChange: (value) => {
        this.loadout.primary = value.primary || this.loadout.primary;
        this.loadout.secondary = value.secondary || this.loadout.secondary;
        this.settings.primary = this.loadout.primary;
        this.settings.secondary = this.loadout.secondary;
        this.saveSettings();
        this.weapon?.setLoadout(this.loadout.primary, this.loadout.secondary);
      },
      onChat: (text) => this.sendChat(text),
      localTeam: () => this.match?.local?.team,
    };
    this.hud = new HUD({ world: null, audio: this.audio, settings: this.settings, hooks: hudHooks });
    this.hud.setSettingValues(this.settings);

    const support = multiplayerSupport();
    if (!support.tab) {
      this.hud.notify('BroadcastChannel unavailable: tab multiplayer disabled', { type: 'warn' });
    }

    // --- graphics check (mirrors the reference game's "graphics unavailable")
    if (!this.checkGraphics()) return;

    try {
      this.renderer = new THREE.WebGLRenderer({
        canvas: this.canvas,
        antialias: false,
        powerPreference: 'high-performance',
        stencil: false,
      });
    } catch (err) {
      this.hud.showLoadingWarning(`Could not start WebGL: ${err.message}`);
      return;
    }
    // software rasterisers (SwiftShader/llvmpipe: no GPU at all, remote desktops)
    // cannot chew through 4x MSAA plus 2048 shadow maps - adapt before baking
    if (this.settings.adapt !== false) {
      const info = this.detectRendererClass();
      if (info.software) {
        const was = this.settings.quality;
        this.settings.quality = 'low';
        this.hud.notify(`Software renderer detected (${info.name.slice(0, 40)}) - quality set to LOW`, { type: 'warn', duration: 6000 });
        if (was !== 'low') console.info('[ironwood] software renderer, dropping quality from', was, 'to low');
      }
    }
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.NoToneMapping;   // we tonemap in post
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.autoClear = false;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(this.settings.fov, window.innerWidth / window.innerHeight, 0.05, 1400);

    // --- bake the art --------------------------------------------------
    this.hud.setLoadingProgress(0.02, 'Baking textures…');
    this.textures = new TextureLibrary(this.renderer, { quality: this.settings.quality });
    await this.textures.build((fraction, label) => {
      this.hud.setLoadingProgress(0.02 + fraction * 0.5, label);
    });

    // --- world ---------------------------------------------------------
    this.hud.setLoadingProgress(0.54, 'Growing the jungle…');
    this.world = new World(this.scene, this.textures, { seed: 1337, quality: this.settings.quality });
    await this.world.build((fraction, label) => {
      this.hud.setLoadingProgress(0.54 + fraction * 0.33, label);
    });
    this.hud.world = this.world;

    // --- lighting + post ----------------------------------------------
    this.hud.setLoadingProgress(0.9, 'Lighting the valley…');
    this.sky = new Sky(this.scene, {
      shadowMapSize: this.settings.quality === 'ultra' ? 4096 : 2048,
      shadowRadius: this.settings.quality === 'low' ? 34 : 42,
    });
    this.postfx = new PostFX(this.renderer, { quality: this.settings.quality });
    this.postfx.setQuality(this.settings.quality);
    this.postfx.setSize(window.innerWidth, window.innerHeight);

    // --- effects + audio ----------------------------------------------
    this.fx = new FX(this.scene, this.world, this.textures, this.audio, { quality: this.settings.quality });
    this.fx.registerSmokeEmitters(this.world.smokeEmitters);
    this.fx.setCamera(this.camera);

    this.input = new Input({
      lockElement: this.canvas,
      sensitivity: this.settings.sensitivity,
      invertY: this.settings.invertY,
      onLockChange: (locked) => {
        if (!locked && this.inMatch && !this.paused) this.pause();
      },
    });
    this.hud.attachInput(this.input);

    this.audio.setMasterVolume(this.settings.masterVolume);
    this.audio.setSfxVolume(this.settings.sfxVolume);
    this.audio.setAmbienceVolume(this.settings.ambienceVolume);

    window.addEventListener('resize', () => this.onResize());
    window.addEventListener('keydown', (ev) => this.onKeyDown(ev));
    this.canvas.addEventListener('click', () => this.onCanvasClick());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.inMatch && !this.paused) this.pause();
    });

    // prime the menu
    this.hud.showMenu('main');
    this.hud.setLoadingProgress(1, 'Ready');
    this.hud.hideLoading();

    this.running = true;
    requestAnimationFrame((t) => this.loop(t));

    // a machine readable "we made it" signal for tests and the diag badge
    window.__IRONWOOD__ = this;
    window.__IRONWOOD_READY__ = true;
    console.info('[ironwood] ready', this.diag().gpu);
    if (this.autoStart) {
      this.hud.showMenu('sp');
      setTimeout(() => this.startSinglePlayer(), 250);
    }
  }

  /** Which GPU (or software rasteriser) are we on? */
  detectRendererClass() {
    let name = 'unknown';
    try {
      const gl = this.renderer?.getContext?.() ?? document.createElement('canvas').getContext('webgl2');
      const dbg = gl?.getExtension?.('WEBGL_debug_renderer_info');
      name = String(dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl?.getParameter?.(gl.RENDERER) ?? 'unknown');
    } catch (err) {
      void err;
    }
    const software = /swiftshader|llvmpipe|software|basic render|mesa offscreen/i.test(name);
    this.rendererClass = { name, software };
    return this.rendererClass;
  }

  checkGraphics() {
    const probe = document.createElement('canvas');
    const gl2 = probe.getContext('webgl2');
    if (!gl2) {
      const gl1 = probe.getContext('webgl');
      this.hud.showLoadingWarning(
        gl1
          ? '<b>WebGL2 unavailable.</b><br>This build needs WebGL2 for its lighting and post processing. Please use a current Chrome, Edge, Firefox or Safari.'
          : '<b>Graphics unavailable.</b><br>This browser could not start the game&rsquo;s graphics. Please use a browser with WebGL2 support.'
      );
      this.hud.setLoadingProgress(0, 'Graphics unavailable');
      return false;
    }
    return true;
  }

  /* ------------------------------------------------------------------ */
  /* Settings plumbing                                                   */
  /* ------------------------------------------------------------------ */

  applySetting(key, value) {
    switch (key) {
      case 'sens':
        this.settings.sensitivity = Number(value);
        if (this.input) this.input.sensitivity = Number(value);
        break;
      case 'fov':
        this.settings.fov = Number(value);
        break;
      case 'invert':
        this.settings.invertY = !!value;
        if (this.input) this.input.invertY = !!value;
        break;
      case 'quality':
        this.settings.quality = value;
        this.applyQuality(value);
        break;
      case 'mastervol':
        this.settings.masterVolume = Number(value);
        this.audio.setMasterVolume(this.settings.masterVolume);
        break;
      case 'sfxvol':
        this.settings.sfxVolume = Number(value);
        this.audio.setSfxVolume(this.settings.sfxVolume);
        break;
      case 'ambvol':
        this.settings.ambienceVolume = Number(value);
        this.audio.setAmbienceVolume(this.settings.ambienceVolume);
        break;
      case 'difficulty':
        this.settings.difficulty = value;
        break;
      case 'bots':
        this.settings.bots = Number(value);
        break;
      default:
        break;
    }
    this.saveSettings();
  }

  applyQuality(level) {
    this.textures.quality = level;
    this.postfx.setQuality(level);
    this.sky.setQuality(level);
    this.postfx.setSize(window.innerWidth, window.innerHeight);
    this.hud.notify(`Quality: ${level.toUpperCase()} (textures apply next load)`, { duration: 3000 });
  }

  /* ------------------------------------------------------------------ */
  /* Menus                                                               */
  /* ------------------------------------------------------------------ */

  handleMenuAction(action) {
    switch (action) {
      case 'goto-sp': this.hud.showMenu('sp'); break;
      case 'goto-mp': this.hud.showMenu('mp'); this.hud.setMpTab('host'); break;
      case 'goto-settings': this.hud.showMenu('settings'); break;
      case 'goto-loadout': this.hud.showMenu('loadout'); break;
      case 'back': this.hud.showMenu(this.inMatch ? 'pause' : 'main'); break;
      case 'reset-settings':
        this.settings = { ...DEFAULT_SETTINGS };
        this.saveSettings();
        this.hud.setSettingValues(this.settings);
        this.applyQuality(this.settings.quality);
        this.hud.notify('Settings reset');
        break;
      case 'start-sp': this.startSinglePlayer(); break;
      case 'host-create': this.hostParty(); break;
      case 'copy-room': copyText(this.hud.multiplayer.roomCode ?? ''); break;
      case 'host-invite-gen': this.generateInvite(); break;
      case 'copy-invite': copyText(this.hud.el('host-invite')?.value ?? ''); break;
      case 'host-accept': this.acceptGuestAnswer(); break;
      case 'host-start': this.startNetworkMatch(); break;
      case 'join-tab': this.joinTabParty(); break;
      case 'join-rtc': this.generateJoinAnswer(); break;
      case 'copy-answer': copyText(this.hud.el('join-answer')?.value ?? ''); break;
      case 'resume': this.resume(); break;
      case 'pause-settings': this.hud.showMenu('settings'); break;
      case 'pause-loadout': this.hud.showMenu('loadout'); break;
      case 'leave': this.leaveMatch(); break;
      case 'rematch': this.rematch(); break;
      default: break;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Match lifecycle                                                     */
  /* ------------------------------------------------------------------ */

  startSinglePlayer() {
    this.settings.difficulty = this.hud.el('opt-difficulty')?.value ?? this.settings.difficulty;
    this.settings.bots = Number(this.hud.el('opt-bots')?.value ?? this.settings.bots);
    this.saveSettings();
    this.beginMatch({ difficulty: this.settings.difficulty, bots: this.settings.bots, net: null });
  }

  beginMatch({ difficulty = 'regular', bots = 6, net = null, role = null, team = null, mode = 'tdm' }) {
    this.teardownMatch();
    this.audio.ensure();
    this.audio.resume();

    this.match = new Match({
      world: this.world,
      textures: this.textures,
      audio: this.audio,
      fx: this.fx,
      net,
      settings: this.settings,
      hooks: {
        onKillfeed: (entry) => this.hud.addKillfeed(entry),
        onHitMarker: (headshot, kill) => this.hud.showHitMarker(headshot, kill),
        onKill: ({ victim, weapon, headshot }) => {
          this.hud.showHitMarker(headshot, true);
          this.audio.kill();
          if (victim.isBot) this.audio.callout('hostile_down', { radio: Math.random() < 0.5 });
        },
        onDeath: ({ attacker, weapon }) => {
          this.hud.showRespawn(4.5, attacker?.name);
          this.deadTime = 0;
        },
        onRespawn: () => {
          this.hud.hideRespawn();
          this.weapon.reset();
          this.hud.showBanner('Respawned — ' + this.objectiveName(), 2200);
        },
        onLocalDamage: (amount, info) => {
          if (info.direction) this.hud.addDamageArc(info.direction, this.match.local.yaw);
        },
        onStreak: () => {
          this.hud.showBanner('RECON UAV AVAILABLE — enemies revealed on radar', 3600);
          this.audio.streak();
        },
        onMatchEnd: (summary) => {
          this.paused = true;
          this.input.exitPointerLock();
          this.hud.showEndScreen(summary, this.match.scoreboard());
        },
        onEvent: (ev) => this.handleMatchEvent(ev),
        onChat: (name, text) => this.hud.addChat(name, text),
        onRemoteStart: (msg) => this.beginMatch({ difficulty: msg.difficulty ?? 'regular', bots: msg.bots ?? 6, net: this.net, role: 'guest', team: msg.team ?? 'opfor', mode: msg.mode ?? 'tdm' }),
        onUav: (t) => this.hud.notify(`${t === this.match?.local?.team ? 'Your' : 'Enemy'} UAV is up`, { type: t === this.match?.local?.team ? 'good' : 'warn' }),
      },
    });

    this.net = net;
    this.netRole = role;
    if (net) {
      net.off?.('message');
      net.on('message', (msg, fromId) => this.match.handleMessage(msg, fromId));
      net.on('peerJoin', (peer) => {
        this.hud.setPartyInfo({ players: [...net.peers.values()].map((p) => ({ name: p.name, id: p.id })) });
        this.hud.notify(`${peer.name} joined the party`);
      });
      net.on('peerLeave', (id) => {
        const peer = net.peers.get(id);
        this.match.removeEntity(id);
        this.hud.setPartyInfo({ players: [...net.peers.values()].map((p) => ({ name: p.name, id: p.id })) });
        if (peer) this.hud.notify(`${peer.name} left`);
      });
      net.on('error', (err) => this.hud.showLoadingWarning(String(err.message ?? err)));
    }

    // local soldier
    const localTeam = team ?? (role === 'guest' ? 'opfor' : 'us');
    const player = this.match.addLocalPlayer({
      name: this.settings.name,
      team: localTeam,
      weapon: this.loadout.primary,
      id: net ? net.id : 'local',
    });
    player.rig && (player.rig.group.visible = true);

    // viewmodel + weapons
    this.viewmodel = new Viewmodel(this.textures, { quality: this.settings.quality });
    this.viewmodel.equip(this.loadout.primary, true);
    this.weapon = new WeaponSystem({
      world: this.world,
      textures: this.textures,
      audio: this.audio,
      fx: this.fx,
      viewmodel: this.viewmodel,
      team: localTeam,
    });
    this.weapon.setLoadout(this.loadout.primary, this.loadout.secondary);
    this.weapon.reset();
    // grenade blasts have to be agreed on by both machines
    this.weapon.on('event', (ev) => {
      if (ev.type !== 'explosion') return;
      const kind = ev.kind;
      const def = kind === 'flash' ? WEAPONS.flash : WEAPONS.frag;
      this.match?.reportExplosion({
        kind,
        position: ev.position,
        radius: def.radius,
        damage: def.damage,
        owner: null,
      });
    });

    this.match.start({ difficulty, bots, mode });
    this.hud.setHudVisible(true);
    this.hud.hideMenu();
    this.hud.showBanner(`DEPLOYING · ${this.objectiveName()}`, 2600);
    this.hud.setPartyInfo({ players: net ? [...net.peers.values()].map((p) => ({ name: p.name, id: p.id })) : [{ name: this.settings.name, isHost: true }] });
    this.inMatch = true;
    this.paused = false;
    this.sessionTeam = localTeam;
    this.audio.startAmbience();
    this.requestPointerLockSoon();
    if (role === 'host' && net) {
      net.broadcast({ t: MSG.START, difficulty, bots, team: 'opfor', mode });
    }
  }

  teardownMatch() {
    if (this.match) {
      this.match.reset();
      this.match = null;
    }
    this.weapon = null;
    this.viewmodel = null;
    this.hud.setHudVisible(false);
    this.hud.hideRespawn();
  }

  objectiveName() {
    const obj = this.world?.objectives?.[0];
    return obj ? obj.name : 'VINH LONG';
  }

  handleMatchEvent(ev) {
    if (!ev) return;
    if (ev.type === 'match_end') {
      this.paused = true;
      this.input.exitPointerLock();
      this.hud.showEndScreen(this.match?.matchSummary, this.match?.scoreboard() ?? []);
    }
    if (ev.type === 'match_start') {
      this.hud.notify('Match live — 75 kills or 10 minutes', { type: 'good' });
    }
    if (ev.type === 'uav' && ev.team === this.match?.local?.team) {
      this.hud.showBanner('ENEMY RECON — you are being tracked', 3200);
    }
  }

  pause() {
    if (!this.inMatch || this.paused) return;
    this.paused = true;
    this.input.exitPointerLock();
    this.hud.showMenu('pause');
  }

  resume() {
    this.paused = false;
    this.hud.hideMenu();
    this.requestPointerLockSoon();
  }

  leaveMatch() {
    this.audio.stopAmbience();
    if (this.net && this.netRole === 'guest') {
      this.net.send({ t: MSG.BYE });
    }
    if (this.net) {
      this.net.close();
      this.net = null;
      this.netRole = null;
      this.hostHandles = null;
    }
    this.teardownMatch();
    this.inMatch = false;
    this.paused = false;
    this.input.exitPointerLock();
    this.hud.showMenu('main');
  }

  rematch() {
    const opts = this.lastMatchOptions ?? { difficulty: this.settings.difficulty, bots: this.settings.bots };
    if (this.netRole === 'guest') {
      this.hud.notify('Waiting for the host to start again…');
      this.hud.showMenu('pause');
      return;
    }
    if (this.netRole === 'host' && this.hostHandles) {
      this.beginMatch({ ...opts, net: this.hostHandles.net, role: 'host', team: 'us' });
      this.hostHandles.net.broadcast({ t: MSG.START, difficulty: opts.difficulty, bots: opts.bots, team: 'opfor', mode: 'tdm' });
      return;
    }
    this.beginMatch(opts);
  }

  requestPointerLockSoon() {
    setTimeout(() => {
      if (this.inMatch && !this.paused) this.input.requestPointerLock(this.canvas);
    }, 60);
  }

  /* ------------------------------------------------------------------ */
  /* Multiplayer plumbing                                                */
  /* ------------------------------------------------------------------ */

  async hostParty() {
    const transport = this.hud.getTransport();
    this.hud.setHostStatus('Creating party…');
    try {
      const handles = await createHost({ transport, name: this.settings.name });
      this.hostHandles = handles;
      this.net = handles.net;
      this.netRole = 'host';
      handles.net.on('message', (msg, fromId) => this.match?.handleMessage(msg, fromId));
      handles.net.on('peerJoin', (peer) => {
        this.hud.setPartyInfo({ players: [...handles.net.peers.values()].map((p) => ({ name: p.name, id: p.id })) });
        this.hud.setHostStatus(`${peer.name} connected.`);
        this.audio.notify();
      });
      handles.net.on('peerLeave', (id) => {
        this.hud.setPartyInfo({ players: [...handles.net.peers.values()].map((p) => ({ name: p.name, id: p.id })) });
        this.hud.setHostStatus('A guest disconnected.');
      });
      this.hud.setPartyInfo({ roomCode: handles.roomCode, players: [{ name: this.settings.name, isHost: true }] });
      this.hud.setHostStatus(
        transport === 'rtc'
          ? 'Party ready. Generate an invite code and send it to a friend.'
          : `Party ready. Room code: ${handles.roomCode} — open the game in another tab and join.`
      );
      this.audio.ensure();
      this.audio.notify();
    } catch (err) {
      this.hud.setHostStatus(`Could not host: ${err.message}`);
    }
  }

  async generateInvite() {
    if (!this.hostHandles?.createInvite) {
      this.hud.setHostStatus('Create a peer-to-peer party first (set link type to WebRTC).');
      return;
    }
    this.hud.setHostStatus('Building invite code…');
    try {
      const code = await this.hostHandles.createInvite();
      this.hud.setInviteCode(formatCode(code));
      this.hud.setHostStatus('Invite ready — send it, then paste their answer below.');
    } catch (err) {
      this.hud.setHostStatus(`Invite failed: ${err.message}`);
    }
  }

  async acceptGuestAnswer() {
    if (!this.hostHandles?.acceptAnswer) {
      this.hud.setHostStatus('No peer-to-peer party to accept into.');
      return;
    }
    const answer = this.hud.getHostAnswer();
    if (!answer) {
      this.hud.setHostStatus('Paste the answer code first.');
      return;
    }
    this.hud.setHostStatus('Connecting…');
    try {
      const peerId = await this.hostHandles.acceptAnswer(answer.replace(/\s+/g, ''));
      this.hud.setHostStatus(`Guest connected (${peerId || 'ok'}). Press Start match when ready.`);
      this.audio.notify();
    } catch (err) {
      this.hud.setHostStatus(`Could not connect: ${err.message}`);
    }
  }

  startNetworkMatch() {
    if (!this.hostHandles) {
      this.hud.setHostStatus('Host a party first.');
      return;
    }
    const difficulty = this.hud.el('opt-difficulty')?.value ?? this.settings.difficulty;
    const bots = Number(this.hud.el('opt-bots')?.value ?? this.settings.bots);
    this.lastMatchOptions = { difficulty, bots };
    this.hostHandles.net.broadcast({ t: MSG.START, difficulty, bots, team: 'opfor', mode: 'tdm' });
    this.beginMatch({ difficulty, bots, net: this.hostHandles.net, role: 'host', team: 'us' });
  }

  async joinTabParty() {
    const code = this.hud.getJoinCode().toUpperCase();
    if (!code) {
      this.hud.setJoinStatus('Enter the room code the host gave you.');
      return;
    }
    this.hud.setJoinStatus('Joining…');
    try {
      const { net } = await createClient({ transport: 'tab', roomCode: code, name: this.settings.name });
      this.net = net;
      this.netRole = 'guest';
      net.on('message', (msg, fromId) => {
        if (msg.t === MSG.START) {
          this.hud.setJoinStatus('Match starting…');
          this.lastMatchOptions = { difficulty: msg.difficulty, bots: msg.bots };
          this.beginMatch({ difficulty: msg.difficulty ?? 'regular', bots: msg.bots ?? 6, net, role: 'guest', team: msg.team ?? 'opfor', mode: msg.mode ?? 'tdm' });
          return;
        }
        this.match?.handleMessage(msg, fromId);
      });
      this.hud.setJoinStatus('Connected. Waiting for the host to start the match…');
      this.audio.ensure();
      this.audio.notify();
    } catch (err) {
      this.hud.setJoinStatus(`Join failed: ${err.message}`);
    }
  }

  async generateJoinAnswer() {
    const invite = this.hud.getJoinInvite();
    if (!invite) {
      this.hud.setJoinStatus('Paste the invite code first.');
      return;
    }
    this.hud.setJoinStatus('Building answer code…');
    try {
      const { net, answerCode } = await createClient({
        transport: 'rtc',
        inviteCode: invite.replace(/\s+/g, ''),
        name: this.settings.name,
      });
      this.net = net;
      this.netRole = 'guest';
      net.on('message', (msg, fromId) => {
        if (msg.t === MSG.START) {
          this.hud.setJoinStatus('Match starting…');
          this.beginMatch({ difficulty: msg.difficulty ?? 'regular', bots: msg.bots ?? 6, net, role: 'guest', team: msg.team ?? 'opfor', mode: msg.mode ?? 'tdm' });
          return;
        }
        this.match?.handleMessage(msg, fromId);
      });
      this.hud.setAnswerCode(formatCode(answerCode));
      this.hud.setJoinStatus('Send this answer code back to the host, then wait for the match.');
      this.audio.ensure();
    } catch (err) {
      this.hud.setJoinStatus(`Could not build answer: ${err.message}`);
    }
  }

  sendChat(text) {
    const line = { t: MSG.CHAT, from: this.settings.name, text };
    if (this.net) this.net.send(line);
    this.hud.addChat(this.settings.name, text, true);
  }

  /* ------------------------------------------------------------------ */
  /* Loop                                                                */
  /* ------------------------------------------------------------------ */

  onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    this.postfx?.setSize(w, h);
  }

  onKeyDown(ev) {
    if (ev.code === 'Escape') {
      if (this.hud.chatOpen) return;
      if (this.inMatch) {
        if (this.paused) this.resume();
        else this.pause();
      }
      return;
    }
    if (!this.inMatch) return;
    if (ev.code === 'Tab') {
      this.scoreboardVisible = true;
      ev.preventDefault();
    }
    if (ev.code === 'KeyY' && !this.hud.chatOpen) {
      ev.preventDefault();
      this.input.exitPointerLock();
      this.hud.openChat();
    }
    if (ev.code === 'KeyM') {
      this.audio.setMuted(!this.audio.muted);
      this.hud.notify(this.audio.muted ? 'Sound muted' : 'Sound on');
    }
  }

  onCanvasClick() {
    this.audio.ensure();
    this.audio.resume();
    if (this.inMatch && !this.paused && !this.input.pointerLocked) {
      this.input.requestPointerLock(this.canvas);
    }
  }

  loop(now) {
    if (!this.running) return;
    requestAnimationFrame((t) => this.loop(t));
    const rawDt = Math.min(0.25, (now - this.lastTime) / 1000);
    this.lastTime = now;
    this.frameTimes.push(rawDt);
    if (this.frameTimes.length > 30) this.frameTimes.shift();
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    this.fps = avg > 0 ? 1 / avg : 60;

    if (this.diagEl) this.updateDiagBadge();
    if (this.renderer) {
      this.renderer.info.autoReset = false;
      this.renderer.info.reset();
    }
    const simRunning = this.inMatch && !this.paused && this.simulateEnabled !== false;
    if (simRunning) {
      this.accumulator += rawDt;
      let steps = 0;
      while (this.accumulator >= FIXED_DT && steps < 5) {
        // one broken subsystem must never freeze the whole game: report it in
        // the diag badge, keep rendering, and drop the frame's remaining work
        try {
          this.simulate(FIXED_DT);
        } catch (err) {
          this.simErrors = (this.simErrors || 0) + 1;
          if (this.simErrors < 6 || this.simErrors % 240 === 0) {
            this.errors?.push({ kind: 'simulate', message: String(err.message ?? err), stack: String(err.stack || '').slice(0, 1200), at: Date.now() });
            console.error('[ironwood] simulate error', err);
            const box = document.getElementById('iw-error-box');
            if (box) {
              box.style.display = 'block';
              box.textContent = `⚠ simulate: ${err.message} (x${this.simErrors})`;
            }
          }
          this.accumulator = 0;
          break;
        }
        this.accumulator -= FIXED_DT;
        steps++;
      }
      if (steps === 5) this.accumulator = 0;
    } else {
      this.accumulator = 0;
      // still tick ambience + effects so the menu world breathes
      this.world.update(rawDt, this.camera);
      this.sky.update(rawDt, this.camera);
      this.fx.update(rawDt);
      if (this.audio.ctx) this.audio.updateAmbience(rawDt, this.camera);
    }
    this.render(rawDt);
    this.input.endFrame();
  }

  /* ------------------------------------------------------------------ */
  /* Simulation step                                                     */
  /* ------------------------------------------------------------------ */

  simulate(dt) {
    const player = this.match?.local;
    if (!player) return;

    // --- look ---------------------------------------------------------
    const look = this.input.lookDelta();
    if (this.input.pointerLocked || this.input.touch.active) {
      const scopeFactor = player.adsAmount ?? 0;
      player.yaw -= look.yaw * (1 - scopeFactor * 0.55);
      player.pitch = clamp(player.pitch - look.pitch * (1 - scopeFactor * 0.55), -1.5, 1.5);
    }

    // suppressed while dead we still let the camera drift a touch
    if (!player.alive) {
      player.update(dt, { moveX: 0, moveZ: 0, jump: false }, {});
      this.hud.updateRespawnTimer(MATCH_RESPAWN_LEFT(this.match, player));
      return;
    }

    const cmd = player.readCommand(this.input);
    player.update(dt, cmd, {
      firing: this.weapon?.cooldown > 0 && !this.weapon?.reloading,
      reloading: this.weapon?.reloading,
    });

    this.weapon.syncMoveState({
      speed: player.speed,
      grounded: player.grounded,
      stance: player.stance,
    });

    // --- weapon + shots ----------------------------------------------
    const ctx = {
      player,
      input: this.input,
      camera: this.camera,
      targets: this.match.entities.size ? [...this.match.entities.values()] : [],
      allTargets: [...this.match.entities.values()],
      lookDelta: look,
      onDamage: (target, damage, info) => this.applyDamage(target, damage, info),
      onFlash: (target, duration, baseDuration) => this.applyFlash(target, duration, baseDuration),
      onGrenade: (ev) => this.spawnBotGrenade(ev),
    };
    this.weapon.update(dt, ctx);

    // --- match --------------------------------------------------------
    this.match.update(dt, {
      targets: [...this.match.entities.values()],
      world: this.world,
      match: this.match,
      onDamage: (target, damage, info) => this.applyDamage(target, damage, info),
      onGrenade: (ev) => this.spawnBotGrenade(ev),
      onShotFx: (bot, from, to, def) => this.match.queueShotFx(from, to, def),
      onCallout: (bot, kind) => {
        const dist = this.match.local ? bot.position.distanceTo(this.match.local.position) : 999;
        if (dist < 45) this.audio.callout(kind, { position: bot.position, distance: dist, radio: Math.random() < 0.4 });
      },
    });

    // --- world / fx / audio -------------------------------------------
    this.world.update(dt, this.camera);
    this.fx.update(dt);
    if (this.audio.ctx) this.audio.updateAmbience(dt, this.camera);

    // net ping housekeeping
    this.net?.update(dt);
  }

  applyDamage(target, damage, info = {}) {
    const match = this.match;
    if (!match || !target) return;
    const isLocalAuthority = !this.net || this.net.isHost;
    if (isLocalAuthority) {
      match.damage(target, damage, info);
      return;
    }
    // guest: apply locally for feedback, and tell the host what happened.
    // grenade damage is covered by the broadcast blast event instead.
    if (target === match.local) return;
    if (info.grenade) return;
    const attacker = info.attacker ?? match.local;
    match.damage(target, damage, { ...info, attacker: attacker?.isLocal ? match.local : attacker });
    match.reportHit({
      targetId: target.id,
      damage,
      weapon: info.weapon,
      headshot: info.headshot,
      point: info.point,
    });
  }

  applyFlash(target, duration, baseDuration) {
    if (target === this.match?.local) {
      const intensity = clamp(duration / Math.max(0.1, baseDuration ?? duration), 0, 1);
      this.flashAmount = Math.max(this.flashAmount, intensity);
      this.audio.flashbang({});
      return;
    }
    if (target?.isBot) target.flashBlind = duration;
  }

  spawnBotGrenade(ev) {
    if (!ev?.position || !ev.direction) return;
    const kind = ev.kind ?? 'frag';
    const def = kind === 'flash' ? WEAPONS.flash : WEAPONS.frag;
    const mesh = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.075, 1),
      this.textures.pbr('metalPainted', { repeat: 3, color: kind === 'flash' ? 0x9a9a9a : 0x3d4a2e })
    );
    this.fx.scene.add(mesh);
    this.weapon.grenadeList.push({
      type: kind,
      def,
      position: { ...ev.position },
      velocity: {
        x: ev.direction.x * (ev.speed ?? 16),
        y: ev.direction.y * (ev.speed ?? 16),
        z: ev.direction.z * (ev.speed ?? 16),
      },
      fuse: def.fuse,
      owner: ev.owner,
      mesh,
      bounces: 0,
      resting: false,
    });
  }

  /* ------------------------------------------------------------------ */
  /* Rendering                                                           */
  /* ------------------------------------------------------------------ */

  /**
   * Front-end camera: a slow cinematic drift over the valley so the menu is a
   * window into the world instead of a black screen.
   */
  menuCamera(dt, now) {
    const t = now * 0.001;
    const shot = Math.floor(t / 26) % 3;
    const spots = [
      { x: 52, z: -52, r: 46, h: 26, look: { x: 52, z: -52 }, speed: 0.05 },   // temple ruins
      { x: -62, z: 34, r: 38, h: 18, look: { x: -56, z: 36 }, speed: -0.045 }, // village + bridge
      { x: 2, z: -2, r: 54, h: 30, look: { x: 2, z: -2 }, speed: 0.038 },      // crossroads basin
    ];
    const spot = spots[shot];
    const ang = t * spot.speed + shot * 1.7;
    const cx = spot.x + Math.cos(ang) * spot.r;
    const cz = spot.z + Math.sin(ang) * spot.r;
    const ground = this.world?.supportHeight?.(cx, cz, 400) ?? 0;
    const cy = ground + spot.h + Math.sin(t * 0.11) * 1.6;
    this.camera.position.set(
      damp(this.camera.position.x || cx, cx, 1.6, dt),
      damp(this.camera.position.y || cy, cy, 1.6, dt),
      damp(this.camera.position.z || cz, cz, 1.6, dt)
    );
    this.camera.lookAt(spot.look.x, (this.world?.supportHeight?.(spot.look.x, spot.look.z, 400) ?? 0) + 7, spot.look.z);
    this.camera.fov = damp(this.camera.fov, 62, 1.2, dt);
    this.camera.updateProjectionMatrix();
    this.fx?.setCamera(this.camera);
    this.audio.setListener(this.camera.position, this.camDir.set(0, 0, -1).applyQuaternion(this.camera.quaternion));
  }

  render(dt) {
    if (this.contextLost) return;
    const player = this.match?.local;
    const weapon = this.weapon;

    if (!player && this.world) {
      this.menuCamera(dt, performance.now());
    }

    if (player) {
      // --- camera transform ------------------------------------------
      const eye = player.eyePosition(this.tmp);
      const offsets = player.cameraOffsets?.() ?? { x: 0, y: 0, roll: 0 };
      const kick = weapon ? weapon.viewKick() : { pitch: 0, yaw: 0 };
      const shake = player.damageShake;
      const suppress = player.suppression;

      this.camera.position.set(
        eye.x + offsets.x,
        eye.y + offsets.y,
        eye.z
      );
      const shakeT = performance.now() * 0.0018;
      this.camera.rotation.set(
        player.pitch + kick.pitch + Math.sin(shakeT * 2.3) * shake * 0.012,
        player.yaw + kick.yaw + Math.cos(shakeT * 1.7) * shake * 0.01,
        offsets.roll + Math.sin(shakeT * 1.1) * suppress * 0.006,
        'YXZ'
      );

      // --- field of view: hip -> ADS -> scope -------------------------
      const def = weapon ? weapon.def : null;
      const adsFov = def?.adsFov ?? 32;
      const hipFov = this.settings.fov;
      const adsBlend = weapon?.adsAmount ?? 0;
      const scopeTarget = def?.sight === 'scope' && adsBlend > 0.5 ? 1 : 0;
      this.scopeAmount = damp(this.scopeAmount, scopeTarget, 12, dt);
      const targetFov = lerp(hipFov, adsFov, adsBlend);
      this.camera.fov = damp(this.camera.fov, targetFov, 18, dt);
      this.camera.updateProjectionMatrix();
      if (this.viewmodel) {
        // the viewmodel keeps a slightly wider lens unless we are behind glass
        const vmFov = this.scopeAmount > 0.5 ? adsFov : clamp(this.camera.fov + 6, 45, 90);
        this.viewmodel.setViewport(window.innerWidth, window.innerHeight, vmFov);
      }
      this.fx.setCamera(this.camera);
      this.camera.getWorldDirection(this.camDir);
      this.audio.setListener(this.camera.position, { x: this.camDir.x, y: this.camDir.y, z: this.camDir.z });

      // spread for HUD crosshair
      if (weapon) this.spreadRadians = weapon.currentSpread(weapon.def) ?? 0.004;

      // damage overlay
      const healthFrac = clamp(player.health / player.maxHealth, 0, 1);
      const wantDamage = player.alive ? clamp(1 - healthFrac / 0.45, 0, 1) * 0.7 : 1;
      this.damageAmount = damp(this.damageAmount, wantDamage, 6, dt);
      this.flashAmount = Math.max(0, this.flashAmount - dt * 0.35);
      this.suppressAmount = damp(this.suppressAmount, player.suppression, 7, dt);
    }

    // --- world -------------------------------------------------------
    this.sky.update(dt, this.camera);
    this.sky.sunScreenUV(this.camera, this.sunScreen);

    const opts = {
      damage: this.damageAmount,
      flash: this.flashAmount,
      scope: this.scopeAmount,
      suppress: this.suppressAmount * 0.6,
      sunScreen: this.sunScreen,
      sunVisible: this.sunScreen.behind !== 1,
      exposure: 0.92,
      bloom: this.scopeAmount > 0.5 ? 0.3 : 0.44,
      vignette: this.scopeAmount > 0.5 ? 0.14 : 0.44,
      overlay: (renderer) => {
        if (!this.viewmodel || this.scopeAmount > 0.85) return;
        renderer.clearDepth();
        renderer.render(this.viewmodel.scene, this.viewmodel.camera);
      },
    };
    this.postfx.render(this.scene, this.camera, dt, opts);

    // --- HUD ---------------------------------------------------------
    if (this.inMatch && this.match) {
      const player2 = this.match.local;
      const radarBlips = this.radarCacheTick(dt) ?? [];
      const mates = [];
      for (const entity of this.match.entities.values()) {
        if (entity.team !== player2.team) continue;
        if (entity === player2) continue;
        mates.push({ x: entity.position.x, y: entity.position.y, z: entity.position.z, yaw: entity.yaw, name: entity.name, alive: entity.alive });
      }
      const blips = [];
      const uavActive = (this.match.uav[player2.team] ?? 0) > 0;
      for (const entity of this.match.entities.values()) {
        if (entity.team === player2.team || !entity.alive) continue;
        const visible = uavActive || this.spotted(entity);
        if (visible) blips.push({ x: entity.position.x, y: entity.position.y + 1.2, z: entity.position.z });
      }
      this.hud.update(dt, {
        player: player2,
        weapon: this.weapon,
        match: this.match,
        camera: this.camera,
        minimap: this.world.minimap,
        objectives: this.world.objectives ?? [],
        blips,
        mates,
        fps: this.fps,
        ping: this.net?.ping ?? 0,
        net: this.net,
        fov: this.camera.fov,
        spread: this.spreadRadians,
        scope: this.scopeAmount,
        dead: !player2.alive,
      });
      this.scoreboardVisible = this.input.isDown('scoreboard') || this.scoreboardVisible;
      if (this.scoreboardVisible) {
        this.hud.setScoreboard(true, this.match.scoreboard(), this.match.scores);
        if (!this.input.isDown('scoreboard')) this.scoreboardVisible = false;
      } else {
        this.hud.setScoreboard(false);
      }
      this.hud.setFlash(this.flashAmount);
      void radarBlips;
    }
  }

  radarCacheTick() {
    return null;
  }

  /** Visible-to-player test used for enemy blips and nametags. */
  spotted(entity) {
    const player = this.match?.local;
    if (!player) return false;
    const eye = this.tmp.set(player.position.x, player.position.y + player.eyeHeight, player.position.z);
    const dx = entity.position.x - eye.x;
    const dz = entity.position.z - eye.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 90) return false;
    const forward = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(player.pitch, player.yaw, 0, 'YXZ'));
    const dot = (dx / (dist || 1)) * forward.x + (dz / (dist || 1)) * forward.z;
    if (dot < 0.2) return false;
    return this.world.lineOfSight(
      { x: eye.x, y: eye.y, z: eye.z },
      { x: entity.position.x, y: entity.position.y + 1.3, z: entity.position.z },
      { through: ['leaf', 'cloth'] }
    );
  }

}

/** small helper so the respawn countdown reads nicely in the HUD */
function MATCH_RESPAWN_LEFT(match, player) {
  const entry = match.respawnQueue.find((r) => r.id === player.id);
  if (!entry) return 0;
  return Math.max(0, entry.at - performance.now() / 1000);
}

function formatCode(code, width = 62) {
  const out = [];
  for (let i = 0; i < code.length; i += width) out.push(code.slice(i, i + width));
  return out.join('\n');
}

async function copyText(text) {
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
  } catch (err) {
    // clipboard can be blocked - fall back to selecting the field
    void err;
  }
}

/* ------------------------------------------------------------------ */

const game = new Game();
game.init().catch((err) => {
  console.error(err);
  game.errors?.push({ kind: 'boot', message: String(err.message ?? err), stack: String(err.stack || '').slice(0, 2000), at: Date.now() });
  const warn = document.getElementById('loading-warning');
  if (warn) {
    warn.innerHTML = `<b>Startup failed.</b><br>${String(err.message ?? err)}`;
    warn.classList.add('show');
  }
});

// handy for the console / debugging in the sandbox preview
window.ironwood = game;
