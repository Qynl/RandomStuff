// Every number that changes how the game feels lives here. Tune in one place.
// Units are metres (1 unit = 1 m), time in seconds.

export const ARENA_RADIUS = 26;

export const PLAYER = {
  hp: 100,
  stamina: 100,
  staminaRegen: 22,       // per second when not attacking or blocking
  walkSpeed: 4.4,
  runSpeed: 6.4,
  accel: 26,              // how quickly velocity follows input (higher = snappier)
  turnRate: 14,           // how quickly the character turns to face movement
  radius: 0.42,           // collision radius vs. arena props
  dodgeSpeed: 8.6,
  dodgeTime: 0.5,
  dodgeIframes: 0.33,     // invulnerable at the start of a dodge
  dodgeCost: 22,
  blockDrain: 14,         // stamina per second while blocking
  blockDamage: 0.25,      // fraction of damage taken while blocking in front
  guardBreakStagger: 0.9,
  hurtInvuln: 0.25,       // brief invulnerability after a hit
  comboWindow: 0.5,       // time after an attack to chain the next one
};

// Three-hit combo. `win` is the active damage window within the clip (seconds).
export const COMBO = [
  { clip: 'attack1', dur: 0.55, win: [0.24, 0.42], dmg: 14, range: 2.3, arc: 1.2, knock: 3, lunge: 1.0, stamina: 8 },
  { clip: 'attack2', dur: 0.65, win: [0.3, 0.48], dmg: 18, range: 2.4, arc: 1.0, knock: 5, lunge: 1.6, stamina: 12 },
  { clip: 'spin', dur: 0.75, win: [0.34, 0.62], dmg: 24, range: 2.7, arc: Math.PI, knock: 8, lunge: 0.4, stamina: 16 },
];

export const CAMERA = {
  dist: 4.4,
  minDist: 2.2,
  wallMargin: 0.4,       // keeps the camera this far from props
  height: 1.7,
  shoulder: 0.55,        // over-the-shoulder offset
  lookHeight: 1.45,
  pitch: 0.22,
  minPitch: -0.25,
  maxPitch: 0.95,
  sensitivity: 0.0022,
  fov: 58,
  fovSprint: 64,
  follow: 14,            // position smoothing rate
};

export const ENEMY = {
  grunt: {
    name: 'Hollow',
    hp: 40,
    speed: 2.7,
    reach: 1.75,
    aggro: 99,
    windup: 0.8,
    strikeAt: 0.2,
    recover: 0.75,
    dmg: 11,
    poise: 1,
    scale: 1,
    color: 0x5a5f6b,
    accent: 0xff3d7f,
    points: 10,
  },
  brute: {
    name: 'Bulwark',
    hp: 130,
    speed: 2.0,
    reach: 2.3,
    aggro: 99,
    windup: 1.15,
    strikeAt: 0.3,
    recover: 1.0,
    dmg: 22,
    poise: 3,
    scale: 1.32,
    color: 0x3a3430,
    accent: 0xff9a3d,
    points: 40,
  },
};

export const BOSS = {
  name: 'THE WARDEN',
  hp: 650,
  speed: 2.7,
  scale: 1.9,
  reach: 2.7,
  windup: 0.9,
  strikeAt: 0.3,
  recover: 0.9,
  dmg: 26,
  poise: 99,             // never staggers from normal hits
  points: 500,
  color: 0x2a2530,
  accent: 0xffb347,
  phase2At: 0.5,         // fraction of HP where phase 2 begins
  slamRadius: 4.4,
  slamDmg: 30,
  chargeSpeed: 10.5,
  chargeTime: 0.75,
  stunTime: 1.6,         // how long a wall-crash leaves the boss open
  shockwaveSpeed: 9,
  shockwaveDmg: 24,
  shockwaveMax: 15,
};

// Waves: each entry is a list of enemy type ids. The boss room is last.
export const WAVES = [
  ['grunt', 'grunt', 'grunt'],
  ['grunt', 'grunt', 'grunt', 'brute'],
  ['grunt', 'grunt', 'brute', 'grunt', 'grunt', 'brute'],
  ['boss'],
];
