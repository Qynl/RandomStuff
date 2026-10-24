/* Set dressing.
 *
 * Every prop is built from primitives and the procedural texture set — there
 * are no models. Kept deliberately low-poly: the scene is carried by silhouette
 * and light, and thousands of tiny meshes would cost more than they add.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { makeRng } from '../lib/rng.js';

/* ------------------------------------------------------------------ light */

export function RoomLight({
  position,
  color = '#ffc982',
  intensity = 2,
  distance = 6,
  decay = 2,
  power = 1,
  flicker = 0,
  seed = 0,
  shadow = false,
}) {
  const ref = useRef();
  const phase = useMemo(() => seed * 3.77, [seed]);

  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.elapsedTime + phase;
    // Two incommensurate waves: reads as a tired filament, not a sine test.
    const beat = Math.sin(t * 7.3) * Math.sin(t * 2.13);
    const dip = flicker > 0 ? Math.max(0, beat) * flicker : 0;
    ref.current.intensity = intensity * power * (1 - dip);
  });

  return (
    <pointLight
      ref={ref}
      position={position}
      color={color}
      intensity={intensity * power}
      distance={distance}
      decay={decay}
      castShadow={shadow}
      shadow-mapSize={[512, 512]}
      shadow-bias={-0.0018}
      shadow-normalBias={0.02}
    />
  );
}

/* ------------------------------------------------------------------- door */

export function DoorSet({ tex, wallZ, open = false, onInteract, power = 1, leafWidth = 2.14, height = 2.94 }) {
  const leaf = useRef();
  const [hover, setHover] = useState(false);

  useFrame((_, delta) => {
    if (!leaf.current) return;
    const target = open ? -Math.PI * 0.94 : 0;
    leaf.current.rotation.y = THREE.MathUtils.damp(leaf.current.rotation.y, target, 3.1, delta);
  });

  const brass = { color: '#a88a58', metalness: 0.78, roughness: 0.28 };

  return (
    <group position={[0, 0, wallZ]}>
      {/* casing */}
      {[-1.2, 1.2].map((x) => (
        <mesh key={x} position={[x, height / 2, 0.03]} castShadow>
          <boxGeometry args={[0.16, height + 0.22, 0.34]} />
          <meshStandardMaterial color="#33271e" roughness={0.78} />
        </mesh>
      ))}
      <mesh position={[0, height + 0.06, 0.03]} castShadow>
        <boxGeometry args={[2.56, 0.18, 0.34]} />
        <meshStandardMaterial color="#33271e" roughness={0.78} />
      </mesh>
      <mesh position={[0, height + 0.17, 0.03]}>
        <boxGeometry args={[2.72, 0.09, 0.42]} />
        <meshStandardMaterial color="#241a14" roughness={0.82} />
      </mesh>

      <group ref={leaf} position={[-1.09, 0, 0.1]}>
        <mesh
          position={[leafWidth / 2, height / 2, 0]}
          castShadow
          receiveShadow
          onPointerOver={(event) => {
            event.stopPropagation();
            setHover(true);
          }}
          onPointerOut={() => setHover(false)}
          onClick={(event) => {
            event.stopPropagation();
            onInteract?.();
          }}
        >
          <boxGeometry args={[leafWidth, height, 0.1]} />
          <meshStandardMaterial
            map={tex.wood}
            bumpMap={tex.bumpWood}
            bumpScale={0.012}
            color={hover ? '#9b7853' : '#ffffff'}
            roughness={0.55}
            metalness={0.04}
          />
        </mesh>

        {/* Panelling: four recessed fields, dark shadow gap between them. */}
        {[
          [0.5, 1.05, 0.62, 0.86],
          [0.5, 2.2, 0.62, 0.86],
          [1.5, 1.05, 0.62, 0.86],
          [1.5, 2.2, 0.62, 0.86],
        ].map(([x, y, w, h]) => (
          <group key={`${x}-${y}`}>
            <mesh position={[x, y, 0.052]}>
              <boxGeometry args={[w, h, 0.02]} />
              <meshStandardMaterial color="#241a14" roughness={0.6} />
            </mesh>
            <mesh position={[x, y, 0.066]}>
              <boxGeometry args={[w - 0.13, h - 0.13, 0.016]} />
              <meshStandardMaterial color="#3c2a1f" roughness={0.66} />
            </mesh>
          </group>
        ))}

        {[0.36, height - 0.34].map((y) => (
          <mesh key={y} position={[0.14, y, 0.07]}>
            <boxGeometry args={[0.1, 0.3, 0.05]} />
            <meshStandardMaterial color="#66543a" metalness={0.82} roughness={0.32} />
          </mesh>
        ))}

        <mesh position={[leafWidth - 0.2, 1.42, 0.1]}>
          <boxGeometry args={[0.17, 0.36, 0.025]} />
          <meshStandardMaterial {...brass} />
        </mesh>
        <mesh position={[leafWidth - 0.22, 1.42, 0.16]}>
          <sphereGeometry args={[0.072, 18, 14]} />
          <meshStandardMaterial {...brass} />
        </mesh>
      </group>

      <RoomLight position={[0, height + 0.5, 0.9]} color="#b98a52" intensity={open ? 1.4 : 0.9} distance={4.6} power={power} />
    </group>
  );
}

/* ---------------------------------------------------------- light fittings */

/**
 * Spot light with a manually driven target.
 *
 * three only aims a SpotLight at light.target if that object's matrixWorld is
 * up to date, and an unparented target is never updated by the renderer — so a
 * declared `target-position` silently aims every spot at the world origin.
 * Rooms sit far down the -Z axis, which made all of them point at room one.
 */
export function Spot({
  position,
  target,
  roomZ = 0,
  color = '#ffd9a8',
  intensity = 20,
  distance = 12,
  angle = 0.5,
  penumbra = 1,
  power = 1,
  shadow = false,
}) {
  const light = useRef();
  const targetObject = useMemo(() => new THREE.Object3D(), []);

  useEffect(() => {
    if (light.current) light.current.target = targetObject;
  }, [targetObject]);

  useFrame(() => {
    if (!light.current) return;
    targetObject.position.set(target[0], target[1], target[2] + roomZ);
    targetObject.updateMatrixWorld();
    light.current.intensity = intensity * power;
  });

  return (
    <spotLight
      ref={light}
      position={position}
      color={color}
      intensity={intensity * power}
      distance={distance}
      angle={angle}
      penumbra={penumbra}
      decay={2}
      castShadow={shadow}
      shadow-mapSize={[512, 512]}
      shadow-bias={-0.0015}
    />
  );
}

/**
 * Cheap volumetric haze: an unlit cone under a lamp, faded with a tiny shader
 * so there is no hard edge at the floor or at the tip. A plain additive cone
 * reads as a solid triangle.
 */
export function LightCone({ position, color = '#ffc27a', height = 1.9, radius = 0.85, opacity = 0.05 }) {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uColor: { value: new THREE.Color(color) },
          uOpacity: { value: opacity },
          uHeight: { value: height },
        },
        vertexShader: `
          varying float vT;
          uniform float uHeight;
          void main() {
            vT = clamp((position.y + uHeight * 0.5) / uHeight, 0.0, 1.0);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform vec3 uColor;
          uniform float uOpacity;
          varying float vT;
          void main() {
            float a = uOpacity * pow(vT, 2.2) * (1.0 - smoothstep(0.85, 1.0, vT) * 0.6);
            gl_FragColor = vec4(uColor, a);
          }
        `,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      }),
    [color, height, opacity],
  );

  return (
    <mesh position={position} material={material}>
      <coneGeometry args={[radius, height, 20, 1, true]} />
    </mesh>
  );
}

