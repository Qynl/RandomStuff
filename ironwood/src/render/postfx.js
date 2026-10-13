/**
 * IRONWOOD - post processing chain.
 *
 * scene(HDR, MSAA) -> bright pass -> separable blur mips -> god rays
 *                  -> composite: bloom + shafts + ACES tonemap + grade
 *                     + chromatic aberration + grain + vignette + scope mask
 *
 * Written with GLSL1-style shaders so three.js handles the WebGL2
 * compatibility layer for us.
 */

import * as THREE from 'three';
import { clamp, saturate } from '../core/math.js';

const QUAD_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const BRIGHT_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D tDiffuse;
uniform float uThreshold;
uniform float uSoft;
uniform vec2 uTexel;
void main() {
  vec3 c = texture2D(tDiffuse, vUv).rgb;
  // cheap 4-tap prefilter to avoid fireflies
  c += texture2D(tDiffuse, vUv + vec2(uTexel.x, 0.0)).rgb;
  c += texture2D(tDiffuse, vUv + vec2(0.0, uTexel.y)).rgb;
  c += texture2D(tDiffuse, vUv - vec2(uTexel.x, uTexel.y)).rgb;
  c *= 0.25;
  float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float knee = max(0.0, lum - uThreshold) / max(uSoft, 1e-4);
  float w = clamp(knee, 0.0, 1.0);
  gl_FragColor = vec4(c * w, 1.0);
}
`;

const BLUR_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D tDiffuse;
uniform vec2 uDirection;
void main() {
  vec3 sum = vec3(0.0);
  sum += texture2D(tDiffuse, vUv - uDirection * 4.0).rgb * 0.051;
  sum += texture2D(tDiffuse, vUv - uDirection * 3.0).rgb * 0.0918;
  sum += texture2D(tDiffuse, vUv - uDirection * 2.0).rgb * 0.12245;
  sum += texture2D(tDiffuse, vUv - uDirection * 1.0).rgb * 0.1531;
  sum += texture2D(tDiffuse, vUv).rgb * 0.1633;
  sum += texture2D(tDiffuse, vUv + uDirection * 1.0).rgb * 0.1531;
  sum += texture2D(tDiffuse, vUv + uDirection * 2.0).rgb * 0.12245;
  sum += texture2D(tDiffuse, vUv + uDirection * 3.0).rgb * 0.0918;
  sum += texture2D(tDiffuse, vUv + uDirection * 4.0).rgb * 0.051;
  gl_FragColor = vec4(sum, 1.0);
}
`;

