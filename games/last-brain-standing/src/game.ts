import { BOT_PROFILES, chooseBotDirection, distance, normalize, shouldBotFire } from "./ai";
import { circleHitsRect, moveWithCollisions, OBSTACLES, segmentBlocked, segmentHitsCircle, WORLD } from "./arena";
import type { AgentState, BotKind, Bullet, PlayerTelemetry, Vec2 } from "./types";
import { getNextWave, getWaveSpawnCount, MAX_WAVES } from "./progression";

interface Particle { position: Vec2; velocity: Vec2; life: number; maxLife: number; color: string; size: number }
interface FloatingText { position: Vec2; text: string; life: number; color: string }

const PLAYER_COLOR = "#55e7ff";
const PLAYER_RADIUS = 12;
const BOT_RADIUS = 12;
const PLAYER_SPEED = 224;
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
const randomBetween = (min: number, max: number) => min + Math.random() * (max - min);

export class ArenaGame {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly keys = new Set<string>();
  private readonly eventController = new AbortController();
  private readonly bots: AgentState[] = [];
  private readonly bullets: Bullet[] = [];
  private readonly particles: Particle[] = [];
  private readonly texts: FloatingText[] = [];
  private readonly telemetry: PlayerTelemetry = { recentDirections: [], recentShots: [], stationaryTime: 0, lastMoveDirection: { x: 0, y: 0 } };
  private readonly profileKinds: BotKind[] = ["hunter", "flanker", "mirror"];
  private player: Vec2 = { x: 480, y: 492 };
  private aim: Vec2 = { x: 480, y: 220 };
  private health = 100;
  private kills = 0;
  private wave = 1;
  private running = false;
  private started = false;
  private over = false;
  private paused = false;
  private dashCooldown = 0;
  private fireCooldown = 0;
  private invulnerability = 0;
  private elapsed = 0;
  private lastFrame = 0;
  private frameId = 0;
  private shake = 0;
  private pointerDown = false;
  private readonly ui = {
    kills: document.querySelector<HTMLElement>("#kills")!,
    best: document.querySelector<HTMLElement>("#best")!,
    wave: document.querySelector<HTMLElement>("#wave")!,
    waveProgress: document.querySelector<HTMLElement>("#wave-progress")!,
    healthText: document.querySelector<HTMLElement>("#health-text")!,
    healthBar: document.querySelector<HTMLElement>("#health-bar")!,
    dashText: document.querySelector<HTMLElement>("#dash-text")!,
    feed: document.querySelector<HTMLElement>("#combat-feed")!,
    overlay: document.querySelector<HTMLElement>("#overlay")!,
    overlayTitle: document.querySelector<HTMLElement>("#overlay-title")!,
    overlayCopy: document.querySelector<HTMLElement>("#overlay-copy")!,
    startButton: document.querySelector<HTMLButtonElement>("#start-button")!,
    arenaMessage: document.querySelector<HTMLElement>("#arena-message")!,
    pauseButton: document.querySelector<HTMLButtonElement>("#pause-button")!,
    simulationStatus: document.querySelector<HTMLElement>("#simulation-status")!
  };

  constructor(private readonly canvas: HTMLCanvasElement) {
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas 2D is not available in this browser.");
    this.ctx = context;
    this.ui.best.textContent = String(this.readBest()).padStart(2, "0");
    this.bindEvents();
    this.resetWorld();
    this.render();
  }

  start(): void {
    if (this.running && !this.paused) return;
    if (this.over || !this.started) {
      this.resetWorld();
      this.started = true;
      this.over = false;
    }
    this.paused = false;
    this.running = true;
    this.ui.overlay.classList.add("hidden");
    this.ui.pauseButton.textContent = "Ⅱ";
    this.ui.pauseButton.setAttribute("aria-label", "Pause game");
    this.ui.pauseButton.title = "Pause (Esc)";
    this.ui.simulationStatus.textContent = "SIMULATION ACTIVE";
    this.ui.arenaMessage.textContent = "ELIMINATE HOSTILES";
    this.lastFrame = performance.now();
    cancelAnimationFrame(this.frameId);
    this.frameId = requestAnimationFrame(this.loop);
    this.addFeed("Simulation started. Keep moving.");
  }

  destroy(): void {
    this.running = false;
    this.paused = true;
    cancelAnimationFrame(this.frameId);
    this.eventController.abort();
    this.keys.clear();
    this.pointerDown = false;
  }

