/**
 * IRONWOOD - weapons.
 *
 * Three parts:
 *   1. WEAPONS      - the balance table (damage, rpm, spread, recoil, handling)
 *   2. Viewmodel    - procedural gun models with hands, sights, reload and
 *                     sprint/ADS poses, drawn in a separate scene so the barrel
 *                     never pokes through walls
 *   3. WeaponSystem - fire control, ballistics (hitscan with penetration),
 *                     grenades, melee and the event stream the game listens to
 *
 * Sights are modelled for real: the red dot and the scope tube are placed on a
 * known anchor, and the ADS pose moves that anchor onto the camera's centre
 * line so what you see is where the bullets go.
 */

import * as THREE from 'three';
import { TAU, clamp, lerp, damp, rand, randRange, Spring, smoothstep } from '../core/math.js';

export const WEAPONS = {
  m4a1: {
    id: 'm4a1', name: 'M4A1', kind: 'rifle', slot: 'primary', audio: 'rifle',
    damage: 24, rpm: 800, modes: ['auto', 'single'], magSize: 30, reserve: 240,
    reloadTime: 2.25, reloadEvents: [[0.18, 'magOut'], [0.62, 'magIn'], [0.85, 'bolt']],
    adsTime: 0.2, adsFov: 26, hipFov: 62, sight: 'reddot', zoom: 1.5,
    spread: { hip: 0.0075, ads: 0.00035, bloom: 0.0011, max: 0.014, move: 2.1, jump: 3.4, crouch: 0.72 },
    recoil: { kick: 0.0082, kickAds: 0.0062, side: 0.0032, recovery: 7.5, viewKick: 0.55 },
    range: { falloffStart: 55, falloffEnd: 110, minMult: 0.72 },
    penetration: 0.35, tracerEvery: 3, holdBreath: false, sprintOut: 0.22,
  },
  intervention: {
    id: 'intervention', name: 'Intervention', kind: 'sniper', slot: 'primary', audio: 'sniper',
    damage: 95, rpm: 45, modes: ['bolt'], magSize: 5, reserve: 25,
    reloadTime: 3.5, reloadEvents: [[0.25, 'magOut'], [0.7, 'magIn'], [0.9, 'bolt']],
    adsTime: 0.42, adsFov: 9, hipFov: 62, sight: 'scope', zoom: 6.2,
    spread: { hip: 0.028, ads: 0.00004, bloom: 0.006, max: 0.05, move: 4.2, jump: 6, crouch: 0.6 },
    recoil: { kick: 0.052, kickAds: 0.05, side: 0.004, recovery: 4.2, viewKick: 1.6 },
    range: { falloffStart: 400, falloffEnd: 500, minMult: 0.95 },
    penetration: 1.0, tracerEvery: 1, holdBreath: true, sprintOut: 0.45, boltCycle: 1.15, swayScale: 0.35,
  },
  mp5: {
    id: 'mp5', name: 'MP5', kind: 'smg', slot: 'primary', audio: 'smg',
    damage: 17, rpm: 900, modes: ['auto'], magSize: 30, reserve: 240,
    reloadTime: 2.0, reloadEvents: [[0.16, 'magOut'], [0.6, 'magIn'], [0.82, 'bolt']],
    adsTime: 0.17, adsFov: 30, hipFov: 64, sight: 'reddot', zoom: 1.45,
    spread: { hip: 0.0095, ads: 0.0005, bloom: 0.0012, max: 0.016, move: 1.7, jump: 3.0, crouch: 0.75 },
    recoil: { kick: 0.0062, kickAds: 0.0048, side: 0.0036, recovery: 8.5, viewKick: 0.42 },
    range: { falloffStart: 32, falloffEnd: 70, minMult: 0.62 },
    penetration: 0.25, tracerEvery: 4, holdBreath: false, sprintOut: 0.18,
  },
  m9: {
    id: 'm9', name: 'M9', kind: 'pistol', slot: 'secondary', audio: 'pistol',
    damage: 22, rpm: 420, modes: ['single'], magSize: 15, reserve: 60,
    reloadTime: 1.65, reloadEvents: [[0.2, 'magOut'], [0.68, 'magIn'], [0.86, 'bolt']],
    adsTime: 0.14, adsFov: 42, hipFov: 62, sight: 'iron', zoom: 1.3,
    spread: { hip: 0.009, ads: 0.0009, bloom: 0.002, max: 0.02, move: 1.5, jump: 2.6, crouch: 0.8 },
    recoil: { kick: 0.0095, kickAds: 0.008, side: 0.004, recovery: 9, viewKick: 0.5 },
    range: { falloffStart: 22, falloffEnd: 45, minMult: 0.6 },
    penetration: 0.2, tracerEvery: 1, holdBreath: false, sprintOut: 0.15,
  },
  knife: {
    id: 'knife', name: 'Combat Knife', kind: 'melee', slot: 'melee', audio: 'melee',
    damage: 150, range: 2.3, cooldown: 0.62, swingTime: 0.28,
  },
  frag: {
    id: 'frag', name: 'Frag Grenade', kind: 'grenade', type: 'frag',
    damage: 135, radius: 7.5, fuse: 3.4, throwSpeed: 17,
  },
  flash: {
    id: 'flash', name: 'Flashbang', kind: 'grenade', type: 'flash',
    damage: 0, radius: 12, fuse: 2.2, throwSpeed: 18, flashDuration: 5.2,
  },
};

/* ------------------------------------------------------------------ */
/* Procedural gun models                                               */
/* ------------------------------------------------------------------ */

function mat(textures, name, opts) {
  const m = textures.pbr(name, { repeat: opts?.repeat ?? 1.6, surface: opts?.surface });
  if (opts?.color !== undefined) m.color = new THREE.Color(opts.color);
  return m;
}

function box(w, h, d, material, x, y, z, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  m.castShadow = false;
  m.receiveShadow = false;
  return m;
}

function cyl(r1, r2, h, material, x, y, z, seg = 12, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, seg), material);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  return m;
}

/** Gloved hand + forearm reaching toward the weapon from the camera. */
function buildArm(textures, teamHue = 0x6a6a52, side = 'left') {
  const g = new THREE.Group();
  const sleeve = mat(textures, 'camoUS', { repeat: 3 });
  const glove = mat(textures, 'leatherGlove', { repeat: 2, color: 0x2a2622 });
  const hand = box(0.085, 0.1, 0.12, glove, 0, 0, 0);
  g.add(hand);
  const thumb = box(0.03, 0.035, 0.07, glove, side === 'left' ? 0.05 : -0.05, 0.03, 0.02);
  g.add(thumb);
  const forearm = new THREE.Mesh(new THREE.CapsuleGeometry(0.048, 0.3, 3, 8), sleeve);
  forearm.position.set(0, -0.02, 0.24);
  forearm.rotation.x = Math.PI / 2;
  g.add(forearm);
  const shoulderFade = cyl(0.05, 0.062, 0.16, sleeve, 0, -0.01, 0.46, 8, Math.PI / 2);
  g.add(shoulderFade);
  g.traverse((o) => {
    if (o.isMesh) o.castShadow = false;
  });
  void teamHue;
  return g;
}

