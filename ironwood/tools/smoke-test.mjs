#!/usr/bin/env node
/**
 * IRONWOOD headless smoke test.
 *
 * The browser is the real target, but most of the game is pure logic: the
 * heightfield, collision, navigation, the player controller, bot AI, match
 * rules and the net codec all run fine in Node. This script boots those
 * systems for real (with a stub texture library standing in for the canvas
 * bakery) and shakes them hard, so a broken commit fails here instead of on
 * someone's screen.
 *
 *   node tools/smoke-test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

/* ------------------------------------------------------------------ */
/* 'three' bare specifier shim (node_modules is gitignored)            */
/* ------------------------------------------------------------------ */

function ensureThreeShim() {
  const dir = path.join(root, 'node_modules', 'three');
  fs.mkdirSync(dir, { recursive: true });
  const pkg = path.join(dir, 'package.json');
  const entry = path.join(dir, 'three.module.js');
  const pkgBody = JSON.stringify({ name: 'three', version: '0.186.1', type: 'module', main: 'three.module.js', exports: { '.': './three.module.js' } }, null, 2);
  if (!fs.existsSync(pkg) || fs.readFileSync(pkg, 'utf8') !== pkgBody) fs.writeFileSync(pkg, pkgBody);
  const reexport = "export * from '../../vendor/three.module.min.js';\n";
  if (!fs.existsSync(entry) || fs.readFileSync(entry, 'utf8') !== reexport) fs.writeFileSync(entry, reexport);
}

ensureThreeShim();
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 0);
}

const THREE = await import('three');
const { World, terrainHeight, terrainNormal, MAP } = await import('../src/world/map.js');
const { Player } = await import('../src/game/player.js');
const { Match } = await import('../src/game/match.js');
const { Bot, DIFFICULTIES } = await import('../src/game/ai.js');
const { FX } = await import('../src/game/fx.js');
const { packCode, unpackCode, createHost, createClient, MSG, Net } = await import('../src/core/net.js');
const { fbm, clamp } = await import('../src/core/math.js');
const { WEAPONS } = await import('../src/game/weapon.js');

/* ------------------------------------------------------------------ */
/* Tiny test harness                                                   */
/* ------------------------------------------------------------------ */