const SHAFT_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D tBright;
uniform vec2 uSunPos;
uniform float uDensity;
uniform float uDecay;
uniform float uWeight;
void main() {
  vec2 delta = (vUv - uSunPos) * uDensity / 24.0;
  vec2 coord = vUv;
  float illum = 1.0;
  vec3 acc = vec3(0.0);
  for (int i = 0; i < 24; i++) {
    coord -= delta;
    vec3 s = texture2D(tBright, clamp(coord, 0.0, 1.0)).rgb;
    acc += s * illum * uWeight;
    illum *= uDecay;
  }
  gl_FragColor = vec4(acc / 24.0, 1.0);
}
`;

const COMPOSITE_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;

uniform sampler2D tScene;
uniform sampler2D tBloom0;
uniform sampler2D tBloom1;
uniform sampler2D tBloom2;
uniform sampler2D tShafts;
uniform vec2 uResolution;
uniform float uExposure;
uniform float uBloom;
uniform float uShaft;
uniform float uVignette;
uniform float uChroma;
uniform float uGrain;
uniform float uTime;
uniform float uDamage;
uniform float uFlash;
uniform float uScope;      // 0 = hipfire, 1 = full scope
uniform float uSuppress;   // 0..1 peripheral squeeze when taking fire
uniform float uSaturation;
uniform float uContrast;
uniform float uSharpen;
uniform vec3 uGradeShadow;
uniform vec3 uGradeHighlight;

// --- ACES filmic (Narkowicz approximation) ---
vec3 aces(vec3 x) {
  const float a = 2.51;
  const float b = 0.03;
  const float c = 2.43;
  const float d = 0.59;
  const float e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

// 5 tap unsharp mask to keep the image crisp after MSAA resolve
vec3 sharpen(sampler2D tex, vec2 uv, vec2 texel, float amount) {
  vec3 c = texture2D(tex, uv).rgb;
  vec3 n = texture2D(tex, uv + vec2(0.0, -texel.y)).rgb;
  vec3 s = texture2D(tex, uv + vec2(0.0, texel.y)).rgb;
  vec3 e = texture2D(tex, uv + vec2(texel.x, 0.0)).rgb;
  vec3 w = texture2D(tex, uv - vec2(texel.x, 0.0)).rgb;
  vec3 blur = (n + s + e + w) * 0.25;
  return c + (c - blur) * amount;
}

void main() {
  vec2 uv = vUv;
  vec2 centered = uv - 0.5;
  float radius = length(centered);

  // --- chromatic aberration grows toward the edges, and a lot inside the scope
  float chroma = uChroma * (0.25 + radius * 1.35) + uScope * 0.6 * smoothstep(0.12, 0.62, radius);
  vec2 dir = normalize(centered + 1e-6);
  vec2 off = dir * chroma * 0.0022;
  vec3 col;
  col.r = sharpen(tScene, uv + off, 1.0 / uResolution, uSharpen).r;
  col.g = sharpen(tScene, uv, 1.0 / uResolution, uSharpen).g;
  col.b = sharpen(tScene, uv - off, 1.0 / uResolution, uSharpen).b;

  // --- bloom (three mips, weighted)
  vec3 bloom = texture2D(tBloom0, uv).rgb * 0.55
             + texture2D(tBloom1, uv).rgb * 0.32
             + texture2D(tBloom2, uv).rgb * 0.22;
  col += bloom * uBloom;

  // --- volumetric shafts
  vec3 shafts = texture2D(tShafts, uv).rgb;
  float shaftMask = smoothstep(0.35, 0.95, 1.0 - radius);
  col += shafts * uShaft * shaftMask;

  // --- exposure + tonemap
  col *= uExposure;
  col = aces(col);

  // --- grade: cool shadows, warm highlights, gentle S curve
  float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col *= mix(uGradeShadow * 2.0, uGradeHighlight, smoothstep(0.0, 0.65, lum));
  col = mix(vec3(0.5), col, uContrast);
  float g = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(g), col, uSaturation);

  // --- flashbang: blow out to white, then bloom the ringing in slowly
  col = mix(col, vec3(1.0), clamp(uFlash, 0.0, 1.0));

  // --- damage / low health: red, desaturated, pulsing
  if (uDamage > 0.001) {
    float pulse = 0.6 + 0.4 * sin(uTime * 5.2);
    float edge = smoothstep(0.25, 0.95, radius);
    float blood = uDamage * (0.35 + edge * 0.9);
    vec3 dmg = mix(col, mix(vec3(g * 0.5), vec3(0.55, 0.03, 0.02), 0.65), clamp(blood * pulse, 0.0, 0.85));
    col = dmg;
  }

  // --- suppression: squeeze the periphery, kill saturation a touch
  if (uSuppress > 0.001) {
    float edge = smoothstep(0.2, 0.95, radius);
    col = mix(col, vec3(g) * 0.75, uSuppress * edge * 0.55);
  }

  // --- scope: black out everything outside the tube + lens dirt + rim glow
  if (uScope > 0.001) {
    float d = length(centered * vec2(uResolution.x / uResolution.y, 1.0));
    float rim = 0.335;
    float mask = smoothstep(rim, rim - 0.012, d);
    col = mix(col, vec3(0.0), (1.0 - mask) * uScope);
    float ring = smoothstep(rim - 0.004, rim - 0.02, d) * (1.0 - smoothstep(rim - 0.02, rim - 0.05, d));
    col += ring * vec3(0.05, 0.06, 0.05) * uScope;
    // subtle scope glass tint + vignette inside the tube
    col = mix(col, col * vec3(0.94, 1.0, 0.96), uScope * 0.5);
    float inner = smoothstep(rim - 0.06, rim - 0.2, d);
    col *= mix(1.0, 0.72, inner * uScope);
  }

  // --- vignette
  col *= mix(1.0, 1.0 - uVignette, smoothstep(0.25, 1.05, radius));

  // --- film grain (more in the shadows, like real sensor noise)
  float grain = hash12(uv * uResolution + vec2(uTime * 91.7, uTime * 47.3)) - 0.5;
  col += grain * uGrain * (1.0 - smoothstep(0.0, 0.8, dot(col, vec3(0.33))));

  // --- linear -> sRGB (we own the whole pipeline, so do it by hand)
  vec3 srgb = mix(col * 12.92, 1.055 * pow(max(col, vec3(1e-5)), vec3(1.0 / 2.4)) - 0.055, step(0.0031308, col));
  gl_FragColor = vec4(srgb, 1.0);
}
`;