function buildRedDot(textures) {
  const g = new THREE.Group();
  const metal = mat(textures, 'gunmetal', { repeat: 2 });
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.1, 14, 1, true), metal);
  tube.rotation.x = Math.PI / 2;
  g.add(tube);
  g.add(cyl(0.032, 0.032, 0.012, metal, 0, 0, 0.05, 14, Math.PI / 2));
  g.add(cyl(0.03, 0.03, 0.012, metal, 0, 0, -0.05, 14, Math.PI / 2));
  // tinted glass
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x0a1a12, roughness: 0.12, metalness: 0.4, transparent: true, opacity: 0.55,
  });
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.026, 16), glassMat);
  lens.position.z = 0.052;
  lens.rotation.y = Math.PI;
  g.add(lens);
  // the dot itself (only really visible when aiming)
  const dotMat = new THREE.MeshBasicMaterial({ color: 0xff2a12, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const dot = new THREE.Mesh(new THREE.CircleGeometry(0.0032, 10), dotMat);
  dot.position.z = -0.06;
  dot.rotation.y = Math.PI;
  g.add(dot);
  const mount = box(0.03, 0.045, 0.05, metal, 0, -0.035, 0);
  g.add(mount);
  g.userData.dot = dot;
  g.userData.aimAnchor = new THREE.Vector3(0, 0, -0.01);
  return g;
}

function buildScope(textures) {
  const g = new THREE.Group();
  const metal = mat(textures, 'gunmetal', { repeat: 2 });
  g.add(cyl(0.024, 0.024, 0.34, metal, 0, 0, 0, 16, Math.PI / 2));
  g.add(cyl(0.033, 0.033, 0.06, metal, 0, 0, -0.19, 16, Math.PI / 2));
  g.add(cyl(0.03, 0.03, 0.05, metal, 0, 0, 0.18, 16, Math.PI / 2));
  // turrets
  g.add(cyl(0.017, 0.017, 0.028, metal, 0, 0.038, 0, 10));
  g.add(cyl(0.017, 0.017, 0.028, metal, 0.038, 0, 0, 10, 0, 0, Math.PI / 2));
  // rings
  g.add(cyl(0.03, 0.03, 0.03, metal, 0, -0.012, -0.1, 12, Math.PI / 2));
  g.add(cyl(0.03, 0.03, 0.03, metal, 0, -0.012, 0.1, 12, Math.PI / 2));
  const lensMat = new THREE.MeshStandardMaterial({ color: 0x081214, roughness: 0.08, metalness: 0.5 });
  const obj = new THREE.Mesh(new THREE.CircleGeometry(0.03, 20), lensMat);
  obj.position.z = -0.216;
  g.add(obj);
  const ocular = new THREE.Mesh(new THREE.CircleGeometry(0.028, 20), lensMat);
  ocular.position.z = 0.205;
  ocular.rotation.y = Math.PI;
  g.add(ocular);
  g.userData.aimAnchor = new THREE.Vector3(0, 0, -0.02);
  return g;
}

function buildIronSights(textures) {
  const g = new THREE.Group();
  const metal = mat(textures, 'gunmetal', { repeat: 2 });
  g.add(box(0.008, 0.014, 0.008, metal, 0, 0.02, -0.1));
  g.add(box(0.022, 0.012, 0.008, metal, 0, 0.02, 0.06));
  g.userData.aimAnchor = new THREE.Vector3(0, 0.026, -0.1);
  return g;
}

function buildM4a1(textures, opts = {}) {
  const g = new THREE.Group();
  const metal = mat(textures, 'gunmetal', { repeat: 1.8 });
  const poly = mat(textures, 'polymer', { repeat: 2.5 });
  // lower + upper receiver
  g.add(box(0.058, 0.075, 0.2, metal, 0, 0, -0.02));
  g.add(box(0.05, 0.05, 0.22, metal, 0, 0.055, -0.03));
  // handguard with rail slots
  g.add(box(0.052, 0.055, 0.3, poly, 0, 0.045, -0.28));
  for (let i = 0; i < 7; i++) {
    g.add(box(0.056, 0.008, 0.02, metal, 0, 0.078, -0.16 - i * 0.036));
  }
  // barrel + brake
  g.add(cyl(0.011, 0.011, 0.2, metal, 0, 0.045, -0.52, 10, Math.PI / 2));
  g.add(cyl(0.019, 0.017, 0.055, metal, 0, 0.045, -0.63, 10, Math.PI / 2));
  // front sight post
  g.add(box(0.012, 0.03, 0.012, metal, 0, 0.075, -0.44));
  // gas block
  g.add(box(0.026, 0.024, 0.04, metal, 0, 0.056, -0.42));
  // pistol grip
  g.add(box(0.036, 0.11, 0.045, poly, 0, -0.085, 0.03, 0.32));
  // trigger guard
  g.add(box(0.008, 0.01, 0.05, poly, 0, -0.045, 0.0));
  // magazine
  const magMat = mat(textures, 'polymer', { repeat: 2 });
  const mag = new THREE.Group();
  mag.add(box(0.036, 0.14, 0.062, magMat, 0, -0.075, 0));
  mag.position.set(0, -0.05, -0.075);
  mag.rotation.x = -0.16;
  g.add(mag);
  g.userData.mag = mag;
  // stock
  g.add(cyl(0.019, 0.019, 0.14, poly, 0, 0.045, 0.14, 10, Math.PI / 2));
  g.add(box(0.05, 0.075, 0.13, poly, 0, 0.035, 0.26));
  g.add(box(0.045, 0.04, 0.05, poly, 0, -0.005, 0.22));
  // charging handle
  g.add(box(0.03, 0.012, 0.03, metal, -0.01, 0.075, 0.1));
  // brass deflector
  g.add(box(0.014, 0.02, 0.02, metal, 0.03, 0.055, -0.02));
  // vertical foregrip
  g.add(box(0.03, 0.09, 0.032, poly, 0, -0.02, -0.34));

  const sight = opts.sightType === 'iron' ? buildIronSights(textures) : buildRedDot(textures);
  sight.position.set(0, opts.sightType === 'iron' ? 0.076 : 0.11, -0.12);
  g.add(sight);
  g.userData.sight = sight;

  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.045, -0.68);
  g.add(muzzle);
  g.userData.muzzle = muzzle;
  const eject = new THREE.Object3D();
  eject.position.set(0.045, 0.05, 0.02);
  g.add(eject);
  g.userData.eject = eject;

  const gripHand = buildArm(textures, 0x6a6a52, 'right');
  gripHand.position.set(0, -0.03, 0.06);
  gripHand.rotation.set(0.5, -0.25, 0);
  g.add(gripHand);
  const supportHand = buildArm(textures, 0x6a6a52, 'left');
  supportHand.position.set(0, -0.02, -0.34);
  supportHand.rotation.set(0.85, 0.3, 0);
  g.add(supportHand);
  g.userData.supportHand = supportHand;
  return g;
}