const results = [];
async function test(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`  ok   ${name}`);
  } catch (err) {
    results.push({ name, ok: false, err });
    console.log(`  FAIL ${name}\n       ${err.message}`);
  }
}
/** Poll until `check()` is truthy or the deadline passes - keeps async tests sane. */
async function until(check, timeout = 2500, step = 20) {
  const deadline = Date.now() + timeout;
  for (;;) {
    if (check()) return true;
    if (Date.now() > deadline) return false;
    await new Promise((r) => setTimeout(r, step));
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}
function assertNoNaN(vec, label) {
  assert(Number.isFinite(vec.x) && Number.isFinite(vec.y) && Number.isFinite(vec.z) && !Number.isNaN(vec.y), `${label} has NaN: ${JSON.stringify(vec)}`);
}

/* ------------------------------------------------------------------ */
/* Stub texture library (stands in for the canvas bakery)              */
/* ------------------------------------------------------------------ */

function fakeTexture() {
  const t = new THREE.Texture();
  t.repeat = new THREE.Vector2(1, 1);
  t.offset = new THREE.Vector2(0, 0);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.needsUpdate = true;
  return t;
}

const stubTextures = {
  quality: 'low',
  pbr(name, opts = {}) {
    const mat = new THREE.MeshStandardMaterial({
      color: opts.color ?? 0xffffff,
      transparent: !!opts.transparent,
      alphaTest: opts.alphaTest ?? 0,
    });
    mat.map = fakeTexture();
    mat.normalMap = fakeTexture();
    mat.roughnessMap = fakeTexture();
    mat.metalnessMap = mat.roughnessMap;
    mat.userData.surface = name;
    return mat;
  },
  tiled(tex) {
    return tex || fakeTexture();
  },
  sprite() {
    return fakeTexture();
  },
  spriteMaterial() {
    return new THREE.MeshBasicMaterial();
  },
  tex() {
    return fakeTexture();
  },
  normal() {
    return fakeTexture();
  },
  orm() {
    return fakeTexture();
  },
};

const silentAudio = {
  gunshot() {}, footstep() {}, impact() {}, hurt() {}, kill() {}, land() {}, jump() {},
  magOut() {}, magIn() {}, chargeHandle() {}, shellDrop() {}, dryFire() {}, meleeSwing() {},
  meleeHit() {}, explosion() {}, flashbang() {}, grenadePin() {}, grenadeBounce() {}, throwWhoosh() {},
  hitmarker() {}, callout() {}, notify() {}, uiClick() {}, uiTick() {}, radioStatic() {},
  device: null,
};

/* ------------------------------------------------------------------ */
/* The world                                                           */
/* ------------------------------------------------------------------ */

console.log('\nIRONWOOD smoke test\n');

const scene = new THREE.Scene();
const world = new World(scene, stubTextures, { seed: 1337, quality: 'low' });
let worldBuilt = false;

await world.build(() => {});
worldBuilt = true;

await test('world builds (terrain + everything) in low quality', () => {
  assert(worldBuilt, 'build did not complete');
  assert(world.terrain, 'no terrain mesh');
  assert(world.colliders.length > 100, `expected many colliders, got ${world.colliders.length}`);
  assert(world.navReady, 'navigation was not baked');
});

await test('heightfield is deterministic, finite and inside sane bounds', () => {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < 400; i++) {
    const x = (i % 20) * 11 - 110;
    const z = Math.floor(i / 20) * 11 - 110;
    const h = terrainHeight(x, z);
    assert(Number.isFinite(h), `height at ${x},${z} is ${h}`);
    assert(h === terrainHeight(x, z), 'heightfield is not deterministic');
    min = Math.min(min, h);
    max = Math.max(max, h);
  }
  assert(max - min > 4, `terrain is too flat (range ${min.toFixed(1)}..${max.toFixed(1)})`);
  assert(min > -40 && max < 160, `terrain out of bounds (${min}..${max})`);
  assert(Number.isFinite(fbm(1.5, 2.5, { octaves: 4 })));
});

await test('spawn points exist, are walkable and on the ground', () => {
  for (const team of ['us', 'opfor']) {
    assert(world.spawns[team].length >= 6, `${team} has too few spawns`);
    for (const spawn of world.spawns[team]) {
      assert(world.nav.isWalkable(spawn.x, spawn.z), `${team} spawn at ${spawn.x},${spawn.z} is not walkable`);
      assert(Math.abs(spawn.y - terrainHeight(spawn.x, spawn.z)) < 0.2, `${team} spawn is floating`);
    }
  }
});

await test('raycast hits terrain, boxes and respects the water surface', () => {
  const origin = { x: 0, y: 60, z: 0 };
  const hit = world.raycast(origin, { x: 0, y: -1, z: 0 }, 200, { bounds: false });
  assert(hit && hit.distance > 0, 'straight down ray missed the ground');
  assert(Math.abs((origin.y - hit.distance) - terrainHeight(0, 0)) < 1.5, 'ground hit does not match the heightfield');

  // horizontal ray into a known collider
  const box = world.colliders.find((c) => c.type === 'box' && c.tag !== 'bounds' && c.box.max.y - c.box.min.y > 1.2);
  if (box) {
    const center = box.box.center;
    const from = { x: center.x, y: center.y + 0.2, z: center.z - 25 };
    const h2 = world.raycast(from, { x: 0, y: 0, z: 1 }, 60, { bounds: false });
    assert(h2, 'ray at a wall hit nothing');
  }
});