export function Sconce({ position, power = 1, flicker = 0, seed = 0 }) {
  return (
    <group position={position}>
      <mesh position={[0, -0.16, 0]} castShadow>
        <boxGeometry args={[0.24, 0.42, 0.12]} />
        <meshStandardMaterial color="#29251e" metalness={0.5} roughness={0.45} />
      </mesh>
      <mesh position={[0, 0.04, -0.015]}>
        <cylinderGeometry args={[0.105, 0.14, 0.24, 16, 1, true]} />
        <meshStandardMaterial
          color="#d0b98e"
          emissive="#a16c35"
          emissiveIntensity={0.85 * power}
          transparent
          opacity={0.78}
          side={THREE.DoubleSide}
        />
      </mesh>
      <RoomLight position={[0, 0.02, 0.16]} color="#ffc982" intensity={20} distance={8.6} power={power} flicker={flicker} seed={seed} />
      <LightCone position={[0, -0.85, 0.16]} height={1.75} radius={0.95} opacity={0.02 * power} />
    </group>
  );
}

export function HangingBulb({ position, power = 1, flicker = 0.2, seed = 0, drop = 1.2, cold = false }) {
  const bulb = useRef();
  const swing = useRef();
  const tint = cold ? '#cfe2f2' : '#d9ad70';
  const emissive = cold ? '#8fb6d6' : '#b17a3c';

  useFrame(({ clock }) => {
    if (!swing.current) return;
    const t = clock.elapsedTime + seed * 2.2;
    swing.current.rotation.z = Math.sin(t * 0.78) * 0.028;
    swing.current.rotation.x = Math.cos(t * 0.61) * 0.022;
    if (bulb.current) {
      bulb.current.emissiveIntensity = 1.3 * power * (flicker > 0 ? 1 - flicker * Math.max(0, Math.sin(t * 9.1) * Math.sin(t * 3.3)) : 1);
    }
  });

  return (
    <group position={position}>
      <group ref={swing}>
        <mesh position={[0, -drop / 2, 0]}>
          <cylinderGeometry args={[0.008, 0.008, drop, 5]} />
          <meshStandardMaterial color="#1b1813" roughness={0.9} />
        </mesh>
        <mesh position={[0, -drop, 0]} castShadow>
          <cylinderGeometry args={[0.05, 0.07, 0.1, 10]} />
          <meshStandardMaterial color="#3a3428" metalness={0.5} roughness={0.5} />
        </mesh>
        <mesh position={[0, -drop - 0.09, 0]} ref={bulb}>
          <sphereGeometry args={[0.075, 14, 12]} />
          <meshStandardMaterial color="#e8d3a6" emissive={emissive} emissiveIntensity={1.3} toneMapped={false} />
        </mesh>
        <RoomLight position={[0, -drop - 0.1, 0]} color={tint} intensity={21} distance={11} power={power} flicker={flicker} seed={seed} />
        <LightCone position={[0, -drop - 0.95, 0]} color={tint} height={1.7} radius={1.25} opacity={0.024 * power} />
      </group>
    </group>
  );
}

export function Fluorescent({ position, power = 1, flicker = 0.35, seed = 0, rotation = [0, 0, 0] }) {
  const tube = useRef();

  useFrame(({ clock }) => {
    if (!tube.current) return;
    const t = clock.elapsedTime + seed * 5.1;
    const cut = flicker > 0 && Math.sin(t * 11.3) * Math.sin(t * 4.7) > 0.72 ? 0.15 : 1;
    tube.current.emissiveIntensity = 1.0 * power * cut;
  });

  return (
    <group position={position} rotation={rotation}>
      <mesh>
        <boxGeometry args={[1.5, 0.12, 0.26]} />
        <meshStandardMaterial color="#3d423d" metalness={0.4} roughness={0.6} />
      </mesh>
      <mesh position={[0, -0.09, 0]} ref={tube}>
        <boxGeometry args={[1.32, 0.06, 0.11]} />
        <meshStandardMaterial color="#e6f1f5" emissive="#a8d4e6" emissiveIntensity={1.0} toneMapped={false} />
      </mesh>
      <RoomLight position={[0, -0.24, 0]} color="#d6ecf8" intensity={9} distance={9} power={power} flicker={flicker} seed={seed} />
    </group>
  );
}

export function CandleCluster({ position, power = 1, count = 5, seed = 1 }) {
  const flames = useRef([]);
  const spots = useMemo(() => {
    const rng = makeRng(seed);
    return Array.from({ length: count }, () => ({
      x: rng.float(-0.34, 0.34),
      z: rng.float(-0.22, 0.22),
      h: rng.float(0.12, 0.36),
      r: rng.float(0.022, 0.034),
    }));
  }, [count, seed]);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    flames.current.forEach((mesh, i) => {
      if (!mesh) return;
      mesh.scale.y = 1 + Math.sin(t * (7 + i) + i) * 0.18;
      mesh.scale.x = 1 + Math.cos(t * (9 + i)) * 0.09;
    });
  });

  return (
    <group position={position}>
      {spots.map((spot, i) => (
        <group key={i} position={[spot.x, 0, spot.z]}>
          <mesh position={[0, spot.h / 2, 0]} castShadow>
            <cylinderGeometry args={[spot.r, spot.r * 1.1, spot.h, 8]} />
            <meshStandardMaterial color="#e0d4b4" roughness={0.85} />
          </mesh>
          <mesh
            position={[0, spot.h + 0.035, 0]}
            ref={(node) => {
              flames.current[i] = node;
            }}
          >
            <coneGeometry args={[0.018, 0.07, 8]} />
            <meshBasicMaterial color="#ffc978" toneMapped={false} />
          </mesh>
        </group>
      ))}
      <RoomLight position={[0, 0.62, 0]} color="#ffb35c" intensity={5.5 * Math.min(1, count / 4)} distance={5} power={power} flicker={0.18} seed={seed} />
    </group>
  );
}

/* --------------------------------------------------------------- furniture */

export function Chair({ tex, position, rotation = [0, 0, 0], scale = 1 }) {
  const wood = { map: tex.wood, bumpMap: tex.bumpWood, bumpScale: 0.01, roughness: 0.68 };
  return (
    <group position={position} rotation={rotation} scale={scale}>
      <mesh position={[0, 0.45, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.5, 0.07, 0.48]} />
        <meshStandardMaterial {...wood} />
      </mesh>
      <mesh position={[0, 0.79, 0.215]} castShadow>
        <boxGeometry args={[0.5, 0.62, 0.055]} />
        <meshStandardMaterial {...wood} color="#543c2a" />
      </mesh>
      {[-0.21, 0.21].flatMap((x) =>
        [-0.19, 0.19].map((z) => (
          <mesh key={`${x}${z}`} position={[x, 0.22, z]} castShadow>
            <boxGeometry args={[0.055, 0.44, 0.055]} />
            <meshStandardMaterial color="#33251c" roughness={0.8} />
          </mesh>
        )),
      )}
    </group>
  );
}