function buildIntervention(textures) {
  const g = new THREE.Group();
  const metal = mat(textures, 'gunmetal', { repeat: 1.6 });
  const poly = mat(textures, 'polymer', { repeat: 2.2, color: 0x2b2d26 });
  // receiver / chassis
  g.add(box(0.06, 0.075, 0.28, metal, 0, 0, -0.02));
  g.add(box(0.05, 0.05, 0.16, poly, 0, -0.02, 0.1));
  // long fluted barrel
  g.add(cyl(0.014, 0.017, 0.62, metal, 0, 0.03, -0.6, 12, Math.PI / 2));
  for (let i = 0; i < 5; i++) {
    g.add(cyl(0.019, 0.019, 0.06, metal, 0, 0.03, -0.42 - i * 0.09, 10, Math.PI / 2));
  }
  g.add(cyl(0.022, 0.026, 0.09, metal, 0, 0.03, -0.93, 12, Math.PI / 2));
  // stock with cheek riser and thumbhole
  g.add(box(0.055, 0.09, 0.24, poly, 0, 0.01, 0.24));
  g.add(box(0.045, 0.03, 0.16, poly, 0, 0.06, 0.22));
  g.add(box(0.07, 0.055, 0.06, poly, 0, -0.04, 0.3));
  // pistol grip + trigger
  g.add(box(0.034, 0.1, 0.045, poly, 0, -0.08, 0.06, 0.3));
  g.add(box(0.008, 0.01, 0.05, poly, 0, -0.045, 0.03));
  // magazine
  const mag = new THREE.Group();
  mag.add(box(0.035, 0.08, 0.07, poly, 0, -0.04, 0));
  mag.position.set(0, -0.05, -0.06);
  g.add(mag);
  g.userData.mag = mag;
  // bolt handle on the right
  const bolt = new THREE.Group();
  bolt.add(cyl(0.008, 0.008, 0.09, metal, 0, 0, 0, 8, 0, 0, Math.PI / 2.6));
  bolt.add(cyl(0.014, 0.014, 0.02, metal, 0.05, -0.03, 0, 8));
  bolt.position.set(0.035, 0.045, 0.06);
  g.add(bolt);
  g.userData.bolt = bolt;
  // bipod folded under the barrel
  for (const s of [-1, 1]) {
    const leg = cyl(0.007, 0.007, 0.22, metal, s * 0.02, -0.03, -0.5, 8, 0, 0, s * 0.35);
    g.add(leg);
  }
  const scope = buildScope(textures);
  scope.position.set(0, 0.105, -0.05);
  g.add(scope);
  g.userData.sight = scope;

  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.03, -0.99);
  g.add(muzzle);
  g.userData.muzzle = muzzle;
  const eject = new THREE.Object3D();
  eject.position.set(0.04, 0.04, 0.05);
  g.add(eject);
  g.userData.eject = eject;

  const gripHand = buildArm(textures, 0x6a6a52, 'right');
  gripHand.position.set(0, -0.02, 0.09);
  gripHand.rotation.set(0.45, -0.3, 0);
  g.add(gripHand);
  const supportHand = buildArm(textures, 0x6a6a52, 'left');
  supportHand.position.set(0.01, -0.05, -0.36);
  supportHand.rotation.set(0.7, 0.45, 0);
  g.add(supportHand);
  g.userData.supportHand = supportHand;
  return g;
}

function buildMp5(textures) {
  const g = new THREE.Group();
  const metal = mat(textures, 'gunmetal', { repeat: 2 });
  const poly = mat(textures, 'polymer', { repeat: 2.4, color: 0x232520 });
  g.add(cyl(0.032, 0.032, 0.3, metal, 0, 0, -0.05, 14, Math.PI / 2));   // receiver tube
  g.add(box(0.05, 0.05, 0.16, metal, 0, -0.03, -0.02));
  g.add(box(0.045, 0.045, 0.2, poly, 0, -0.01, -0.3));                  // handguard
  g.add(cyl(0.012, 0.012, 0.16, metal, 0, -0.01, -0.48, 10, Math.PI / 2));
  g.add(cyl(0.02, 0.018, 0.05, metal, 0, -0.01, -0.58, 10, Math.PI / 2));
  // cocking tube
  g.add(cyl(0.018, 0.018, 0.22, metal, 0, 0.03, -0.36, 10, Math.PI / 2));
  g.add(cyl(0.022, 0.022, 0.05, metal, 0, 0.03, -0.48, 10, Math.PI / 2)); // front sight ring
  // curved magazine
  const mag = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const seg = box(0.032, 0.045, 0.06, metal, 0, -0.02 - i * 0.042, -i * 0.012);
    seg.rotation.x = -0.22;
    mag.add(seg);
  }
  mag.position.set(0, -0.055, -0.09);
  g.add(mag);
  g.userData.mag = mag;
  // grip + trigger group
  g.add(box(0.036, 0.1, 0.05, poly, 0, -0.09, 0.05, 0.35));
  g.add(box(0.05, 0.06, 0.08, poly, 0, -0.05, -0.02));
  // retractable stock
  g.add(box(0.02, 0.02, 0.16, metal, 0, 0.015, 0.18));
  g.add(box(0.05, 0.07, 0.03, poly, 0, 0.0, 0.26));
  const sight = buildRedDot(textures);
  sight.position.set(0, 0.062, -0.14);
  g.add(sight);
  g.userData.sight = sight;
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, -0.01, -0.62);
  g.add(muzzle);
  g.userData.muzzle = muzzle;
  const eject = new THREE.Object3D();
  eject.position.set(0.04, 0.02, -0.05);
  g.add(eject);
  g.userData.eject = eject;
  const gripHand = buildArm(textures, 0x6a6a52, 'right');
  gripHand.position.set(0, -0.03, 0.06);
  gripHand.rotation.set(0.5, -0.25, 0);
  g.add(gripHand);
  const supportHand = buildArm(textures, 0x6a6a52, 'left');
  supportHand.position.set(0, -0.02, -0.3);
  supportHand.rotation.set(0.9, 0.35, 0);
  g.add(supportHand);
  g.userData.supportHand = supportHand;
  return g;
}

function buildM9(textures) {
  const g = new THREE.Group();
  const metal = mat(textures, 'gunmetal', { repeat: 2 });
  const poly = mat(textures, 'polymer', { repeat: 2.5, color: 0x1e201c });
  g.add(box(0.032, 0.045, 0.2, metal, 0, 0.02, -0.04));   // slide
  g.add(box(0.03, 0.035, 0.06, metal, 0, 0.02, 0.12));     // hammer area
  g.add(box(0.03, 0.04, 0.14, poly, 0, -0.03, 0.0));       // frame
  g.add(box(0.032, 0.1, 0.05, poly, 0, -0.09, 0.05, 0.32)); // grip
  g.add(box(0.025, 0.045, 0.04, metal, 0, -0.07, 0.02));    // magazine base
  g.add(box(0.008, 0.014, 0.008, metal, 0, 0.055, -0.12));  // front sight
  g.add(box(0.02, 0.012, 0.008, metal, 0, 0.055, 0.06));    // rear sight
  const sight = buildIronSights(textures);
  sight.position.set(0, 0.03, -0.06);
  g.add(sight);
  g.userData.sight = sight;
  g.userData.slide = g.children[0];
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.02, -0.16);
  g.add(muzzle);
  g.userData.muzzle = muzzle;
  const eject = new THREE.Object3D();
  eject.position.set(0.025, 0.04, 0.02);
  g.add(eject);
  g.userData.eject = eject;
  const gripHand = buildArm(textures, 0x6a6a52, 'right');
  gripHand.position.set(0, -0.04, 0.06);
  gripHand.rotation.set(0.4, -0.2, 0);
  g.add(gripHand);
  return g;
}

function buildKnife(textures) {
  const g = new THREE.Group();
  const blade = new THREE.MeshStandardMaterial({ color: 0xb9c0c6, roughness: 0.22, metalness: 0.95 });
  const grip = mat(textures, 'polymer', { repeat: 3, color: 0x1b1c18 });
  const bladeMesh = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.006, 0.22), blade);
  bladeMesh.position.set(0, 0.03, -0.12);
  g.add(bladeMesh);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.011, 0.06, 4), blade);
  tip.rotation.x = -Math.PI / 2;
  tip.position.set(0, 0.03, -0.245);
  g.add(tip);
  g.add(box(0.026, 0.02, 0.1, grip, 0, 0.03, 0.05));
  g.add(box(0.03, 0.006, 0.03, grip, 0, 0.03, 0.11));
  const hand = buildArm(textures, 0x6a6a52, 'right');
  hand.position.set(0, 0.03, 0.13);
  hand.rotation.set(0.2, 0, 0);
  g.add(hand);
  g.userData.muzzle = new THREE.Object3D();
  g.userData.muzzle.position.set(0, 0.03, -0.26);
  g.add(g.userData.muzzle);
  return g;
}