class FullScreenPass {
  constructor(material) {
    this.material = material;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    this.mesh.frustumCulled = false;
    this.scene = new THREE.Scene();
    this.scene.add(this.mesh);
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }
  render(renderer, target) {
    renderer.setRenderTarget(target || null);
    renderer.render(this.scene, this.camera);
  }
  dispose() {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}

export class PostFX {
  constructor(renderer, opts = {}) {
    this.renderer = renderer;
    this.quality = opts.quality || 'high';
    this.resolution = new THREE.Vector2(1, 1);
    this.hdrType = THREE.HalfFloatType;

    this.params = {
      exposure: opts.exposure ?? 1.05,
      bloom: opts.bloom ?? 0.62,
      bloomThreshold: 0.85,
      bloomSoft: 0.55,
      shafts: opts.shafts ?? 0.5,
      vignette: 0.34,
      chroma: 0.7,
      grain: 0.022,
      saturation: 1.1,
      contrast: 1.06,
      sharpen: 0.28,
      gradeShadow: new THREE.Vector3(0.86, 0.92, 1.02),
      gradeHighlight: new THREE.Vector3(1.06, 1.0, 0.94),
    };

    this.sceneRT = null;
    this.bloomMips = [];
    this._buildPasses();
    this._allocTargets(2, 2);
  }

  _buildPasses() {
    const quad = () => new THREE.PlaneGeometry(2, 2);

    this.brightPass = new FullScreenPass(
      new THREE.ShaderMaterial({
        vertexShader: QUAD_VERT,
        fragmentShader: BRIGHT_FRAG,
        depthTest: false,
        depthWrite: false,
        uniforms: {
          tDiffuse: { value: null },
          uThreshold: { value: this.params.bloomThreshold },
          uSoft: { value: this.params.bloomSoft },
          uTexel: { value: new THREE.Vector2() },
        },
      })
    );

    this.blurPass = new FullScreenPass(
      new THREE.ShaderMaterial({
        vertexShader: QUAD_VERT,
        fragmentShader: BLUR_FRAG,
        depthTest: false,
        depthWrite: false,
        uniforms: {
          tDiffuse: { value: null },
          uDirection: { value: new THREE.Vector2() },
        },
      })
    );

    this.shaftPass = new FullScreenPass(
      new THREE.ShaderMaterial({
        vertexShader: QUAD_VERT,
        fragmentShader: SHAFT_FRAG,
        depthTest: false,
        depthWrite: false,
        uniforms: {
          tBright: { value: null },
          uSunPos: { value: new THREE.Vector2(0.5, 0.5) },
          uDensity: { value: 1.0 },
          uDecay: { value: 0.94 },
          uWeight: { value: 0.35 },
        },
      })
    );

    this.compositePass = new FullScreenPass(
      new THREE.ShaderMaterial({
        vertexShader: QUAD_VERT,
        fragmentShader: COMPOSITE_FRAG,
        depthTest: false,
        depthWrite: false,
        uniforms: {
          tScene: { value: null },
          tBloom0: { value: null },
          tBloom1: { value: null },
          tBloom2: { value: null },
          tShafts: { value: null },
          uResolution: { value: new THREE.Vector2(1, 1) },
          uExposure: { value: this.params.exposure },
          uBloom: { value: this.params.bloom },
          uShaft: { value: this.params.shafts },
          uVignette: { value: this.params.vignette },
          uChroma: { value: this.params.chroma },
          uGrain: { value: this.params.grain },
          uTime: { value: 0 },
          uDamage: { value: 0 },
          uFlash: { value: 0 },
          uScope: { value: 0 },
          uSuppress: { value: 0 },
          uSaturation: { value: this.params.saturation },
          uContrast: { value: this.params.contrast },
          uSharpen: { value: this.params.sharpen },
          uGradeShadow: { value: this.params.gradeShadow },
          uGradeHighlight: { value: this.params.gradeHighlight },
        },
      })
    );
    void quad;
  }