export function Table({ tex, position, rotation = [0, 0, 0], width = 1.1, depth = 0.7, height = 0.76 }) {
  const wood = { map: tex.woodTable ?? tex.wood, bumpMap: tex.bumpTable ?? tex.bumpWood, bumpScale: 0.01, roughness: 0.66 };
  return (
    <group position={position} rotation={rotation}>
      <mesh position={[0, height, 0]} castShadow receiveShadow>
        <boxGeometry args={[width, 0.09, depth]} />
        <meshStandardMaterial {...wood} />
      </mesh>
      {[-1, 1].flatMap((sx) =>
        [-1, 1].map((sz) => (
          <mesh key={`${sx}${sz}`} position={[(sx * (width - 0.16)) / 2, height / 2, (sz * (depth - 0.14)) / 2]} castShadow>
            <boxGeometry args={[0.07, height, 0.07]} />
            <meshStandardMaterial color="#30231b" roughness={0.82} />
          </mesh>
        )),
      )}
    </group>
  );
}

export function Crate({ tex, position, rotation = [0, 0, 0], size = 0.7 }) {
  return (
    <group position={position} rotation={rotation}>
      <mesh position={[0, size / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[size, size, size]} />
        <meshStandardMaterial map={tex.woodSmall ?? tex.wood} bumpMap={tex.bumpWood} bumpScale={0.02} color="#8a7560" roughness={0.85} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[0, size / 2, (s * size) / 2 + 0.005]}>
          <boxGeometry args={[size * 0.96, 0.06, 0.02]} />
          <meshStandardMaterial color="#241a13" roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}

export function Shelf({ tex, position, rotation = [0, 0, 0], width = 1.5, height = 2.1 }) {
  const levels = [0.15, 0.75, 1.35, 1.95];
  return (
    <group position={position} rotation={rotation}>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[(s * width) / 2, height / 2, 0]} castShadow>
          <boxGeometry args={[0.07, height, 0.62]} />
          <meshStandardMaterial color="#2c241c" roughness={0.9} />
        </mesh>
      ))}
      {levels.map((y) => (
        <mesh key={y} position={[0, y, 0]} castShadow>
          <boxGeometry args={[width, 0.055, 0.62]} />
          <meshStandardMaterial map={tex.woodSmall ?? tex.wood} color="#7a6550" roughness={0.88} />
        </mesh>
      ))}
      {levels.slice(0, 3).map((y, i) =>
        [0, 1, 2]
          .filter((n) => (n + i) % 3 !== 0)
          .map((n) => (
            <mesh key={`${y}-${n}`} position={[-width / 2 + 0.24 + n * (width / 3.4), y + 0.16, 0]} castShadow>
              <boxGeometry args={[0.26, 0.26, 0.3]} />
              <meshStandardMaterial color={n % 2 ? '#4a3f30' : '#33302a'} roughness={0.9} />
            </mesh>
          )),
      )}
    </group>
  );
}

export function Desk({ tex, position, rotation = [0, 0, 0] }) {
  return (
    <group position={position} rotation={rotation}>
      <mesh position={[0, 0.74, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.6, 0.07, 0.8]} />
        <meshStandardMaterial map={tex.woodTable ?? tex.wood} color="#615243" roughness={0.72} />
      </mesh>
      <mesh position={[0, 0.38, 0]} castShadow>
        <boxGeometry args={[1.5, 0.66, 0.7]} />
        <meshStandardMaterial color="#2a2a26" roughness={0.8} />
      </mesh>
      <mesh position={[0.42, 0.56, 0.36]}>
        <boxGeometry args={[0.56, 0.03, 0.02]} />
        <meshStandardMaterial color="#8b7f66" metalness={0.6} roughness={0.4} />
      </mesh>
      <mesh position={[-0.4, 0.79, 0.06]} rotation={[0, 0.3, 0]} castShadow>
        <boxGeometry args={[0.42, 0.02, 0.3]} />
        <meshStandardMaterial color="#c9c2ae" roughness={0.95} />
      </mesh>
      <Chair tex={tex} position={[0, 0, 0.72]} rotation={[0, Math.PI, 0]} scale={0.94} />
    </group>
  );
}

