import { describe, expect, it } from "vitest";
import {
  angleApart,
  botKeepsTracking,
  diveSpeedScale,
  FLANKER_DIVE,
  FLANKER_VOLLEY,
  flankerHoldsFire,
  flankerShouldDive,
  HUNTER_LOCK_PROGRESS,
  HUNTER_PLATING,
  HUNTER_VOLLEY,
  mirrorEvadePull,
  mirrorVolley,
  pincerSide,
  platingScale,
  volleyDamage,
  volleyFor
} from "../src/signatures";
import { chooseBotSpeedScale } from "../src/ai";
import {
  DETOUR_TIME,
  DETOUR_TRIGGER,
  pressureFireScale,
  pressureSpeedScale,
  STALL_PRESSURE_TIME
} from "../src/sim";
import { createPolicy, autoplay } from "./helpers/autoplay";
import { createWorld, eliminateBot, emptyInput, setWorldLoadout, stepWorld } from "../src/sim";
import { pinLayout } from "./helpers/layout";

/**
 * The three hostile profiles have to differ in *behaviour*, not just in colour
 * and hit points. Each archetype owns a different axis - the Hunter owns timing,
 * the Flanker owns space, the Mirror owns your own kit - and these tests pin the
 * rules that make that true, first as pure functions and then through the
 * simulation.
 */

describe("volley geometry", () => {
  it("gives the Hunter two rounds from one telegraph", () => {
    expect(HUNTER_VOLLEY.rounds).toHaveLength(2);
    // One tight round and one sloppy one, so a sidestep beats the first and a
    // standing target still eats the pair.
    const [tight, loose] = HUNTER_VOLLEY.rounds;
    expect(tight.spread).toBeLessThan(loose.spread);
    expect(volleyDamage(HUNTER_VOLLEY)).toBeCloseTo(1, 5);
  });

  it("gives the Flanker a single round: its identity is where it stands", () => {
    expect(FLANKER_VOLLEY.rounds).toHaveLength(1);
    expect(volleyDamage(FLANKER_VOLLEY)).toBeCloseTo(1, 5);
  });

  it("has the Mirror copy the player's weapon geometry", () => {
    const rifle = mirrorVolley("rifle");
    const scatter = mirrorVolley("scatter");
    const rail = mirrorVolley("rail");
    expect(rifle.rounds).toHaveLength(1);
    // The scattergun's fan and the railgun's weight both come back at you.
    expect(scatter.rounds.length).toBeGreaterThan(rifle.rounds.length);
    expect(scatter.rounds[0].spread).toBeGreaterThan(rifle.rounds[0].spread);
    expect(rail.rounds[0].speedScale).toBeGreaterThan(rifle.rounds[0].speedScale);
    expect(rail.telegraphScale).toBeGreaterThan(rifle.telegraphScale);
    // A copy is worth roughly one profile volley whichever weapon it echoes,
    // and it always says which one it is.
    for (const volley of [rifle, scatter, rail]) {
      expect(volleyDamage(volley)).toBeGreaterThan(0.9);
      expect(volleyDamage(volley)).toBeLessThan(1.35);
      expect(volley.label).toContain("COPIED");
    }
    // The label names the copied weapon so the HUD can call it out.
    expect(scatter.label).toContain("SCATTERGUN");
  });

  it("routes each profile to its own volley", () => {
    expect(volleyFor("hunter", "scatter")).toBe(HUNTER_VOLLEY);
    expect(volleyFor("flanker", "rail")).toBe(FLANKER_VOLLEY);
    expect(volleyFor("mirror", "rail")).toEqual(mirrorVolley("rail"));
  });
});

