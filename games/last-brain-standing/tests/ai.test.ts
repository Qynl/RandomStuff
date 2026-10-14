import { describe, expect, it } from "vitest";
import {
  BOT_PROFILES,
  applySeparation,
  chooseBotDirection,
  chooseBotMovement,
  chooseBotSpeedScale,
  detectFiringHabit,
  detectMovementHabit,
  distance,
  evaluateBotFire,
  nearestAlly,
  normalize,
  predictIntercept,
  preferredStrafeSign,
  rankTargetsByAim,
  rotateToward,
  shouldBotFire,
  summarizeMirrorRead,
  windupAimPoint,
  windupDuration,
  windupTurnRate
} from "../src/ai";
import type { PlayerTelemetry } from "../src/types";

const telemetry = (): PlayerTelemetry => ({
  recentDirections: [],
  recentShots: [],
  stationaryTime: 0,
  lastMoveDirection: { x: 1, y: 0 }
});

describe("AI movement primitives", () => {
  it("normalizes vectors without changing their direction", () => {
    expect(normalize({ x: 3, y: 4 })).toEqual({ x: 0.6, y: 0.8 });
  });

  it("returns a zero vector for zero input", () => {
    expect(normalize({ x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
  });

  it("measures distance between positions", () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });

  it("gives each bot a valid movement direction", () => {
    for (const kind of ["hunter", "flanker", "mirror"] as const) {
      const direction = chooseBotDirection({ kind, position: { x: 100, y: 100 }, strafeSign: 1 }, { x: 400, y: 300 }, telemetry(), 1);
      expect(Number.isFinite(direction.x)).toBe(true);
      expect(Number.isFinite(direction.y)).toBe(true);
      expect(Math.hypot(direction.x, direction.y)).toBeCloseTo(1);
    }
  });

  it("does not let bots fire through a cooldown or across extreme distances", () => {
    expect(shouldBotFire("hunter", 100, 0.1, telemetry())).toBe(false);
    expect(shouldBotFire("hunter", 900, 0, telemetry())).toBe(false);
  });

  it("makes the Mirror respond to repeated player movement", () => {
    const cautious = telemetry();
    const habitual = telemetry();
    habitual.recentDirections = Array.from({ length: 8 }, () => ({ x: 1, y: 0 }));
    const bot = { kind: "mirror" as const, position: { x: 200, y: 300 }, strafeSign: 1 };
    const player = { x: 500, y: 300 };
    const cautiousDirection = chooseBotDirection(bot, player, cautious, 2);
    const habitualDirection = chooseBotDirection(bot, player, habitual, 2);
    expect(habitualDirection.x).not.toBeCloseTo(cautiousDirection.x, 2);
  });
});

describe("habit detection", () => {
  it("stays neutral until there are enough samples", () => {
    expect(detectMovementHabit([]).strength).toBe(0);
    expect(detectMovementHabit([{ x: 1, y: 0 }, { x: 1, y: 0 }]).strength).toBe(0);
  });

  it("reads a sustained straight line as a habit", () => {
    const reading = detectMovementHabit(Array.from({ length: 10 }, () => ({ x: 1, y: 0 })));
    expect(reading.strength).toBeGreaterThan(0.8);
    expect(reading.direction.x).toBeCloseTo(1, 3);
  });

  it("does not read oscillating movement as a habit", () => {
    const alternating = Array.from({ length: 12 }, (_, index) => (index % 2 ? { x: 1, y: 0 } : { x: -1, y: 0 }));
    expect(detectMovementHabit(alternating).strength).toBe(0);
  });

  it("reads a repeated firing lane", () => {
    const reading = detectFiringHabit(Array.from({ length: 6 }, () => ({ x: 0.7, y: -0.7 })));
    expect(reading.strength).toBeGreaterThan(0.5);
    expect(reading.direction.y).toBeLessThan(0);
  });

  it("ignores a couple of scattered shots", () => {
    expect(detectFiringHabit([{ x: 1, y: 0 }, { x: 0, y: 1 }]).strength).toBe(0);
  });
});

describe("interception and aiming", () => {
  it("leads a moving target but never further than the cap", () => {
    const target = { x: 300, y: 300 };
    const velocity = { x: 200, y: 0 };
    const close = predictIntercept({ x: 200, y: 300 }, target, velocity, 400, 0.5);
    expect(close.x).toBeGreaterThan(target.x);
    const far = predictIntercept({ x: 0, y: 300 }, target, velocity, 400, 0.2);
    expect(far.x).toBeCloseTo(target.x + 40, 5);
  });

  it("rotates toward a target at a bounded rate", () => {
    const rotated = rotateToward({ x: 1, y: 0 }, { x: 0, y: 1 }, 0.25);
    expect(Math.atan2(rotated.y, rotated.x)).toBeCloseTo(0.25, 4);
    const full = rotateToward({ x: 1, y: 0 }, { x: 0, y: 1 }, 3);
    expect(full.x).toBeCloseTo(0, 4);
    expect(full.y).toBeCloseTo(1, 4);
  });

  it("lets the Hunter lead more than the Flanker", () => {
    const velocity = { x: 240, y: 0 };
    const botPosition = { x: 100, y: 300 };
    const player = { x: 400, y: 300 };
    const hunterAim = windupAimPoint("hunter", botPosition, player, velocity, 330, telemetry());
    const flankerAim = windupAimPoint("flanker", botPosition, player, velocity, 330, telemetry());
    expect(hunterAim.x - player.x).toBeGreaterThan(flankerAim.x - player.x);
  });

  it("scales the Mirror's lead with how predictable the player is", () => {
    const velocity = { x: 200, y: 0 };
    const botPosition = { x: 100, y: 300 };
    const player = { x: 400, y: 300 };
    const erratic = telemetry();
    const habitual = telemetry();
    habitual.recentDirections = Array.from({ length: 10 }, () => ({ x: 1, y: 0 }));
    const erraticLead = windupAimPoint("mirror", botPosition, player, velocity, 350, erratic).x;
    const habitualLead = windupAimPoint("mirror", botPosition, player, velocity, 350, habitual).x;
    expect(habitualLead).toBeGreaterThan(erraticLead);
  });

  it("ranks targets by alignment with the aim ray", () => {
    const ranked = rankTargetsByAim({ x: 0, y: 0 }, { x: 1, y: 0 }, [
      { id: 1, position: { x: 100, y: 40 } },
      { id: 2, position: { x: 100, y: 3 } },
      { id: 3, position: { x: -100, y: 0 } }
    ]);
    expect(ranked[0]).toBe(2);
    expect(ranked).not.toContain(3);
  });
});

describe("crowd separation", () => {
  it("pushes a bot away from an ally it is standing on", () => {
    const separated = applySeparation({ x: 1, y: 0 }, { x: 100, y: 100 }, { player: { x: 0, y: 0 }, allies: [{ x: 100, y: 96 }] });
    expect(separated.y).toBeGreaterThan(0.2);
    expect(Math.hypot(separated.x, separated.y)).toBeCloseTo(1, 4);
    // An ally directly behind the desired heading keeps the heading, just normalised.
    const behind = applySeparation({ x: 1, y: 0 }, { x: 100, y: 100 }, { player: { x: 0, y: 0 }, allies: [{ x: 60, y: 100 }] });
    expect(behind.x).toBeCloseTo(1, 4);
    expect(behind.y).toBeCloseTo(0, 4);
  });

  it("leaves the direction alone when nobody is nearby", () => {
    const separated = applySeparation({ x: 0, y: 1 }, { x: 100, y: 100 }, { player: { x: 0, y: 0 }, allies: [{ x: 600, y: 100 }] });
    expect(separated.x).toBeCloseTo(0, 5);
    expect(separated.y).toBeCloseTo(1, 5);
  });
});

describe("fire discipline", () => {
  it("refuses to fire without a line of sight", () => {
    const intent = evaluateBotFire("hunter", 120, 0, telemetry(), { hasLineOfSight: false });
    expect(intent.shouldFire).toBe(false);
  });

  it("refuses to fire while it has been blind for a while", () => {
    expect(evaluateBotFire("hunter", 120, 0, telemetry(), { blindTime: 0.6 }).shouldFire).toBe(false);
  });

  it("makes the Mirror commit when the player stands still", () => {
    const still = telemetry();
    still.stationaryTime = 2.5;
    expect(evaluateBotFire("mirror", 300, 0, still).shouldFire).toBe(true);
    expect(evaluateBotFire("mirror", 300, 0, telemetry()).shouldFire).toBe(false);
  });

  it("never fires beyond its own engagement range", () => {
    for (const kind of ["hunter", "flanker", "mirror"] as const) {
      expect(evaluateBotFire(kind, 900, 0, telemetry()).shouldFire).toBe(false);
    }
  });

  it("shortens telegraphs on harder difficulties but never below the floor", () => {
    const recruit = windupDuration("hunter", 1.5, 0);
    const standard = windupDuration("hunter", 1, 0);
    const veteran = windupDuration("hunter", 0.72, 0);
    expect(recruit).toBeGreaterThan(standard);
    expect(standard).toBeGreaterThan(veteran);
    expect(windupDuration("hunter", 0.01, 0)).toBeGreaterThanOrEqual(0.16);
    expect(windupTurnRate("hunter", 1)).toBeGreaterThan(windupTurnRate("hunter", 1.5));
  });
});

describe("speed intent", () => {
  it("slows bots down while they telegraph a shot", () => {
    expect(chooseBotSpeedScale("hunter", 200, { advancing: true, windingUp: true })).toBeLessThan(0.5);
  });

  it("lets the Flanker commit when it is far out of position", () => {
    const far = chooseBotSpeedScale("flanker", BOT_PROFILES.flanker.preferredRange + 140, { advancing: true, windingUp: false });
    const close = chooseBotSpeedScale("flanker", BOT_PROFILES.flanker.preferredRange, { advancing: false, windingUp: false });
    expect(far).toBeGreaterThan(close);
  });
});

describe("profile intent", () => {
  it("reports a retreat when the player is inside the bot's comfort ring", () => {
    const decision = chooseBotMovement(
      { kind: "flanker", position: { x: 300, y: 300 }, strafeSign: 1 },
      telemetry(),
      1,
      { player: { x: 320, y: 300 } }
    );
    expect(decision.intent).toBe("retreat");
  });

  it("keeps distant bots advancing", () => {
    const decision = chooseBotMovement(
      { kind: "hunter", position: { x: 100, y: 100 }, strafeSign: 1 },
      telemetry(),
      1,
      { player: { x: 700, y: 500 } }
    );
    expect(["advance", "predict"]).toContain(decision.intent);
  });
});

describe("mirror read reporting", () => {
  it("says nothing is happening when there is no mirror", () => {
    const summary = summarizeMirrorRead(null);
    expect(summary.focus).toBeNull();
    expect(summary.label).toContain("NO MIRROR");
  });

  it("reports a clean slate instead of inventing a pattern", () => {
    expect(summarizeMirrorRead({ movement: 0.05, firing: 0.02 })).toEqual({
      label: "NO PATTERN YET",
      counter: "KEEP MOVING",
      focus: null
    });
  });

  it("names the habit it is punishing and the counter to it", () => {
    const movement = summarizeMirrorRead({ movement: 0.62, firing: 0.1 });
    expect(movement.focus).toBe("movement");
    expect(movement.label).toBe("READING YOUR MOVEMENT");
    expect(movement.counter).toBe("CHANGE DIRECTION");

    const firing = summarizeMirrorRead({ movement: 0.2, firing: 0.54 });
    expect(firing.focus).toBe("firing");
    expect(firing.label).toBe("READING YOUR FIRING LANE");
    expect(firing.counter).toContain("ANGLE");
  });

  it("clamps nonsense input rather than trusting it", () => {
    expect(summarizeMirrorRead({ movement: 4, firing: -2 }).focus).toBe("movement");
  });
});

describe("flanking coordination", () => {
  it("sends a bot to the opposite side of its ally", () => {
    // Tangent sign +1 moves along (-toward.y, toward.x). With the player straight
    // below (0, 1), that is the -x side, so an ally at +x has to flip the sign and
    // an ally at -x has to hold it.
    expect(preferredStrafeSign({ x: 0, y: 1 }, { x: 80, y: 0 }, -1)).toBe(1);
    expect(preferredStrafeSign({ x: 0, y: 1 }, { x: -80, y: 0 }, 1)).toBe(-1);
  });

  it("keeps the current side when the ally is directly ahead or behind", () => {
    expect(preferredStrafeSign({ x: 0, y: 1 }, { x: 0, y: 120 }, 1)).toBe(1);
    expect(preferredStrafeSign({ x: 0, y: 1 }, { x: 0, y: -120 }, -1)).toBe(-1);
    expect(preferredStrafeSign({ x: 0, y: 1 }, { x: 6, y: -140 }, -1)).toBe(-1); // inside the hysteresis band
    expect(preferredStrafeSign({ x: 0, y: 1 }, { x: 0, y: 0 }, 1)).toBe(1);
  });

  it("finds the closest ally inside range only", () => {
    const bot = { position: { x: 0, y: 0 } };
    expect(nearestAlly(bot, [{ x: 100, y: 0 }, { x: 40, y: 0 }], 200)).toEqual({ x: 40, y: 0 });
    expect(nearestAlly(bot, [{ x: 400, y: 0 }], 200)).toBeNull();
    expect(nearestAlly(bot, [], 200)).toBeNull();
  });
});
