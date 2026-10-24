/* A tiny seeded PRNG (mulberry32) plus the handful of helpers the room
 * generator needs. Every room is derived from (runSeed, roomIndex), so a run is
 * reproducible from a single number and rooms can be regenerated on demand.
 */

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashSeed(...parts) {
  let h = 2166136261;
  for (const part of parts) {
    let value = typeof part === 'number' ? Math.floor(part) : 0;
    h ^= value & 0xff;
    h = Math.imul(h, 16777619);
    h ^= (value >>> 8) & 0xff;
    h = Math.imul(h, 16777619);
    h ^= (value >>> 16) & 0xff;
    h = Math.imul(h, 16777619);
    h ^= (value >>> 24) & 0xff;
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function makeRng(seed) {
  const next = mulberry32(seed);
  const rng = {
    next,
    float: (min, max) => min + next() * (max - min),
    int: (min, max) => Math.floor(min + next() * (max - min + 1)),
    pick: (list) => list[Math.min(list.length - 1, Math.floor(next() * list.length))],
    chance: (probability) => next() < probability,
    sign: () => (next() < 0.5 ? -1 : 1),
    shuffle: (list) => {
      const copy = list.slice();
      for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
      }
      return copy;
    },
    weighted: (entries) => {
      const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
      let roll = next() * total;
      for (const entry of entries) {
        roll -= entry.weight;
        if (roll <= 0) return entry.value;
      }
      return entries[entries.length - 1].value;
    },
  };
  return rng;
}