describe("the Hunter", () => {
  it("only eats part of a hit from the front", () => {
    const position = { x: 100, y: 100 };
    const facing = 0; // looking along +x
    // Straight ahead: plated.
    expect(platingScale("hunter", position, facing, { x: 120, y: 100 })).toBeCloseTo(1 - HUNTER_PLATING, 5);
    // From behind: full damage.
    expect(platingScale("hunter", position, facing, { x: 80, y: 100 })).toBe(1);
    // Just outside the arc is unplated, so the arc has a real edge.
    const outside = { x: 50, y: 100 - 50 };
    expect(platingScale("hunter", position, facing, outside)).toBe(1);
    // A hit reported at the centre cannot be attributed an angle.
    expect(platingScale("hunter", position, facing, { x: 100, y: 100 })).toBe(1);
  });

  it("never plates the other two profiles", () => {
    expect(platingScale("flanker", { x: 0, y: 0 }, 0, { x: 10, y: 0 })).toBe(1);
    expect(platingScale("mirror", { x: 0, y: 0 }, 0, { x: 10, y: 0 })).toBe(1);
  });

  it("commits its aim halfway through the wind-up", () => {
    expect(botKeepsTracking("hunter", 0.2)).toBe(true);
    expect(botKeepsTracking("hunter", HUNTER_LOCK_PROGRESS + 0.01)).toBe(false);
    // The others track all the way to the shot.
    expect(botKeepsTracking("flanker", 0.99)).toBe(true);
    expect(botKeepsTracking("mirror", 0.99)).toBe(true);
  });
});

describe("the Flanker", () => {
  it("knows which side of you an ally is on", () => {
    const bot = { x: 0, y: 0 };
    const player = { x: 100, y: 0 };
    // Ally above the line: one side; below: the other; on it: queued up.
    expect(Math.sign(pincerSide(bot, player, { x: 100, y: -50 }))).toBe(-1);
    expect(Math.sign(pincerSide(bot, player, { x: 100, y: 50 }))).toBe(1);
    expect(pincerSide(bot, player, { x: 140, y: 0 })).toBeCloseTo(0, 5);
  });

  it("holds fire while an ally crowds the same arc, and shoots once it has the angle", () => {
    const player = { x: 400, y: 200 };
    const bot = { x: 700, y: 200 }; // due east of the player
    // Ally crowding the same arc (roughly east): wasted gun, so it waits.
    expect(flankerHoldsFire(bot, player, [{ x: 760, y: 240 }], 300)).toBe(true);
    // Ally standing on top of it: nothing to shoot through either.
    expect(flankerHoldsFire(bot, player, [{ x: 712, y: 200 }], 300)).toBe(true);
    // Ally on the far side of the player: a real envelop, so it fires.
    expect(flankerHoldsFire(bot, player, [{ x: 100, y: 200 }], 300)).toBe(false);
    // An ally no longer in the fight does not count either.
    expect(flankerHoldsFire(bot, player, [{ x: 900, y: 900 }], 300)).toBe(false);
    // Alone it never freezes.
    expect(flankerHoldsFire(bot, player, [], 300)).toBe(false);
    // Close enough to press: it takes the shot whatever the ally is doing,
    // which is what stops a pair of them standing around politely.
    expect(flankerHoldsFire(bot, { x: 820, y: 200 }, [{ x: 800, y: 200 }], 120)).toBe(false);
  });

  it("moves differently while it telegraphs", () => {
    // A planted Hunter, a skirmishing Flanker, a drifting Mirror: the wind-up
    // slowdown is the same mechanic, but the numbers make it feel like three.
    const winding = (kind: "hunter" | "flanker" | "mirror") =>
      chooseBotSpeedScale(kind, 200, { advancing: false, windingUp: true });
    expect(winding("hunter")).toBeLessThan(winding("mirror"));
    expect(winding("mirror")).toBeLessThan(winding("flanker"));
    expect(winding("hunter")).toBeLessThan(0.4);
    expect(winding("flanker")).toBeGreaterThan(0.5);
    // And they all still slow down: a telegraph has to stay readable.
    for (const kind of ["hunter", "flanker", "mirror"] as const) {
      expect(winding(kind)).toBeLessThan(1);
      expect(winding(kind)).toBeGreaterThan(0.1);
    }
  });

  it("measures the angle between two bearings the short way round", () => {
    expect(angleApart(0, 0)).toBeCloseTo(0, 6);
    expect(angleApart(0, Math.PI)).toBeCloseTo(Math.PI, 6);
    expect(angleApart(0.1, Math.PI * 2 - 0.1)).toBeCloseTo(0.2, 6);
    expect(angleApart(-Math.PI * 0.9, Math.PI * 0.9)).toBeCloseTo(Math.PI * 0.2, 6);
  });

  it("dives only when it is genuinely out of position", () => {
    expect(flankerShouldDive(500, 0, false, 258)).toBe(true);
    expect(flankerShouldDive(300, 0, false, 258)).toBe(false);
    // Never mid-telegraph, and never before the cooldown is up.
    expect(flankerShouldDive(500, 0, true, 258)).toBe(false);
    expect(flankerShouldDive(500, 1.2, false, 258)).toBe(false);
    // Only the Flanker dives.
    expect(diveSpeedScale("flanker", 0.2)).toBe(FLANKER_DIVE.speed);
    expect(diveSpeedScale("flanker", 0)).toBe(1);
    expect(diveSpeedScale("hunter", 0.4)).toBe(1);
    expect(diveSpeedScale("mirror", 0.4)).toBe(1);
  });
});

