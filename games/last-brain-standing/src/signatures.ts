import type { AgentState, BotAttack, BotKind } from "./types";
import type { LoadoutId } from "./loadouts";

/**
 * Archetype signatures — the part of a hostile that is *behaviour*, not stats.
 *
 * The brief was that the three profiles must not read as the same enemy in
 * different paint. Each one now owns a different axis:
 *
 * - **The Hunter** owns *timing*: it fires a two-round salvo and its aim locks
 *   for the second half of the wind-up, so late lateral movement beats it while
 *   early panic does not. Its front plating eats a share of frontal damage.
 * - **The Flanker** owns *space*: it will not shoot while stacked with an ally,
 *   and dives across the room to close out of position.
 * - **The Mirror** owns *your own kit*: it copies the projectile geometry of
 *   whatever weapon you brought, so your loadout choice arms it differently.
 *
 * Everything here is pure data or pure functions, so the rules can be asserted
 * directly rather than inferred from a full simulation run.
 */

export interface VolleyRound {
  /** Seconds after the wind-up completes before this round leaves the barrel. */
  delay: number;
  /** Radians of random spread applied to the aim direction. */
  spread: number;
  /** Share of the profile's nominal damage this round carries. */
  damageShare: number;
  /** Multiplier on the profile's bullet speed. */
  speedScale: number;
  /** Multiplier on the round's lifetime. */
  lifeScale: number;
}

export interface Volley {
  rounds: VolleyRound[];
  /** Short label shown in the HUD when this profile is the one shooting. */
  label: string;
  /** Multiplier on the wind-up duration: heavier commitments telegraph longer. */
  telegraphScale: number;
}

const round = (overrides: Partial<VolleyRound> = {}): VolleyRound => ({
  delay: 0,
  spread: 0.04,
  damageShare: 1,
  speedScale: 1,
  lifeScale: 1,
  ...overrides
});

/**
 * Two rounds leave the barrel together: one tight, one sloppy. It is a wider
 * threat than a single round without adding a second reaction window, which
 * keeps the fight step-size independent and the telegraph honest.
 */
export const HUNTER_VOLLEY: Volley = {
  rounds: [
    round({ delay: 0, spread: 0.04, damageShare: 0.55 }),
    round({ delay: 0, spread: 0.13, damageShare: 0.45, speedScale: 0.94 })
  ],
  label: "DOUBLE SALVO",
  telegraphScale: 1
};

/** The Flanker's identity is positional, not ballistic: one round, on the move. */
export const FLANKER_VOLLEY: Volley = {
  rounds: [round({ spread: 0.1 })],
  label: "MOVING SHOT",
  telegraphScale: 1
};

/** The Mirror fires a copy of whatever you brought. */
export function mirrorVolley(loadout: LoadoutId): Volley {
  if (loadout === "breacher") {
    return {
      rounds: [
        round({ spread: 0.3, damageShare: 0.32, speedScale: 0.95, lifeScale: 0.6 }),
        round({ spread: 0.3, damageShare: 0.32, speedScale: 0.95, lifeScale: 0.6 }),
        round({ spread: 0.3, damageShare: 0.32, speedScale: 0.95, lifeScale: 0.6 })
      ],
      label: "COPIED SCATTERGUN",
      telegraphScale: 0.95
    };
  }
  if (loadout === "marksman" || loadout === "sapper") {
    return {
      rounds: [round({ spread: 0.02, damageShare: 1.1, speedScale: 1.35, lifeScale: 1.4 })],
      label: loadout === "sapper" ? "COPIED LOBBER" : "COPIED RAILGUN",
      telegraphScale: 1.3
    };
  }
  return {
    rounds: [round({ spread: 0.05 })],
    label: "COPIED RIFLE",
    telegraphScale: 1
  };
}

/** The volley a profile will actually fire, given the player's weapon. */
export function volleyFor(kind: AgentState["kind"], loadout: LoadoutId): Volley {
  if (kind === "hunter") return HUNTER_VOLLEY;
  if (kind === "flanker") return FLANKER_VOLLEY;
  return mirrorVolley(loadout);
}

/** Total share of nominal damage one full volley carries. */
export function volleyDamage(volley: Volley): number {
  return volley.rounds.reduce((sum, entry) => sum + entry.damageShare, 0);
}

// ------------------------------------------------------------------- the Hunter

/** Fraction of frontal damage the Hunter's plating absorbs. */
export const HUNTER_PLATING = 0.22;
/** Half-angle of the plated frontal arc, in radians (about 65° either side). */
export const HUNTER_PLATING_ARC = 1.13;
/**
 * How far through its wind-up the Hunter keeps tracking. Past this the barrel is
 * committed and the shot goes where it was last pointed.
 */
