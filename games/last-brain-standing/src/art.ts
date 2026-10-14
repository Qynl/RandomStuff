import type { AgentState } from "./types";

/**
 * Art direction.
 *
 * One place for every palette value and every per-unit look, so the game reads
 * as a grounded industrial test chamber rather than a neon vector demo: warm
 * concrete, painted steel, rust and brass instead of glow, and no bloom
 * anywhere. Each hostile archetype has its own silhouette, body plates and
 * accent so a fight is readable from shape alone, and the player is a distinct
 * armoured operative rather than another shape in the crowd.
 */

export interface UnitArt {
  /** Main body fill. */
  body: string;
  /** Lighter armour plate on top of the body. */
  plate: string;
  /** Dark shading used for recesses and the underside. */
  shade: string;
  /** Unit accent, used for trims, sensors and HUD rings. */
  accent: string;
  /** Ink used for fine details (barrels, bolts). */
  ink: string;
  /** How the model is assembled, keyed to a drawing routine. */
  silhouette: "trooper" | "wedge" | "dart" | "prism";
  /** Optional second accent for small details. */
  detail?: string;
}

export const FLOOR = {
  top: "#20242a",
  bottom: "#14161a",
  grid: "rgba(120, 128, 138, 0.055)",
  paint: "rgba(206, 196, 176, 0.09)",
  paintStrong: "rgba(206, 196, 176, 0.16)",
  stencil: "rgba(206, 196, 176, 0.22)",
  dust: "rgba(196, 186, 168, 0.05)"
} as const;

export const BLOCK = {
  top: "#2b3138",
  topHighlight: "rgba(214, 222, 230, 0.09)",
  face: "#232830",
  faceShade: "#1a1e24",
  edge: "rgba(12, 14, 17, 0.85)",
  rim: "rgba(190, 176, 148, 0.22)",
  bolt: "rgba(176, 186, 196, 0.28)",
  rust: "rgba(138, 96, 62, 0.18)",
  stripe: "rgba(196, 158, 96, 0.16)"
} as const;

export const PLAYER_ART: UnitArt = {
  body: "#27313d",
  plate: "#3c4a5a",
  shade: "#151b23",
  accent: "#c9a05a",
  ink: "#0b0e12",
  detail: "#8fb4d6",
  silhouette: "trooper"
};

export const BOT_ART: Record<AgentState["kind"], UnitArt> = {
  // A squat siege mech: heavy plates, a single amber sensor slit, a stubby
  // cannon. Reads as slow and direct at a glance.
  hunter: {
    body: "#2f3238",
    plate: "#44484f",
    shade: "#1a1c20",
    accent: "#b4574a",
    detail: "#e0a05c",
    ink: "#0a0b0d",
    silhouette: "wedge"
  },
  // A light interceptor: narrow fuselage, swept prongs and thruster pods, cool
  // steel blue. Reads as fast and evasive.
  flanker: {
    body: "#262c37",
    plate: "#39465a",
    shade: "#161a22",
    accent: "#6d92c0",
    detail: "#c2d3e6",
    ink: "#090b0f",
    silhouette: "dart"
  },
  // A tall faceted prism of mirrored panels that slowly turns. Reads as patient
  // and watchful.
  mirror: {
    body: "#2a2730",
    plate: "#413c4d",
    shade: "#181520",
    accent: "#a08ec0",
    detail: "#ded6ea",
    ink: "#0c0a10",
    silhouette: "prism"
  }
};

/** Muted ink for telegraphs: an aim line is a warning, not a light show. */
export const TELEGRAPH = {
  hunter: "rgba(214, 118, 104, 0.72)",
  flanker: "rgba(206, 162, 96, 0.72)",
  mirror: "rgba(168, 148, 200, 0.72)"
} as const;

export const BULLET = {
  playerCore: "#e8dcc0",
  playerTrail: "rgba(226, 200, 150, 0.34)",
  botCore: "#e09a86",
  botTrail: "rgba(206, 130, 110, 0.3)",
  casing: "#8d8577"
} as const;

/** Health and status colours, kept in the same muted family as the units. */
export const STATUS = {
  healthGood: "#8fb48c",
  healthLow: "#c9715f",
  healthTrack: "rgba(16, 18, 22, 0.75)",
  warning: "#d8a25e",
  hit: "#f2ede2",
  shadow: "rgba(6, 7, 9, 0.5)"
} as const;