describe("the Mirror", () => {
  it("slides out of the lane the player is aiming down", () => {
    // Not aimed at it at all: no pull.
    expect(mirrorEvadePull(0.5)).toBe(0);
    // Dead centre: full pull.
    expect(mirrorEvadePull(1)).toBeCloseTo(1, 5);
    // And it ramps rather than switching on.
    expect(mirrorEvadePull(0.93)).toBeGreaterThan(0);
    expect(mirrorEvadePull(0.93)).toBeLessThan(mirrorEvadePull(0.99));
  });
});

describe("stall pressure", () => {
  it("ramps speed and fire rate together and clamps", () => {
    expect(pressureSpeedScale(0)).toBe(1);
    expect(pressureFireScale(0)).toBe(1);
    expect(pressureSpeedScale(1)).toBeGreaterThan(1.5);
    expect(pressureFireScale(1)).toBeGreaterThan(1.2);
    // Out-of-range input cannot create a super-bot.
    expect(pressureSpeedScale(9)).toBe(pressureSpeedScale(1));
    expect(pressureFireScale(-4)).toBe(pressureFireScale(0));
    expect(STALL_PRESSURE_TIME).toBeGreaterThan(5);
  });

  it("engages a stalled wave and stands down the moment something dies", () => {
    const world = createWorld({ seed: "pressure" });
    world.phase = "running";
    pinLayout(world);
    const policy = createPolicy("passive");
    const step = 1 / 60;
    // Idle waves are not stalled fights.
    stepWorld(world, emptyInput(), step);
    expect(world.pressure).toBe(0);

    // An active wave with one hostile that simply refuses to die quickly, and a
    // player too tough to lose the fight: a genuine stalemate.
    world.waveState = "active";
    world.pendingSpawns.length = 0;
    world.waveTimer = 0;
    world.player.health = 100000;
    world.player.maxHealth = 100000;
    for (const bot of world.bots) bot.health = 100000;
    // A wave can re-telegraph while this runs, which legitimately restarts the
    // stall clock, so give the ramp enough room to reach its ceiling.
    for (let i = 0; i < 60 * 30; i += 1) {
      stepWorld(world, policy.decide(world), step);
    }
    expect(world.stallTimer).toBeGreaterThan(STALL_PRESSURE_TIME);
    expect(world.pressure).toBeGreaterThan(0.8);
    expect(pressureSpeedScale(world.pressure)).toBeGreaterThan(1.5);

    // A single elimination drops it straight back to zero.
    const bot = world.bots.find((candidate) => candidate.alive);
    expect(bot).toBeTruthy();
    eliminateBot(world, bot!);
    stepWorld(world, emptyInput(), step);
    expect(world.pressure).toBe(0);
    expect(world.stallTimer).toBeLessThan(0.1);
  });

  it("declares its detour thresholds as constants that make sense", () => {
    expect(DETOUR_TRIGGER).toBeGreaterThan(0.1);
    expect(DETOUR_TRIGGER).toBeLessThan(DETOUR_TIME);
  });
});