export function buildWeaponModel(id, textures) {
  switch (id) {
    case 'm4a1': return buildM4a1(textures, { sightType: 'reddot' });
    case 'intervention': return buildIntervention(textures);
    case 'mp5': return buildMp5(textures);
    case 'm9': return buildM9(textures);
    case 'knife': return buildKnife(textures);
    default: return buildM4a1(textures, { sightType: 'reddot' });
  }
}

/* ------------------------------------------------------------------ */
/* Viewmodel                                                           */
/* ------------------------------------------------------------------ */

/**
 * Owns the viewmodel scene (guns + hands), all pose blending and the
 * animation timeline for firing, reloading, sprinting and switching.
 */
export class Viewmodel {
  constructor(textures, opts = {}) {
    this.textures = textures;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.01, 6);
    this.models = new Map();
    this.quality = opts.quality || 'high';

    // simple lighting that matches the world sun direction
    this.hemi = new THREE.HemisphereLight(0xcfe0ff, 0x40453a, 1.15);
    this.scene.add(this.hemi);
    this.key = new THREE.DirectionalLight(0xfff0d2, 2.0);
    this.key.position.set(-0.4, 0.9, 0.5);
    this.scene.add(this.key);
    this.rim = new THREE.DirectionalLight(0x88a0ff, 0.35);
    this.rim.position.set(0.7, 0.2, -0.8);
    this.scene.add(this.rim);

    // pose state
    this.currentId = null;
    this.sights = { reddot: false, scope: false };
    this.ads = 0;                 // 0..1 blend
    this.adsTarget = 0;
    this.fireKick = new Spring(0, 260, 22);
    this.swayX = 0;
    this.swayY = 0;
    this.bobPhase = 0;
    this.reloadT = 0;             // 0..1 timeline
    this.reloading = false;
    this.boltT = 0;
    this.bolting = false;
    this.drawT = 1;               // 0 = off screen, 1 = ready
    this.meleeT = 0;
    this.sprintT = 0;
    this.breathT = 0;
    this.heldBreath = 0;
    this.group = new THREE.Group();
    this.scene.add(this.group);
    this.socketOffset = new THREE.Vector3(0, 0, 0);
    this._v = new THREE.Vector3();
    this.weaponSwapT = 0;
  }

  setQuality(level) {
    this.quality = level;
    this.camera.fov = 62;
    this.camera.updateProjectionMatrix();
  }

  /** Equip (or pre-equip) a weapon model. */
  equip(id, instant = false) {
    if (this.currentId === id && this.models.has(id)) {
      if (instant) this.drawT = 1;
      return this.models.get(id);
    }
    if (!this.models.has(id)) {
      const model = buildWeaponModel(id, this.textures);
      model.visible = false;
      this.scene.add(model);
      this.models.set(id, model);
    }
    for (const [key, model] of this.models) model.visible = key === id;
    this.currentId = id;
    this.drawT = instant ? 1 : 0.25;
    this.group = this.models.get(id);
    const sight = this.group.userData.sight;
    this.sights.reddot = !!(sight && sight.userData.dot);
    this.sights.scope = id === 'intervention';
    return this.group;
  }

  current() {
    return this.models.get(this.currentId) || null;
  }

  playReload() {
    this.reloading = true;
    this.reloadT = 0;
  }
  playBolt(cycle = 1) {
    this.bolting = true;
    this.boltT = 0;
    this.boltCycle = cycle;
  }
  playMelee() {
    this.meleeT = 0.0001;
  }

  update(dt, state) {
    const model = this.current();
    if (!model) return;

    // --- ADS blend ------------------------------------------------
    this.adsTarget = state.ads ? 1 : 0;
    const adsSpeed = state.ads ? 1 / Math.max(0.08, state.adsTime) : 1 / 0.16;
    this.ads = clamp(this.ads + (this.adsTarget - this.ads) * clamp(adsSpeed * dt * 3.4, 0, 1), 0, 1);

    // --- draw/holster --------------------------------------------
    this.drawT = clamp(this.drawT + dt * (state.drawing ? -1.6 : 2.2), 0, 1);

    // --- sprint ------------------------------------------------
    const sprintTarget = state.sprinting && !state.ads ? 1 : 0;
    this.sprintT = damp(this.sprintT, sprintTarget, 9, dt);

    // --- sway from look input ------------------------------------
    this.swayX = damp(this.swayX, clamp(-(state.lookDX ?? 0) * 0.9, -0.06, 0.06), 9, dt);
    this.swayY = damp(this.swayY, clamp((state.lookDY ?? 0) * 0.9, -0.05, 0.05), 9, dt);

    // --- bob -----------------------------------------------------
    const speed = state.speed ?? 0;
    if (speed > 0.2 && state.grounded !== false) {
      this.bobPhase += dt * (2.1 + speed * 1.15) * 5.2;
    } else {
      this.bobPhase += dt * 1.2;
    }
    const bobAmount = clamp(speed / 6.6, 0, 1) * (1 - this.ads * 0.75);
    const bobX = Math.sin(this.bobPhase) * 0.012 * bobAmount;
    const bobY = Math.abs(Math.cos(this.bobPhase)) * 0.010 * bobAmount;

    // --- breathing (sniper sway) ---------------------------------
    this.breathT += dt;
    const breathScale = (1 - this.heldBreath * 0.85) * (state.weaponId === 'intervention' ? 1.25 : 0.55);
    const breathX = Math.sin(this.breathT * 1.35) * 0.0026 * breathScale * (1 + this.ads);
    const breathY = Math.sin(this.breathT * 0.92 + 1.3) * 0.0032 * breathScale * (1 + this.ads);

    // --- fire kick ----------------------------------------------
    const kick = this.fireKick.update(dt);

    // --- reload timeline ---------------------------------------
    if (this.reloading) {
      this.reloadT = clamp(this.reloadT + dt / Math.max(0.4, state.reloadTime ?? 2.2), 0, 1);
      if (this.reloadT >= 1) this.reloading = false;
    }
    if (this.bolting) {
      this.boltT = clamp(this.boltT + dt / Math.max(0.2, this.boltCycle ?? 1), 0, 1);
      if (this.boltT >= 1) this.bolting = false;
    }
    if (this.meleeT > 0) {
      this.meleeT += dt / 0.42;
      if (this.meleeT > 1) this.meleeT = 0;
    }

    // --- compose the pose ---------------------------------------
    const ads = this.ads;
    const sight = model.userData.sight;
    const anchor = sight?.userData.aimAnchor ?? new THREE.Vector3(0, 0.05, -0.05);
    const anchorWorldish = anchor.clone().applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(model.rotation));

    // hip pose
    const hipPos = new THREE.Vector3(0.16, -0.14, -0.34);
    const hipRot = new THREE.Euler(0.012, 0.06, 0.02);
    // ads pose: put the sight anchor on the aim line
    const adsPos = new THREE.Vector3(-anchorWorldish.x, -anchorWorldish.y + 0.005, -0.30 - (anchorWorldish.z + 0.02));
    const adsRot = new THREE.Euler(0, 0, 0);

    // sniper scopes sit further back so the tube fills the screen
    if (state.weaponId === 'intervention') {
      adsPos.z = -0.26 - (anchorWorldish.z + 0.02);
    }

    const pos = hipPos.clone().lerp(adsPos, ads);
    const rot = new THREE.Euler(
      lerp(hipRot.x, adsRot.x, ads),
      lerp(hipRot.y, adsRot.y, ads),
      lerp(hipRot.z, adsRot.z, ads)
    );

    // sprint: swing the muzzle down and out
    const spr = this.sprintT;
    pos.x += spr * 0.12;
    pos.y += spr * -0.06;
    pos.z += spr * -0.05;
    rot.x += spr * 0.35;
    rot.y += spr * -0.55;
    rot.z += spr * 0.25;

    // sway / bob / breathing
    pos.x += bobX + this.swayX + breathX;
    pos.y += -bobY + this.swayY + breathY;
    rot.z += (this.swayX + breathX) * 1.2;
    rot.x += (this.swayY + breathY) * 1.1;

    // recoil kick
    pos.z += kick * 0.05 * (1 - ads * 0.35);
    rot.x -= kick * 0.16 * (1 - ads * 0.4);
    rot.z += kick * 0.05;

    // reload animation: dip the gun, tilt it, and work the mag
    if (this.reloading) {
      const rt = this.reloadT;
      const dip = Math.sin(clamp(rt, 0, 1) * Math.PI);
      pos.y -= dip * 0.14;
      pos.z += dip * 0.06;
      rot.x += dip * 0.35;
      rot.z += Math.sin(rt * TAU) * 0.22;
      rot.y += dip * 0.25;
      const mag = model.userData.mag;
      if (mag) {
        const magDrop = rt < 0.45 ? clamp((rt - 0.15) / 0.3, 0, 1) : clamp(1 - (rt - 0.5) / 0.35, 0, 1);
        mag.position.y = -0.05 - magDrop * 0.16;
        mag.rotation.z = magDrop * 0.4;
      }
      const support = model.userData.supportHand;
      if (support) {
        const work = rt < 0.5 ? clamp((rt - 0.1) / 0.3, 0, 1) : clamp(1 - (rt - 0.6) / 0.3, 0, 1);
        support.position.y = -0.02 - work * 0.18;
        support.rotation.x = 0.85 + work * 0.5;
      }
    } else {
      const mag = model.userData.mag;
      if (mag) {
        mag.position.y = damp(mag.position.y, -0.05, 12, dt);
        mag.rotation.z = damp(mag.rotation.z, 0, 12, dt);
      }
      const support = model.userData.supportHand;
      if (support) {
        support.position.y = damp(support.position.y, -0.02, 12, dt);
        support.rotation.x = damp(support.rotation.x, 0.85, 12, dt);
      }
    }

    // bolt action cycle
    if (this.bolting && model.userData.bolt) {
      const bt = Math.sin(clamp(this.boltT, 0, 1) * Math.PI);
      model.userData.bolt.rotation.z = bt * 1.3;
      model.userData.bolt.position.z = 0.06 + bt * 0.06;
      rot.z += bt * 0.12;
      pos.y -= bt * 0.02;
    }

    // melee: the knife (or the rifle butt) swings across the screen
    if (this.meleeT > 0) {
      const mt = this.meleeT;
      const swing = Math.sin(clamp(mt, 0, 1) * Math.PI);
      rot.y -= swing * 0.9;
      rot.z += swing * 0.6;
      pos.x += swing * 0.05;
      pos.y += swing * 0.06;
    }

    // draw / holster
    const draw = smoothstep(0, 1, this.drawT);
    pos.y -= (1 - draw) * 0.3;
    rot.x -= (1 - draw) * 0.7;

    model.position.copy(pos);
    model.rotation.copy(rot);

    // red dot intensity: brighter when aiming, dim when the dot is far from centre
    if (sight?.userData.dot) {
      const dotMat = sight.userData.dot.material;
      dotMat.opacity = lerp(0.55, 1, ads);
      sight.userData.dot.scale.setScalar(lerp(1.4, 1, ads));
    }
    this.heldBreath = state.heldBreath ? 1 : Math.max(0, this.heldBreath - dt * 1.5);
  }

  /** Where the muzzle is right now, in viewmodel space. */
  muzzleWorld(out = new THREE.Vector3()) {
    const model = this.current();
    if (!model?.userData.muzzle) return out.set(0, 0, 0);
    model.userData.muzzle.getWorldPosition(out);
    return out;
  }

  ejectWorld(out = new THREE.Vector3()) {
    const model = this.current();
    if (!model?.userData.eject) return out.set(0, 0, 0);
    model.userData.eject.getWorldPosition(out);
    return out;
  }

  setViewport(width, height, fov) {
    this.camera.aspect = width / Math.max(1, height);
    this.camera.fov = fov;
    this.camera.updateProjectionMatrix();
  }
}

