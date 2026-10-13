/**
 * IRONWOOD - sky, atmosphere and lighting rig.
 * The dome is a single shader: gradient, procedural cloud decks, sun disk and
 * horizon haze. A distant ridge silhouette plus exponential fog give the map
 * its sense of scale.
 */

import * as THREE from 'three';

const SKY_VERT = /* glsl */ `
varying vec3 vWorldDir;
void main() {
  vWorldDir = normalize((modelMatrix * vec4(position, 1.0)).xyz);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
}
`;

const SKY_FRAG = /* glsl */ `
precision highp float;
varying vec3 vWorldDir;

uniform vec3 uSunDir;
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uSunColor;
uniform float uTime;
uniform float uCloudCover;
uniform float uCloudHeight;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 5; i++) {
    v += a * vnoise(p);
    p = rot * p * 2.03;
    a *= 0.5;
  }
  return v;
}

void main() {
  vec3 dir = normalize(vWorldDir);
  float up = clamp(dir.y, -1.0, 1.0);

  // base gradient: warm haze at the horizon, deep blue overhead
  float t = pow(clamp(up * 0.5 + 0.5, 0.0, 1.0), 1.35);
  vec3 col = mix(uHorizon, uZenith, smoothstep(0.35, 0.95, t));

  // sun: disk + huge bloom + forward scattering
  float cosAngle = dot(dir, normalize(uSunDir));
  float disk = smoothstep(0.9994, 0.99975, cosAngle);
  float glow = pow(max(cosAngle, 0.0), 220.0);
  float scatter = pow(max(cosAngle, 0.0), 6.0) * 0.35;
  col += uSunColor * (disk * 12.0 + glow * 1.6 + scatter);

  // cloud decks: two scrolling layers projected onto the dome
  if (up > -0.02) {
    vec2 cp = dir.xz / max(up + 0.14, 0.02);
    vec2 p1 = cp * uCloudHeight + vec2(uTime * 0.0035, uTime * 0.0012);
    vec2 p2 = cp * (uCloudHeight * 2.3) + vec2(uTime * -0.0022, uTime * 0.0018);
    float c1 = fbm(p1);
    float c2 = fbm(p2);
    float thick = smoothstep(0.52 - uCloudCover * 0.22, 0.86 - uCloudCover * 0.12, c1 * 0.7 + c2 * 0.45);
    float detail = smoothstep(0.35, 0.75, c2);
    float fade = smoothstep(0.0, 0.28, up);
    float sunBehind = pow(max(cosAngle, 0.0), 3.0);
    vec3 cloudCol = mix(vec3(0.55, 0.56, 0.58), vec3(1.06, 1.03, 0.97), detail);
    cloudCol += uSunColor * sunBehind * 0.5;
    cloudCol *= mix(0.75, 1.15, smoothstep(0.0, 0.5, up));
    col = mix(col, cloudCol, clamp(thick * fade * 0.92, 0.0, 0.95));
  }

  // ground haze band just below the horizon (the map is a valley)
  col = mix(col, uHorizon * 0.82, smoothstep(0.02, -0.25, up));

  gl_FragColor = vec4(col, 1.0);
}
`;