export function Cabinet({ tex, position, rotation = [0, 0, 0], height = 1.4, width = 0.62, depth = 0.66 }) {
  return (
    <group position={position} rotation={rotation}>
      <mesh position={[0, height / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[width, height, depth]} />
        <meshStandardMaterial color="#383d38" metalness={0.36} roughness={0.58} />
      </mesh>
      {[0.2, 0.45, 0.7, 0.95].map((f, i) =>
        i * height * 0.24 + 0.14 < height ? (
          <group key={f}>
            <mesh position={[0, 0.16 + i * (height * 0.24), depth / 2 + 0.005]}>
              <boxGeometry args={[width * 0.9, height * 0.2, 0.03]} />
              <meshStandardMaterial color="#2b2f2b" roughness={0.62} />
            </mesh>
            <mesh position={[0, 0.16 + i * (height * 0.24), depth / 2 + 0.03]}>
              <boxGeometry args={[width * 0.34, 0.035, 0.03]} />
              <meshStandardMaterial color="#8b8a7d" metalness={0.6} roughness={0.4} />
            </mesh>
          </group>
        ) : null,
      )}
    </group>
  );
}

export function Pew({ tex, position, rotation = [0, 0, 0], length = 3.2 }) {
  return (
    <group position={position} rotation={rotation}>
      <mesh position={[0, 0.45, 0]} castShadow receiveShadow>
        <boxGeometry args={[length, 0.08, 0.44]} />
        <meshStandardMaterial map={tex.woodSmall ?? tex.wood} color="#584434" roughness={0.75} />
      </mesh>
      <mesh position={[0, 0.78, -0.2]} rotation={[-0.09, 0, 0]} castShadow>
        <boxGeometry args={[length, 0.62, 0.07]} />
        <meshStandardMaterial map={tex.woodSmall ?? tex.wood} color="#4d3b2c" roughness={0.78} />
      </mesh>
      {[-length / 2 + 0.16, length / 2 - 0.16].map((x) => (
        <mesh key={x} position={[x, 0.22, 0]} castShadow>
          <boxGeometry args={[0.09, 0.44, 0.42]} />
          <meshStandardMaterial color="#2c2118" roughness={0.85} />
        </mesh>
      ))}
    </group>
  );
}

export function Crib({ tex, position, rotation = [0, 0, 0] }) {
  const bars = Array.from({ length: 7 }, (_, i) => -0.42 + i * 0.14);
  return (
    <group position={position} rotation={rotation}>
      <mesh position={[0, 0.5, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.1, 0.8, 0.66]} />
        <meshStandardMaterial color="#b8b0a0" roughness={0.9} transparent opacity={0.16} />
      </mesh>
      <mesh position={[0, 0.14, 0]} castShadow>
        <boxGeometry args={[0.98, 0.12, 0.56]} />
        <meshStandardMaterial color="#d8d2c2" roughness={0.92} />
      </mesh>
      {bars.map((x) =>
        [-0.31, 0.31].map((z) => (
          <mesh key={`${x}${z}`} position={[x, 0.52, z]}>
            <boxGeometry args={[0.025, 0.72, 0.025]} />
            <meshStandardMaterial color="#c6bfae" roughness={0.8} />
          </mesh>
        )),
      )}
      <mesh position={[0, 0.9, 0]} castShadow>
        <boxGeometry args={[1.1, 0.05, 0.66]} />
        <meshStandardMaterial color="#cfc8b6" roughness={0.86} />
      </mesh>
      <mesh position={[0, 0.24, 0.02]} castShadow>
        <boxGeometry args={[0.62, 0.1, 0.34]} />
        <meshStandardMaterial color="#8f8b7c" roughness={1} />
      </mesh>
    </group>
  );
}

export function RockingHorse({ tex, position, rotation = [0, 0, 0] }) {
  return (
    <group position={position} rotation={rotation}>
      <mesh position={[0, 0.44, 0]} rotation={[0, 0, 0.02]} castShadow>
        <capsuleGeometry args={[0.16, 0.34, 4, 8]} />
        <meshStandardMaterial color="#8b6a4a" roughness={0.86} />
      </mesh>
      <mesh position={[0.24, 0.62, 0]}>
        <sphereGeometry args={[0.1, 12, 10]} />
        <meshStandardMaterial color="#8b6a4a" roughness={0.86} />
      </mesh>
      <mesh position={[0.3, 0.78, 0]} rotation={[0, 0, 0.4]}>
        <boxGeometry args={[0.04, 0.16, 0.04]} />
        <meshStandardMaterial color="#3a3026" roughness={0.9} />
      </mesh>
      {[-0.2, 0.2].flatMap((z) =>
        [-0.22, 0.22].map((x) => (
          <mesh key={`${x}${z}`} position={[x, 0.2, z]} rotation={[0, 0, 0.1]}>
            <boxGeometry args={[0.045, 0.34, 0.045]} />
            <meshStandardMaterial color="#6d5238" roughness={0.9} />
          </mesh>
        )),
      )}
      <mesh position={[0, 0.02, 0]} rotation={[0, 0, 0]}>
        <torusGeometry args={[0.34, 0.03, 6, 16, Math.PI]} />
        <meshStandardMaterial color="#412f21" roughness={0.9} />
      </mesh>
    </group>
  );
}

export function Painting({ tex, position, rotation = [0, 0, 0], index = 0, scale = 1 }) {
  const art = tex.portraits[index % tex.portraits.length];
  return (
    <group position={position} rotation={rotation} scale={scale}>
      <mesh castShadow>
        <boxGeometry args={[0.94, 1.2, 0.09]} />
        <meshStandardMaterial color="#2a2419" metalness={0.35} roughness={0.6} />
      </mesh>
      <mesh position={[0, 0, 0.052]}>
        <boxGeometry args={[0.8, 1.06, 0.025]} />
        <meshStandardMaterial color="#6f6350" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0, 0.07]}>
        <planeGeometry args={[0.72, 0.98]} />
        <meshStandardMaterial map={art} emissiveMap={art} emissive="#ffffff" emissiveIntensity={0.32} roughness={1} />
      </mesh>
    </group>
  );
}

export function Mirror({ tex, position, rotation = [0, 0, 0], width = 1.1, height = 1.5, power = 1 }) {
  return (
    <group position={position} rotation={rotation}>
      <mesh castShadow>
        <boxGeometry args={[width + 0.1, height + 0.1, 0.06]} />
        <meshStandardMaterial color="#2b2f29" metalness={0.4} roughness={0.5} />
      </mesh>
      <mesh position={[0, 0, 0.04]}>
        <planeGeometry args={[width, height]} />
        <meshStandardMaterial
          color="#161d1e"
          metalness={1}
          roughness={0.08}
          envMapIntensity={0.7 * power}
          transparent
          opacity={0.96}
        />
      </mesh>
      <mesh position={[0, 0, 0.045]}>
        <planeGeometry args={[width * 0.31, height]} />
        <meshBasicMaterial color="#070a09" transparent opacity={0.34} />
      </mesh>
    </group>
  );
}

export function Sink({ tex, position, rotation = [0, 0, 0] }) {
  return (
    <group position={position} rotation={rotation}>
      <mesh position={[0, 0.78, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.78, 0.16, 0.52]} />
        <meshStandardMaterial color="#d3d6cc" roughness={0.42} metalness={0.12} />
      </mesh>
      <mesh position={[0, 0.7, 0.02]}>
        <cylinderGeometry args={[0.2, 0.15, 0.1, 18, 1, true]} />
        <meshStandardMaterial color="#8f948c" roughness={0.5} metalness={0.2} />
      </mesh>
      <mesh position={[0, 0.92, -0.18]}>
        <cylinderGeometry args={[0.022, 0.022, 0.3, 8]} />
        <meshStandardMaterial color="#b7bdb5" metalness={0.7} roughness={0.3} />
      </mesh>
      <mesh position={[0, 0.8, 0.02]}>
        <cylinderGeometry args={[0.016, 0.016, 0.26, 6]} />
        <meshStandardMaterial color="#9aa29c" metalness={0.6} roughness={0.4} />
      </mesh>
    </group>
  );
}

export function Stall({ position, rotation = [0, 0, 0], width = 1.15 }) {
  return (
    <group position={position} rotation={rotation}>
      <mesh position={[0, 1.05, 0]} castShadow>
        <boxGeometry args={[width, 2.1, 0.05]} />
        <meshStandardMaterial color="#4d5a54" roughness={0.72} metalness={0.2} />
      </mesh>
      <mesh position={[-width / 2, 1.05, 0]}>
        <boxGeometry args={[0.05, 2.1, 0.05]} />
        <meshStandardMaterial color="#2f3833" roughness={0.8} />
      </mesh>
      <mesh position={[width / 2 - 0.2, 1.2, 0.05]}>
        <boxGeometry args={[0.04, 0.04, 0.04]} />
        <meshStandardMaterial color="#9aa39c" metalness={0.7} roughness={0.3} />
      </mesh>
    </group>
  );
}

export function Pipes({ position, rotation = [0, 0, 0], length = 6, count = 3, height = 3.1 }) {
  return (
    <group position={position} rotation={rotation}>
      {Array.from({ length: count }, (_, i) => (
        <mesh key={i} position={[0, height - i * 0.26, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[0.06 + (i % 2) * 0.02, 0.06 + (i % 2) * 0.02, length, 10]} />
          <meshStandardMaterial color={i % 2 ? '#4a4034' : '#3c433c'} metalness={0.55} roughness={0.55} />
        </mesh>
      ))}
      {[-length / 3, length / 3].map((z) => (
        <mesh key={z} position={[0, height - 0.26, z]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.075, 0.075, 0.7, 10]} />
          <meshStandardMaterial color="#3a332a" metalness={0.5} roughness={0.6} />
        </mesh>
      ))}
    </group>
  );
}