await test('line of sight is blocked by solid geometry and clear in open air', () => {
  const open = world.lineOfSight({ x: -86, y: terrainHeight(-86, 78) + 1.7, z: 78 }, { x: -80, y: terrainHeight(-80, 74) + 1.7, z: 74 });
  assert(open, 'sight failed across open ground at the US spawn');
  const solid = world.colliders.find((c) => c.type === 'box' && c.box.max.y - c.box.min.y > 2.5 && c.tag !== 'bounds');
  if (solid) {
    const c = solid.box.center;
    const a = { x: c.x, y: c.y, z: c.z - 6 };
    const b = { x: c.x, y: c.y, z: c.z + 6 };
    assert(!world.lineOfSight(a, b), 'sight passed straight through a wall');
  }
});

await test('A* finds paths across the map and they are walkable', () => {
  const a = world.spawns.us[0];
  const b = world.spawns.opfor[0];
  const raw = world.nav.findPath(a.x, a.z, b.x, b.z, 60000);
  assert(raw && raw.length > 10, `path too short (${raw ? raw.length : 'null'})`);
  const sm = world.nav.smoothPath(raw);
  assert(sm && sm.length >= 2, 'smoothed path collapsed');
  for (const point of sm) {
    assert(world.nav.isWalkable(point.x, point.z), `path waypoint ${point.x.toFixed(1)},${point.z.toFixed(1)} is not walkable`);
  }
  assert(sm[sm.length - 1].x === raw[raw.length - 1].x, 'path does not end at the goal');
});

await test('the play space is one connected walkable graph', () => {
  const nav = world.nav;
  const { size, originX, originZ, cell } = nav;
  const comp = new Int32Array(size * size).fill(-1);
  const sizes = [];
  let count = 0;
  for (let i = 0; i < size * size; i++) {
    if (!nav.walkable[i] || comp[i] >= 0) continue;
    const id = count++;
    const stack = [i];
    comp[i] = id;
    let n = 0;
    while (stack.length) {
      const c = stack.pop();
      n++;
      const gx = c % size;
      const gz = (c / size) | 0;
      if (gx > 0 && nav.walkable[c - 1] && comp[c - 1] < 0) { comp[c - 1] = id; stack.push(c - 1); }
      if (gx < size - 1 && nav.walkable[c + 1] && comp[c + 1] < 0) { comp[c + 1] = id; stack.push(c + 1); }
      if (gz > 0 && nav.walkable[c - size] && comp[c - size] < 0) { comp[c - size] = id; stack.push(c - size); }
      if (gz < size - 1 && nav.walkable[c + size] && comp[c + size] < 0) { comp[c + size] = id; stack.push(c + size); }
    }
    sizes[id] = n;
  }
  const walkableTotal = nav.walkable.reduce((a, b) => a + b, 0);
  let main = 0;
  for (let id = 1; id < count; id++) if (sizes[id] > sizes[main]) main = id;
  assert(sizes[main] / walkableTotal > 0.97, `main walkable component only covers ${(100 * sizes[main] / walkableTotal).toFixed(1)}% of the map`);
  const at = (x, z) => comp[Math.floor((z - originZ) / cell) * size + Math.floor((x - originX) / cell)];
  const landmarks = [
    ['us spawn', world.spawns.us[0].x, world.spawns.us[0].z],
    ['opfor spawn', world.spawns.opfor[0].x, world.spawns.opfor[0].z],
    ['temple', 52, -52], ['crossroads', 2, -2], ['village road', -70, 62],
  ];
  for (const [name, x, z] of landmarks) {
    assert(nav.isWalkable(x, z), `${name} is not walkable at all`);
    assert(at(x, z) === main, `${name} sits in a stranded pocket (component ${at(x, z)} of ${sizes[at(x, z)]} cells)`);
  }
  for (const wk of world.walkways) {
    const mx = (wk.ax + wk.bx) / 2;
    const mz = (wk.az + wk.bz) / 2;
    assert(nav.isWalkable(mx, mz), `bridge deck at ${mx.toFixed(0)},${mz.toFixed(0)} is not in the nav graph`);
    assert(at(mx, mz) === main, 'a bridge deck is isolated from the mainland');
  }
  const route = nav.findPath(world.spawns.us[0].x, world.spawns.us[0].z, world.spawns.opfor[0].x, world.spawns.opfor[0].z, 60000);
  assert(route && route.length > 10, 'no full route between the spawns');
  assert(!route[route.length - 1].partial, 'spawn route is only a partial march');
});

