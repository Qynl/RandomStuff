import { describe, expect, it } from "vitest";
import {
  CAREER_RANKS,
  careerScore,
  DEFAULT_LOADOUT,
  isLoadoutId,
  isUnlocked,
  LOADOUTS,
  LOADOUT_ORDER,
  nextLockedLoadout,
  nextRank,
  rankFor,
  resolveLoadout,
  unlockProgress,
  unlockedLoadouts
} from "../src/loadouts";
import { createWorld, damageBot, eliminateBot, emptyInput, resetWorld, setWorldLoadout, stepWorld } from "../src/sim";
import { DIFFICULTIES, PLAYER_FIRE_INTERVAL, PLAYER_SPEED } from "../src/constants";
import { pinLayout } from "./helpers/layout";
import type { AgentState } from "../src/types";

/**
 * Operative classes are the player's side of the difficulty curve: six kits with
 * genuinely different bodies, mobility and signature rules, all issued from the
 * start. Career score buys badges and rank; it never buys access.
 */
describe("operative classes", () => {
  it("keeps every class complete and distinct", () => {
    const weaponSignatures = new Set<string>();
    const bodies = new Set<string>();
    const traits = new Set<string>();
    for (const id of LOADOUT_ORDER) {
      const klass = LOADOUTS[id];
      expect(klass.id).toBe(id);
      expect(klass.name.length).toBeGreaterThan(4);
      expect(klass.tagline.length).toBeGreaterThan(10);
      expect(klass.counter.length).toBeGreaterThan(10);
      expect(klass.traitName.length).toBeGreaterThanOrEqual(3);
      expect(klass.traitRule.length).toBeGreaterThan(20);
      expect(klass.shots).toBeGreaterThanOrEqual(1);
      expect(klass.damage).toBeGreaterThan(0);
      expect(klass.fireInterval).toBeGreaterThan(0.04);
      expect(klass.bulletSpeed).toBeGreaterThan(250);
      expect(klass.bulletLife).toBeGreaterThan(0.2);
      expect(klass.recoil).toBeGreaterThan(0);
      expect(klass.maxHealth).toBeGreaterThanOrEqual(80);
      expect(klass.speedScale).toBeGreaterThan(0.8);
      expect(klass.dashDistance).toBeGreaterThan(90);
      expect(klass.dashCooldown).toBeGreaterThan(1);
      weaponSignatures.add(`${klass.shots}:${klass.damage}:${klass.fireInterval}:${klass.pierce}`);
      bodies.add(`${klass.maxHealth}:${klass.speedScale}`);
      traits.add(klass.trait);
    }
    // Six classes, six weapons, six bodies and six signature rules: no class is
    // a recolour of another.
    expect(weaponSignatures.size).toBe(LOADOUT_ORDER.length);
    expect(bodies.size).toBe(LOADOUT_ORDER.length);
    expect(traits.size).toBe(LOADOUT_ORDER.length);
    expect(LOADOUT_ORDER.length).toBeGreaterThanOrEqual(6);
  });

  it("keeps the balance promise each class makes", () => {
    const vanguard = LOADOUTS.vanguard;
    const breacher = LOADOUTS.breacher;
    const marksman = LOADOUTS.marksman;
    // Shot-for-shot: the marksman hits hardest and fires slowest, the shotgun
    // trades per-pellet damage for pellet count and a wide spread.
    expect(marksman.damage).toBeGreaterThan(vanguard.damage);
    expect(marksman.fireInterval).toBeGreaterThan(vanguard.fireInterval);
    expect(breacher.shots).toBeGreaterThan(1);
    expect(breacher.spread).toBeGreaterThan(0);
    expect(breacher.damage).toBeLessThan(vanguard.damage);
    // The heavy classes are slower and tougher; the light ones the opposite.
    expect(breacher.maxHealth).toBeGreaterThan(vanguard.maxHealth);
    expect(breacher.speedScale).toBeLessThan(vanguard.speedScale);
    expect(marksman.maxHealth).toBeLessThan(vanguard.maxHealth);
    expect(LOADOUTS.ghost.speedScale).toBeGreaterThan(vanguard.speedScale);
    // Burst damage stays in the same ballpark so no class trivialises a wave.
    for (const id of LOADOUT_ORDER) {
      const klass = LOADOUTS[id];
      const burst = (klass.shots * klass.damage) / klass.fireInterval;
      expect(burst).toBeGreaterThan(24);
      expect(burst).toBeLessThan(140);
    }
    expect(LOADOUTS[DEFAULT_LOADOUT].trait).toBe("steady");
  });

  it("issues every class from the start, at any career score", () => {
    for (const career of [0, 1, 4499, 11000, 999999]) {
      expect(unlockedLoadouts(career)).toEqual(LOADOUT_ORDER);
      for (const id of LOADOUT_ORDER) {
        expect(isUnlocked(id, career)).toBe(true);
        expect(unlockProgress(id, career)).toBe(1);
      }
      expect(nextLockedLoadout(career)).toBeNull();
    }
  });

  it("sums the best score of every threat level into a career score", () => {
    expect(careerScore({})).toBe(0);
    expect(careerScore({ standard: { score: 1000 } })).toBe(1000);
    expect(careerScore({ recruit: { score: 900 }, standard: { score: 1200 }, veteran: { score: 300 } })).toBe(2400);
    // Junk, negatives and non-numbers are ignored rather than poisoning the sum.
    expect(careerScore({ recruit: { score: -50 }, standard: { score: Number.NaN }, veteran: { score: 400 } })).toBe(400);
    expect(careerScore({ bogus: { score: 999 } })).toBe(999);
  });

  it("ignores unknown ids and maps the pre-class names onto their successors", () => {
    expect(isLoadoutId("breacher")).toBe(true);
    expect(isLoadoutId("railgun")).toBe(false);
    expect(isLoadoutId(7)).toBe(false);
    // A stored value from before the roster was renamed still resolves.
    expect(resolveLoadout("rifle")).toBe("vanguard");
    expect(resolveLoadout("scatter")).toBe("breacher");
    expect(resolveLoadout("rail")).toBe("marksman");
    expect(resolveLoadout("breacher")).toBe("breacher");
    expect(resolveLoadout("nonsense")).toBe("vanguard");
    expect(resolveLoadout(undefined)).toBe("vanguard");
  });

  it("ranks the operator by career score, with a next goal", () => {
    expect(rankFor(0).name).toBe("RECRUIT");
    expect(rankFor(2999).name).toBe("RECRUIT");
    expect(rankFor(3000).name).toBe("OPERATOR");
    expect(rankFor(999999).name).toBe(CAREER_RANKS[CAREER_RANKS.length - 1].name);
    for (let index = 1; index < CAREER_RANKS.length; index += 1) {
      expect(CAREER_RANKS[index].threshold).toBeGreaterThan(CAREER_RANKS[index - 1].threshold);
    }
    expect(nextRank(0)?.name).toBe("OPERATOR");
    expect(nextRank(999999)).toBeNull();
  });
});

