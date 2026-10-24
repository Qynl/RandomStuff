/* Room chain.
 *
 * Rooms are laid out along -Z at a fixed pitch, so walking through a door
 * physically carries you into the next room instead of teleporting: the rooms
 * really are adjacent, they just should not be.
 *
 *   room i interior: [centerZ + depth/2] .. [centerZ - depth/2]
 *   corridor i+1:    the leftover space between room i's back wall and room
 *                    i+1's front wall, rendered as part of room i+1.
 *
 * Everything is derived from (runSeed, roomIndex), so a run is reproducible —
 * but the shape of the run is drawn once, up front, from twenty-odd kinds of
 * room, and no kind ever follows itself or the room before that. Opening a door
 * should feel like not knowing what building you are in.
 */
import { makeRng, hashSeed } from './rng.js';

export const PITCH = 14.0;
export const ROOM_TOTAL = 21;
export const EXIT_INDEX = ROOM_TOTAL - 1;

/** Doorway (the hole in the wall). */
export const DOOR_HALF = 1.12;
export const DOOR_TOP = 2.98;
/** Walkable half-width through that hole. */
export const BAY_HALF = 0.92;
/** Entry corridor dimensions. */
export const CORRIDOR_HALF = 1.16;
export const CORRIDOR_H = 3.05;

export const EYE = 1.64;
export const SPEED = 2.5;

export const WALL_MARGIN = 0.42;

/* Each entry is one kind of room. `shape` gives the ranges a room of that kind
 * is allowed to take; the variation between two Store Rooms is as important as
 * the variation between a Store Room and a Chapel. */