await test('bridges carry a body across the water and keep it on the deck', () => {
  const deck = world.walkways[0];
  assert(deck, 'no walkways were registered');
  const mid = { x: (deck.ax + deck.bx) / 2, z: (deck.az + deck.bz) / 2 };
  assert(world.waterDepth(mid.x, mid.z) > 1.6, 'the bridge is not spanning deep water');
  assert(Math.abs(world.supportHeight(mid.x, mid.z, deck.yA + 0.1) - deck.yA) < 0.05, 'the deck is not a support surface');

  // walk the plank: from one abutment to the other, staying at deck height
  const dirX = (deck.bx - deck.ax) / Math.hypot(deck.bx - deck.ax, deck.bz - deck.az);
  const dirZ = (deck.bz - deck.az) / Math.hypot(deck.bx - deck.ax, deck.bz - deck.az);
  const pos = new THREE.Vector3(deck.ax, deck.yA + 0.02, deck.az);
  let lowest = Infinity;
  let onDeckFrames = 0;
  for (let i = 0; i < 260; i++) {
    pos.x += dirX * 0.09;
    pos.z += dirZ * 0.09;
    const support = world.supportHeight(pos.x, pos.z, pos.y + 0.62);
    if (pos.y <= support + 0.01) pos.y = support;
    else pos.y -= 0.05;
    world.resolveCollisions(pos, 0.38, 1.8);
    lowest = Math.min(lowest, pos.y);
    if (pos.y > MAP.waterLevel + 0.4) onDeckFrames++;
  }
  assert(onDeckFrames > 200, `the walker fell off the bridge (${onDeckFrames} frames above water)`);
  assert(lowest > MAP.waterLevel - 0.2, 'the walker ended up in the river');

  // the railings stop a body from stepping sideways off the span
  const rail = new THREE.Vector3(mid.x, deck.yA, mid.z);
  const off = new THREE.Vector3(0, 0, 0);
  off.x = mid.x + dirZ * 6;
  off.z = mid.z - dirX * 6;
  off.y = deck.yA;
  world.resolveCollisions(off, 0.38, 1.8);
  const lateral = Math.hypot(off.x - mid.x, off.z - mid.z);
  assert(lateral < deck.halfWidth + 0.2, `the railing let a body drift ${lateral.toFixed(2)} m off the centre line`);
  void rail;
});