  setQuality(level) {
    this.quality = level;
    const cfg = {
      low: { mips: 1, samples: 0, shafts: false, scale: 1.0 },
      medium: { mips: 2, samples: 0, shafts: true, scale: 1.0 },
      high: { mips: 3, samples: 4, shafts: true, scale: 1.0 },
      ultra: { mips: 3, samples: 4, shafts: true, scale: 1.15 },
    }[level] || { mips: 3, samples: 4, shafts: true, scale: 1.0 };
    this.cfg = cfg;
    this.params.shafts = cfg.shafts ? 0.5 : 0;
    const dpr = Math.min(window.devicePixelRatio || 1, cfg.scale * 1.5);
    this.renderer.setPixelRatio(dpr);
    this._allocTargets(this.size?.w ?? window.innerWidth, this.size?.h ?? window.innerHeight);
  }

  _allocTargets(w, h) {
    this.size = { w, h };
    const mipCount = Math.max(1, this.cfg?.mips ?? 3);
    const samples = this.renderer.capabilities.isWebGL2 ? (this.cfg?.samples ?? 4) : 0;

    this.sceneRT?.dispose();
    this.sceneRT = new THREE.WebGLRenderTarget(w, h, {
      type: this.hdrType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: true,
      stencilBuffer: false,
      samples,
    });
    this.sceneRT.texture.colorSpace = THREE.NoColorSpace;

    for (const rt of this.bloomMips) rt.dispose();
    this.bloomMips = [];
    for (let i = 0; i < mipCount; i++) {
      const div = 2 << i;
      const mw = Math.max(2, Math.floor(w / div));
      const mh = Math.max(2, Math.floor(h / div));
      const rt = new THREE.WebGLRenderTarget(mw, mh, {
        type: this.hdrType,
        format: THREE.RGBAFormat,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        depthBuffer: false,
      });
      rt.texture.colorSpace = THREE.NoColorSpace;
      this.bloomMips.push(rt);
    }
    this.shaftRT?.dispose();
    const sw = Math.max(2, Math.floor(w / 4));
    const sh = Math.max(2, Math.floor(h / 4));
    this.shaftRT = new THREE.WebGLRenderTarget(sw, sh, {
      type: this.hdrType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
    });
    this.shaftRT.texture.colorSpace = THREE.NoColorSpace;
    for (const t of this.blurTmps || []) t.dispose();
    this.blurTmps = [];
    this.resolution.set(w, h);
  }

  setSize(w, h) {
    const dpr = this.renderer.getPixelRatio();
    this._allocTargets(Math.max(2, Math.floor(w * dpr)), Math.max(2, Math.floor(h * dpr)));
  }