export function Column({ position, height = 4.2, radius = 0.32 }) {
  return (
    <group position={position}>
      <mesh position={[0, height / 2, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[radius, radius * 1.08, height, 12]} />
        <meshStandardMaterial color="#6e6d61" roughness={0.96} />
      </mesh>
      <mesh position={[0, 0.1, 0]} castShadow>
        <boxGeometry args={[radius * 2.8, 0.2, radius * 2.8]} />
        <meshStandardMaterial color="#5f5e53" roughness={0.95} />
      </mesh>
      <mesh position={[0, height - 0.14, 0]} castShadow>
        <boxGeometry args={[radius * 2.6, 0.28, radius * 2.6]} />
        <meshStandardMaterial color="#5f5e53" roughness={0.95} />
      </mesh>
    </group>
  );
}

export function Water({ width, depth, y = 0.03 }) {
  const material = useRef();
  useFrame(({ clock }) => {
    if (!material.current?.normalMap) return;
    material.current.normalMap.offset.x = clock.elapsedTime * 0.012;
    material.current.normalMap.offset.y = clock.elapsedTime * 0.017;
  });
  return (
    <mesh position={[0, y, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[width, depth]} />
      <meshStandardMaterial
        ref={material}
        color="#0d1a1d"
        metalness={0.72}
        roughness={0.14}
        transparent
        opacity={0.92}
        envMapIntensity={1.1}
      />
    </mesh>
  );
}

export function Rug({ tex, position = [0, 0.006, 0], width = 3.2, depth = 4.3 }) {
  return (
    <group position={position}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[width, depth]} />
        <meshStandardMaterial map={tex.fabric} color="#a89a7d" roughness={1} />
      </mesh>
      <mesh position={[0, 0.004, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[width * 0.31, width * 0.335, 4]} />
        <meshStandardMaterial color="#8d7f60" roughness={1} />
      </mesh>
    </group>
  );
}

export function ExitSign({ position, rotation = [0, 0, 0], power = 1 }) {
  return (
    <group position={position} rotation={rotation}>
      <mesh>
        <boxGeometry args={[0.66, 0.24, 0.08]} />
        <meshStandardMaterial color="#101310" roughness={0.7} />
      </mesh>
      <mesh position={[0, 0, 0.045]}>
        <planeGeometry args={[0.58, 0.17]} />
        <meshBasicMaterial color="#3f8f5c" toneMapped={false} transparent opacity={0.85 * power} />
      </mesh>
      <RoomLight position={[0, -0.1, 0.3]} color="#4fbf7d" intensity={2.2} distance={3.2} power={power} />
    </group>
  );
}

export function Chains({ position, count = 3, length = 1.6 }) {
  return (
    <group position={position}>
      {Array.from({ length: count }, (_, i) => (
        <group key={i} position={[(i - (count - 1) / 2) * 0.16, 0, 0]}>
          <mesh position={[0, -length / 2, 0]}>
            <cylinderGeometry args={[0.012, 0.012, length, 5]} />
            <meshStandardMaterial color="#3b3b35" metalness={0.65} roughness={0.5} />
          </mesh>
          <mesh position={[0, -length, 0]}>
            <torusGeometry args={[0.06, 0.014, 5, 10]} />
            <meshStandardMaterial color="#4a4a42" metalness={0.7} roughness={0.45} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

export function BoardedWindow({ position, power = 1 }) {
  // Local -Z points into the room, so every offset here is negative.
  return (
    <group position={position}>
      {/* reveal, frame, sill */}
      <mesh position={[0, 0, 0.02]}>
        <boxGeometry args={[1.96, 1.5, 0.14]} />
        <meshStandardMaterial color="#14181a" roughness={1} />
      </mesh>
      <mesh position={[0, 0, -0.035]}>
        <boxGeometry args={[1.78, 1.32, 0.03]} />
        <meshStandardMaterial color="#2a2a22" roughness={0.9} />
      </mesh>
      <mesh position={[0, -0.73, -0.1]} castShadow>
        <boxGeometry args={[1.98, 0.09, 0.26]} />
        <meshStandardMaterial color="#332c22" roughness={0.85} />
      </mesh>

      {/* the cold behind the glass */}
      <mesh position={[0, 0, -0.052]}>
        <planeGeometry args={[1.6, 1.14]} />
        <meshBasicMaterial color="#2b3d47" toneMapped={false} />
      </mesh>
      <mesh position={[0, -0.24, -0.056]}>
        <planeGeometry args={[1.6, 0.52]} />
        <meshBasicMaterial color="#1b272d" toneMapped={false} />
      </mesh>

      {/* mullions */}
      {[-0.4, 0.4].map((x) => (
        <mesh key={`m${x}`} position={[x, 0, -0.075]}>
          <boxGeometry args={[0.045, 1.14, 0.035]} />
          <meshStandardMaterial color="#232620" roughness={0.9} />
        </mesh>
      ))}
      <mesh position={[0, 0.02, -0.075]}>
        <boxGeometry args={[1.6, 0.045, 0.035]} />
        <meshStandardMaterial color="#232620" roughness={0.9} />
      </mesh>

      {/* boards, nailed across the frame */}
      {[-0.44, -0.06, 0.42].map((y, i) => (
        <mesh
          key={`board${y}`}
          position={[0, y, -0.135]}
          rotation={[0, 0, i === 1 ? 0.022 : i === 2 ? -0.03 : -0.012]}
          castShadow
        >
          <boxGeometry args={[1.94, 0.15, 0.055]} />
          <meshStandardMaterial color="#2b2118" roughness={0.88} />
        </mesh>
      ))}

      <RoomLight position={[0, -0.2, -0.9]} color="#8fb0c4" intensity={9} distance={8} power={power} />
    </group>
  );
}

export function TallWindow({ position, rotation = [0, 0, 0], power = 1, height = 2.6 }) {
  return (
    <group position={position} rotation={rotation}>
      <mesh>
        <boxGeometry args={[0.7, height, 0.06]} />
        <meshStandardMaterial color="#0a1014" emissive="#2b4152" emissiveIntensity={0.9 * power} roughness={1} />
      </mesh>
      <mesh position={[0, 0, 0.05]}>
        <boxGeometry args={[0.05, height, 0.04]} />
        <meshStandardMaterial color="#161c1c" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0, 0.05]}>
        <boxGeometry args={[0.7, 0.05, 0.04]} />
        <meshStandardMaterial color="#161c1c" roughness={0.9} />
      </mesh>
      <RoomLight position={[0, 0, 0.5]} color="#7fa6c4" intensity={3.4} distance={4.6} power={power} />
    </group>
  );
}

export function Dust({ count = 90, spread = [8, 4, 8], origin = [0, 0, 0], size = 0.008, seed = 1 }) {
  const ref = useRef();
  const spreadKey = spread.join(',');
  const originKey = origin.join(',');
  const positions = useMemo(() => {
    const rng = makeRng(seed);
    const [width, height, depth] = spreadKey.split(',').map(Number);
    const [x, y, z] = originKey.split(',').map(Number);
    const p = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      p[i * 3] = (rng.next() - 0.5) * width + x;
      p[i * 3 + 1] = rng.next() * height + y;
      p[i * 3 + 2] = (rng.next() - 0.5) * depth + z;
    }
    return p;
  }, [count, spreadKey, originKey, seed]);

  useFrame(({ clock }) => {
    if (!ref.current) return;
    ref.current.rotation.y = Math.sin(clock.elapsedTime * 0.04 + seed) * 0.06;
    ref.current.position.y = Math.sin(clock.elapsedTime * 0.11 + seed) * 0.05;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial color="#e4d7b8" size={size} transparent opacity={0.055} sizeAttenuation depthWrite={false} />
    </points>
  );
}

/* ------------------------------------------------------- second prop batch */
/* The furniture for the rooms past the eleventh door. Same rule as above:
 * primitives only, silhouette first, detail only where light will find it. */

export function Bed({ tex, position, rotation = [0, 0, 0], made = true, length = 1.95 }) {
  return (
    <group position={position} rotation={rotation}>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * 0.62, 0.24, 0]} castShadow>
          <boxGeometry args={[0.08, 0.48, length]} />
          <meshStandardMaterial color="#2e231a" roughness={0.86} />
        </mesh>
      ))}
      <mesh position={[0, 0.5, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.28, 0.8, length]} />
        <meshStandardMaterial color="#4a4038" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.92, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.34, 0.16, length + 0.03]} />
        <meshStandardMaterial color={made ? '#a9a292' : '#7d786c'} roughness={1} />
      </mesh>
      {/* blanket: thicker at the foot, and never quite straight */}
      <mesh position={[0, 0.99, length * 0.16]} rotation={[0.012, 0, 0.014]} castShadow>
        <boxGeometry args={[1.38, 0.08, length * 0.66]} />
        <meshStandardMaterial map={tex.fabric} color={made ? '#6b6252' : '#5c5548'} roughness={1} />
      </mesh>
      <mesh position={[0, 1.02, -length * 0.31]} rotation={[0, 0.04, 0.02]} castShadow>
        <boxGeometry args={[0.72, 0.13, 0.36]} />
        <meshStandardMaterial color="#b8b2a2" roughness={1} />
      </mesh>
      <mesh position={[0, 1.02, -length * 0.31]} rotation={[0, -0.05, 0]}>
        <boxGeometry args={[0.68, 0.12, 0.32]} />
        <meshStandardMaterial color="#c4beb0" roughness={1} />
      </mesh>
      <mesh position={[0, 0.9, -length / 2 - 0.02]} castShadow>
        <boxGeometry args={[1.34, 0.5, 0.06]} />
        <meshStandardMaterial color="#3a2c20" roughness={0.84} />
      </mesh>
    </group>
  );
}