await test('cliffs and deep water stop a body from walking out of the world', () => {
  const spawn = world.spawns.us[0];
  const player = new Player(world, { x: spawn.x, y: spawn.y, z: spawn.z });
  const startY = player.position.y;
  let peak = startY;
  for (let i = 0; i < 1200; i++) {
    player.update(1 / 60, { moveX: 0, moveZ: -1, jump: false, crouch: false, prone: false, sprint: true }, {});
    peak = Math.max(peak, player.position.y);
    assert(Math.abs(player.position.x) < 118 && Math.abs(player.position.z) < 118, 'player left the play area');
    assert(player.position.y > -12, 'player fell through the world');
  }
  assert(peak - startY < 14, `player climbed ${(peak - startY).toFixed(1)} m of cliff`);

  // a steep face has to redirect the move, never allow an uphill march
  let steep = null;
  const probe = new THREE.Vector3();
  for (let x = -110; x <= 110 && !steep; x += 2) {
    for (let z = -110; z <= 110; z += 2) {
      const n = terrainNormal(x, z, probe);
      const gl0 = Math.hypot(n.x, n.z);
      if (gl0 < 1e-3) continue;
      const ux = -n.x / gl0;
      const uz = -n.z / gl0;
      const ahead = terrainNormal(x + ux * 0.55, z + uz * 0.55, probe);
      if (ahead.y < 0.4) {
        steep = { x, z, ux, uz };
        break;
      }
    }
  }
  assert(steep, 'the map has no cliffs to test against');
  const clamped = world.clampGroundMove(steep.x, steep.z, steep.ux * 5, steep.uz * 5);
  const stillUphill = clamped.x * steep.ux + clamped.z * steep.uz;
  assert(stillUphill <= 0.35, `climbing a cliff was allowed at ${stillUphill.toFixed(2)} m/s`);

  // wading is fine, swimming is not
  let deep = null;
  for (let x = -60; x <= 60 && !deep; x += 2) {
    for (let z = -60; z <= 60; z += 2) {
      if (world.waterDepth(x, z) > 2) {
        deep = { x, z };
        break;
      }
    }
  }
  assert(deep, 'the map has no deep water to test against');
  // step back from the deep spot until the water is only chest deep ahead
  let shoreX = deep.x;
  for (let i = 0; i < 120; i++) {
    const next = shoreX - 0.25;
    if (world.waterDepth(next, deep.z) <= 1.6 && world.waterDepth(next + 0.55, deep.z) > 1.6) {
      shoreX = next;
      break;
    }
    shoreX = next;
  }
  const into = world.clampGroundMove(shoreX, deep.z, 5, 0);
  assert(into.x < 4.6, `deep water did not slow a body walking straight in (${into.x.toFixed(2)} m/s)`);
});

await test('collision resolution keeps a body out of solid walls', () => {
  const solid = world.colliders.find((c) => c.type === 'box' && c.tag !== 'bounds' && c.box.max.y - c.box.min.y > 2);
  if (solid) {
    const c = solid.box.center;
    const pos = new THREE.Vector3(c.x, c.y, c.z);
    world.resolveCollisions(pos, 0.38, 1.8);
    assert(!solid.box.containsPoint({ x: pos.x, y: c.y, z: pos.z }), 'body stayed inside a wall after resolution');
  }
});

/* ------------------------------------------------------------------ */
/* Player controller                                                   */
/* ------------------------------------------------------------------ */

await test('player walks, sprints, jumps and never leaves the ground plane', () => {
  const spawn = world.spawns.us[0];
  const player = new Player(world, { x: spawn.x, y: spawn.y, z: spawn.z, team: 'us', isLocal: true });
  const start = player.position.clone();
  let maxY = -Infinity;
  let minY = Infinity;
  for (let i = 0; i < 900; i++) {
    const cmd = {
      moveX: 0,
      moveZ: -1,
      jump: i % 180 === 60,
      crouch: i % 300 > 200,
      prone: false,
      sprint: i % 220 < 110,
    };
    player.update(1 / 60, cmd, {});
    assertNoNaN(player.position, 'player position');
    maxY = Math.max(maxY, player.position.y);
    minY = Math.min(minY, player.position.y);
  }
  const travelled = Math.hypot(player.position.x - start.x, player.position.z - start.z);
  assert(travelled > 12, `player barely moved (${travelled.toFixed(1)} m)`);
  assert(maxY - minY < 30, 'player teleported vertically');
  assert(player.position.y > -12, 'player sank through the world');
  assert(player.stamina <= 1 && player.stamina >= 0, 'stamina out of range');
});

await test('fall damage + respawn work', () => {
  const spawn = world.spawns.us[0];
  const player = new Player(world, { x: spawn.x, y: spawn.y + 40, z: spawn.z });
  for (let i = 0; i < 200; i++) player.update(1 / 60, { moveX: 0, moveZ: 0 }, {});
  assert(player.health <= 100, 'health above max');
  player.damage(500, { direction: { x: 1, y: 0, z: 0 } });
  assert(!player.alive, 'lethal damage did not kill');
  player.respawn(spawn);
  assert(player.alive && player.health === 100, 'respawn did not restore the player');
});