const TYPES = {
  waiting: {
    label: 'THE WAITING ROOM',
    weight: 0,
    shape: { width: [9.2, 9.2], depth: [9.1, 9.1], height: [4.2, 4.2] },
    ambient: '#b9c0ad',
    ambientIntensity: 0.22,
    fog: '#101411',
    fogNear: 5.5,
    fogFar: 17,
    exposure: 1.38,
  },
  hall: {
    label: 'THE LONG HALL',
    weight: 9,
    shape: { width: [6.4, 7.4], depth: [10.6, 11.8], height: [4.3, 4.9] },
    ambient: '#93a4ab',
    ambientIntensity: 0.2,
    fog: '#0b1214',
    fogNear: 3.4,
    fogFar: 15,
    exposure: 1.4,
  },
  nursery: {
    label: 'THE NURSERY',
    weight: 7,
    shape: { width: [8.0, 9.0], depth: [9.2, 10.6], height: [3.9, 4.3] },
    ambient: '#c3a4ae',
    ambientIntensity: 0.21,
    fog: '#140d11',
    fogNear: 4.2,
    fogFar: 15,
    exposure: 1.38,
  },
  chapel: {
    label: 'THE CHAPEL',
    weight: 6,
    shape: { width: [9.4, 10.6], depth: [10.4, 11.6], height: [4.4, 5.1] },
    ambient: '#8fa3b8',
    ambientIntensity: 0.2,
    fog: '#0a1016',
    fogNear: 5,
    fogFar: 20,
    exposure: 1.36,
  },
  store: {
    label: 'THE STORE ROOM',
    weight: 9,
    shape: { width: [8.2, 9.6], depth: [9.0, 10.6], height: [3.9, 4.4] },
    ambient: '#a2a89c',
    ambientIntensity: 0.17,
    fog: '#0d100c',
    fogNear: 3.8,
    fogFar: 14,
    exposure: 1.4,
  },
  washroom: {
    label: 'THE WASHROOM',
    weight: 7,
    shape: { width: [8.0, 9.2], depth: [9.0, 10.2], height: [3.7, 4.1] },
    ambient: '#a0b5b1',
    ambientIntensity: 0.21,
    fog: '#0a1212',
    fogNear: 3.6,
    fogFar: 13,
    exposure: 1.36,
  },
  office: {
    label: 'THE OFFICE',
    weight: 7,
    shape: { width: [8.4, 9.8], depth: [9.4, 10.8], height: [3.8, 4.2] },
    ambient: '#aab7bf',
    ambientIntensity: 0.22,
    fog: '#0b0f11',
    fogNear: 4.4,
    fogFar: 16,
    exposure: 1.34,
  },
  flooded: {
    label: 'THE FLOOD',
    weight: 6,
    shape: { width: [9.0, 10.4], depth: [10.0, 11.4], height: [4.1, 4.7] },
    ambient: '#77909f',
    ambientIntensity: 0.21,
    fog: '#080f13',
    fogNear: 3.2,
    fogFar: 15,
    exposure: 1.42,
  },
  gallery: {
    label: 'THE GALLERY',
    weight: 7,
    shape: { width: [8.8, 10.2], depth: [10.0, 11.2], height: [4.1, 4.6] },
    ambient: '#b09884',
    ambientIntensity: 0.2,
    fog: '#100c09',
    fogNear: 4,
    fogFar: 15,
    exposure: 1.36,
  },
  boiler: {
    label: 'THE BOILER ROOM',
    weight: 6,
    shape: { width: [8.0, 9.4], depth: [9.2, 10.4], height: [3.9, 4.4] },
    ambient: '#9c8474',
    ambientIntensity: 0.17,
    fog: '#120a07',
    fogNear: 3.2,
    fogFar: 13,
    exposure: 1.4,
  },
  nowhere: {
    label: 'NOWHERE',
    weight: 4,
    shape: { width: [8.4, 8.4], depth: [9.6, 9.6], height: [4.5, 4.5] },
    ambient: '#8d9490',
    ambientIntensity: 0.2,
    fog: '#0a0b0a',
    fogNear: 4.4,
    fogFar: 17,
    exposure: 1.36,
  },
  bedroom: {
    label: 'THE BEDROOM',
    weight: 8,
    shape: { width: [7.8, 9.0], depth: [9.2, 10.6], height: [3.8, 4.2] },
    ambient: '#bda99a',
    ambientIntensity: 0.19,
    fog: '#120d0a',
    fogNear: 3.9,
    fogFar: 14,
    exposure: 1.4,
  },
  kitchen: {
    label: 'THE KITCHEN',
    weight: 7,
    shape: { width: [8.0, 9.2], depth: [8.8, 10.2], height: [3.7, 4.1] },
    ambient: '#aab2a2',
    ambientIntensity: 0.2,
    fog: '#0c110d',
    fogNear: 3.5,
    fogFar: 13,
    exposure: 1.38,
  },
  library: {
    label: 'THE LIBRARY',
    weight: 6,
    shape: { width: [9.0, 10.2], depth: [10.2, 11.6], height: [4.2, 4.9] },
    ambient: '#b3a58c',
    ambientIntensity: 0.18,
    fog: '#100c08',
    fogNear: 3.8,
    fogFar: 15,
    exposure: 1.4,
  },
  classroom: {
    label: 'THE CLASSROOM',
    weight: 7,
    shape: { width: [8.6, 9.8], depth: [9.8, 11.2], height: [4.0, 4.5] },
    ambient: '#aebcb4',
    ambientIntensity: 0.21,
    fog: '#0b1110',
    fogNear: 4.0,
    fogFar: 15,
    exposure: 1.36,
  },
  stairwell: {
    label: 'THE STAIRWELL',
    weight: 6,
    shape: { width: [7.0, 8.0], depth: [10.0, 11.2], height: [4.6, 5.2] },
    ambient: '#93a0a4',
    ambientIntensity: 0.19,
    fog: '#0a0e10',
    fogNear: 3.4,
    fogFar: 16,
    exposure: 1.38,
  },
  mirrorhall: {
    label: 'THE MIRROR HALL',
    weight: 5,
    shape: { width: [7.2, 8.2], depth: [10.4, 11.6], height: [4.2, 4.8] },
    ambient: '#9fb4b8',
    ambientIntensity: 0.24,
    fog: '#080f11',
    fogNear: 3.0,
    fogFar: 14,
    exposure: 1.34,
  },
  morgue: {
    label: 'THE COLD ROOM',
    weight: 5,
    shape: { width: [8.2, 9.4], depth: [9.4, 10.8], height: [3.6, 4.0] },
    ambient: '#a6bcc2',
    ambientIntensity: 0.23,
    fog: '#080e10',
    fogNear: 3.2,
    fogFar: 12.5,
    exposure: 1.32,
  },
  laundry: {
    label: 'THE LAUNDRY',
    weight: 6,
    shape: { width: [7.6, 8.8], depth: [9.0, 10.4], height: [3.6, 4.0] },
    ambient: '#a8b6b0',
    ambientIntensity: 0.2,
    fog: '#0a1010',
    fogNear: 3.4,
    fogFar: 12,
    exposure: 1.38,
  },
  clockroom: {
    label: 'THE CLOCK ROOM',
    weight: 5,
    shape: { width: [8.2, 9.4], depth: [9.6, 11.0], height: [4.2, 4.8] },
    ambient: '#b8a485',
    ambientIntensity: 0.17,
    fog: '#110c07',
    fogNear: 3.6,
    fogFar: 14,
    exposure: 1.4,
  },
  closet: {
    label: 'THE CLOSET',
    weight: 5,
    shape: { width: [3.8, 4.4], depth: [4.0, 4.8], height: [3.3, 3.55] },
    ambient: '#9aa79e',
    ambientIntensity: 0.18,
    fog: '#0a0d0b',
    fogNear: 2.4,
    fogFar: 9,
    exposure: 1.34,
  },
  void: {
    label: 'THE ROOM WITH NO CEILING',
    weight: 4,
    shape: { width: [11.0, 12.4], depth: [10.6, 11.6], height: [6.2, 7.0] },
    ambient: '#8a949c',
    ambientIntensity: 0.16,
    fog: '#070a0c',
    fogNear: 4.6,
    fogFar: 22,
    exposure: 1.44,
  },
  exit: {
    label: 'THE WAY OUT',
    weight: 0,
    shape: { width: [7.4, 7.4], depth: [10.2, 10.2], height: [3.9, 3.9] },
    ambient: '#d6dcd8',
    ambientIntensity: 0.4,
    fog: '#c8d0cc',
    fogNear: 7,
    fogFar: 30,
    exposure: 1.16,
  },
};