export const HUNTER_LOCK_PROGRESS = 0.55;

/**
 * Plating multiplier for a hit that lands at `impact` on a hostile at
 * `position` facing `facing`: 1 normally, less than 1 inside the frontal arc.
 * Only the Hunter is plated.
 */
export function platingScale(
  kind: AgentState["kind"],
  position: { x: number; y: number },
  facing: number,
  impact: { x: number; y: number }
): number {
  if (kind !== "hunter") return 1;
  const dx = impact.x - position.x;
  const dy = impact.y - position.y;
  const gap = Math.hypot(dx, dy);
  // A hit reported at the centre tells us nothing about the angle, and guessing
  // would punish the player for an artefact of a fast projectile.
  if (gap < 0.001) return 1;
  const cos = (dx / gap) * Math.cos(facing) + (dy / gap) * Math.sin(facing);
  return cos > Math.cos(HUNTER_PLATING_ARC) ? 1 - HUNTER_PLATING : 1;
}

/**
 * How each profile *aims* - the part of a hostile the player actually reads.
 *
 * The roster is a set of different aiming problems, not a set of different
 * health bars: one sight slides in and locks, one barrel charges, one sprays
 * from the hip, one opens a cone, one marks the floor, one raises a shield, one
 * fans a volley, one runs a lane, and one does not aim at all.
 *
 * `acquire` is the tell that costs the shooter time: the Marksman spends it
 * sliding its sight onto you in full view, and while it is acquiring it is
 * standing still, which is the window to shoot back.
 */
export type AimTell = "sight" | "barrel" | "hip" | "cone" | "marker" | "guard" | "spore" | "ram" | "none";

export interface AimSpec {
  /** What is drawn while this profile is aiming. */
  tell: AimTell;
  /** Seconds spent visibly acquiring a target before the wind-up begins. */
  acquire: number;
  /** Fraction of the wind-up after which this profile stops re-aiming. */
  lockAt: number;
  /** A bright lens the player can spot across the arena while it aims. */
  glint: boolean;
  /** It plants its feet while aiming instead of walking the shot in. */
  plants: boolean;
  /** Two or three words for the codex: what the tell looks like on screen. */
  label: string;
  /** How the tell behaves and what it costs the player, in one line. */
  note: string;
}

export const AIMS: Record<AgentState["kind"], AimSpec> = {
  // Commits halfway: the barrel light is the tell and it stops tracking early.
  hunter: {
    tell: "barrel", acquire: 0, lockAt: HUNTER_LOCK_PROGRESS, glint: false, plants: false,
    label: "BARREL LIGHT",
    note: "The light commits halfway: it stops tracking you, then fires two rounds."
  },
  // Never stops moving, so its tell is a short hip-flick instead of a lane.
  flanker: {
    tell: "hip", acquire: 0, lockAt: 1, glint: false, plants: false,
    label: "HIP FLICK",
    note: "A flick at the muzzle while it runs: it never plants, so it never leads."
  },
  // Copies your weapon and fires it from the hip, in your own class colour.
  mirror: {
    tell: "hip", acquire: 0, lockAt: 1, glint: false, plants: false,
    label: "COPIED KIT",
    note: "Your own weapon, from the hip, in your class colour: the round is familiar."
  },
  // The real sniper: a laser sight that slides onto you and locks, a glint you
  // can spot across the arena, and a stance it will not break to walk.
  sniper: {
    tell: "sight", acquire: 0.62, lockAt: 0.72, glint: true, plants: true,
    label: "LASER SIGHT",
    note: "A glint, then a sight that slides onto you and locks: break the line or step at the freeze."
  },
  // A cone of fire: the whole wedge is the danger, not a line.
  pyro: {
    tell: "cone", acquire: 0.2, lockAt: 1, glint: false, plants: false,
    label: "FLAME CONE",
    note: "A wedge, not a line: everything in front of it burns, cover does not help."
  },
  // Marks the floor and holds its stance while the shell is in the air.
  mortar: {
    tell: "marker", acquire: 0.3, lockAt: 1, glint: false, plants: true,
    label: "FLOOR MARKER",
    note: "Marks the floor it will land on: walk out of the ring and the shell is wasted."
  },
  // No shot at all: the shield arc and the short reach are the whole tell.
  shielder: {
    tell: "guard", acquire: 0.25, lockAt: 1, glint: false, plants: false,
    label: "SHIELD ARC",
    note: "The arc is the tell and the answer: nothing gets through the front, go round it."
  },
  // Fans a volley: three diverging lines rather than one.
  splitter: {
    tell: "spore", acquire: 0.15, lockAt: 1, glint: false, plants: false,
    label: "SPORE FAN",
    note: "Three diverging lines: the gap between them is the dodge, and it splits again."
  },
  // Marks a lane and paws the ground before it runs.
  charger: {
    tell: "ram", acquire: 0.35, lockAt: 1, glint: false, plants: false,
    label: "PAWED LANE",
    note: "Paws the ground and marks a lane before it runs: step out and it staggers."
  },
  shard: {
    tell: "none", acquire: 0, lockAt: 1, glint: false, plants: false,
    label: "NO TELL",
    note: "No tell at all. It is a shard: kill it before it touches you."
  }
};

