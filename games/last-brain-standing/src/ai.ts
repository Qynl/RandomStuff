import type { AgentState, BotProfile, PlayerTelemetry, Vec2 } from "./types";

export const BOT_PROFILES: Record<AgentState["kind"], BotProfile> = {
  hunter: { kind: "hunter", name: "THE HUNTER", color: "#ff5c76", speed: 142, fireRate: 0.92, preferredRange: 215 },
  flanker: { kind: "flanker", name: "THE FLANKER", color: "#ffb454", speed: 154, fireRate: 1.12, preferredRange: 255 },
  mirror: { kind: "mirror", name: "THE MIRROR", color: "#b58cff", speed: 130, fireRate: 0.78, preferredRange: 285 }
};

export const distance = (a: Vec2, b: Vec2): number => Math.hypot(b.x - a.x, b.y - a.y);

export const normalize = (v: Vec2): Vec2 => {
  const length = Math.hypot(v.x, v.y);
  return length > 0.0001 ? { x: v.x / length, y: v.y / length } : { x: 0, y: 0 };
};

export function chooseBotDirection(
  bot: Pick<AgentState, "kind" | "position" | "strafeSign">,
  player: Vec2,
  telemetry: PlayerTelemetry,
  elapsed: number
): Vec2 {
  const toward = normalize({ x: player.x - bot.position.x, y: player.y - bot.position.y });
  const range = distance(bot.position, player);
  const tangent = { x: -toward.y * bot.strafeSign, y: toward.x * bot.strafeSign };

  if (bot.kind === "hunter") {
    const lead = telemetry.lastMoveDirection;
    const prediction = normalize({ x: toward.x + lead.x * 0.42, y: toward.y + lead.y * 0.42 });
    const pressure = range > 185 ? 1 : range < 125 ? -0.58 : 0.12;
    return normalize({ x: prediction.x * pressure + tangent.x * 0.14, y: prediction.y * pressure + tangent.y * 0.14 });
  }

  if (bot.kind === "flanker") {
    const orbit = range > 280 ? 0.82 : range < 180 ? -0.42 : 0.18;
    const pulse = Math.sin(elapsed * 1.65 + bot.position.x * 0.01) * 0.12;
    return normalize({ x: toward.x * orbit + tangent.x * (0.72 + pulse), y: toward.y * orbit + tangent.y * (0.72 + pulse) });
  }

  const recent = telemetry.recentDirections.slice(-8);
  const average = recent.reduce((sum, direction) => ({ x: sum.x + direction.x, y: sum.y + direction.y }), { x: 0, y: 0 });
  const habit = normalize(average);
  const habitStrength = Math.min(1, Math.hypot(average.x, average.y) / Math.max(1, recent.length));
  const hasHabit = recent.length >= 3 && habitStrength > 0.35;
  const counter = hasHabit ? { x: -habit.x, y: -habit.y } : tangent;
  const desiredRange = range > BOT_PROFILES.mirror.preferredRange ? 0.9 : range < 205 ? -0.7 : 0.05;
  const lateral = hasHabit ? 0.52 : 0.24;
  return normalize({
    x: toward.x * desiredRange + counter.x * (0.28 + habitStrength * 0.5) + tangent.x * lateral,
    y: toward.y * desiredRange + counter.y * (0.28 + habitStrength * 0.5) + tangent.y * lateral
  });
}

export function shouldBotFire(
  kind: AgentState["kind"],
  range: number,
  cooldown: number,
  telemetry: PlayerTelemetry
): boolean {
  if (cooldown > 0 || range > 480) return false;
  if (kind === "hunter") return range < 430;
  if (kind === "flanker") return range < 390;
  return range < 440 && (telemetry.stationaryTime < 3.5 || range < 240);
}