  private bindEvents(): void {
    const options = { signal: this.eventController.signal };
    window.addEventListener("keydown", (event) => {
      const key = event.key.toLowerCase();
      if ([" ", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(key)) event.preventDefault();
      this.keys.add(key);
      if (key === "escape") this.togglePause();
      if (key === " " && !event.repeat) this.tryShoot();
      if (key === "shift" && !event.repeat) this.tryDash();
      if (key === "r" && this.started) this.restart();
    }, options);
    window.addEventListener("keyup", (event) => this.keys.delete(event.key.toLowerCase()), options);
    this.canvas.addEventListener("pointermove", (event) => {
      const rect = this.canvas.getBoundingClientRect();
      this.aim = { x: ((event.clientX - rect.left) / rect.width) * WORLD.width, y: ((event.clientY - rect.top) / rect.height) * WORLD.height };
    }, options);
    this.canvas.addEventListener("pointerdown", (event) => {
      if (event.button === 0) { this.pointerDown = true; this.tryShoot(); }
    }, options);
    window.addEventListener("pointerup", () => { this.pointerDown = false; }, options);
    this.ui.startButton.addEventListener("click", () => this.start(), options);
    this.ui.pauseButton.addEventListener("click", () => this.togglePause(), options);
    window.addEventListener("blur", () => { this.keys.clear(); this.pointerDown = false; if (this.running) this.pause(); }, options);
  }

  private loop = (now: number): void => {
    if (!this.running || this.paused) return;
    const dt = Math.min(0.033, (now - this.lastFrame) / 1000 || 0);
    this.lastFrame = now;
    this.update(dt);
    this.render();
    if (this.running && !this.paused) this.frameId = requestAnimationFrame(this.loop);
  };

  private update(dt: number): void {
    this.elapsed += dt;
    this.fireCooldown = Math.max(0, this.fireCooldown - dt);
    this.dashCooldown = Math.max(0, this.dashCooldown - dt);
    this.invulnerability = Math.max(0, this.invulnerability - dt);
    this.shake = Math.max(0, this.shake - dt * 22);
    this.updatePlayer(dt);
    this.updateBots(dt);
    this.updateBullets(dt);
    this.updateParticles(dt);
    this.updateTexts(dt);
    this.spawnWaveIfClear();
    this.updateHud();
  }

  private updatePlayer(dt: number): void {
    let direction = { x: 0, y: 0 };
    if (this.keys.has("w") || this.keys.has("arrowup")) direction.y -= 1;
    if (this.keys.has("s") || this.keys.has("arrowdown")) direction.y += 1;
    if (this.keys.has("a") || this.keys.has("arrowleft")) direction.x -= 1;
    if (this.keys.has("d") || this.keys.has("arrowright")) direction.x += 1;
    direction = normalize(direction);
    if (Math.hypot(direction.x, direction.y) > 0) {
      this.telemetry.lastMoveDirection = direction;
      this.telemetry.recentDirections.push(direction);
      if (this.telemetry.recentDirections.length > 18) this.telemetry.recentDirections.shift();
      this.telemetry.stationaryTime = 0;
      const movement = { x: direction.x * PLAYER_SPEED * dt, y: direction.y * PLAYER_SPEED * dt };
      const next = moveWithCollisions(this.player, movement, PLAYER_RADIUS);
      this.player = next;
      if (Math.random() < 0.48) this.particles.push({ position: { ...this.player }, velocity: { x: randomBetween(-16, 16), y: randomBetween(-16, 16) }, life: 0.22, maxLife: 0.22, color: "#2b8199", size: randomBetween(1, 2.5) });
    } else {
      this.telemetry.stationaryTime += dt;
      this.telemetry.lastMoveDirection = { x: this.telemetry.lastMoveDirection.x * 0.96, y: this.telemetry.lastMoveDirection.y * 0.96 };
    }
    if (this.pointerDown) this.tryShoot();
  }

  private updateBots(dt: number): void {
    for (const bot of this.bots) {
      if (!bot.alive) continue;
      bot.fireCooldown = Math.max(0, bot.fireCooldown - dt);
      bot.hitFlash = Math.max(0, bot.hitFlash - dt);
      const profile = BOT_PROFILES[bot.kind];
      const direction = chooseBotDirection(bot, this.player, this.telemetry, this.elapsed);
      const movement = { x: direction.x * profile.speed * dt, y: direction.y * profile.speed * dt };
      const next = moveWithCollisions(bot.position, movement, BOT_RADIUS);
      if (distance(next, bot.position) < 0.1) bot.strafeSign *= -1;
      bot.velocity = { x: (next.x - bot.position.x) / Math.max(dt, 0.001), y: (next.y - bot.position.y) / Math.max(dt, 0.001) };
      bot.position = next;
      const range = distance(bot.position, this.player);
      if (shouldBotFire(bot.kind, range, bot.fireCooldown, this.telemetry) && !segmentBlocked(bot.position, this.player)) {
        this.fireBot(bot);
      }
      if (range < PLAYER_RADIUS + BOT_RADIUS + 2 && this.invulnerability <= 0) this.damagePlayer(12, bot.position);
    }
  }

  private updateBullets(dt: number): void {
    for (let i = this.bullets.length - 1; i >= 0; i -= 1) {
      const bullet = this.bullets[i];
      const previous = { ...bullet.position };
      bullet.position.x += bullet.velocity.x * dt;
      bullet.position.y += bullet.velocity.y * dt;
      bullet.life -= dt;
      const out = bullet.position.x < 0 || bullet.position.x > WORLD.width || bullet.position.y < 0 || bullet.position.y > WORLD.height;
      const blocked = segmentBlocked(previous, bullet.position)
        || OBSTACLES.some((obstacle) => circleHitsRect(bullet.position, 3, obstacle));
      if (out || blocked || bullet.life <= 0) { this.bullets.splice(i, 1); continue; }
      if (bullet.owner === "player") {
        // Sweep the whole frame movement so fast shots cannot skip over a target between frames.
        const target = this.bots.find((bot) => bot.alive && segmentHitsCircle(previous, bullet.position, bot.position, BOT_RADIUS + 3));
        if (target) {
          target.health -= bullet.damage;
          target.hitFlash = 0.14;
          this.burst(bullet.position, BOT_PROFILES[target.kind].color, 7);
          this.bullets.splice(i, 1);
          if (target.health <= 0) this.eliminateBot(target);
        }
      } else if (this.invulnerability <= 0 && segmentHitsCircle(previous, bullet.position, this.player, PLAYER_RADIUS + 3)) {
        this.bullets.splice(i, 1);
        this.damagePlayer(bullet.damage, bullet.position);
      }
    }
  }

  private tryShoot(): void {
    if (!this.running || this.paused || this.fireCooldown > 0 || this.over) return;
    const direction = normalize({ x: this.aim.x - this.player.x, y: this.aim.y - this.player.y });
    if (direction.x === 0 && direction.y === 0) return;
    this.fireCooldown = 0.19;
    this.telemetry.recentShots.push(direction);
    if (this.telemetry.recentShots.length > 12) this.telemetry.recentShots.shift();
    this.bullets.push({ position: { x: this.player.x + direction.x * 17, y: this.player.y + direction.y * 17 }, velocity: { x: direction.x * 590, y: direction.y * 590 }, owner: "player", damage: 1, life: 1.3, color: PLAYER_COLOR });
    this.burst({ x: this.player.x + direction.x * 18, y: this.player.y + direction.y * 18 }, PLAYER_COLOR, 3);
    this.shake = Math.max(this.shake, 1.4);
  }

  private fireBot(bot: AgentState): void {
    const profile = BOT_PROFILES[bot.kind];
    const targetVelocity = this.telemetry.lastMoveDirection;
    const leadFactor = bot.kind === "hunter" ? 0.28 : bot.kind === "mirror" ? 0.14 : 0.06;
    const predicted = { x: this.player.x + targetVelocity.x * 65 * leadFactor, y: this.player.y + targetVelocity.y * 65 * leadFactor };
    const direction = normalize({ x: predicted.x - bot.position.x, y: predicted.y - bot.position.y });
    const spread = bot.kind === "flanker" ? 0.1 : 0.035;
    const angle = Math.atan2(direction.y, direction.x) + randomBetween(-spread, spread);
    this.bullets.push({ position: { x: bot.position.x + Math.cos(angle) * 16, y: bot.position.y + Math.sin(angle) * 16 }, velocity: { x: Math.cos(angle) * 315, y: Math.sin(angle) * 315 }, owner: "bot", damage: bot.kind === "hunter" ? 10 : 8, life: 1.7, color: profile.color });
    bot.fireCooldown = profile.fireRate + randomBetween(-0.1, 0.12);
    this.burst({ x: bot.position.x + Math.cos(angle) * 17, y: bot.position.y + Math.sin(angle) * 17 }, profile.color, 2);
  }

  private tryDash(): void {
    if (!this.running || this.paused || this.dashCooldown > 0 || this.over) return;
    let direction = { x: 0, y: 0 };
    if (this.keys.has("w")) direction.y -= 1;
    if (this.keys.has("s")) direction.y += 1;
    if (this.keys.has("a")) direction.x -= 1;
    if (this.keys.has("d")) direction.x += 1;
    direction = normalize(direction);
    if (!direction.x && !direction.y) direction = normalize({ x: this.aim.x - this.player.x, y: this.aim.y - this.player.y });
    const destination = moveWithCollisions(this.player, { x: direction.x * 102, y: direction.y * 102 }, PLAYER_RADIUS);
    this.player = destination;
    this.dashCooldown = 2.2;
    this.invulnerability = 0.22;
    this.shake = 4;
    this.burst(this.player, PLAYER_COLOR, 14);
    this.addFeed("Dash used. Reposition.");
  }

  private damagePlayer(amount: number, source: Vec2): void {
    if (this.invulnerability > 0 || this.over) return;
    this.health = Math.max(0, this.health - amount);
    this.invulnerability = 0.58;
    this.shake = 8;
    this.burst(source, "#ff5c76", 10);
    this.addFeed("Integrity compromised: -" + amount + "%");
    if (this.health <= 0) this.endRun();
  }

  private eliminateBot(bot: AgentState): void {
    bot.alive = false;
    this.kills += 1;
    this.burst(bot.position, BOT_PROFILES[bot.kind].color, 22);
    this.texts.push({ position: { ...bot.position }, text: "+1 ELIM", life: 0.85, color: BOT_PROFILES[bot.kind].color });
    this.addFeed(BOT_PROFILES[bot.kind].name + " eliminated.");
    this.ui.best.textContent = String(Math.max(this.readBest(), this.kills)).padStart(2, "0");
    if (this.kills > this.readBest()) {
      try { localStorage.setItem("lbs-best", String(this.kills)); } catch { /* Storage can be disabled. */ }
    }
  }

  private spawnWaveIfClear(): void {
    if (this.bots.some((bot) => bot.alive)) return;
    const nextWave = getNextWave(this.wave);
    if (nextWave === null) {
      this.finishRun();
      return;
    }
    this.wave = nextWave;
    const count = getWaveSpawnCount(this.wave);
    const kinds: BotKind[] = this.wave >= 3 ? ["hunter", "flanker", "mirror", "hunter", "flanker", "mirror"].slice(0, count) : this.profileKinds.slice(0, count);
    for (let i = 0; i < count; i += 1) {
      const angle = (Math.PI * 2 * i) / count + randomBetween(-0.2, 0.2);
      const radius = 210 + randomBetween(0, 40);
      const position = moveWithCollisions({ x: WORLD.width / 2 + Math.cos(angle) * radius, y: WORLD.height / 2 + Math.sin(angle) * radius }, { x: 0, y: 0 }, BOT_RADIUS);
      this.bots.push({ id: this.elapsed * 100 + i, kind: kinds[i % kinds.length], position, velocity: { x: 0, y: 0 }, health: 2 + Math.floor(this.wave / 3), fireCooldown: randomBetween(0.25, 0.8), strafeSign: i % 2 ? 1 : -1, alive: true, hitFlash: 0 });
    }
    this.addFeed("Threat level increased to " + String(this.wave).padStart(2, "0") + ".");
    this.updateHud();
  }

  private resetWorld(): void {
    this.player = { x: 480, y: 492 };
    this.aim = { x: 480, y: 220 };
    this.health = 100;
    this.kills = 0;
    this.wave = 0;
    this.dashCooldown = 0;
    this.fireCooldown = 0;
    this.invulnerability = 0;
    this.elapsed = 0;
    this.bots.length = 0;
    this.bullets.length = 0;
    this.particles.length = 0;
    this.texts.length = 0;
    this.telemetry.recentDirections.length = 0;
    this.telemetry.recentShots.length = 0;
    this.telemetry.stationaryTime = 0;
    this.telemetry.lastMoveDirection = { x: 0, y: 0 };
    this.spawnWaveIfClear();
    this.updateHud();
    this.ui.feed.innerHTML = "";
    this.addFeed("Three distinct AI profiles loaded.");
  }

  private restart(): void {
    this.over = true;
    this.paused = false;
    this.running = false;
    this.start();
  }

  private finishRun(): void {
    this.over = true;
    this.running = false;
    this.paused = false;
    cancelAnimationFrame(this.frameId);
    this.ui.overlayTitle.innerHTML = "ARENA<br /><span>CONQUERED.</span>";
    this.ui.overlayCopy.textContent = "All five threat levels cleared. You eliminated " + this.kills + " opponents and outlasted every profile. Ready for another run?";
    this.ui.startButton.innerHTML = "<span>RUN IT BACK</span><span aria-hidden=\"true\">↻</span>";
    this.ui.overlay.classList.remove("hidden");
    this.ui.simulationStatus.textContent = "ARENA CONQUERED";
    this.ui.arenaMessage.textContent = "SIMULATION COMPLETE";
    this.addFeed("All threat levels cleared. Arena conquered.");
  }

  private endRun(): void {
    this.over = true;
    this.running = false;
    cancelAnimationFrame(this.frameId);
    this.ui.overlayTitle.innerHTML = "RUN<br /><span>TERMINATED.</span>";
    this.ui.overlayCopy.textContent = "You eliminated " + this.kills + " opponent" + (this.kills === 1 ? "" : "s") + ". The arena keeps score. Think you can do better?";
    this.ui.startButton.innerHTML = "<span>RUN IT BACK</span><span aria-hidden=\"true\">↻</span>";
    this.ui.overlay.classList.remove("hidden");
    this.ui.simulationStatus.textContent = "SIMULATION TERMINATED";
    this.ui.arenaMessage.textContent = "SIMULATION TERMINATED";
    this.addFeed("Run terminated. Press R to retry.");
  }

  private togglePause(): void {
    if (!this.started || this.over) return;
    if (this.paused) {
      this.start();
      return;
    }
    if (this.running) this.pause();
  }

  private pause(): void {
    this.paused = true;
    this.running = false;
    cancelAnimationFrame(this.frameId);
    this.ui.pauseButton.textContent = "▶";
    this.ui.pauseButton.setAttribute("aria-label", "Resume game");
    this.ui.pauseButton.title = "Resume (Esc)";
    this.ui.simulationStatus.textContent = "SIMULATION PAUSED";
    this.ui.overlayTitle.innerHTML = "TAKE A<br /><span>BREATHER.</span>";
    this.ui.overlayCopy.textContent = "The bots aren't going anywhere. Ready when you are.";
    this.ui.startButton.innerHTML = "<span>RESUME RUN</span><span aria-hidden=\"true\">↗</span>";
    this.ui.overlay.classList.remove("hidden");
    this.ui.arenaMessage.textContent = "SIMULATION PAUSED";
  }

  private burst(position: Vec2, color: string, count: number): void {
    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = randomBetween(22, 155);
      const life = randomBetween(0.16, 0.48);
      this.particles.push({ position: { ...position }, velocity: { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed }, life, maxLife: life, color, size: randomBetween(1.4, 3.2) });
    }
  }