/* ------------------------------------------------------------------ */
/* Weapon system                                                       */
/* ------------------------------------------------------------------ */

export class WeaponSystem {
  constructor({ world, textures, audio, fx, viewmodel, team }) {
    this.world = world;
    this.textures = textures;
    this.audio = audio;
    this.fx = fx;
    this.viewmodel = viewmodel;
    this.team = team;

    this.loadout = { primary: 'm4a1', secondary: 'm9' };
    this.currentSlot = 'primary';
    this.ammo = { m4a1: { mag: 30, reserve: 240 }, mp5: { mag: 30, reserve: 240 }, intervention: { mag: 5, reserve: 25 }, m9: { mag: 15, reserve: 60 } };
    this.grenades = { frag: 2, flash: 1 };

    this.ads = false;
    this.adsAmount = 0;
    this.fireMode = 0; // index into def.modes
    this.lastShot = 0;
    this.burstQueue = 0;
    this.bloom = 0;
    this.cooldown = 0;
    this.reloadTimer = 0;
    this.reloading = false;
    this.bolting = false;
    this.boltTimer = 0;
    this.drawTimer = 0;
    this.switchTimer = 0;
    this.meleeTimer = 0;
    this.heldBreath = false;
    this.breathHeld = 0;
    this.recoil = { pitch: 0, yaw: 0, pitchVel: 0, yawVel: 0 };
    this.shotsSinceTracer = 0;
    this.grenadeList = [];
    this.lastStepEvent = null;
    this.listeners = { shot: [], hit: [], kill: [], event: [] };
    this.muzzleWorld = new THREE.Vector3();
    this.tmpDir = new THREE.Vector3();
    this._grenadeGeometry = null;
  }

  on(type, cb) {
    (this.listeners[type] ||= []).push(cb);
    return () => {
      this.listeners[type] = this.listeners[type].filter((f) => f !== cb);
    };
  }
  emit(type, payload) {
    for (const cb of this.listeners[type] || []) cb(payload);
  }

  get def() {
    return WEAPONS[this.weaponId] ?? WEAPONS.m4a1;
  }

  get weaponId() {
    return this.currentSlot === 'primary' ? this.loadout.primary : this.currentSlot === 'knife' ? 'knife' : this.loadout.secondary;
  }

  setLoadout(primary, secondary) {
    this.loadout.primary = primary;
    this.loadout.secondary = secondary;
    for (const id of [primary, secondary]) {
      if (!this.ammo[id]) {
        const d = WEAPONS[id];
        this.ammo[id] = { mag: d.magSize, reserve: d.reserve };
      }
    }
  }