/** The aim behaviour a profile uses. */
export function aimFor(kind: AgentState["kind"]): AimSpec {
  return AIMS[kind];
}

/**
 * Whether a hostile keeps re-aiming this far through its wind-up. The Hunter
 * commits halfway; the Marksman commits earlier still, because its sight is
 * already frozen on the target by then.
 */
export function botKeepsTracking(kind: AgentState["kind"], progress: number): boolean {
  return progress < AIMS[kind].lockAt;
}

/**
 * How fast a sight slides onto its target, in units per second.
 *
 * Slower than a running player on purpose: the sight crawls onto a strafing
 * target, trails a fleeing one, and settles almost at once on somebody who
 * stands still. That is the profile's whole bargain - it punishes a stationary
 * player and loses to a moving one.
 */
export const SIGHT_SETTLE_RATE = 150;

/**
 * How fast a sight that has found its target follows it, in units per second.
 *
 * Much quicker than the crawl, because this is the part where the rifle is
 * tracking you: it converges well before the aim locks, so the freeze at the
 * end of the wind-up is a distinct, deliberate moment rather than a snap.
 */
export const SIGHT_TRACK_RATE = 900;

/** Where a sight starts: out along the barrel, where the rifle is pointing. */
export const SIGHT_START_RANGE = 420;

/**
 * How far off the target the sight opens, in radians of swing.
 *
 * A reticle that is drawn straight onto the player is a sentence rather than a
 * warning: it tells the player they have already been shot at. The Marksman
 * opens its sight *beside* the player instead and sweeps across onto them, so
 * the aim-in is a visible process with an obvious end - and the last-second
 * sidestep after that end is the counterplay.
 */
export const SIGHT_START_SWEEP = 0.34;

/** How much a given unit's opening swing varies, so two of them do not sweep in step. */
export function sightSweepFor(botId: number): number {
  const jitter = ((botId * 37) % 11) / 11;
  const side = botId % 2 === 0 ? 1 : -1;
  return SIGHT_START_SWEEP * (0.75 + 0.5 * jitter) * side;
}

/**
 * Pitch multiplier per profile, so the same cue sounds like whoever fired it:
 * the Hunter is heavy and low, the Flanker light and high, the Mirror in
 * between with a flat electronic edge. A player can hear which profile is
 * winding up behind them without turning around.
 */
export const PROFILE_PITCH: Record<AgentState["kind"], number> = {
  hunter: 0.78,
  flanker: 1.22,
  mirror: 0.98,
  sniper: 0.62,
  pyro: 0.86,
  mortar: 0.7,
  shielder: 1.05,
  splitter: 1.34,
  charger: 0.74,
  shard: 1.55
};

// ----------------------------------------------------------------- the new ones

/**
 * What each attack does when a telegraph completes. Everything specific to a
 * profile's *attack* lives here, so the simulation only has to ask "how does
 * this one hurt me?" and never has to know which profile it is looking at.
 */
export interface AttackSpec {
  /** How much longer (`>1`) or shorter (`<1`) its telegraph is than the base. */
  telegraphScale: number;
  /** Distance it will start an attack from. */
  range: number;
  /** Needs a clear line at the moment the telegraph starts. */
  requiresSight: boolean;
  /** Rounds fired in one volley, if it fires rounds. */
  rounds?: number;
  /** Random spread per round. */
  spread?: number;
  /** Damage split across the volley, as a share of the profile's damage. */
  damageShare?: number;
  /** A faster, longer-lived round: the marksman's slug. */
  slug?: { speedScale: number; lifeScale: number };
  /** A continuous attack: several short-lived rounds on a timer. */
  spray?: { duration: number; interval: number; spread: number; speedScale: number; lifeScale: number; damageShare: number };
  /** A lobbed shell that lands on a marked circle. */
  shell?: { flight: number; radius: number; lead: number; falloff: number };
  /** A committed charge along a marked lane. */
  charge?: { duration: number; speedScale: number; reach: number; stunOnMiss: number };
  /** Blocks player rounds inside this arc of its facing. */
  shieldArc?: number;
  /** Splits into these when it dies. */
  splitsInto?: { kind: BotKind; count: number };
  /** Melee burst instead of a projectile. */
  melee?: { radius: number; knockback: number };
  /** Detonates on contact with the player. */
  kamikaze?: boolean;
}