export function Wardrobe({ tex, position, rotation = [0, 0, 0], height = 2.1, width = 1.25, ajar = 0.12 }) {
  return (
    <group position={position} rotation={rotation}>
      <mesh position={[0, height / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[width, height, 0.62]} />
        <meshStandardMaterial map={tex.wood} bumpMap={tex.bumpWood} bumpScale={0.012} color="#4c3a29" roughness={0.8} />
      </mesh>
      <mesh position={[0, height - 0.05, 0]}>
        <boxGeometry args={[width + 0.1, 0.08, 0.68]} />
        <meshStandardMaterial color="#2c2018" roughness={0.85} />
      </mesh>
      {[-1, 1].map((side) => (
        <group key={side} position={[side * (width / 4), height / 2, 0.32]} rotation={[0, side * -ajar, 0]}>
          <mesh castShadow>
            <boxGeometry args={[width / 2 - 0.02, height - 0.14, 0.05]} />
            <meshStandardMaterial map={tex.woodSmall ?? tex.wood} color="#5a4532" roughness={0.76} />
          </mesh>
          <mesh position={[-side * 0.12, 0, 0.04]}>
            <boxGeometry args={[0.035, 0.2, 0.03]} />
            <meshStandardMaterial color="#8b7b5c" metalness={0.6} roughness={0.4} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

export function Bathtub({ tex, position, rotation = [0, 0, 0], filled = false }) {
  const porcelain = { color: '#c9cdc2', roughness: 0.34, metalness: 0.08 };
  return (
    <group position={position} rotation={rotation}>
      <mesh position={[0, 0.3, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.6, 0.6, 0.78]} />
        <meshStandardMaterial {...porcelain} />
      </mesh>
      <mesh position={[0, 0.61, 0]}>
        <boxGeometry args={[1.42, 0.06, 0.6]} />
        <meshStandardMaterial color="#10140f" roughness={0.7} />
      </mesh>
      {filled && (
        <mesh position={[0, 0.585, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[1.36, 0.56]} />
          <meshStandardMaterial color="#0a1113" metalness={0.7} roughness={0.14} transparent opacity={0.94} />
        </mesh>
      )}
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * 0.76, 0.1, 0]}>
          <boxGeometry args={[0.12, 0.28, 0.5]} />
          <meshStandardMaterial color="#3a3a34" metalness={0.5} roughness={0.5} />
        </mesh>
      ))}
    </group>
  );
}

export function Stove({ tex, position, rotation = [0, 0, 0] }) {
  return (
    <group position={position} rotation={rotation}>
      <mesh position={[0, 0.45, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.3, 0.9, 0.66]} />
        <meshStandardMaterial color="#b6b9ae" metalness={0.3} roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.92, 0]}>
        <boxGeometry args={[1.3, 0.05, 0.66]} />
        <meshStandardMaterial color="#4a4c46" metalness={0.4} roughness={0.55} />
      </mesh>
      {[-0.33, 0.33].flatMap((x) =>
        [-0.15, 0.15].map((z) => (
          <mesh key={`${x}${z}`} position={[x, 0.95, z]} rotation={[-Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.11, 0.012, 5, 16]} />
            <meshStandardMaterial color="#23231f" metalness={0.6} roughness={0.6} />
          </mesh>
        )),
      )}
      <mesh position={[0, 0.44, 0.335]}>
        <boxGeometry args={[1.1, 0.5, 0.03]} />
        <meshStandardMaterial color="#2a2b27" roughness={0.6} metalness={0.3} />
      </mesh>
      <mesh position={[0, 0.66, 0.37]}>
        <boxGeometry args={[0.9, 0.035, 0.04]} />
        <meshStandardMaterial color="#8a8b80" metalness={0.7} roughness={0.35} />
      </mesh>
    </group>
  );
}

export function SchoolDesk({ tex, position, rotation = [0, 0, 0] }) {
  return (
    <group position={position} rotation={rotation}>
      <mesh position={[0, 0.7, 0]} rotation={[-0.09, 0, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.68, 0.05, 0.48]} />
        <meshStandardMaterial map={tex.woodSmall ?? tex.wood} color="#7c6a52" roughness={0.82} />
      </mesh>
      <mesh position={[0, 0.66, 0]}>
        <boxGeometry args={[0.6, 0.1, 0.4]} />
        <meshStandardMaterial color="#3a3228" roughness={0.9} />
      </mesh>
      {[-0.26, 0.26].map((x) => (
        <mesh key={x} position={[x, 0.32, 0]}>
          <boxGeometry args={[0.04, 0.64, 0.04]} />
          <meshStandardMaterial color="#454a44" metalness={0.4} roughness={0.55} />
        </mesh>
      ))}
      <Chair tex={tex} position={[0, 0, 0.56]} rotation={[0, Math.PI, 0]} scale={0.86} />
    </group>
  );
}

