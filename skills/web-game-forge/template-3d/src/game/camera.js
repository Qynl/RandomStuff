// Over-the-shoulder third-person camera.
//
// * Mouse look (pointer lock) orbits around the character.
// * Collision: if a pillar or crate sits between the character and the camera, the
//   camera slides in toward the character instead of clipping.
// * Smoothed follow, plus trauma shake and a sprint FOV kick.

import * as THREE from 'three';
import { CAMERA } from './config.js';
import { clamp, damp } from '../engine/math.js';

export class ThirdPersonCamera {
  constructor(camera) {
    this.cam = camera;
    this.yaw = Math.PI;
    this.pitch = CAMERA.pitch;
    this.pos = new THREE.Vector3();
    this.look = new THREE.Vector3();
    this.fov = CAMERA.fov;
    this.init = false;
    this._L = new THREE.Vector3();
    this._C = new THREE.Vector3();
  }

  reset(yaw = Math.PI) {
    this.yaw = yaw;
    this.pitch = CAMERA.pitch;
    this.init = false;
  }

  update(dt, input, target, arena, trauma, sprint) {
    const m = input.mouse;
    this.yaw -= m.dx * CAMERA.sensitivity;
    this.pitch = clamp(this.pitch + m.dy * CAMERA.sensitivity, CAMERA.minPitch, CAMERA.maxPitch);

    const L = this._L.set(target.x, target.y + CAMERA.lookHeight, target.z);
    const fx = Math.sin(this.yaw);
    const fz = Math.cos(this.yaw);
    const rx = -fz;
    const rz = fx;
    const cp = Math.cos(this.pitch);
    const sp = Math.sin(this.pitch);

    let D = CAMERA.dist;
    const C = this._C;
    const place = () => {
      C.set(
        L.x - fx * cp * D + rx * CAMERA.shoulder,
        L.y + sp * D,
        L.z - fz * cp * D + rz * CAMERA.shoulder,
      );
    };
    place();
    // Pull in only when a prop is really in the way, and never closer than a
    // comfortable over-the-shoulder distance.
    const t = arena.segmentBlocked(L.x, L.z, C.x, C.z, CAMERA.wallMargin);
    if (t < 1) {
      D = Math.max(CAMERA.minDist, D * t);
      place();
    }
    C.y = Math.max(0.5, C.y);

    const follow = 1 - Math.exp(-CAMERA.follow * dt);
    if (!this.init) {
      this.pos.copy(C);
      this.look.copy(L);
      this.init = true;
    } else {
      this.pos.lerp(C, follow);
      this.look.lerp(L, 1 - Math.exp(-22 * dt));
    }

    const amp = 0.3 * trauma.value;
    this.cam.position.set(
      this.pos.x + trauma.ox * amp,
      this.pos.y + trauma.oy * amp,
      this.pos.z + trauma.oz * amp,
    );
    this.cam.lookAt(this.look);

    this.fov = damp(this.fov, sprint ? CAMERA.fovSprint : CAMERA.fov, 6, dt);
    if (Math.abs(this.cam.fov - this.fov) > 0.01) {
      this.cam.fov = this.fov;
      this.cam.updateProjectionMatrix();
    }
  }
}