  /** Full state reset for a new life. */
  reset() {
    for (const id of Object.keys(this.ammo)) {
      const d = WEAPONS[id];
      if (!d) continue;
      this.ammo[id].mag = d.magSize;
      this.ammo[id].reserve = d.reserve;
    }
    this.grenades = { frag: 2, flash: 1 };
    this.currentSlot = 'primary';
    this.reloading = false;
    this.bolting = false;
    this.recoil.pitch = 0;
    this.recoil.yaw = 0;
    this.bloom = 0;
    this.ads = false;
    this.adsAmount = 0;
    this.viewmodel.equip(this.loadout.primary, true);
  }

  ammoState() {
    const d = this.def;
    const a = this.ammo[this.weaponId] || { mag: 0, reserve: 0 };
    return { mag: a.mag, reserve: a.reserve, magSize: d.magSize ?? 0, name: d.name, kind: d.kind };
  }

  /* ---------------- input driven ---------------- */

  update(dt, ctx) {
    const { player, input } = ctx;
    const def = this.def;
    this.adsAmount = damp(this.adsAmount, this.ads ? 1 : 0, this.ads ? 1 / Math.max(0.05, def.adsTime) * 1.4 : 12, dt);

    // recoil recovery
    this.recoil.pitch *= Math.exp(-def.recoil.recovery * dt);
    this.recoil.yaw *= Math.exp(-def.recoil.recovery * dt * 1.1);
    this.bloom = Math.max(0, this.bloom - dt * (def.spread?.max ? 0.05 : 0.02) * 2.2);
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.switchTimer = Math.max(0, this.switchTimer - dt);
    this.meleeTimer = Math.max(0, this.meleeTimer - dt);
    if (this.reloading) {
      this.reloadTimer -= dt;
      this._fireReloadEvents(def);
      if (this.reloadTimer <= 0) this._finishReload();
    }
    if (this.bolting) {
      this.boltTimer -= dt;
      if (this.boltTimer <= 0) this.bolting = false;
    }

    // weapon switching
    if (input.wasPressed('swap') && this.switchTimer <= 0 && !this.reloading) {
      this.currentSlot = this.currentSlot === 'primary' ? 'secondary' : 'primary';
      this.switchTimer = 0.4;
      this.viewmodel.equip(this.weaponId);
      this.emit('event', { type: 'swap', weapon: this.weaponId });
      this.audio.uiClick();
    }

    // reload
    if (input.wasPressed('reload') && !this.reloading && this.ammoState().mag < (def.magSize ?? 0)) {
      this.startReload();
    }

    // ADS toggle
    const wantAds = input.adsDown() && !player.sprinting && this.switchTimer <= 0 && !this.reloading;
    if (wantAds !== this.ads) {
      this.ads = wantAds;
      if (wantAds && def.sight === 'scope') this.audio.uiTick();
    }

    // hold breath
    if (def.holdBreath && this.ads) {
      this.heldBreath = input.isDown('holdBreath') && player.stamina > 0.12;
      if (this.heldBreath) player.stamina -= dt * 0.22;
    } else {
      this.heldBreath = false;
    }

    // firing
    const mode = def.modes ? def.modes[this.fireMode % def.modes.length] : 'single';
    const canShoot = this.cooldown <= 0 && !this.reloading && !this.bolting && this.switchTimer <= 0 && !player.sprinting;
    if (input.fireDown() && canShoot) {
      if (mode === 'auto') {
        this.fire(ctx);
      } else if (input.firePressed()) {
        if (mode === 'burst') this.burstQueue = 3;
        this.fire(ctx);
      }
    }
    if (this.burstQueue > 0 && canShoot && mode === 'burst') {
      this.fire(ctx);
      this.burstQueue--;
    }

    // melee
    if (input.meleePressed() && this.meleeTimer <= 0) {
      this.melee(ctx);
    }

    // grenades
    if (input.wasPressed('frag')) this.throwGrenade('frag', ctx);
    if (input.wasPressed('flash')) this.throwGrenade('flash', ctx);

    this.updateGrenades(dt, ctx);

    // pass pose info to the viewmodel
    this.viewmodel.update(dt, {
      ads: this.ads,
      adsTime: def.adsTime,
      speed: player.speed,
      sprinting: player.sprinting,
      grounded: player.grounded,
      lookDX: ctx.lookDelta?.yaw ?? 0,
      lookDY: ctx.lookDelta?.pitch ?? 0,
      reloading: this.reloading,
      reloadTime: def.reloadTime,
      weaponId: this.weaponId,
      drawing: this.switchTimer > 0.05,
      heldBreath: this.heldBreath,
    });
    this.fireKickDecay(dt);
  }

  fireKickDecay(dt) {
    void dt;
  }

  _fireReloadEvents(def) {
    const t = 1 - this.reloadTimer / Math.max(0.01, def.reloadTime);
    for (const [at, sound] of def.reloadEvents || []) {
      if (!this._firedEvents) this._firedEvents = new Set();
      const key = `${this.reloadTimer.toFixed(2)}:${sound}`;
      if (t >= at && !this._firedEvents.has(sound)) {
        this._firedEvents.add(sound);
        if (sound === 'magOut') this.audio.magOut();
        else if (sound === 'magIn') this.audio.magIn();
        else if (sound === 'bolt') this.audio.chargeHandle();
      }
      void key;
    }
    if (t >= 1) this._firedEvents = null;
  }

  startReload() {
    const def = this.def;
    const state = this.ammoState();
    if (state.reserve <= 0 && state.mag <= 0) return;
    if (state.mag >= (def.magSize ?? 0)) return;
    this.reloading = true;
    this.reloadTimer = def.reloadTime;
    this._firedEvents = new Set();
    this.ads = false;
    this.viewmodel.playReload();
    this.emit('event', { type: 'reload', weapon: this.weaponId });
    this.audio.radioStatic();
  }

  _finishReload() {
    this.reloading = false;
    const def = this.def;
    const id = this.weaponId;
    const state = this.ammo[id];
    const need = (def.magSize ?? 0) - state.mag;
    const take = Math.min(need, state.reserve);
    state.mag += take;
    state.reserve -= take;
    this.emit('event', { type: 'reloaded', weapon: id, mag: state.mag, reserve: state.reserve });
  }

  melee(ctx) {
    const def = WEAPONS.knife;
    this.meleeTimer = def.cooldown;
    this.viewmodel.playMelee();
    this.audio.meleeSwing();
    this.emit('event', { type: 'melee' });
    // short range hit test after a beat
    setTimeout(() => {
      const hit = this._hitscan(ctx, { range: def.range, spread: 0.004, penetration: 0 });
      if (hit && hit.target) {
        const dmg = def.damage;
        this.audio.meleeHit();
        ctx.onDamage?.(hit.target, dmg, { weapon: 'knife', headshot: false, melee: true, point: hit.point, direction: hit.direction });
        this.fx.bloodBurst(hit.point, hit.normal, 1.2);
      } else if (hit) {
        this.audio.impact(hit.surface, { position: hit.point, distance: 2 });
        this.fx.impact(hit.point, hit.normal, hit.surface, { decal: true });
      }
    }, def.swingTime * 1000);
  }

  /* ---------------- ballistics ---------------- */