  render(scene, camera, dt, opts = {}) {
    const renderer = this.renderer;
    const w = this.sceneRT.width;
    const h = this.sceneRT.height;
    const u = this.compositePass.material.uniforms;

    // 1) scene -> HDR target (MSAA), then an optional depth-cleared overlay
    // (the weapon viewmodel is drawn here so it can never clip into walls but
    // still receives the full post processing chain)
    renderer.setRenderTarget(this.sceneRT);
    renderer.setClearColor(0x000000, 0);
    renderer.clear(true, true, false);
    renderer.render(scene, camera);
    if (typeof opts.overlay === 'function') {
      renderer.clearDepth();
      opts.overlay(renderer);
    }

    // 2) bright pass
    this.brightPass.material.uniforms.tDiffuse.value = this.sceneRT.texture;
    this.brightPass.material.uniforms.uTexel.value.set(1 / w, 1 / h);
    this.brightPass.render(renderer, this.bloomMips[0]);

    // 3) separable blur chain (each mip: H into a temp, V back into the mip,
    //    then a blurred downsample seeds the next, wider mip)
    const dir = this.blurPass.material.uniforms.uDirection.value;
    const bu = this.blurPass.material.uniforms;
    for (let i = 0; i < this.bloomMips.length; i++) {
      const rt = this.bloomMips[i];
      const tmp = this._ensureTmp(rt.width, rt.height, 0);

      bu.tDiffuse.value = rt.texture;
      dir.set(1 / rt.width, 0);
      this.blurPass.render(renderer, tmp);

      bu.tDiffuse.value = tmp.texture;
      dir.set(0, 1 / rt.height);
      this.blurPass.render(renderer, rt);

      const next = this.bloomMips[i + 1];
      if (next) {
        const tmpNext = this._ensureTmp(next.width, next.height, 1);
        bu.tDiffuse.value = rt.texture;
        dir.set(1 / rt.width, 0);
        this.blurPass.render(renderer, tmpNext);

        bu.tDiffuse.value = tmpNext.texture;
        dir.set(0, 1 / next.height);
        this.blurPass.render(renderer, next);
      }
    }

    // 4) god rays (from the first bloom mip = bright areas of the frame)
    if (this.params.shafts > 0.001) {
      const sm = this.shaftPass.material.uniforms;
      sm.tBright.value = this.bloomMips[0].texture;
      const sp = opts.sunScreen || { x: 0.5, y: 0.9 };
      sm.uSunPos.value.set(clamp(sp.x, -0.4, 1.4), clamp(sp.y, -0.4, 1.4));
      sm.uDensity.value = 1.05;
      sm.uWeight.value = 0.42 * (opts.sunVisible === false ? 0.15 : 1);
      this.shaftPass.render(renderer, this.shaftRT);
    }

    // 5) composite to screen
    u.tScene.value = this.sceneRT.texture;
    u.tBloom0.value = this.bloomMips[0]?.texture ?? null;
    u.tBloom1.value = this.bloomMips[1]?.texture ?? this.bloomMips[0]?.texture ?? null;
    u.tBloom2.value = this.bloomMips[2]?.texture ?? this.bloomMips[1]?.texture ?? this.bloomMips[0]?.texture ?? null;
    u.tShafts.value = this.params.shafts > 0.001 ? this.shaftRT.texture : this._black().texture;
    u.uResolution.value.set(w, h);
    u.uTime.value += dt;
    u.uExposure.value = opts.exposure ?? this.params.exposure;
    u.uBloom.value = opts.bloom ?? this.params.bloom;
    u.uShaft.value = opts.shaftStrength ?? this.params.shafts;
    u.uVignette.value = opts.vignette ?? this.params.vignette;
    u.uChroma.value = opts.chroma ?? this.params.chroma;
    u.uGrain.value = opts.grain ?? this.params.grain;
    u.uDamage.value = saturate(opts.damage ?? 0);
    u.uFlash.value = saturate(opts.flash ?? 0);
    u.uScope.value = saturate(opts.scope ?? 0);
    u.uSuppress.value = saturate(opts.suppress ?? 0);
    u.uSaturation.value = opts.saturation ?? this.params.saturation;
    u.uContrast.value = opts.contrast ?? this.params.contrast;
    this.compositePass.render(renderer, null);
    renderer.setRenderTarget(null);
  }

  _ensureTmp(w, h, slot = 0) {
    this.blurTmps = this.blurTmps || [];
    const current = this.blurTmps[slot];
    if (current && current.width === w && current.height === h) return current;
    current?.dispose();
    const rt = new THREE.WebGLRenderTarget(w, h, {
      type: this.hdrType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
    });
    rt.texture.colorSpace = THREE.NoColorSpace;
    this.blurTmps[slot] = rt;
    return rt;
  }

  _black() {
    if (!this.blackRT) {
      this.blackRT = new THREE.WebGLRenderTarget(2, 2, { depthBuffer: false });
      const prev = this.renderer.getRenderTarget();
      const oldClear = this.renderer.getClearColor(new THREE.Color());
      const oldAlpha = this.renderer.getClearAlpha();
      this.renderer.setRenderTarget(this.blackRT);
      this.renderer.setClearColor(0x000000, 1);
      this.renderer.clear(true, false, false);
      this.renderer.setRenderTarget(prev);
      this.renderer.setClearColor(oldClear, oldAlpha);
    }
    return this.blackRT;
  }

  dispose() {
    this.sceneRT?.dispose();
    for (const rt of this.bloomMips) rt.dispose();
    this.shaftRT?.dispose();
    for (const t of this.blurTmps || []) t.dispose();
    this.blackRT?.dispose();
    this.brightPass.dispose();
    this.blurPass.dispose();
    this.shaftPass.dispose();
    this.compositePass.dispose();
  }
}