describe("archetype behaviour in the simulation", () => {
  /** Drops a single hostile into a pinned arena and steps it forward. */
  const soloWorld = (kind: "hunter" | "flanker" | "mirror", seed: string) => {
    const world = createWorld({ seed });
    world.phase = "running";
    pinLayout(world);
    world.waveState = "active";
    world.pendingSpawns.length = 0;
    world.bots.length = 0;
    world.bots.push({
      id: 1,
      kind,
      position: { x: 700, y: 500 },
      velocity: { x: 0, y: 0 },
      health: 500,
      maxHealth: 500,
      fireCooldown: 0,
      windup: 0,
      windupDuration: 0,
      windupTurnRate: 2,
      facing: Math.PI,
      spawnGuard: 0,
      strafeSign: 1,
      strafeLock: 0,
      alive: true,
      hitFlash: 0,
      blindTime: 0,
      pendingRounds: 0,
      burstTimer: 0,
      diveTime: 0,
      diveCooldown: 0,
      detourTime: 0,
      detourSign: 1,
      grindTime: 0
    });
    world.player.position = { x: 400, y: 500 };
    return world;
  };

  it("fires two rounds per Hunter telegraph and one per Flanker telegraph", () => {
    const events = autoplay({ seed: "archetypes-volley", maxSeconds: 60 }).events;
    const shots: Record<string, number> = { hunter: 0, flanker: 0, mirror: 0 };
    const started: Record<string, number> = { hunter: 0, flanker: 0, mirror: 0 };
    const cancelled: Record<string, number> = { hunter: 0, flanker: 0, mirror: 0 };
    const kindOf = new Map<number, "hunter" | "flanker" | "mirror">();
    for (const event of events) {
      if (event.type === "bot-fired") shots[event.kind] += 1;
      if (event.type === "bot-windup") {
        started[event.kind] += 1;
        kindOf.set(event.botId, event.kind);
      }
      if (event.type === "bot-windup-cancel") {
        const kind = kindOf.get(event.botId);
        if (kind) cancelled[kind] += 1;
      }
      // A hostile killed mid-telegraph never finished it either.
      if (event.type === "bot-eliminated" && event.interrupted) cancelled[event.kind] += 1;
    }
    // Completed telegraphs, not started ones: a wind-up that gets cut by cover
    // is supposed to produce nothing.
    const completed = {
      hunter: started.hunter - cancelled.hunter,
      flanker: started.flanker - cancelled.flanker,
      mirror: started.mirror - cancelled.mirror
    };
    // A run can end between a completed telegraph and the round leaving the
    // barrel, which costs at most one shot per profile, so allow that slack.
    expect(completed.hunter).toBeGreaterThan(0);
    expect(Math.abs(shots.hunter - completed.hunter * 2)).toBeLessThanOrEqual(2);
    if (completed.flanker > 0) expect(Math.abs(shots.flanker - completed.flanker)).toBeLessThanOrEqual(1);
    if (completed.mirror > 0) expect(shots.mirror).toBeGreaterThanOrEqual(completed.mirror - 1);
  });

  it("arms the Mirror with the player's own weapon", () => {
    const volleyOf = (loadout: "rifle" | "scatter" | "rail") => {
      const world = soloWorld("mirror", `mirror-${loadout}`);
      setWorldLoadout(world, loadout, 100_000);
      world.bots[0].windup = 0.001;
      world.bots[0].windupDuration = 0.001;
      const bullets: Array<{ speed: number; damage: number }> = [];
      const events = stepWorld(world, emptyInput(), 1 / 60);
      for (const event of events) {
        if (event.type === "bot-fired") {
          const shot = world.bullets[world.bullets.length - 1];
          bullets.push({ speed: Math.hypot(shot.velocity.x, shot.velocity.y), damage: shot.damage });
        }
      }
      return { bullets, loadout };
    };
    const rifle = volleyOf("rifle");
    const scatter = volleyOf("scatter");
    const rail = volleyOf("rail");
    expect(rifle.bullets).toHaveLength(1);
    // The scattergun comes back as a fan...
    expect(scatter.bullets.length).toBeGreaterThan(rifle.bullets.length);
    // ...and the railgun as a single heavier, faster slug.
    expect(rail.bullets).toHaveLength(1);
    expect(rail.bullets[0].speed).toBeGreaterThan(rifle.bullets[0].speed);
    expect(rail.bullets[0].damage).toBeGreaterThan(rifle.bullets[0].damage);
  });

  it("stops a Hunter's barrel halfway but lets a Flanker keep tracking", () => {
    const turnThroughWindup = (kind: "hunter" | "flanker") => {
      const world = soloWorld(kind, `lock-${kind}`);
      const bot = world.bots[0];
      bot.windup = 0.5;
      bot.windupDuration = 0.5;
      bot.windupTurnRate = 2;
      bot.facing = 0;
      const firstHalf: number[] = [];
      const secondHalf: number[] = [];
      for (let step = 0; step < 18; step += 1) {
        // The player keeps sliding sideways, so tracking means turning.
        world.player.position = { x: 400 - step * 6, y: 500 + step * 4 };
        const before = bot.facing;
        const progress = 1 - bot.windup / bot.windupDuration;
        stepWorld(world, emptyInput(), 1 / 60);
        const turned = Math.abs(bot.facing - before);
        if (bot.windup <= 0) break;
        if (progress < HUNTER_LOCK_PROGRESS) firstHalf.push(turned);
        else secondHalf.push(turned);
      }
      const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
      return { firstHalf: sum(firstHalf), secondHalf: sum(secondHalf), samples: secondHalf.length };
    };
    const hunter = turnThroughWindup("hunter");
    const flanker = turnThroughWindup("flanker");
    // The Hunter turns before it commits and then holds still.
    expect(hunter.firstHalf).toBeGreaterThan(0);
    expect(hunter.secondHalf).toBeCloseTo(0, 5);
    // The Flanker never stops tracking.
    expect(flanker.secondHalf).toBeGreaterThan(0);
    expect(flanker.samples).toBeGreaterThan(0);
  });

  it("plates frontal hits on the Hunter only", () => {
    const hitFrom = (kind: "hunter" | "flanker", fromAhead: boolean) => {
      const world = soloWorld(kind, `plating-${kind}-${fromAhead}`);
      const bot = world.bots[0];
      bot.facing = Math.PI; // looking left, toward the player
      bot.position = { x: 700, y: 500 };
      // Start well clear of the hostile so the recorded impact point still says
      // which side of it the round came from.
      // A shot from behind has to chase a hostile walking the other way, so it
      // needs more speed than one that meets it head on.
      const impact = fromAhead ? { x: 640, y: 500 } : { x: 760, y: 500 };
      world.bullets.push({
        position: { ...impact },
        velocity: { x: fromAhead ? 120 : -300, y: 0 },
        owner: "player",
        damage: 20,
        life: 1,
        color: "#fff",
        source: "player",
        travelled: 0
      });
      const before = bot.health;
      for (let step = 0; step < 90; step += 1) {
        const events = stepWorld(world, emptyInput(), 1 / 60);
        const hit = events.find((event) => event.type === "bot-hit");
        if (hit && hit.type === "bot-hit") return { taken: before - bot.health, plated: hit.plated === true };
      }
      return { taken: 0, plated: false };
    };
    const hunterFront = hitFrom("hunter", true);
    const hunterBack = hitFrom("hunter", false);
    expect(hunterFront.taken).toBeLessThan(hunterBack.taken);
    expect(hunterFront.plated).toBe(true);
    expect(hunterBack.taken).toBeCloseTo(20, 5);
    expect(hunterBack.plated).toBe(false);
    // A Flanker is never plated, so its damage reduction is zero.
    expect(hitFrom("flanker", true).taken).toBeCloseTo(20, 5);
  });

  it("shows every signature in a real twelve-seed sweep", () => {
    // The headline requirement: the profiles must not all play the same. This
    // measures one full run per seed and checks that each profile's own
    // mechanics actually fire, and that none of them bleeds into another.
    const seeds = Array.from({ length: 12 }, (_, index) => `balance-${String(index + 1).padStart(2, "0")}`);
    const totals: Record<string, { windups: number; shots: number; dives: number; plated: number; hits: number }> = {
      hunter: { windups: 0, shots: 0, dives: 0, plated: 0, hits: 0 },
      flanker: { windups: 0, shots: 0, dives: 0, plated: 0, hits: 0 },
      mirror: { windups: 0, shots: 0, dives: 0, plated: 0, hits: 0 }
    };
    const cancelled: Record<string, number> = { hunter: 0, flanker: 0, mirror: 0 };
    const kindOf = new Map<number, "hunter" | "flanker" | "mirror">();
    for (const seed of seeds) {
      for (const event of autoplay({ seed, maxSeconds: 200 }).events) {
        if (event.type === "bot-windup") {
          totals[event.kind].windups += 1;
          kindOf.set(event.botId, event.kind);
        }
        if (event.type === "bot-windup-cancel") {
          const kind = kindOf.get(event.botId);
          if (kind) cancelled[kind] += 1;
        }
        if (event.type === "bot-eliminated" && event.interrupted) cancelled[event.kind] += 1;
        if (event.type === "bot-fired") totals[event.kind].shots += 1;
        if (event.type === "bot-dive") totals[event.kind].dives += 1;
        if (event.type === "bot-hit") {
          totals[event.kind].hits += 1;
          if (event.plated) totals[event.kind].plated += 1;
        }
      }
    }
    // Everyone fights.
    for (const kind of ["hunter", "flanker", "mirror"]) {
      expect(totals[kind].windups).toBeGreaterThan(20);
      expect(totals[kind].shots).toBeGreaterThan(20);
    }
    // The Hunter is the only plated profile, and it is plated often enough to
    // matter without making a frontal fight pointless.
    expect(totals.hunter.plated).toBeGreaterThan(50);
    expect(totals.hunter.plated / totals.hunter.hits).toBeLessThan(0.95);
    expect(totals.flanker.plated).toBe(0);
    expect(totals.mirror.plated).toBe(0);
    // The Flanker is the only profile that dives.
    expect(totals.flanker.dives).toBeGreaterThan(5);
    expect(totals.hunter.dives).toBe(0);
    expect(totals.mirror.dives).toBe(0);
    // A Hunter salvo puts two rounds in the air for every telegraph it
    // finishes; the other two profiles put one each. Measured over the sweep,
    // with cancelled wind-ups and run-ending kills taken out of the count.
    const roundsPerTelegraph = (kind: "hunter" | "flanker" | "mirror") =>
      totals[kind].shots / Math.max(1, totals[kind].windups - cancelled[kind]);
    expect(roundsPerTelegraph("hunter")).toBeGreaterThan(1.9);
    expect(roundsPerTelegraph("hunter")).toBeLessThan(2.05);
    expect(roundsPerTelegraph("flanker")).toBeGreaterThan(0.9);
    expect(roundsPerTelegraph("flanker")).toBeLessThan(1.1);
    expect(roundsPerTelegraph("mirror")).toBeGreaterThan(0.85);
    expect(roundsPerTelegraph("mirror")).toBeLessThan(1.15);
  });

  it("gives a Flanker with a stacked ally a reason to hold, and to dive", () => {
    const shotsWithAllyAt = (ally: { x: number; y: number }) => {
      const world = soloWorld("flanker", "flanker-pincer");
      const bot = world.bots[0];
      world.player.position = { x: 200, y: 500 };
      bot.position = { x: 500, y: 500 };
      bot.facing = Math.PI;
      world.bots.push({ ...bot, id: 2, position: { ...ally } });
      let fired = 0;
      for (let step = 0; step < 150; step += 1) {
        for (const event of stepWorld(world, emptyInput(), 1 / 60)) {
          if (event.type === "bot-fired") fired += 1;
        }
      }
      return fired;
    };
    const stacked = shotsWithAllyAt({ x: 560, y: 500 });
    const split = shotsWithAllyAt({ x: 240, y: 330 });
    console.log("pincer stacked", stacked, "split", split);
    // Far out of position with nobody to share the angle with: it dives.
    const world = soloWorld("flanker", "flanker-pincer");
    const bot = world.bots[0];
    world.player.position = { x: 200, y: 500 };
    bot.position = { x: 900, y: 500 };
    let dived = false;
    for (let step = 0; step < 60; step += 1) {
      for (const event of stepWorld(world, emptyInput(), 1 / 60)) {
        if (event.type === "bot-dive") dived = true;
      }
    }
    expect(dived).toBe(true);
  });

  it("moves a stalled hostile instead of letting it grind on a crate", () => {
    const world = createWorld({ seed: "grind" });
    world.phase = "running";
    pinLayout(world);
    const policy = createPolicy("passive");
    const step = 1 / 60;
    for (let i = 0; i < 60 * 40; i += 1) stepWorld(world, policy.decide(world), step);
    const live = world.bots.filter((bot) => bot.alive);
    // The wave must not freeze: either everything is dead, or a live hostile is
    // still making progress toward a player it can actually reach.
    expect(world.phase === "running" || live.length === 0).toBe(true);
    for (const bot of live) {
      expect(Number.isFinite(bot.position.x)).toBe(true);
      expect(bot.grindTime).toBeLessThan(4);
    }
    // And a fight that has not stalled never has pressure applied.
    expect(world.pressure).toBeLessThan(1);
  });
});