/* ------------------------------------------------------------------ */
/* Combat systems                                                      */
/* ------------------------------------------------------------------ */

await test('weapon table is complete and self consistent', () => {
  for (const [id, def] of Object.entries(WEAPONS)) {
    assert(def.id === id, `${id} has mismatched id`);
    assert(typeof def.name === 'string' && def.name.length, `${id} has no name`);
    if (def.kind === 'grenade' || def.kind === 'melee') continue;
    assert(def.damage > 0, `${id} does no damage`);
    assert(def.rpm > 0, `${id} has no fire rate`);
    assert(def.magSize > 0, `${id} has no magazine`);
    assert(def.reloadTime > 0.3, `${id} reloads impossibly fast`);
    assert(def.adsFov > 4 && def.adsFov < 70, `${id} ADS field of view is odd`);
    assert(def.spread.hip >= def.spread.ads, `${id} hip fire is more accurate than ADS`);
  }
  assert(WEAPONS.intervention.adsFov < WEAPONS.m4a1.adsFov, 'the sniper should zoom more than the rifle');
});

await test('a live bot-vs-bot firefight produces kills', () => {
  const fx = new FX(scene, world, stubTextures, silentAudio, { quality: 'low' });
  const match = new Match({
    world,
    textures: stubTextures,
    audio: silentAudio,
    fx,
    net: null,
    settings: { difficulty: 'hardened' },
    hooks: {},
  });
  const player = match.addLocalPlayer({ name: 'Tester', team: 'us', weapon: 'm4a1' });
  assert(player.alive, 'local player did not spawn alive');
  for (let i = 0; i < 6; i++) match.addBot({ team: 'us', difficulty: 'hardened', index: i });
  for (let i = 0; i < 6; i++) match.addBot({ team: 'opfor', difficulty: 'hardened', index: i });
  match.start({ difficulty: 'hardened', bots: 6, mode: 'tdm' });

  // drop the two teams next to each other so contact is guaranteed quickly
  const mid = { x: 2, z: -2 };
  const bots = [...match.bots.values()];
  bots.forEach((bot, i) => {
    const side = bot.team === 'us' ? -1 : 1;
    bot.position.set(mid.x + side * (6 + (i % 3) * 1.5), terrainHeight(mid.x, mid.z) + 0.1, mid.z + (i % 4) * 2 - 3);
  });

  let shots = 0;
  let errors = 0;
  for (let tick = 0; tick < 3600; tick++) {
    const ctx = {
      targets: [...match.entities.values()],
      world,
      match,
      onDamage: (target, dmg, info) => match.damage(target, dmg, info),
      onGrenade: () => {},
      onCallout: () => {},
      onShotFx: () => {},
    };
    try {
      match.update(1 / 60, ctx);
      player.update(1 / 60, { moveX: 0, moveZ: 0, jump: false, crouch: false }, {});
      fx.update(1 / 60);
    } catch (err) {
      errors++;
      if (errors === 1) console.log(`       first error: ${err.stack.split('\n').slice(0, 3).join(' | ')}`);
      if (errors > 3) break;
    }
    for (const bot of match.bots.values()) {
      shots += bot.stats.shots > 0 ? 1 : 0;
      bot.stats.shots = 0;
      assertNoNaN(bot.position, `bot ${bot.name}`);
    }
  }
  assert(errors === 0, `${errors} simulation errors`);
  assert(shots > 20, `bots barely fired (${shots} shot ticks)`);
  assert(match.scores.us + match.scores.opfor > 0, 'no kills happened in 60 seconds of fighting');
  const aliveBots = [...match.bots.values()].filter((b) => b.alive).length;
  assert(aliveBots > 0, 'every bot died and none respawned');
});