export class Sky {
  constructor(scene, opts = {}) {
    this.sunAzimuth = opts.sunAzimuth ?? 2.35; // radians
    this.sunElevation = opts.sunElevation ?? 0.62; // radians above horizon
    this.sunDir = new THREE.Vector3(
      Math.cos(this.sunElevation) * Math.cos(this.sunAzimuth),
      Math.sin(this.sunElevation),
      Math.cos(this.sunElevation) * Math.sin(this.sunAzimuth)
    ).normalize();

    this.zenithColor = new THREE.Color(0x2a63b8);
    this.horizonColor = new THREE.Color(0xc8d7d0);
    this.sunColor = new THREE.Color(0xfff2d8);
    this.fogColor = new THREE.Color(0x8ea79c);

    const geo = new THREE.SphereGeometry(900, 32, 20);
    this.material = new THREE.ShaderMaterial({
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uSunDir: { value: this.sunDir.clone() },
        uZenith: { value: this.zenithColor.clone() },
        uHorizon: { value: this.horizonColor.clone() },
        uSunColor: { value: this.sunColor.clone() },
        uTime: { value: 0 },
        uCloudCover: { value: opts.cloudCover ?? 0.62 },
        uCloudHeight: { value: opts.cloudHeight ?? 1.15 },
      },
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1000;
    scene.add(this.mesh);

    // --- lighting -------------------------------------------------
    this.sun = new THREE.DirectionalLight(0xffe9c4, 2.15);
    this.sun.position.copy(this.sunDir).multiplyScalar(120);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(opts.shadowMapSize ?? 2048, opts.shadowMapSize ?? 2048);
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 260;
    this.shadowRadius = opts.shadowRadius ?? 42;
    const cam = this.sun.shadow.camera;
    cam.left = -this.shadowRadius;
    cam.right = this.shadowRadius;
    cam.top = this.shadowRadius;
    cam.bottom = -this.shadowRadius;
    cam.updateProjectionMatrix();
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.045;
    scene.add(this.sun);
    this.sunTarget = new THREE.Object3D();
    scene.add(this.sunTarget);
    this.sun.target = this.sunTarget;

    this.hemi = new THREE.HemisphereLight(0x9fc0e8, 0x4a5537, 0.84);
    scene.add(this.hemi);

    // subtle bounce from the warm ground to fill the shadow side of soldiers
    this.fill = new THREE.DirectionalLight(0xa8c39a, 0.32);
    this.fill.position.set(-this.sunDir.x * 60, 30, -this.sunDir.z * 60);
    scene.add(this.fill);

    // --- fog ------------------------------------------------------
    // thinner fog: enough aerial perspective to sell the scale, not enough to
    // wash the jungle out
    scene.fog = new THREE.FogExp2(this.fogColor.getHex(), opts.fogDensity ?? 0.0038);
    this.fogDensity = opts.fogDensity ?? 0.0038;

    // --- distant ridge silhouette ---------------------------------
    this.ridge = this._buildRidge();
    scene.add(this.ridge);

    this.scene = scene;
    this._time = 0;
    this._cloudDrift = 0;
  }

  _buildRidge() {
    const segments = 96;
    const radius = 520;
    const geo = new THREE.BufferGeometry();
    const verts = [];
    const colors = [];
    const base = -30;
    for (let i = 0; i < segments; i++) {
      const a0 = (i / segments) * Math.PI * 2;
      const a1 = ((i + 1) / segments) * Math.PI * 2;
      const h0 = 24 + Math.abs(Math.sin(a0 * 3.1) * 34) + Math.sin(a0 * 7.3) * 12;
      const h1 = 24 + Math.abs(Math.sin(a1 * 3.1) * 34) + Math.sin(a1 * 7.3) * 12;
      const x0 = Math.cos(a0) * radius;
      const z0 = Math.sin(a0) * radius;
      const x1 = Math.cos(a1) * radius;
      const z1 = Math.sin(a1) * radius;
      verts.push(x0, base, z0, x1, base, z1, x1, h1, z1);
      verts.push(x0, base, z0, x1, h1, z1, x0, h0, z0);
      const cTop = new THREE.Color(0x5c6f63);
      const cBase = new THREE.Color(0x8fa094);
      colors.push(cBase.r, cBase.g, cBase.b, cBase.r, cBase.g, cBase.b, cTop.r, cTop.g, cTop.b);
      colors.push(cBase.r, cBase.g, cBase.b, cTop.r, cTop.g, cTop.b, cTop.r, cTop.g, cTop.b);
    }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: true, depthWrite: false });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = -900;
    mesh.frustumCulled = false;
    return mesh;
  }

  update(dt, camera) {
    this._time += dt;
    this.material.uniforms.uTime.value = this._time;
    if (camera) {
      this.mesh.position.copy(camera.position);
      this.ridge.position.set(camera.position.x, camera.position.y * 0.2 - 8, camera.position.z);
    }
    // Keep the shadow frustum tight around the player for crisp contact shadows.
    this.sunTarget.position.set(camera?.position.x ?? 0, 0, camera?.position.z ?? 0);
    this.sun.position.set(
      (camera?.position.x ?? 0) + this.sunDir.x * 120,
      this.sunDir.y * 120,
      (camera?.position.z ?? 0) + this.sunDir.z * 120
    );
  }

  /** Screen-space position of the sun (0..1), for god rays. */
  sunScreenUV(camera, out = { x: 0.5, y: 0.5 }) {
    const p = new THREE.Vector3()
      .copy(camera.position)
      .addScaledVector(this.sunDir, 500)
      .project(camera);
    out.x = p.x * 0.5 + 0.5;
    out.y = p.y * 0.5 + 0.5;
    out.behind = p.z > 1 ? 1 : 0;
    return out;
  }

  setQuality(level) {
    const map = { low: 1024, medium: 1536, high: 2048, ultra: 4096 };
    const size = map[level] ?? 2048;
    this.sun.shadow.mapSize.set(size, size);
    if (this.sun.shadow.map) {
      this.sun.shadow.map.dispose();
      this.sun.shadow.map = null;
    }
    if (level === 'low') {
      this.scene.fog.density = this.fogDensity * 1.25;
    } else {
      this.scene.fog.density = this.fogDensity;
    }
  }
}