export function Chalkboard({ tex, position, rotation = [0, 0, 0], width = 3.2, height = 1.5 }) {
  return (
    <group position={position} rotation={rotation}>
      <mesh castShadow>
        <boxGeometry args={[width + 0.16, height + 0.16, 0.07]} />
        <meshStandardMaterial color="#3a2f24" roughness={0.82} />
      </mesh>
      <mesh position={[0, 0, 0.042]}>
        <planeGeometry args={[width, height]} />
        <meshStandardMaterial color="#1e2822" roughness={0.72} emissive="#16201b" emissiveIntensity={0.5} />
      </mesh>
      <mesh position={[0, -height / 2 - 0.06, 0.07]}>
        <boxGeometry args={[width, 0.05, 0.12]} />
        <meshStandardMaterial color="#4a3a2a" roughness={0.8} />
      </mesh>
    </group>
  );
}

export function Staircase({ tex, position, rotation = [0, 0, 0], steps = 11, rise = 0.29, run = 0.34, width = 1.5 }) {
  return (
    <group position={position} rotation={rotation}>
      {Array.from({ length: steps }, (_, i) => (
        <mesh key={i} position={[0, rise * (i + 0.5), -run * i]} castShadow receiveShadow>
          <boxGeometry args={[width, rise, run]} />
          <meshStandardMaterial map={tex.woodSmall ?? tex.wood} color="#5d4a37" roughness={0.9} />
        </mesh>
      ))}
      {/* the landing at the top, and the dark you cannot see into from here */}
      <mesh position={[0, rise * steps, -run * steps - 0.6]} castShadow>
        <boxGeometry args={[width + 0.4, 0.12, 1.4]} />
        <meshStandardMaterial color="#3b3128" roughness={0.92} />
      </mesh>
      <mesh position={[0, rise * steps + 1.15, -run * steps - 1.2]}>
        <planeGeometry args={[width, 2.4]} />
        <meshBasicMaterial color="#020303" />
      </mesh>
      {[-1, 1].map((side) => (
        <group key={side}>
          <mesh position={[side * (width / 2 - 0.04), rise * steps * 0.55 + 0.75, -run * steps * 0.5]} rotation={[-Math.atan2(rise, run), 0, 0]}>
            <boxGeometry args={[0.06, 0.06, Math.hypot(rise, run) * steps]} />
            <meshStandardMaterial color="#4b3a29" roughness={0.8} />
          </mesh>
          {Array.from({ length: 4 }, (_, i) => (
            <mesh key={i} position={[side * (width / 2 - 0.04), rise * (i * 3) + 0.55, -run * i * 3]}>
              <boxGeometry args={[0.05, 0.9, 0.05]} />
              <meshStandardMaterial color="#43331f" roughness={0.85} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

export function Trolley({ tex, position, rotation = [0, 0, 0], covered = true }) {
  const steel = { color: '#9aa0a0', metalness: 0.7, roughness: 0.32 };
  return (
    <group position={position} rotation={rotation}>
      <mesh position={[0, 0.72, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.72, 0.07, 1.86]} />
        <meshStandardMaterial {...steel} />
      </mesh>
      {[-1, 1].flatMap((sx) =>
        [-1, 1].map((sz) => (
          <mesh key={`${sx}${sz}`} position={[sx * 0.3, 0.37, sz * 0.78]} castShadow>
            <cylinderGeometry args={[0.022, 0.022, 0.7, 8]} />
            <meshStandardMaterial {...steel} />
          </mesh>
        )),
      )}
      {[-1, 1].map((sx) => (
        <mesh key={sx} position={[sx * 0.3, 0.86, 0]}>
          <boxGeometry args={[0.03, 0.03, 1.8]} />
          <meshStandardMaterial {...steel} />
        </mesh>
      ))}
      {covered && (
        <mesh position={[0, 0.92, 0]} scale={[1, 1, 1.12]} castShadow>
          <capsuleGeometry args={[0.21, 1.35, 4, 12]} />
          <meshStandardMaterial color="#8c8e85" roughness={1} />
        </mesh>
      )}
    </group>
  );
}

export function Washer({ position, rotation = [0, 0, 0], spinning = true, seed = 0 }) {
  const drum = useRef();
  useFrame(({ clock }) => {
    if (!drum.current || !spinning) return;
    drum.current.rotation.z = clock.elapsedTime * (1.2 + seed * 0.1);
  });
  return (
    <group position={position} rotation={rotation}>
      <mesh position={[0, 0.55, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.7, 0.9, 0.68]} />
        <meshStandardMaterial color="#aeb3a8" metalness={0.35} roughness={0.45} />
      </mesh>
      <mesh position={[0, 0.55, 0.345]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.24, 0.035, 6, 20]} />
        <meshStandardMaterial color="#6c716a" metalness={0.6} roughness={0.35} />
      </mesh>
      <mesh position={[0, 0.55, 0.33]}>
        <circleGeometry args={[0.23, 20]} />
        <meshStandardMaterial color="#171d1c" metalness={0.8} roughness={0.2} />
      </mesh>
      <mesh ref={drum} position={[0, 0.55, 0.35]} rotation={[0, 0, 0]}>
        <boxGeometry args={[0.36, 0.03, 0.02]} />
        <meshStandardMaterial color="#7f857c" metalness={0.4} roughness={0.5} />
      </mesh>
      <mesh position={[0, 1.02, 0]}>
        <boxGeometry args={[0.72, 0.04, 0.7]} />
        <meshStandardMaterial color="#8d9288" metalness={0.4} roughness={0.5} />
      </mesh>
    </group>
  );
}

export function GrandfatherClock({ tex, position, rotation = [0, 0, 0], height = 2.3 }) {
  const pendulum = useRef();
  useFrame(({ clock }) => {
    if (!pendulum.current) return;
    pendulum.current.rotation.z = Math.sin(clock.elapsedTime * 1.55) * 0.2;
  });
  return (
    <group position={position} rotation={rotation}>
      <mesh position={[0, 0.16, 0]} castShadow>
        <boxGeometry args={[0.72, 0.32, 0.5]} />
        <meshStandardMaterial map={tex.wood} color="#3d2c1e" roughness={0.8} />
      </mesh>
      <mesh position={[0, height * 0.55, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.62, height * 0.78, 0.42]} />
        <meshStandardMaterial map={tex.wood} bumpMap={tex.bumpWood} bumpScale={0.01} color="#4a3524" roughness={0.76} />
      </mesh>
      <mesh position={[0, height * 0.97, 0]} castShadow>
        <boxGeometry args={[0.7, height * 0.24, 0.48]} />
        <meshStandardMaterial map={tex.wood} color="#543c28" roughness={0.74} />
      </mesh>
      <mesh position={[0, height * 0.99, 0.246]}>
        <circleGeometry args={[0.2, 24]} />
        <meshStandardMaterial color="#8e8774" roughness={0.82} emissive="#57462c" emissiveIntensity={0.16} />
      </mesh>
      <mesh position={[0, height * 0.99, 0.25]} rotation={[0, 0, 0.6]}>
        <boxGeometry args={[0.012, 0.14, 0.006]} />
        <meshStandardMaterial color="#2b241c" roughness={0.9} />
      </mesh>
      <mesh position={[0, height * 0.99, 0.25]} rotation={[0, 0, -1.2]}>
        <boxGeometry args={[0.01, 0.1, 0.006]} />
        <meshStandardMaterial color="#2b241c" roughness={0.9} />
      </mesh>
      <mesh position={[0, height * 0.52, 0.216]} ref={pendulum}>
        <boxGeometry args={[0.045, 0.6, 0.02]} />
        <meshStandardMaterial color="#8b7a4f" metalness={0.7} roughness={0.35} />
      </mesh>
      <mesh position={[0, height * 0.52, 0.205]}>
        <planeGeometry args={[0.44, height * 0.5]} />
        <meshBasicMaterial color="#050604" transparent opacity={0.9} />
      </mesh>
    </group>
  );
}

export function Barrel({ tex, position, rotation = [0, 0, 0], height = 0.92, radius = 0.34 }) {
  return (
    <group position={position} rotation={rotation}>
      <mesh position={[0, height / 2, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[radius, radius * 0.94, height, 14]} />
        <meshStandardMaterial map={tex.woodSmall ?? tex.wood} color="#5b4530" roughness={0.88} />
      </mesh>
      {[0.2, 0.72].map((t) => (
        <mesh key={t} position={[0, height * t, 0]}>
          <torusGeometry args={[radius * 0.99, 0.018, 5, 16]} />
          <meshStandardMaterial color="#33322c" metalness={0.6} roughness={0.55} />
        </mesh>
      ))}
    </group>
  );
}

export function HangingCloth({ position, rotation = [0, 0, 0], width = 1.2, height = 2.2, opacity = 0.24, seed = 0 }) {
  const mesh = useRef();
  useFrame(({ clock }) => {
    if (!mesh.current) return;
    const t = clock.elapsedTime + seed * 1.7;
    mesh.current.rotation.y = rotation[1] + Math.sin(t * 0.42) * 0.06;
    mesh.current.rotation.x = rotation[0] + Math.cos(t * 0.31) * 0.02;
  });
  return (
    <group position={position}>
      <mesh ref={mesh} rotation={rotation}>
        <planeGeometry args={[width, height, 1, 8]} />
        <meshStandardMaterial color="#8d938a" transparent opacity={opacity} roughness={0.7} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
    </group>
  );
}

/** A door that is only paint and panic: it never opens, and there is nothing
 *  behind it. Rooms with more than one door are how the building lies. */
export function DoorPanel({ tex, position, rotation = [0, 0, 0], open = false, height = 2.3, width = 1.0, glow = 0 }) {
  return (
    <group position={position} rotation={rotation}>
      <mesh position={[0, height / 2, -0.04]} castShadow>
        <boxGeometry args={[width + 0.18, height + 0.12, 0.1]} />
        <meshStandardMaterial color="#2b2118" roughness={0.82} />
      </mesh>
      <group rotation={[0, open ? -0.9 : 0, 0]} position={[-width / 2, 0, 0.02]}>
        <mesh position={[width / 2, height / 2, 0]} castShadow>
          <boxGeometry args={[width, height, 0.06]} />
          <meshStandardMaterial map={tex.wood} bumpMap={tex.bumpWood} bumpScale={0.01} color="#5c462f" roughness={0.62} />
        </mesh>
        <mesh position={[width - 0.15, height * 0.48, 0.05]}>
          <sphereGeometry args={[0.045, 12, 10]} />
          <meshStandardMaterial color="#a88a58" metalness={0.8} roughness={0.28} />
        </mesh>
        {[0.34, 0.66].map((t) => (
          <mesh key={t} position={[width / 2, height * t, 0.035]}>
            <boxGeometry args={[width - 0.22, height * 0.2, 0.012]} />
            <meshStandardMaterial color="#3a2a1c" roughness={0.66} />
          </mesh>
        ))}
      </group>
      {glow > 0 && (
        <mesh position={[0, 0.02, 0.14]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[width * 0.9, 0.24]} />
          <meshBasicMaterial color="#c9a06a" transparent opacity={glow} toneMapped={false} />
        </mesh>
      )}
    </group>
  );
}

export function CeilingFan({ position, power = 1, speed = 0.5, radius = 0.7 }) {
  const rotor = useRef();
  useFrame(({ clock }) => {
    if (rotor.current) rotor.current.rotation.y = clock.elapsedTime * speed;
  });
  return (
    <group position={position}>
      <mesh position={[0, 0.18, 0]}>
        <cylinderGeometry args={[0.035, 0.035, 0.36, 6]} />
        <meshStandardMaterial color="#2a2a24" roughness={0.8} />
      </mesh>
      <mesh>
        <cylinderGeometry args={[0.12, 0.14, 0.12, 12]} />
        <meshStandardMaterial color="#37372e" metalness={0.4} roughness={0.55} />
      </mesh>
      <group ref={rotor}>
        {[0, 1, 2, 3].map((i) => {
          const a = (i / 4) * Math.PI * 2;
          return (
            <mesh key={i} position={[Math.cos(a) * radius * 0.55, -0.04, Math.sin(a) * radius * 0.55]} rotation={[0, -a, 0.06]} castShadow>
              <boxGeometry args={[radius, 0.018, 0.19]} />
              <meshStandardMaterial color="#423a2c" roughness={0.8} />
            </mesh>
          );
        })}
      </group>
      <mesh position={[0, -0.16, 0]}>
        <sphereGeometry args={[0.09, 12, 10]} />
        <meshStandardMaterial color="#e8d3a6" emissive="#c08c4c" emissiveIntensity={1.1 * power} toneMapped={false} />
      </mesh>
      <RoomLight position={[0, -0.3, 0]} color="#e8bb82" intensity={9} distance={8} power={power} flicker={0.12} seed={11} />
    </group>
  );
}

export function Rubble({ position, seed = 0, count = 9, spread = 1.6 }) {
  const bits = useMemo(() => {
    const rng = makeRng(seed);
    return Array.from({ length: count }, () => ({
      x: rng.float(-spread / 2, spread / 2),
      z: rng.float(-spread / 2, spread / 2),
      s: rng.float(0.06, 0.24),
      r: rng.float(0, Math.PI),
      h: rng.float(0.05, 0.16),
    }));
  }, [seed, count, spread]);
  return (
    <group position={position}>
      {bits.map((b, i) => (
        <mesh key={i} position={[b.x, b.h / 2, b.z]} rotation={[0.03, b.r, 0.02]} castShadow receiveShadow>
          <boxGeometry args={[b.s, b.h, b.s * 0.8]} />
          <meshStandardMaterial color={i % 3 === 0 ? '#4a463c' : '#3b3831'} roughness={0.98} />
        </mesh>
      ))}
    </group>
  );
}

export function Drain({ position, rotation = [-Math.PI / 2, 0, 0] }) {
  return (
    <group position={position} rotation={rotation}>
      <mesh>
        <circleGeometry args={[0.17, 20]} />
        <meshStandardMaterial color="#1a1e1c" metalness={0.6} roughness={0.5} />
      </mesh>
      {[-0.08, 0, 0.08].map((x) => (
        <mesh key={x} position={[x, 0.001, 0]}>
          <boxGeometry args={[0.02, 0.02, 0.3]} />
          <meshStandardMaterial color="#4a4f4a" metalness={0.7} roughness={0.4} />
        </mesh>
      ))}
    </group>
  );
}