await test('bots path their way toward the objective instead of standing still', () => {
  const bot = new Bot(world, { team: 'opfor', difficulty: 'regular', x: world.spawns.opfor[0].x, y: world.spawns.opfor[0].y, z: world.spawns.opfor[0].z });
  const start = { x: bot.position.x, z: bot.position.z };
  const ctx = {
    targets: [],
    world,
    match: {
      objectiveFor: () => ({ x: 2, z: -2, name: 'CROSSROADS' }),
      spawnAreaFor: () => ({ x: -86, z: 78 }),
    },
    onDamage: () => {},
    onGrenade: () => {},
    onCallout: () => {},
  };
  for (let i = 0; i < 1200; i++) bot.update(1 / 60, ctx);
  const moved = Math.hypot(bot.position.x - start.x, bot.position.z - start.z);
  assert(moved > 20, `bot only moved ${moved.toFixed(1)} m in 20 simulated seconds`);
  assertNoNaN(bot.position, 'bot position');
});

/* ------------------------------------------------------------------ */
/* Match rules                                                         */
/* ------------------------------------------------------------------ */

await test('damage, kills, scores, streaks and match end behave', () => {
  const match = new Match({ world, textures: stubTextures, audio: silentAudio, fx: null, settings: {}, hooks: {} });
  const a = match.addLocalPlayer({ name: 'A', team: 'us', weapon: 'm4a1' });
  const b = match.addBot({ team: 'opfor', difficulty: 'regular', index: 0 });
  match.start({ difficulty: 'regular', bots: 1 });

  // friendly fire is ignored
  const friendly = match.damage(a, 50, { attacker: a });
  assert(friendly === null, 'friendly fire was applied');

  const killed = match.damage(b, 999, { attacker: a, weapon: 'm4a1', headshot: true });
  assert(killed, 'kill was not registered');
  assert(!b.alive, 'victim still alive');
  assert(match.scores.us === 1, `score did not increase (${match.scores.us})`);
  assert(match.killfeed.length === 1, 'killfeed entry missing');
  assert(a.kills === 1, 'attacker kill count wrong');

  // streak / UAV at 5 kills
  for (let i = 0; i < 4; i++) {
    b.alive = true;
    b.health = 100;
    match.damage(b, 999, { attacker: a, weapon: 'm4a1' });
  }
  assert(match.uav.us > 0, 'UAV streak did not trigger at 5 kills');

  // score limit ends the match
  match.scores.us = 75;
  match.damage((() => { b.alive = true; b.health = 100; return b; })(), 999, { attacker: a, weapon: 'm4a1' });
  assert(match.state === 'ended', 'score limit did not end the match');
  assert(match.matchSummary && match.matchSummary.winner === 'us', 'wrong match winner');
});

await test('radar blips only reveal what the player can actually see', () => {
  const match = new Match({ world, textures: stubTextures, audio: silentAudio, fx: null, settings: {}, hooks: {} });
  const local = match.addLocalPlayer({ name: 'Scout', team: 'us', weapon: 'm4a1' });
  const mate = match.addBot({ team: 'us', difficulty: 'regular', index: 0 });
  const enemy = match.addBot({ team: 'opfor', difficulty: 'regular', index: 1 });
  enemy.position.set(local.position.x + 8, local.position.y, local.position.z + 8);
  const blips = match.radarBlips('us');
  assert(Array.isArray(blips), 'blips should be an array');
  mate.position.set(local.position.x + 2, local.position.y, local.position.z + 2);
  assert(match.teamSummary().us.alive >= 2, 'team summary is wrong');
});

/* ------------------------------------------------------------------ */
/* Networking                                                          */
/* ------------------------------------------------------------------ */

await test('pairing codes round-trip through compression', async () => {
  const payload = { v: 1, role: 'offer', sdp: 'v=0\r\no=- 123 2 IN IP4 127.0.0.1\r\n' + 'a=candidate:1 1 udp 2113937151 192.168.1.5 50000 typ host\r\n'.repeat(40) };
  const code = await packCode(payload);
  assert(typeof code === 'string' && code.length > 0, 'no code produced');
  const back = await unpackCode(code);
  assert(back.sdp === payload.sdp && back.role === 'offer', 'code did not survive the round trip');
});

