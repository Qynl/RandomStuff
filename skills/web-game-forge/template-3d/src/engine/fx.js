// GPU particle system: one THREE.Points draw call for thousands of soft, additive
// sparks, with per-particle size, colour, and alpha. Pooled, so nothing is allocated
// while the game runs.

import * as THREE from 'three';
import { TAU } from './math.js';

const VERT = /* glsl */ `
  attribute float aSize;
  attribute vec3 aColor;
  attribute float aAlpha;
  uniform float uScale;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vColor = aColor;
    vAlpha = aAlpha;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uScale / max(0.1, -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAG = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float a = smoothstep(1.0, 0.0, d) * vAlpha;
    if (a < 0.003) discard;
    gl_FragColor = vec4(vColor, a);
  }
`;

export class Sparks {
  constructor(scene, max = 3000) {
    this.max = max;
    this.px = new Float32Array(max * 3);
    this.vx = new Float32Array(max * 3);
    this.color = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.base = new Float32Array(max);
    this.cursor = 0;

    const geo = new THREE.BufferGeometry();
    const attr = (arr, n) => {
      const a = new THREE.BufferAttribute(arr, n);
      a.setUsage(THREE.DynamicDrawUsage);
      return a;
    };
    geo.setAttribute('position', attr(this.px, 3));
    geo.setAttribute('aColor', attr(this.color, 3));
    geo.setAttribute('aSize', attr(this.size, 1));
    geo.setAttribute('aAlpha', attr(this.alpha, 1));
    this.geo = geo;

    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uScale: { value: 500 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this._c = new THREE.Color();
  }

  // Call on resize: converts world size to pixels for the current viewport.
  setViewport(pixelHeight, fovDeg) {
    this.mat.uniforms.uScale.value = (pixelHeight * 0.5) / Math.tan((fovDeg * Math.PI) / 360);
  }

  _slot() {
    for (let i = 0; i < this.max; i++) {
      const idx = (this.cursor + i) % this.max;
      if (this.life[idx] <= 0) {
        this.cursor = (idx + 1) % this.max;
        return idx;
      }
    }
    return -1;
  }

  // emit(pos, { count, speed, life, size, color, gravity, drag, up, spread })
  // `spread` 1 = sphere burst, 0 = all in `dir` direction (use with `dir`).
  emit(x, y, z, o = {}) {
    const count = o.count ?? 12;
    const speed = o.speed ?? 4;
    const life = o.life ?? 0.5;
    const size = o.size ?? 0.12;
    const up = o.up ?? 0;
    const grav = o.gravity ?? 6;
    const drag = o.drag ?? 2.5;
    this._c.set(o.color ?? 0xffffff);
    for (let n = 0; n < count; n++) {
      const i = this._slot();
      if (i < 0) return;
      const th = Math.random() * TAU;
      const cp = Math.random() * 2 - 1;
      const sp = Math.sqrt(1 - cp * cp);
      const s = speed * (0.35 + Math.random() * 0.65);
      this.px[i * 3] = x;
      this.px[i * 3 + 1] = y;
      this.px[i * 3 + 2] = z;
      this.vx[i * 3] = Math.cos(th) * sp * s;
      this.vx[i * 3 + 1] = cp * s + up;
      this.vx[i * 3 + 2] = Math.sin(th) * sp * s;
      this.color[i * 3] = this._c.r;
      this.color[i * 3 + 1] = this._c.g;
      this.color[i * 3 + 2] = this._c.b;
      this.life[i] = this.maxLife[i] = life * (0.7 + Math.random() * 0.6);
      this.base[i] = size * (0.6 + Math.random() * 0.8);
      this.grav[i] = grav;
      this.drag[i] = drag;
    }
  }

  update(dt) {
    const { px, vx, life, alpha, size, base, grav, drag, maxLife } = this;
    for (let i = 0; i < this.max; i++) {
      if (life[i] <= 0) {
        alpha[i] = 0;
        size[i] = 0;
        continue;
      }
      life[i] -= dt;
      const k = Math.exp(-drag[i] * dt);
      vx[i * 3] *= k;
      vx[i * 3 + 1] = vx[i * 3 + 1] * k - grav[i] * dt;
      vx[i * 3 + 2] *= k;
      px[i * 3] += vx[i * 3] * dt;
      px[i * 3 + 1] += vx[i * 3 + 1] * dt;
      px[i * 3 + 2] += vx[i * 3 + 2] * dt;
      const f = Math.max(0, life[i] / maxLife[i]);
      alpha[i] = f;
      size[i] = base[i] * (0.3 + 0.7 * f);
      if (px[i * 3 + 1] < 0.02) {
        px[i * 3 + 1] = 0.02;
        vx[i * 3 + 1] *= -0.3;
      }
    }
    for (const name of ['position', 'aColor', 'aSize', 'aAlpha']) {
      this.geo.attributes[name].needsUpdate = true;
    }
  }
}