  fire(ctx) {
    const def = this.def;
    if (def.kind === 'melee') return;
    const ammo = this.ammo[this.weaponId];
    if (!ammo) return;
    if (ammo.mag <= 0) {
      this.cooldown = 0.35;
      this.audio.dryFire();
      if (ammo.reserve > 0) this.startReload();
      this.emit('event', { type: 'dryfire' });
      return;
    }
    ammo.mag--;
    this.cooldown = 60 / def.rpm;
    if (def.modes?.[this.fireMode] === 'bolt') {
      this.bolting = true;
      this.boltTimer = def.boltCycle ?? 1.15;
      this.viewmodel.playBolt(def.boltCycle ?? 1.15);
    }

    // spread
    const spread = this.currentSpread(def);
    this.bloom = Math.min(def.spread.max, this.bloom + def.spread.bloom);
    const shot = this._hitscan(ctx, { range: 320, spread: spread + this.bloom, penetration: def.penetration });

    // recoil
    const kick = this.adsAmount > 0.5 ? def.recoil.kickAds : def.recoil.kick;
    this.recoil.pitch += kick * (1 - this.adsAmount * 0.25);
    this.recoil.yaw += (Math.random() - 0.5) * def.recoil.side * 2;
    this.viewmodel.fireKick.impulse(0.9 + Math.random() * 0.4);

    // audio + fx
    const muzzle = this.viewmodel.muzzleWorld(this.muzzleWorld);
    this.audio.gunshot(def.audio, { suppressed: false });
    const originWorld = { x: muzzle.x, y: muzzle.y, z: muzzle.z };
    const dirWorld = shot ? shot.direction : this._cameraDir(ctx);
    this.fx.muzzleFlash(
      { x: ctx.camera.position.x + dirWorld.x * 0.5, y: ctx.camera.position.y + dirWorld.y * 0.5, z: ctx.camera.position.z + dirWorld.z * 0.5 },
      dirWorld,
      def.kind === 'sniper' ? 1.7 : def.kind === 'pistol' ? 0.8 : 1.1,
      { lightIntensity: def.kind === 'sniper' ? 6 : 3.2 }
    );
    this.shotsSinceTracer++;
    if (shot && this.shotsSinceTracer % (def.tracerEvery || 1) === 0) {
      this.fx.tracer(originWorld, shot.point, {});
    }
    // shell casing
    this._ejectShell(ctx, def);

    this.emit('event', { type: 'shot', weapon: this.weaponId });
    this.emit('shot', { weapon: this.weaponId, origin: originWorld, direction: dirWorld });

    // impacts
    if (shot) {
      if (shot.target) {
        const range = shot.distance;
        const falloff = def.range
          ? lerp(1, def.range.minMult, smoothstep(def.range.falloffStart, def.range.falloffEnd, range))
          : 1;
        const damage = def.damage * (shot.sphere?.mult ?? 1) * falloff;
        const headshot = shot.sphere?.name === 'head';
        this.emit('hit', { target: shot.target, damage, headshot });
        ctx.onDamage?.(shot.target, damage, {
          weapon: def.id,
          headshot,
          point: shot.point,
          direction: dirWorld,
          attacker: ctx.player,
        });
        this.fx.bloodBurst(shot.point, shot.normal, headshot ? 1.4 : 1);
      } else {
        this.fx.impact(shot.point, shot.normal, shot.surface, {
          spark: shot.surface === 'metal' || shot.surface === 'concrete',
          distance: shot.distance,
        });
      }
    }
  }

  currentSpread(def) {
    const s = def.spread;
    if (!s) return 0;
    let spread = lerp(s.hip, s.ads, this.adsAmount);
    const speed = this._speed ?? 0;
    spread += s.hip * s.move * clamp(speed / 6.6, 0, 1) * (1 - this.adsAmount * 0.6);
    if (this._airborne) spread += s.hip * s.jump * 0.15;
    if (this._crouched) spread *= s.crouch;
    return spread;
  }

  _cameraDir(ctx) {
    const dir = new THREE.Vector3(0, 0, -1);
    dir.applyEuler(new THREE.Euler(ctx.player.pitch, ctx.player.yaw, 0, 'YXZ'));
    return { x: dir.x, y: dir.y, z: dir.z };
  }

  /** Raycast that also tests soldier damage spheres. */
  _hitscan(ctx, opts = {}) {
    const camera = ctx.camera;
    const baseDir = this._cameraDir(ctx);
    const spread = opts.spread ?? 0;
    const dir = {
      x: baseDir.x + randRange(-spread, spread),
      y: baseDir.y + randRange(-spread, spread),
      z: baseDir.z + randRange(-spread, spread),
    };
    const len = Math.hypot(dir.x, dir.y, dir.z) || 1;
    dir.x /= len; dir.y /= len; dir.z /= len;
    const origin = { x: camera.position.x, y: camera.position.y, z: camera.position.z };
    const maxDist = opts.range ?? 320;

    const worldHit = this.world.raycast(origin, dir, maxDist, { bounds: false });

    // soldier spheres
    let bestTarget = null;
    let bestSphere = null;
    let bestT = worldHit ? worldHit.distance : maxDist;
    for (const target of ctx.targets || []) {
      if (!target.alive || target.team === ctx.player.team) continue;
      const spheres = target.hitSpheres ? target.hitSpheres() : target.spheres;
      if (!spheres) continue;
      for (const sphere of spheres) {
        const t = raySphereHit(origin, dir, sphere);
        if (t >= 0 && t < bestT) {
          bestT = t;
          bestTarget = target;
          bestSphere = sphere;
        }
      }
    }

    if (bestTarget) {
      const point = { x: origin.x + dir.x * bestT, y: origin.y + dir.y * bestT, z: origin.z + dir.z * bestT };
      return {
        point,
        normal: { x: -dir.x, y: -dir.y, z: -dir.z },
        distance: bestT,
        surface: 'flesh',
        target: bestTarget,
        sphere: bestSphere,
        direction: dir,
      };
    }
    if (worldHit) {
      // penetration: keep going a short way to see if the wall is thin
      if ((opts.penetration ?? 0) > 0.5 && (worldHit.surface === 'cloth' || worldHit.surface === 'leaf' || worldHit.surface === 'wood')) {
        const secondOrigin = {
          x: worldHit.point.x + dir.x * 0.25,
          y: worldHit.point.y + dir.y * 0.25,
          z: worldHit.point.z + dir.z * 0.25,
        };
        const second = this.world.raycast(secondOrigin, dir, maxDist - worldHit.distance, { bounds: false });
        if (second && second.distance > 0.4) {
          return { ...second, distance: worldHit.distance + second.distance };
        }
      }
      return {
        point: worldHit.point,
        normal: worldHit.normal,
        distance: worldHit.distance,
        surface: worldHit.surface,
        target: null,
        sphere: null,
        direction: dir,
      };
    }
    return null;
  }

  _ejectShell(ctx) {
    const eject = this.viewmodel.ejectWorld(new THREE.Vector3());
    const right = new THREE.Vector3(1, 0, 0).applyEuler(new THREE.Euler(0, ctx.player.yaw, 0));
    this.fx.sparks.spawn({
      x: eject.x, y: eject.y, z: eject.z,
      vx: right.x * rand(2.2, 3.6) + rand(-0.3, 0.3),
      vy: rand(1.6, 2.6),
      vz: right.z * rand(2.2, 3.6) + rand(-0.3, 0.3),
      life: rand(0.5, 1.0),
      size: 0.035,
      endSize: 0.03,
      color: 0xd9b25a,
      gravity: 11,
      drag: 0.995,
    });
    this.audio.shellDrop();
  }

  /* ---------------- grenades ---------------- */