export const ATTACKS: Record<BotAttack, AttackSpec> = {
  salvo: { telegraphScale: 1, range: 470, requiresSight: true, rounds: 2, spread: 0.04 },
  shot: { telegraphScale: 1, range: 430, requiresSight: true, rounds: 1, spread: 0.1 },
  copy: { telegraphScale: 1, range: 470, requiresSight: true, rounds: 1, spread: 0.05 },
  // The marksman's telegraph is long and its line is drawn across the arena, so
  // the shot is always survivable; it also cannot chase, so cover resets it.
  // The Marksman's own copy promises a 1.5 s aim line, and this makes it
  // literally true: 0.62 s of sight sliding on plus a 0.88 s hold, at standard.
  // Every other profile's tell is shorter; none of them is a sniper.
  beam: { telegraphScale: 2.2, range: 620, requiresSight: true, rounds: 1, spread: 0.012, slug: { speedScale: 1.6, lifeScale: 1.5 } },
  // Six seconds of fire, one short round every 0.11 s: a wall of flame that
  // forces movement rather than one hit that has to be dodged.
  flame: { telegraphScale: 0.7, range: 210, requiresSight: true, spray: { duration: 0.55, interval: 0.055, spread: 0.34, speedScale: 0.95, lifeScale: 0.42, damageShare: 1 } },
  mortar: { telegraphScale: 1.5, range: 520, requiresSight: false, shell: { flight: 1.75, radius: 64, lead: 0.35, falloff: 0.45 } },
  // A walking wall: the shield covers the front, the bash only reaches arm's
  // length, and it takes a long time to wind up so it is never a surprise.
  shield: { telegraphScale: 1.5, range: 150, requiresSight: false, shieldArc: 1.15, melee: { radius: 84, knockback: 34 } },
  split: { telegraphScale: 1, range: 430, requiresSight: true, rounds: 3, spread: 0.22, splitsInto: { kind: "shard", count: 2 } },
  charge: { telegraphScale: 1.3, range: 460, requiresSight: false, charge: { duration: 0.62, speedScale: 3.1, reach: 330, stunOnMiss: 2.1 } },
  kamikaze: { telegraphScale: 1, range: 0, requiresSight: false, kamikaze: true }
};

/** The attack a profile uses. */
export function attackFor(kind: AgentState["kind"]): AttackSpec {
  return ATTACKS[BOT_PROFILES_ATTACK[kind]];
}

/**
 * How much longer (`>1`) or shorter (`<1`) this profile's telegraph is than the
 * base wind-up.
 *
 * The Mirror is the one profile whose tell depends on the player rather than on
 * itself: it telegraphs the weapon it copied, so it takes its scale from the
 * volley it is about to fire. Everyone else owes their tell to their own attack,
 * which is how a marksman gets a sighting-in line and a cinder gets a snap
 * before the flame.
 */
export function telegraphScaleFor(kind: AgentState["kind"], loadout: LoadoutId): number {
  if (kind === "mirror") return volleyFor(kind, loadout).telegraphScale;
  return attackFor(kind).telegraphScale;
}

/**
 * Which attack each profile owns. Kept as a table rather than read off the
 * profile object so `signatures` stays free of the AI module's imports.
 */
export const BOT_PROFILES_ATTACK: Record<BotKind, BotAttack> = {
  hunter: "salvo",
  flanker: "shot",
  mirror: "copy",
  sniper: "beam",
  pyro: "flame",
  mortar: "mortar",
  shielder: "shield",
  splitter: "split",
  charger: "charge",
  shard: "kamikaze"
};

/** Player rounds are stopped outright inside a bulwark's shield arc. */
export function shieldBlocks(
  kind: AgentState["kind"],
  facing: number,
  position: { x: number; y: number },
  impact: { x: number; y: number },
  /** A staggered bulwark has dropped its guard. */
  staggered = false
): boolean {
  const arc = ATTACKS[BOT_PROFILES_ATTACK[kind]].shieldArc;
  if (!arc || staggered) return false;
  const dx = impact.x - position.x;
  const dy = impact.y - position.y;
  const gap = Math.hypot(dx, dy);
  if (gap < 0.001) return false;
  const cos = (dx / gap) * Math.cos(facing) + (dy / gap) * Math.sin(facing);
  return cos > Math.cos(arc);
}