  private updateParticles(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i -= 1) {
      const p = this.particles[i];
      p.position.x += p.velocity.x * dt;
      p.position.y += p.velocity.y * dt;
      p.velocity.x *= 0.96;
      p.velocity.y *= 0.96;
      p.life -= dt;
      if (p.life <= 0) this.particles.splice(i, 1);
    }
    if (this.particles.length > 500) this.particles.splice(0, this.particles.length - 500);
  }

  private updateTexts(dt: number): void {
    for (let i = this.texts.length - 1; i >= 0; i -= 1) {
      this.texts[i].life -= dt;
      this.texts[i].position.y -= 24 * dt;
      if (this.texts[i].life <= 0) this.texts.splice(i, 1);
    }
  }

  private updateHud(): void {
    this.ui.kills.textContent = String(this.kills).padStart(2, "0");
    this.ui.wave.innerHTML = String(this.wave).padStart(2, "0") + " <i>/ " + String(MAX_WAVES).padStart(2, "0") + "</i>";
    this.ui.waveProgress.style.width = (this.kills % 5) * 20 + "%";
    this.ui.healthText.textContent = this.health + "%";
    this.ui.healthBar.style.width = this.health + "%";
    this.ui.healthBar.classList.toggle("low", this.health <= 35);
    this.ui.dashText.textContent = this.dashCooldown <= 0 ? "READY" : this.dashCooldown.toFixed(1) + "s";
    for (const kind of this.profileKinds) {
      const alive = this.bots.some((bot) => bot.kind === kind && bot.alive);
      const element = document.querySelector<HTMLElement>("#state-" + kind);
      if (element) { element.textContent = alive ? "ACTIVE" : "DOWN"; element.classList.toggle("down", !alive); }
    }
  }

  private addFeed(message: string): void {
    const row = document.createElement("p");
    const stamp = document.createElement("span");
    stamp.textContent = new Date().toLocaleTimeString([], { minute: "2-digit", second: "2-digit" });
    row.append(stamp, document.createTextNode(" " + message));
    this.ui.feed.prepend(row);
    while (this.ui.feed.children.length > 5) this.ui.feed.lastElementChild?.remove();
  }

  private readBest(): number {
    try { return Number(localStorage.getItem("lbs-best") || 0); } catch { return 0; }
  }

  private render(): void {
    const ctx = this.ctx;
    ctx.save();
    if (this.shake > 0) ctx.translate(randomBetween(-this.shake, this.shake), randomBetween(-this.shake, this.shake));
    this.drawBackground();
    this.drawObstacles();
    this.drawAimLine();
    this.drawBullets();
    this.drawAgents();
    this.drawParticles();
    this.drawTexts();
    ctx.restore();
  }

  private drawBackground(): void {
    const ctx = this.ctx;
    const gradient = ctx.createLinearGradient(0, 0, WORLD.width, WORLD.height);
    gradient.addColorStop(0, "#0c1423");
    gradient.addColorStop(1, "#080d16");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, WORLD.width, WORLD.height);
    ctx.save();
    ctx.strokeStyle = "rgba(111, 153, 190, 0.075)";
    ctx.lineWidth = 1;
    for (let x = 0; x <= WORLD.width; x += 32) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, WORLD.height); ctx.stroke(); }
    for (let y = 0; y <= WORLD.height; y += 32) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(WORLD.width, y); ctx.stroke(); }
    const glow = ctx.createRadialGradient(this.player.x, this.player.y, 0, this.player.x, this.player.y, 230);
    glow.addColorStop(0, "rgba(39, 174, 211, 0.075)");
    glow.addColorStop(1, "rgba(39, 174, 211, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, WORLD.width, WORLD.height);
    ctx.restore();
    ctx.strokeStyle = "rgba(97, 153, 184, 0.2)";
    ctx.strokeRect(12, 12, WORLD.width - 24, WORLD.height - 24);
    ctx.fillStyle = "#3e7188";
    for (const [x, y] of [[12, 12], [WORLD.width - 12, 12], [12, WORLD.height - 12], [WORLD.width - 12, WORLD.height - 12]]) {
      ctx.fillRect(x - 2, y - 2, 4, 4);
    }
  }

  private drawObstacles(): void {
    const ctx = this.ctx;
    for (const obstacle of OBSTACLES) {
      ctx.fillStyle = "rgba(0, 0, 0, 0.22)";
      ctx.fillRect(obstacle.x + 4, obstacle.y + 6, obstacle.w, obstacle.h);
      ctx.fillStyle = "#131e2d";
      ctx.fillRect(obstacle.x, obstacle.y, obstacle.w, obstacle.h);
      ctx.strokeStyle = "rgba(93, 131, 161, 0.48)";
      ctx.lineWidth = 1;
      ctx.strokeRect(obstacle.x + 0.5, obstacle.y + 0.5, obstacle.w - 1, obstacle.h - 1);
      ctx.fillStyle = "#37576d";
      ctx.fillRect(obstacle.x + 7, obstacle.y + 7, 3, 3);
      ctx.fillRect(obstacle.x + obstacle.w - 10, obstacle.y + obstacle.h - 10, 3, 3);
      ctx.strokeStyle = "rgba(61, 99, 125, 0.25)";
      ctx.beginPath(); ctx.moveTo(obstacle.x + 10, obstacle.y + obstacle.h / 2); ctx.lineTo(obstacle.x + obstacle.w - 10, obstacle.y + obstacle.h / 2); ctx.stroke();
    }
  }

  private drawAimLine(): void {
    const ctx = this.ctx;
    const direction = normalize({ x: this.aim.x - this.player.x, y: this.aim.y - this.player.y });
    ctx.save();
    ctx.setLineDash([3, 8]);
    ctx.strokeStyle = "rgba(85, 231, 255, 0.17)";
    ctx.beginPath();
    ctx.moveTo(this.player.x + direction.x * 20, this.player.y + direction.y * 20);
    ctx.lineTo(this.player.x + direction.x * 150, this.player.y + direction.y * 150);
    ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = "rgba(85, 231, 255, 0.6)";
    ctx.beginPath(); ctx.arc(this.aim.x, this.aim.y, 6, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(this.aim.x - 10, this.aim.y); ctx.lineTo(this.aim.x - 4, this.aim.y); ctx.moveTo(this.aim.x + 4, this.aim.y); ctx.lineTo(this.aim.x + 10, this.aim.y); ctx.stroke();
  }

  private drawBullets(): void {
    const ctx = this.ctx;
    for (const bullet of this.bullets) {
      ctx.save();
      ctx.shadowBlur = 13;
      ctx.shadowColor = bullet.color;
      ctx.fillStyle = bullet.color;
      ctx.beginPath(); ctx.arc(bullet.position.x, bullet.position.y, bullet.owner === "player" ? 3.4 : 3, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.28;
      ctx.strokeStyle = bullet.color;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(bullet.position.x, bullet.position.y); ctx.lineTo(bullet.position.x - bullet.velocity.x * 0.026, bullet.position.y - bullet.velocity.y * 0.026); ctx.stroke();
      ctx.restore();
    }
  }

  private drawAgents(): void {
    const ctx = this.ctx;
    for (const bot of this.bots) {
      if (!bot.alive) continue;
      const profile = BOT_PROFILES[bot.kind];
      ctx.save();
      ctx.translate(bot.position.x, bot.position.y);
      ctx.shadowBlur = bot.hitFlash > 0 ? 25 : 16;
      ctx.shadowColor = profile.color;
      ctx.fillStyle = bot.hitFlash > 0 ? "#ffffff" : "#111722";
      ctx.strokeStyle = profile.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      if (bot.kind === "hunter") { ctx.moveTo(0, -13); ctx.lineTo(12, 0); ctx.lineTo(0, 13); ctx.lineTo(-12, 0); ctx.closePath(); }
      else if (bot.kind === "flanker") { ctx.moveTo(0, -14); ctx.lineTo(12, 10); ctx.lineTo(-12, 10); ctx.closePath(); }
      else { ctx.arc(0, 0, 11, 0, Math.PI * 2); }
      ctx.fill(); ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.fillStyle = profile.color;
      ctx.beginPath(); ctx.arc(0, 0, 2.8, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.18)";
      ctx.beginPath(); ctx.arc(0, 0, 17, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (bot.health / (2 + Math.floor(this.wave / 3)))); ctx.stroke();
      ctx.restore();
    }
    ctx.save();
    ctx.translate(this.player.x, this.player.y);
    ctx.globalAlpha = this.invulnerability > 0 && Math.floor(this.elapsed * 28) % 2 === 0 ? 0.45 : 1;
    ctx.shadowBlur = 22;
    ctx.shadowColor = PLAYER_COLOR;
    ctx.fillStyle = "#0e2934";
    ctx.strokeStyle = PLAYER_COLOR;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, PLAYER_RADIUS, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    const angle = Math.atan2(this.aim.y - this.player.y, this.aim.x - this.player.x);
    ctx.rotate(angle);
    ctx.fillStyle = PLAYER_COLOR;
    ctx.fillRect(4, -3, 15, 6);
    ctx.fillStyle = "#d7fbff";
    ctx.beginPath(); ctx.arc(0, 0, 4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  private drawParticles(): void {
    const ctx = this.ctx;
    for (const p of this.particles) {
      ctx.globalAlpha = clamp(p.life / p.maxLife, 0, 1);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.position.x, p.position.y, p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }

  private drawTexts(): void {
    const ctx = this.ctx;
    ctx.textAlign = "center";
    ctx.font = "700 10px 'IBM Plex Mono', monospace";
    for (const text of this.texts) {
      ctx.globalAlpha = clamp(text.life / 0.85, 0, 1);
      ctx.fillStyle = text.color;
      ctx.fillText(text.text, text.position.x, text.position.y);
    }
    ctx.globalAlpha = 1;
  }
}