await test('raw pack/unpack is async-safe', async () => {
  const code = await packCode({ hello: 'jungle' });
  const back = await unpackCode(code);
  assert(back.hello === 'jungle', 'payload mismatch');
});

await test('same-device host and client complete a handshake', async () => {
  const room = `TEST${Math.floor(Math.random() * 900 + 100)}`;
  const host = await createHost({ transport: 'tab', roomCode: room, name: 'Host' });
  const received = [];
  let joined = null;
  host.net.on('peerJoin', (peer) => {
    joined = peer;
  });
  host.net.on('message', (msg) => received.push(msg));
  const client = await createClient({ transport: 'tab', roomCode: room, name: 'Guest' });
  let hostSeen = false;
  client.net.on('peerJoin', () => {
    hostSeen = true;
  });
  client.net.send({ t: MSG.CHAT, text: 'hello from guest' });
  await until(() => joined && hostSeen && received.length > 0);
  assert(joined, 'host never saw the guest');
  assert(hostSeen, 'guest never saw the host');
  assert(received.length > 0, 'host received no traffic');
  assert(host.net instanceof Net && client.net instanceof Net, 'factories returned the wrong objects');
  host.net.close();
  client.net.close();
});

await test('net pings and bookkeeping do not throw', async () => {
  const room = `PING${Math.floor(Math.random() * 9000 + 1000)}`;
  const host = await createHost({ transport: 'tab', roomCode: room, name: 'Host' });
  const client = await createClient({ transport: 'tab', roomCode: room, name: 'Guest' });
  for (let i = 0; i < 60; i++) {
    host.net.update(1 / 60);
    client.net.update(1 / 60);
  }
  await new Promise((r) => setTimeout(r, 80));
  assert(host.net.ping >= 0 && client.net.ping >= 0, 'ping went negative');
  host.net.close();
  client.net.close();
});

await test('match snapshots serialise and apply between host and guest', () => {
  const hostMatch = new Match({ world, textures: stubTextures, audio: silentAudio, fx: null, settings: {}, hooks: {} });
  hostMatch.addLocalPlayer({ name: 'Host', team: 'us', weapon: 'm4a1' });
  hostMatch.addBot({ team: 'us', difficulty: 'regular', index: 0 });
  hostMatch.start({ difficulty: 'regular', bots: 1 });
  hostMatch.net = { isHost: true, broadcast: () => {}, peers: new Map(), send: () => {}, ping: 0 };
  hostMatch.broadcastSnapshot();

  const payload = { t: MSG.SNAPSHOT, time: 300, s: { us: 3, opfor: 2 }, st: 'live', p: [], b: [], uav: {}, ev: [] };
  const guestMatch = new Match({ world, textures: stubTextures, audio: silentAudio, fx: null, settings: {}, hooks: {} });
  guestMatch.local = new Match({ world, textures: stubTextures, audio: silentAudio, fx: null, settings: {}, hooks: {} }).local;
  guestMatch.net = { isHost: false, send: () => {}, broadcast: () => {}, peers: new Map(), ping: 0 };
  guestMatch.handleMessage(payload, 'host');
  assert(guestMatch.scores.us === 3, 'scores did not sync');
  assert(guestMatch.state === 'live', 'state did not sync');
});

await test('unknown DIFFICULTIES fall back safely', () => {
  const bot = new Bot(world, { team: 'us', difficulty: 'not-a-difficulty' });
  assert(bot.diff && bot.diff.reaction > 0, 'difficulty fallback failed');
  assert(Object.keys(DIFFICULTIES).length >= 4, 'expected four difficulty tiers');
});

/* ------------------------------------------------------------------ */

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.log('\nFailures:');
  for (const f of failed) console.log(` - ${f.name}: ${f.err.message}`);
  process.exit(1);
}
console.log('Map size used:', MAP.size, '· colliders:', world.colliders.length, '· cover points:', world.coverPoints.length);
void clamp;