/** Damage multiplier once a hostile has been staggered by a failed charge. */
export const STUNNED_DAMAGE_SCALE = 1.5;

// ------------------------------------------------------------------ the Flanker

/** An ally further than this from the player is not part of the same attack. */
export const PINCER_ALLY_RANGE = 430;
/** Inside this the Flanker takes the shot regardless of where its ally is. */
export const PINCER_PRESS_RANGE = 195;
/**
 * How far apart two flankers must be *around the player* before both may shoot:
 * about 100°, so crowding the same arc counts as the same angle and splitting to
 * opposite sides counts as an envelop.
 */
export const PINCER_ARC = (100 * Math.PI) / 180;

/** Smallest angle between two bearings, in radians. */
export function angleApart(a: number, b: number): number {
  let delta = Math.abs(a - b) % (Math.PI * 2);
  if (delta > Math.PI) delta = Math.PI * 2 - delta;
  return delta;
}

/**
 * How far off the player→ally line a flanker sits, signed. Positive means the
 * ally is on one side of the bot's approach, negative the other; near zero means
 * they are queued up behind each other.
 */
export function pincerSide(position: { x: number; y: number }, player: { x: number; y: number }, ally: { x: number; y: number }): number {
  const toward = { x: player.x - position.x, y: player.y - position.y };
  const gap = Math.hypot(toward.x, toward.y);
  if (gap < 0.001) return 0;
  toward.x /= gap;
  toward.y /= gap;
  const offset = { x: ally.x - position.x, y: ally.y - position.y };
  const offsetGap = Math.hypot(offset.x, offset.y);
  if (offsetGap < 0.001) return 0;
  return (toward.x * offset.y - toward.y * offset.x) / offsetGap;
}

/**
 * The Flanker's discipline: it holds fire while it is still stacked with a live
 * ally, because a second gun from the same angle is wasted pressure. It takes
 * the shot anyway when it is close enough to press, or when it is the only one
 * left, so a lone survivor never freezes.
 */
export function flankerHoldsFire(
  position: { x: number; y: number },
  player: { x: number; y: number },
  allies: Array<{ x: number; y: number }>,
  range: number
): boolean {
  if (range < PINCER_PRESS_RANGE) return false;
  const mine = Math.atan2(position.y - player.y, position.x - player.x);
  for (const ally of allies) {
    // Only allies still in this fight count, measured against the player: one
    // across the arena is somebody else's problem.
    if (Math.hypot(ally.x - player.x, ally.y - player.y) > PINCER_ALLY_RANGE) continue;
    // Standing on top of it: nothing to see through.
    if (Math.hypot(ally.x - position.x, ally.y - position.y) < 40) return true;
    // Still crowding the same arc around the player: a second gun here adds
    // nothing. It keeps moving instead, and fires once it has the envelop.
    const theirs = Math.atan2(ally.y - player.y, ally.x - player.x);
    if (angleApart(mine, theirs) < PINCER_ARC) return true;
  }
  return false;
}

/** The Flanker's committed closing burst. */
export const FLANKER_DIVE = {
  /** Speed multiplier while diving. */
  speed: 1.8,
  /** How long the burst lasts. */
  duration: 0.42,
  /** Seconds before it may dive again. */
  cooldown: 2.4,
  /** How far outside its preferred ring it must be to bother. */
  extraRange: 60
} as const;

/** Whether the Flanker should launch a closing dive right now. */
export function flankerShouldDive(range: number, cooldown: number, windingUp: boolean, preferredRange: number): boolean {
  if (windingUp || cooldown > 0) return false;
  return range > preferredRange + FLANKER_DIVE.extraRange;
}

/** Speed multiplier for a profile's committed dive, if any. */
export function diveSpeedScale(kind: AgentState["kind"], diveTime: number): number {
  return kind === "flanker" && diveTime > 0 ? FLANKER_DIVE.speed : 1;
}

// ------------------------------------------------------------------- the Mirror

/**
 * How far past the player the Mirror slides away from the aim ray, so standing
 * in its lane is not the same as hitting it.
 */
export function mirrorEvadePull(aimDot: number): number {
  if (aimDot < 0.86) return 0; // the player is not even aiming this way
  return (aimDot - 0.86) / 0.14; // 0 at the edge of the lane, 1 dead centre
}
