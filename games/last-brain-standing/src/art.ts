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
  silhouette:
    | "trooper"
    | "wedge"
    | "dart"
    | "prism"
    | "lance"
    | "furnace"
    | "pod"
    | "wall"
    | "cluster"
    | "ram"
    | "splinter";
  /** Optional second accent for small details. */
  detail?: string;
  /**
   * Footprint of this profile, in its *own* frame: `x` along the direction it is
   * looking, `y` across it. A marksman is long down its barrel and narrow across
   * it; a bulwark is the other way round, a slab stood broadside. Size is the
   * fastest read in a crowd, so the roster is separated by it as well as by
   * shape and colour. Defaults to 1x1 for anything that does not declare one.
   */
  frame?: { x: number; y: number };
}

/** The declared footprint of a unit, defaulting to unscaled. */
export function frameOf(art: UnitArt): { x: number; y: number } {
  return art.frame ?? { x: 1, y: 1 };
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

/**
 * Terrain skins, one per arena family.
 *
 * A layout is a shape; a biome is what it is made of. The maps use the same tile
 * language, but a foundry floor is poured grey, a quarry is dust and ochre, the
 * gardens are cut grass, and the plaza is wet stone - so walking into a new
 * arena reads as a different place before a single hostile shows up.
 *
 * Everything here sits well under the neon threshold on purpose: contrast does
 * the work, not brightness.
 */
export interface BiomeSkin {
  floor: { top: string; bottom: string; grid: string; paint: string; stencil: string; dust: string };
  wall: { top: string; topEdge: string; face: string; faceShade: string; rim: string; rust: string };
  crate: { top: string; face: string; plank: string; band: string };
  bush: { leaf: string; leafDark: string; leafPale: string };
  water: { fill: string; rim: string; glint: string };
}

export const BIOMES: Record<"foundry" | "quarry" | "garden" | "harbour", BiomeSkin> = {
  // Poured concrete, oil-stained steel, cold work light.
  foundry: {
    floor: {
      top: "#20242a",
      bottom: "#14161a",
      grid: "rgba(120, 128, 138, 0.055)",
      paint: "rgba(206, 196, 176, 0.09)",
      stencil: "rgba(206, 196, 176, 0.22)",
      dust: "rgba(196, 186, 168, 0.05)"
    },
    wall: {
      top: "#2b3138",
      topEdge: "rgba(214, 222, 230, 0.09)",
      face: "#232830",
      faceShade: "#1a1e24",
      rim: "rgba(190, 176, 148, 0.22)",
      rust: "rgba(138, 96, 62, 0.18)"
    },
    crate: { top: "#4a3a28", face: "#382c1e", plank: "rgba(20, 14, 8, 0.35)", band: "rgba(150, 128, 96, 0.25)" },
    bush: { leaf: "#33452f", leafDark: "#243020", leafPale: "#4d6340" },
    water: { fill: "rgba(34, 51, 58, 0.85)", rim: "rgba(150, 190, 200, 0.16)", glint: "rgba(190, 226, 232, 0.14)" }
  },
  // Dust, cut stone and ore carts.
  quarry: {
    floor: {
      top: "#2a2620",
      bottom: "#1b1814",
      grid: "rgba(150, 132, 104, 0.05)",
      paint: "rgba(214, 196, 158, 0.08)",
      stencil: "rgba(214, 196, 158, 0.2)",
      dust: "rgba(206, 184, 142, 0.06)"
    },
    wall: {
      top: "#3a332a",
      topEdge: "rgba(226, 208, 172, 0.09)",
      face: "#2d2820",
      faceShade: "#211d18",
      rim: "rgba(206, 180, 130, 0.2)",
      rust: "rgba(150, 104, 58, 0.2)"
    },
    crate: { top: "#5a4429", face: "#43311d", plank: "rgba(24, 16, 8, 0.35)", band: "rgba(176, 146, 96, 0.25)" },
    bush: { leaf: "#3d4530", leafDark: "#2b3222", leafPale: "#5c6642" },
    water: { fill: "rgba(38, 51, 58, 0.85)", rim: "rgba(160, 190, 190, 0.14)", glint: "rgba(200, 224, 214, 0.12)" }
  },
  // Cut grass, stone kerbs and hedges.
  garden: {
    floor: {
      top: "#1e2a20",
      bottom: "#131a16",
      grid: "rgba(122, 148, 116, 0.05)",
      paint: "rgba(206, 214, 186, 0.08)",
      stencil: "rgba(206, 214, 186, 0.2)",
      dust: "rgba(186, 202, 172, 0.05)"
    },
    wall: {
      top: "#333a34",
      topEdge: "rgba(220, 228, 214, 0.09)",
      face: "#262c27",
      faceShade: "#1b201c",
      rim: "rgba(186, 196, 172, 0.2)",
      rust: "rgba(120, 122, 78, 0.16)"
    },
    crate: { top: "#4a3c26", face: "#382d1c", plank: "rgba(20, 16, 8, 0.35)", band: "rgba(158, 144, 100, 0.25)" },
    bush: { leaf: "#2f4a2c", leafDark: "#223a20", leafPale: "#48703f" },
    water: { fill: "rgba(31, 48, 56, 0.85)", rim: "rgba(150, 196, 196, 0.14)", glint: "rgba(196, 226, 220, 0.12)" }
  },
  // Wet flagstones, mossy kerbs and standing water.
  harbour: {
    floor: {
      top: "#232a30",
      bottom: "#151a1f",
      grid: "rgba(140, 158, 172, 0.055)",
      paint: "rgba(206, 214, 220, 0.09)",
      stencil: "rgba(206, 214, 220, 0.2)",
      dust: "rgba(178, 196, 206, 0.05)"
    },
    wall: {
      top: "#38424b",
      topEdge: "rgba(226, 234, 240, 0.1)",
      face: "#2b333b",
      faceShade: "#1f252b",
      rim: "rgba(186, 206, 216, 0.22)",
      rust: "rgba(112, 130, 146, 0.16)"
    },
    crate: { top: "#4c3f2a", face: "#3a3020", plank: "rgba(18, 16, 10, 0.35)", band: "rgba(160, 156, 120, 0.25)" },
    bush: { leaf: "#2c4430", leafDark: "#203224", leafPale: "#426643" },
    water: { fill: "rgba(35, 64, 75, 0.85)", rim: "rgba(150, 200, 214, 0.18)", glint: "rgba(198, 230, 238, 0.16)" }
  }
};

export const PLAYER_ART: UnitArt = {
  body: "#27313d",
  plate: "#3c4a5a",
  shade: "#151b23",
  accent: "#c9a05a",
  ink: "#0b0e12",
  detail: "#8fb4d6",
  silhouette: "trooper"
};

/**
 * Operative classes.
 *
 * The player used to be one fixed palette, which made a class swap invisible
 * outside the HUD. Each class now carries its own metals and trim, so the
 * operative you picked is the one standing on the floor: blue-grey line
 * infantry, brown siege plate, slate marksman, violet-tinged infiltrator,
 * scorched fire crew, and mossy engineer.
 */
export const CLASS_ART: Record<"vanguard" | "breacher" | "marksman" | "ghost" | "cinder" | "sapper", UnitArt> = {
  vanguard: PLAYER_ART,
  breacher: {
    body: "#3a3029",
    plate: "#55463a",
    shade: "#1c1613",
    accent: "#d0705c",
    ink: "#120c0a",
    detail: "#d8b08a",
    silhouette: "trooper"
  },
  marksman: {
    body: "#2e3540",
    plate: "#47505e",
    shade: "#171b21",
    accent: "#cfa25f",
    ink: "#0d1014",
    detail: "#cfd8e2",
    silhouette: "trooper"
  },
  ghost: {
    body: "#2b2a36",
    plate: "#45445a",
    shade: "#16161d",
    accent: "#a08ec0",
    ink: "#0d0d12",
    detail: "#c6bcdd",
    silhouette: "trooper"
  },
  cinder: {
    body: "#332a24",
    plate: "#4d3f33",
    shade: "#1a1411",
    accent: "#c9975a",
    ink: "#120d0a",
    detail: "#e0b48a",
    silhouette: "trooper"
  },
  sapper: {
    body: "#2b332e",
    plate: "#414c45",
    shade: "#161a18",
    accent: "#8fb48c",
    ink: "#0d100e",
    detail: "#bcd0b8",
    silhouette: "trooper"
  }
};

const BASE_BOT_ART: Record<"hunter" | "flanker" | "mirror", UnitArt> = {
  // A squat siege mech: heavy plates, a single amber sensor slit, a stubby
  // cannon. Reads as slow and direct at a glance.
  hunter: {
    body: "#2f3238",
    plate: "#44484f",
    shade: "#1a1c20",
    accent: "#b4574a",
    detail: "#e0a05c",
    ink: "#0a0b0d",
    silhouette: "wedge",
    // The size everything else is read against: a solid, mid-sized mech.
    frame: { x: 1, y: 1 }
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
    silhouette: "dart",
    // Narrow and light: the smallest of the three original profiles, so it
    // reads as an interceptor next to the hunter's bulk.
    frame: { x: 0.82, y: 0.86 }
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
    silhouette: "prism",
    // Tall and narrow: a prism standing up, taller than anything but the wall.
    frame: { x: 0.92, y: 1.22 }
  }
};

/** Ten profiles, ten silhouettes: no two hostiles read the same at a glance. */
export const MORE_BOT_ART: Record<string, UnitArt> = {
  // A long, low rifle platform with a bipod and one very long barrel: the
  // longest thing on the field by a wide margin, and the thinnest for its
  // length, so the silhouette points at whoever is being lined up.
  sniper: {
    frame: { x: 1.34, y: 0.84 },
    body: "#2b2a26",
    plate: "#464339",
    shade: "#171614",
    accent: "#cbb37f",
    detail: "#efe3c6",
    ink: "#0b0a09",
    silhouette: "lance"
  },
  // A round-shouldered furnace with a snout, tank, and vents along its back:
  // round-shouldered in both axes, the widest body in the roster.
  pyro: {
    frame: { x: 1.16, y: 1.02 },
    body: "#332a22",
    plate: "#4d3d2c",
    shade: "#1c1712",
    accent: "#d08a4a",
    detail: "#f0c088",
    ink: "#0d0a07",
    silhouette: "furnace"
  },
  // A squat tracked mortar carrier: wide base, short tube, one tilted plate,
  // which makes it a flat wide block next to the taller hunters.
  mortar: {
    frame: { x: 1.24, y: 0.8 },
    body: "#302c24",
    plate: "#4a4436",
    shade: "#191712",
    accent: "#a9926a",
    detail: "#d8c9a6",
    ink: "#0c0b08",
    silhouette: "pod"
  },
  // A broad, upright wall of plating on two stubby legs. The wall model is
  // built broadside, so the footprint keeps it that way: the largest thing that
  // walks, and much wider across your path than it is deep down it.
  shielder: {
    frame: { x: 1.35, y: 1.95 },
    body: "#2c3036",
    plate: "#454b53",
    shade: "#181b1f",
    accent: "#8a97a6",
    detail: "#ced6e0",
    ink: "#0a0c0f",
    silhouette: "wall"
  },
  // An organic cluster of pods and spores with a soft, uneven outline.
  splitter: {
    frame: { x: 1.02, y: 0.94 },
    body: "#26302a",
    plate: "#37473c",
    shade: "#151c17",
    accent: "#8fb48c",
    detail: "#d6e6d2",
    ink: "#080c09",
    silhouette: "cluster"
  },
  // Angled armour over oversized pistons, built to go forward only: a low
  // wedge, longer than it is wide.
  charger: {
    frame: { x: 1.08, y: 0.92 },
    body: "#332620",
    plate: "#4c372c",
    shade: "#1c1410",
    accent: "#c9744f",
    detail: "#e8b394",
    ink: "#0d0806",
    silhouette: "ram"
  },
  // A faceted splinter: small, sharp and deliberately cheap-looking. A speck,
  // so the arena always has one thing that is obviously not a threat to look at.
  // Its body is a shade off its parent cluster's, which is what lets the two be
  // told apart when a splitter puts a pair of them in the air right next to it.
  shard: {
    frame: { x: 0.6, y: 0.6 },
    body: "#2f3b31",
    plate: "#3a4b3e",
    shade: "#141b16",
    accent: "#a9c7a4",
    detail: "#e2efdf",
    ink: "#070c08",
    silhouette: "splinter"
  }
};

/** Every hostile's art, keyed by kind. */
export const BOT_ART: Record<AgentState["kind"], UnitArt> = {
  ...BASE_BOT_ART,
  sniper: MORE_BOT_ART.sniper,
  pyro: MORE_BOT_ART.pyro,
  mortar: MORE_BOT_ART.mortar,
  shielder: MORE_BOT_ART.shielder,
  splitter: MORE_BOT_ART.splitter,
  charger: MORE_BOT_ART.charger,
  shard: MORE_BOT_ART.shard
};

/** One glyph per profile for the HUD list, so the eye can tell them apart fast. */
export const BOT_SYMBOLS: Record<AgentState["kind"], string> = {
  hunter: "+",
  flanker: "◇",
  mirror: "⌁",
  sniper: "⋙",
  pyro: "▲",
  mortar: "⌒",
  shielder: "▮",
  splitter: "❉",
  charger: "➤",
  shard: "·"
};

/** How each profile warns you: a lane, a cone, a floor marker, a guard arc. */
export const TELEGRAPH_STYLE: Record<AgentState["kind"], "lane" | "beam" | "cone" | "marker" | "guard" | "ram" | "spore" | "hip" | "none"> = {
  hunter: "lane",
  // Fired from the hip on the move: a flick at the muzzle, not a lane.
  flanker: "hip",
  mirror: "hip",
  // The sniper's own tell, drawn by `drawSightTell` from the bot's live sight.
  sniper: "beam",
  pyro: "cone",
  mortar: "marker",
  shielder: "guard",
  splitter: "spore",
  charger: "ram",
  shard: "none"
};

/** Muted ink for telegraphs: an aim line is a warning, not a light show. */
export const TELEGRAPH = {
  hunter: "rgba(214, 118, 104, 0.72)",
  flanker: "rgba(206, 162, 96, 0.72)",
  mirror: "rgba(168, 148, 200, 0.72)",
  sniper: "rgba(203, 179, 127, 0.8)",
  pyro: "rgba(208, 138, 74, 0.72)",
  mortar: "rgba(169, 146, 106, 0.72)",
  shielder: "rgba(138, 151, 166, 0.72)",
  splitter: "rgba(143, 180, 140, 0.72)",
  charger: "rgba(201, 116, 79, 0.8)",
  shard: "rgba(169, 199, 164, 0.72)"
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
  shadow: "rgba(6, 7, 9, 0.5)",
  /** Marksman focus gauge: painted brass, no glow. */
  brassArc: "#cfa25f",
  /** Ghost phase outline: cold steel, barely lit. */
  phaseInk: "#9fb6cc",
  /** Burning hostile ring. */
  ember: "#8a6a3f"
} as const;