describe("classes in the simulation", () => {
  const start = (id: keyof typeof LOADOUTS) => {
    const world = createWorld({ seed: `class-${id}` });
    resetWorld(world, { seed: `class-${id}` });
    pinLayout(world);
    setWorldLoadout(world, id);
    world.waveState = "idle";
    world.pendingSpawns.length = 0;
    world.bots.length = 0;
    world.player.position = { x: 480, y: 520 };
    world.player.aimDirection = { x: 0, y: -1 };
    return world;
  };

  const fire = (id: keyof typeof LOADOUTS) => {
    const world = start(id);
    stepWorld(world, { ...emptyInput(), firing: true }, 1 / 120);
    return world;
  };

  it("fires the class's own round profile", () => {
    const vanguard = fire("vanguard");
    expect(vanguard.bullets.length).toBe(1);
    expect(vanguard.bullets[0].damage).toBe(LOADOUTS.vanguard.damage);

    const breacher = fire("breacher");
    expect(breacher.bullets.length).toBe(LOADOUTS.breacher.shots);
    expect(breacher.bullets.every((bullet) => bullet.damage === LOADOUTS.breacher.damage)).toBe(true);
    const headings = new Set(breacher.bullets.map((bullet) => Math.round(Math.atan2(bullet.velocity.y, bullet.velocity.x) * 1000)));
    expect(headings.size).toBe(LOADOUTS.breacher.shots);
    expect(Math.max(...breacher.bullets.map((bullet) => bullet.life))).toBeLessThan(LOADOUTS.vanguard.bulletLife);

    const marksman = fire("marksman");
    expect(marksman.bullets.length).toBe(1);
    expect(marksman.bullets[0].damage).toBeGreaterThan(vanguard.bullets[0].damage);
    expect(marksman.bullets[0].pierce).toBe(LOADOUTS.marksman.pierce);

    // A cinder's round is fire that dies on the wall it hits.
    const cinder = fire("cinder");
    expect(cinder.bullets[0].flame).toBe(true);
    expect(cinder.bullets[0].burn).toBeGreaterThan(1);

    // The sapper does not fire bullets at all: it lobs a shell.
    const sapper = fire("sapper");
    expect(sapper.bullets.length).toBe(0);
    expect(sapper.shells.length).toBe(1);
    expect(sapper.shells[0].owner).toBe("player");

    for (const id of ["vanguard", "breacher", "marksman", "ghost"] as const) {
      const world = fire(id);
      expect(world.player.fireCooldown).toBeCloseTo(LOADOUTS[id].fireInterval, 5);
    }
    expect(LOADOUTS.marksman.fireInterval).toBeGreaterThan(PLAYER_FIRE_INTERVAL);
  });

  it("carries the class body into the run", () => {
    for (const id of LOADOUT_ORDER) {
      const world = start(id);
      expect(world.player.maxHealth).toBe(LOADOUTS[id].maxHealth);
      expect(world.player.health).toBe(LOADOUTS[id].maxHealth);
    }
    // Speed is the class's, not the operative baseline.
    const fast = start("ghost");
    const slow = start("breacher");
    const step = (world: typeof fast) => {
      for (let i = 0; i < 30; i += 1) stepWorld(world, { ...emptyInput(), move: { x: 1, y: 0 } }, 1 / 60);
      return world.player.position.x;
    };
    const fastX = step(fast);
    const slowX = step(slow);
    expect(fastX).toBeGreaterThan(slowX);
    expect(fastX).toBeLessThan(480 + PLAYER_SPEED * 1.2);
  });

  it("gives the breacher a dash that knocks a hostile down", () => {
    const world = start("breacher");
    const bot: AgentState = {
      id: 9, kind: "hunter", position: { x: 560, y: 520 }, velocity: { x: 0, y: 0 }, health: 48, maxHealth: 48,
      fireCooldown: 99, windup: 0, windupDuration: 0, windupTurnRate: 2, facing: 0, spawnGuard: 0, strafeSign: 1,
      strafeLock: 0, alive: true, hitFlash: 0, blindTime: 0, pendingRounds: 0, burstTimer: 0, diveTime: 0,
      diveCooldown: 0, detourTime: 0, detourSign: 1, grindTime: 0, stun: 0, chargeTime: 0,
      chargeDirection: { x: 0, y: 0 }, sprayTime: 0
    };
    world.bots.push(bot);
    world.player.moveIntent = { x: 1, y: 0 };
    world.player.dashCooldown = 0;
    stepWorld(world, { ...emptyInput(), move: { x: 1, y: 0 }, dash: true }, 1 / 60);
    expect(bot.stun).toBeGreaterThan(0.5);
    expect(bot.health).toBeLessThan(48);
  });

  it("makes a ghost's dash break a committed telegraph", () => {
    const world = start("ghost");
    const bot: AgentState = {
      id: 11, kind: "hunter", position: { x: 560, y: 520 }, velocity: { x: 0, y: 0 }, health: 60, maxHealth: 60,
      fireCooldown: 0, windup: 0.6, windupDuration: 1, windupTurnRate: 2, facing: Math.PI, spawnGuard: 0, strafeSign: 1,
      strafeLock: 0, alive: true, hitFlash: 0, blindTime: 0, pendingRounds: 0, burstTimer: 0, diveTime: 0,
      diveCooldown: 0, detourTime: 0, detourSign: 1, grindTime: 0, stun: 0, chargeTime: 0,
      chargeDirection: { x: 0, y: 0 }, sprayTime: 0
    };
    world.bots.push(bot);
    world.player.dashCooldown = 0;
    const events = stepWorld(world, { ...emptyInput(), move: { x: 1, y: 0 }, dash: true }, 1 / 60);
    expect(events.some((event) => event.type === "bot-windup-cancel")).toBe(true);
    expect(world.player.phaseTime).toBeGreaterThan(0.2);
    expect(bot.windup).toBe(0);
  });

  it("hands a vanguard a third of its dash back for every kill", () => {
    const total = Math.max(LOADOUTS.vanguard.dashCooldown, DIFFICULTIES.standard.dashCooldown);
    const world = start("vanguard");
    const bot: AgentState = {
      id: 12, kind: "hunter", position: { x: 560, y: 520 }, velocity: { x: 0, y: 0 }, health: 1, maxHealth: 48,
      fireCooldown: 99, windup: 0, windupDuration: 0, windupTurnRate: 2, facing: 0, spawnGuard: 0, strafeSign: 1,
      strafeLock: 0, alive: true, hitFlash: 0, blindTime: 0, pendingRounds: 0, burstTimer: 0, diveTime: 0,
      diveCooldown: 0, detourTime: 0, detourSign: 1, grindTime: 0, stun: 0, chargeTime: 0,
      chargeDirection: { x: 0, y: 0 }, sprayTime: 0
    };
    world.bots.push(bot);
    world.player.dashCooldown = total;
    eliminateBot(world, bot);
    // Paid out of the whole cooldown, not the remainder: one kill is one third.
    expect(world.player.dashCooldown).toBeCloseTo(total * 0.65, 4);
    // And it stops at a full dash rather than running into negative time.
    world.player.dashCooldown = total * 0.2;
    world.bots.push({ ...bot, id: 13, alive: true, health: 1 });
    eliminateBot(world, world.bots[world.bots.length - 1]);
    expect(world.player.dashCooldown).toBe(0);
    // No other class gets it for free.
    for (const id of ["breacher", "marksman", "ghost", "cinder", "sapper"] as const) {
      const other = start(id);
      const spare: AgentState = { ...bot, id: 14 };
      other.bots.push(spare);
      other.player.dashCooldown = total;
      eliminateBot(other, spare);
      expect(other.player.dashCooldown).toBe(total);
    }
  });

  it("lets a marksman bank focus for one heavy piercing round", () => {
    const world = start("marksman");
    // Standing still for the full focus window.
    for (let i = 0; i < 60; i += 1) stepWorld(world, emptyInput(), 1 / 60);
    expect(world.player.focusTime).toBeGreaterThan(0.7);
    const events = stepWorld(world, { ...emptyInput(), firing: true }, 1 / 120);
    expect(events.some((event) => event.type === "player-focus")).toBe(true);
    expect(world.bullets[0].damage).toBeCloseTo(LOADOUTS.marksman.damage * 1.6, 3);
    expect(world.bullets[0].pierce).toBeGreaterThan(LOADOUTS.marksman.pierce);
    // Moving gives the bank back.
    expect(world.player.focusTime).toBe(0);
    stepWorld(world, { ...emptyInput(), move: { x: 1, y: 0 } }, 1 / 60);
    expect(world.player.focusTime).toBe(0);
    // And a fresh shot without focus is the plain round.
    world.player.fireCooldown = 0;
    stepWorld(world, { ...emptyInput(), firing: true }, 1 / 120);
    const plain = world.bullets[world.bullets.length - 1];
    expect(plain.damage).toBe(LOADOUTS.marksman.damage);
  });

  it("lights hostiles up with a cinder and lets them burn down", () => {
    const world = start("cinder");
    const bot: AgentState = {
      id: 12, kind: "splitter", position: { x: 520, y: 520 }, velocity: { x: 0, y: 0 }, health: 46, maxHealth: 46,
      fireCooldown: 99, windup: 0, windupDuration: 0, windupTurnRate: 2, facing: 0, spawnGuard: 0, strafeSign: 1,
      strafeLock: 0, alive: true, hitFlash: 0, blindTime: 0, pendingRounds: 0, burstTimer: 0, diveTime: 0,
      diveCooldown: 0, detourTime: 0, detourSign: 1, grindTime: 0, stun: 0, chargeTime: 0,
      chargeDirection: { x: 0, y: 0 }, sprayTime: 0
    };
    world.bots.push(bot);
    world.player.aimDirection = { x: 1, y: 0 };
    const eastward = () => ({ ...emptyInput(), aim: { x: world.player.position.x + 200, y: world.player.position.y } });
    stepWorld(world, { ...eastward(), firing: true }, 1 / 60);
    // Let the flame reach the target before asking whether it caught.
    for (let i = 0; i < 30; i += 1) stepWorld(world, eastward(), 1 / 60);
    expect(bot.burn).toBeGreaterThan(1);
    const healthAfterHit = bot.health;
    for (let i = 0; i < 60; i += 1) stepWorld(world, emptyInput(), 1 / 60);
    expect(bot.health).toBeLessThan(healthAfterHit);
  });

  it("clears a ring of hostiles with the sapper's shell", () => {
    const world = start("sapper");
    const bots: AgentState[] = [
      { id: 21, x: 890, y: 520 },
      { id: 22, x: 896, y: 516 },
      { id: 23, x: 300, y: 200 }
    ].map((entry) => ({
      id: entry.id, kind: "hunter" as const, position: { x: entry.x, y: entry.y }, velocity: { x: 0, y: 0 },
      health: 120, maxHealth: 120, fireCooldown: 99, windup: 0, windupDuration: 0, windupTurnRate: 2, facing: 0,
      spawnGuard: 0, strafeSign: 1, strafeLock: 0, alive: true, hitFlash: 0, blindTime: 0, pendingRounds: 0,
      burstTimer: 0, diveTime: 0, diveCooldown: 0, detourTime: 0, detourSign: 1, grindTime: 0, stun: 0,
      chargeTime: 0, chargeDirection: { x: 0, y: 0 }, sprayTime: 0
    }));
    world.bots.push(...bots);
    // Held in place so the test measures the blast, not how far a hunter walked.
    for (const bot of bots) bot.stun = 6;
    world.player.aimDirection = { x: 1, y: 0 };
    const aim = { ...emptyInput(), aim: { x: world.player.position.x + 400, y: world.player.position.y } };
    stepWorld(world, { ...aim, firing: true }, 1 / 60);
    expect(world.shells.length).toBe(1);
    for (let i = 0; i < 90; i += 1) stepWorld(world, aim, 1 / 60);
    expect(world.shells.length).toBe(0);
    expect(bots[0].health).toBeLessThan(120);
    expect(bots[1].health).toBeLessThan(120);
    // Out of the ring is out of the blast.
    expect(bots[2].health).toBe(120);
  });

  it("scales damage by the class and never by a stored id", () => {
    const world = createWorld({ seed: "class-guard" });
    expect(setWorldLoadout(world, "nonsense").id).toBe(DEFAULT_LOADOUT);
    expect(setWorldLoadout(world, "marksman").id).toBe("marksman");
    expect(setWorldLoadout(world, "rifle").id).toBe("vanguard");
  });

  it("keeps a class swap from healing the operative for free", () => {
    const world = start("vanguard");
    world.player.health = 50;
    setWorldLoadout(world, "breacher");
    expect(world.player.maxHealth).toBe(LOADOUTS.breacher.maxHealth);
    expect(world.player.health).toBeLessThan(LOADOUTS.breacher.maxHealth);
    expect(world.player.health).toBeGreaterThan(1);
  });

  it("counts a burn tick as real damage on the profile", () => {
    const world = start("cinder");
    const bot: AgentState = {
      id: 31, kind: "hunter", position: { x: 600, y: 520 }, velocity: { x: 0, y: 0 }, health: 48, maxHealth: 48,
      fireCooldown: 99, windup: 0, windupDuration: 0, windupTurnRate: 2, facing: 0, spawnGuard: 0, strafeSign: 1,
      strafeLock: 0, alive: true, hitFlash: 0, blindTime: 0, pendingRounds: 0, burstTimer: 0, diveTime: 0,
      diveCooldown: 0, detourTime: 0, detourSign: 1, grindTime: 0, stun: 0, chargeTime: 0,
      chargeDirection: { x: 0, y: 0 }, sprayTime: 0
    };
    world.bots.push(bot);
    const before = world.stats.damageDealt;
    damageBot(world, bot, 10, bot.position, "shell");
    expect(world.stats.damageDealt).toBe(before + 10);
    expect(bot.health).toBe(38);
  });
});