  throwGrenade(kind, ctx) {
    if ((this.grenades[kind] ?? 0) <= 0) return;
    const def = kind === 'frag' ? WEAPONS.frag : WEAPONS.flash;
    this.grenades[kind]--;
    const dir = this._cameraDir(ctx);
    const cam = ctx.camera.position;
    const origin = { x: cam.x + dir.x * 0.5, y: cam.y - 0.1, z: cam.z + dir.z * 0.5 };
    const speed = def.throwSpeed;
    const grenade = {
      type: kind,
      def,
      position: { ...origin },
      velocity: {
        x: dir.x * speed + randRange(-0.3, 0.3),
        y: dir.y * speed + 2.6,
        z: dir.z * speed + randRange(-0.3, 0.3),
      },
      fuse: def.fuse,
      owner: ctx.player,
      mesh: this._makeGrenadeMesh(kind),
      bounces: 0,
      resting: false,
    };
    this.fx.scene.add(grenade.mesh);
    this.grenadeList.push(grenade);
    this.audio.grenadePin();
    this.audio.throwWhoosh();
    this.emit('event', { type: 'grenade', kind, position: origin });
    this.emit('shot', { weapon: kind, origin, direction: dir });
  }

  _makeGrenadeMesh(kind) {
    if (!this._grenadeGeometry) {
      this._grenadeGeometry = new THREE.IcosahedronGeometry(0.075, 1);
    }
    const matg = this.textures.pbr('metalPainted', {
      repeat: 3,
      color: kind === 'flash' ? 0x9a9a9a : 0x3d4a2e,
      surface: 'metal',
    });
    const mesh = new THREE.Mesh(this._grenadeGeometry, matg);
    mesh.castShadow = false;
    return mesh;
  }

  updateGrenades(dt, ctx) {
    for (let i = this.grenadeList.length - 1; i >= 0; i--) {
      const g = this.grenadeList[i];
      g.fuse -= dt;
      if (!g.resting) {
        g.velocity.y -= 16 * dt;
        const nx = g.position.x + g.velocity.x * dt;
        const ny = g.position.y + g.velocity.y * dt;
        const nz = g.position.z + g.velocity.z * dt;
        const dir = { x: g.velocity.x, y: g.velocity.y, z: g.velocity.z };
        const len = Math.hypot(dir.x, dir.y, dir.z) || 1;
        const hit = this.world.raycast(g.position, { x: dir.x / len, y: dir.y / len, z: dir.z / len }, len * dt + 0.12, { bounds: false });
        if (hit) {
          // bounce
          const bounce = 0.32;
          const n = hit.normal;
          const dot = g.velocity.x * n.x + g.velocity.y * n.y + g.velocity.z * n.z;
          g.velocity.x = (g.velocity.x - 2 * dot * n.x) * bounce;
          g.velocity.y = (g.velocity.y - 2 * dot * n.y) * bounce;
          g.velocity.z = (g.velocity.z - 2 * dot * n.z) * bounce;
          g.position.x = hit.point.x + n.x * 0.09;
          g.position.y = hit.point.y + n.y * 0.09;
          g.position.z = hit.point.z + n.z * 0.09;
          g.bounces++;
          this.audio.grenadeBounce({ position: g.position, distance: 4 });
        } else {
          g.position.x = nx;
          g.position.y = ny;
          g.position.z = nz;
        }
        const ground = this.world.supportHeight(g.position.x, g.position.z, g.position.y + 1);
        if (g.position.y <= ground + 0.08 && Math.abs(g.velocity.y) < 1.2) {
          g.position.y = ground + 0.08;
          g.velocity.x *= 0.6;
          g.velocity.z *= 0.6;
          g.velocity.y = 0;
          if (Math.hypot(g.velocity.x, g.velocity.z) < 0.4) g.resting = true;
        }
        g.velocity.x *= Math.pow(0.92, dt * 60);
        g.velocity.z *= Math.pow(0.92, dt * 60);
      }
      if (g.mesh) {
        g.mesh.position.set(g.position.x, g.position.y, g.position.z);
        g.mesh.rotation.x += dt * (g.resting ? 0 : 8);
        g.mesh.rotation.z += dt * (g.resting ? 0 : 6);
      }
      if (g.fuse <= 0) {
        this._detonate(g, ctx);
        this.fx.scene.remove(g.mesh);
        this.grenadeList.splice(i, 1);
      }
    }
  }

  _detonate(g, ctx) {
    const p = g.position;
    if (g.type === 'frag') {
      this.fx.explosion(p, { radius: g.def.radius });
      // damage everyone in radius, with falloff and LOS check
      for (const target of ctx.allTargets || []) {
        if (!target.alive) continue;
        const chest = target.position;
        const dist = Math.hypot(chest.x - p.x, chest.y + 0.9 - p.y, chest.z - p.z);
        if (dist > g.def.radius) continue;
        const clear = this.world.lineOfSight({ x: p.x, y: p.y + 0.2, z: p.z }, { x: chest.x, y: chest.y + 0.9, z: chest.z });
        if (!clear && dist > 2.2) continue;
        const dmg = g.def.damage * Math.pow(1 - dist / g.def.radius, 1.5);
        if (dmg > 1) {
          ctx.onDamage?.(target, dmg, { weapon: 'frag', headshot: false, grenade: true, point: p, attacker: g.owner });
        }
      }
      this.emit('event', { type: 'explosion', kind: 'frag', position: p });
    } else {
      this.fx.flashLight(p.x, p.y, p.z, 26);
      this.audio.flashbang({ position: p, distance: 6 });
      for (const target of ctx.allTargets || []) {
        if (!target.alive) continue;
        const chest = { x: target.position.x, y: target.position.y + 1.0, z: target.position.z };
        const dist = Math.hypot(chest.x - p.x, chest.y - p.y, chest.z - p.z);
        if (dist > g.def.radius) continue;
        const clear = this.world.lineOfSight({ x: p.x, y: p.y + 0.1, z: p.z }, chest);
        const views = target.lookDirection ? target.lookDirection() : null;
        let facing = 1;
        if (views) {
          const dx = (p.x - chest.x) / (dist || 1);
          const dy = (p.y - chest.y) / (dist || 1);
          const dz = (p.z - chest.z) / (dist || 1);
          const dot = dx * views.x + dy * views.y + dz * views.z;
          facing = clamp((dot + 0.35) / 1.35, 0, 1);
        }
        const strength = (clear ? 1 : 0.45) * (1 - dist / g.def.radius) ** 1.2 * facing;
        if (strength > 0.08) {
          ctx.onFlash?.(target, strength * g.def.flashDuration, g.def.flashDuration);
        }
      }
      this.emit('event', { type: 'explosion', kind: 'flash', position: p });
    }
  }

  /** Called by the owner with the player's movement state for spread maths. */
  syncMoveState(state) {
    this._speed = state.speed;
    this._airborne = !state.grounded;
    this._crouched = state.stance === 'crouch' || state.stance === 'prone';
  }

  viewKick() {
    return { pitch: this.recoil.pitch, yaw: this.recoil.yaw };
  }
}

/** Ray vs sphere; returns distance or -1. */
function raySphereHit(origin, dir, sphere) {
  const fx = origin.x - sphere.x;
  const fy = origin.y - sphere.y;
  const fz = origin.z - sphere.z;
  const b = 2 * (fx * dir.x + fy * dir.y + fz * dir.z);
  const c = fx * fx + fy * fy + fz * fz - sphere.r * sphere.r;
  const disc = b * b - 4 * c;
  if (disc < 0) return -1;
  const sq = Math.sqrt(disc);
  let t = (-b - sq) / 2;
  if (t < 0) t = (-b + sq) / 2;
  return t < 0 ? -1 : t;
}

export { raySphereHit };