const ENCOUNTER_KEYS = Object.keys(TYPES).filter(
  (key) => TYPES[key].weight > 0 && key !== 'waiting' && key !== 'exit',
);

/* Things a room may or may not have, drawn per room. Dressing reads these so
 * two rooms of the same kind are still not the same room. */
function rollExtras(rng) {
  return {
    // lights are already failing when you walk in
    darkEntry: rng.chance(0.16),
    // a second, decorative door that goes nowhere
    falseDoor: rng.chance(0.3),
    fan: rng.chance(0.22),
    puddle: rng.chance(0.3),
    rubble: rng.chance(0.24),
    cloth: rng.chance(0.2),
    chairs: rng.int(1, 3),
    extraLight: rng.chance(0.45),
    collapse: rng.chance(0.14),
  };
}

function shapeOf(key, rng) {
  const { width, depth, height } = TYPES[key].shape;
  return {
    width: +rng.float(width[0], width[1]).toFixed(2),
    depth: +rng.float(depth[0], depth[1]).toFixed(2),
    height: +rng.float(height[0], height[1]).toFixed(2),
  };
}

function buildRoom({ index, seed, key, width, depth, height, entryGap, variant, extras }) {
  const centerZ = -index * PITCH;
  const type = TYPES[key];
  return {
    index,
    key,
    variant,
    extras,
    seed,
    width,
    depth,
    height,
    centerZ,
    frontZ: centerZ + depth / 2,
    backZ: centerZ - depth / 2,
    entryGap,
    mood: {
      label: type.label,
      ambient: type.ambient,
      ambientIntensity: type.ambientIntensity,
      fog: type.fog,
      fogNear: type.fogNear,
      fogFar: type.fogFar,
      exposure: type.exposure,
    },
    label: type.label,
  };
}

export function buildChain(runSeed, total = ROOM_TOTAL) {
  const rooms = [];
  const recent = [];
  const bag = [];
  let previousDepth = null;

  // Draw rooms from a shuffled bag rather than weighted randoms. A twenty-room
  // run should look like the building has more than a dozen rooms in it: the
  // surprise comes from the order, not from rolling the same room four times.
  const drawKey = (rng) => {
    if (!bag.length) {
      const pool = rng.shuffle(ENCOUNTER_KEYS).filter((key) => !recent.includes(key));
      bag.push(...(pool.length ? pool : rng.shuffle(ENCOUNTER_KEYS)));
    }
    return bag.pop();
  };

  for (let index = 0; index < total; index++) {
    const seed = hashSeed(runSeed, index + 1);
    const rng = makeRng(seed);

    let key;
    if (index === 0) key = 'waiting';
    else if (index === total - 1) key = 'exit';
    else key = drawKey(rng);

    const shape = shapeOf(key, rng);
    const extras = key === 'exit' ? null : rollExtras(rng);
    const variant = rng.int(0, 3);

    // Corridor length: whatever is left between the previous back wall and this
    // room's front wall. Depth ranges are capped so this never collapses.
    const entryGap = previousDepth === null ? 0 : Math.max(1.7, PITCH - (previousDepth + shape.depth) / 2);

    rooms.push(buildRoom({ index, seed, key, ...shape, entryGap, variant, extras }));
    recent.push(key);
    if (recent.length > 2) recent.shift();
    previousDepth = shape.depth;
  }

  return rooms;
}

/* Walkable space is a union of axis-aligned rectangles: the room floor, the
 * doorway bay, the entry corridor and so on. Movement is resolved one axis at a
 * time against that union, which gives sliding along walls for free.
 */
export function walkableRects(room, { doorOpen = false } = {}) {
  const half = room.width / 2 - WALL_MARGIN;
  const rects = [];

  rects.push({
    x0: -half,
    x1: half,
    z0: room.backZ + WALL_MARGIN,
    z1: room.frontZ - WALL_MARGIN,
  });

  // Front (entry) doorway — always open, it is how you got in.
  if (room.index > 0) {
    rects.push({
      x0: -BAY_HALF,
      x1: BAY_HALF,
      z0: room.frontZ - 0.45,
      z1: room.frontZ + room.entryGap,
    });
  }

  // Back doorway, only passable while the leaf is open.
  if (doorOpen) {
    rects.push({
      x0: -BAY_HALF,
      x1: BAY_HALF,
      z0: room.backZ - 0.5,
      z1: room.backZ + 0.5,
    });
  }

  return rects;
}

export function pointInRects(x, z, rects) {
  for (let i = 0; i < rects.length; i++) {
    const r = rects[i];
    if (x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1) return true;
  }
  return false;
}

/** Where the player is dropped at the start of a run. */
export function startPosition(rooms) {
  const first = rooms[0];
  return [0, EYE, first.frontZ - 2.1];
}

/** Distance from the player to the door of the given room. */
export function distanceToDoor(room, x, z) {
  return Math.hypot(x - 0, z - room.backZ);
}
