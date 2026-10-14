export type BotKind = "hunter" | "flanker" | "mirror";

export interface Vec2 {
  x: number;
  y: number;
}

export interface BotProfile {
  kind: BotKind;
  name: string;
  color: string;
  speed: number;
  fireRate: number;
  preferredRange: number;
}

export interface PlayerTelemetry {
  recentDirections: Vec2[];
  recentShots: Vec2[];
  stationaryTime: number;
  lastMoveDirection: Vec2;
}

export interface AgentState {
  id: number;
  kind: BotKind;
  position: Vec2;
  velocity: Vec2;
  health: number;
  fireCooldown: number;
  strafeSign: number;
  alive: boolean;
  hitFlash: number;
}

export interface Bullet {
  position: Vec2;
  velocity: Vec2;
  owner: "player" | "bot";
  damage: number;
  life: number;
  color: string;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}