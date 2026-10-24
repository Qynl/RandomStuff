/* The thing in the rooms.
 *
 * A rig, not a silhouette. Too tall, too thin, arms a little too long, head not
 * quite on straight — but built from joints so it can walk, and walking is what
 * sells it. A figure that stands still is a statue; a figure that takes a step
 * while you are looking at it is a problem.
 *
 * It wears a shroud from the shoulders to the knees, which is doing most of the
 * work: it hides the joints, gives the body some weight, and stops the figure
 * from reading as a shop mannequin. The face is barely lit; the eyes are the
 * only thing that carries at distance.
 */
import React, { useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { makeRng } from '../lib/rng.js';

const SKIN = { color: '#08090a', roughness: 1, metalness: 0 };
const CLOTH = { color: '#0b0c0b', roughness: 1, metalness: 0 };

function Limb({ length, radius, ...rest }) {
  return (
    <mesh {...rest}>
      <capsuleGeometry args={[radius, Math.max(0.01, length - radius * 2), 4, 9]} />
      <meshStandardMaterial {...SKIN} />
    </mesh>
  );
}

/** A ball at the joint: capsules pinch to a point at each end, and the gap
 *  where two of them meet is the difference between a body and a puppet. */
function Joint({ radius, ...rest }) {
  return (
    <mesh {...rest}>
      <sphereGeometry args={[radius, 10, 8]} />
      <meshStandardMaterial {...SKIN} />
    </mesh>
  );
}

export default function Apparition({
  position = [0, 0, 0],
  visible = true,
  close = false,
  scale = 1,
  pose = 'idle',
  stagger = 0,
}) {
  const root = useRef();
  const torso = useRef();
  const head = useRef();
  const eyes = useRef();
  const hips = useRef();
  const leftArm = useRef();
  const rightArm = useRef();
  const leftFore = useRef();
  const rightFore = useRef();
  const leftLeg = useRef();
  const rightLeg = useRef();
  const leftShin = useRef();
  const rightShin = useRef();
  const shroud = useRef();

  const walk = pose === 'walk';
  const crouch = pose === 'crouch';
  const phase = useMemo(() => stagger * Math.PI * 2, [stagger]);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime + phase;
    const rate = walk ? 2.05 : close ? 1.5 : 0.9;
    const swing = walk ? 0.46 : 0;

    if (root.current) {
      // It does not stand level. One hip is always a little lower.
      root.current.rotation.z = Math.sin(t * rate * 0.5) * (walk ? 0.035 : 0.014);
      root.current.position.y = crouch ? -0.42 : Math.sin(t * rate) * (walk ? 0.026 : 0.009);
      root.current.scale.setScalar(scale * (1 + Math.sin(t * 0.9) * 0.004));
    }

    if (hips.current) {
      hips.current.rotation.y = Math.sin(t * rate) * (walk ? 0.13 : 0.02);
    }

    if (torso.current) {
      torso.current.rotation.x = (close ? 0.18 : 0.07) + Math.sin(t * rate * 2) * (walk ? 0.035 : 0.012);
      torso.current.rotation.z = Math.sin(t * rate) * (walk ? 0.045 : 0.018);
    }

    if (shroud.current) {
      // The hem lags the body by a few tenths of a second.
      shroud.current.rotation.x = Math.sin(t * rate - 0.6) * (walk ? 0.05 : 0.014);
      shroud.current.rotation.z = Math.sin(t * rate * 0.5 - 0.4) * 0.02;
    }

    if (leftLeg.current && rightLeg.current) {
      leftLeg.current.rotation.x = Math.sin(t * rate) * swing;
      rightLeg.current.rotation.x = Math.sin(t * rate + Math.PI) * swing;
      // Knees only bend one way, and late.
      leftShin.current.rotation.x = Math.max(0, Math.sin(t * rate + Math.PI * 0.55)) * (walk ? 0.62 : 0.03);
      rightShin.current.rotation.x = Math.max(0, Math.sin(t * rate + Math.PI * 1.55)) * (walk ? 0.62 : 0.03);
    }

    if (leftArm.current && rightArm.current) {
      const reach = close ? 1.15 : 0;
      leftArm.current.rotation.x = Math.sin(t * rate + Math.PI) * swing * 0.8 - reach;
      rightArm.current.rotation.x = Math.sin(t * rate) * swing * 0.8 - reach;
      leftArm.current.rotation.z = 0.09 + Math.sin(t * 0.7) * 0.02;
      rightArm.current.rotation.z = -0.09 - Math.sin(t * 0.7 + 1.3) * 0.02;
      leftFore.current.rotation.x = -0.2 - Math.max(0, Math.sin(t * rate + Math.PI)) * 0.2 - reach * 0.8;
      rightFore.current.rotation.x = -0.2 - Math.max(0, Math.sin(t * rate)) * 0.2 - reach * 0.8;
    }

    if (head.current) {
      // The head lags the body, and twitches rather than turns.
      const twitch = Math.pow(Math.max(0, Math.sin(t * 0.31 + phase)), 26) * 0.5;
      head.current.rotation.z = 0.16 + Math.sin(t * rate * 0.7) * 0.05 - twitch * (close ? 1 : 0.4);
      head.current.rotation.x = -0.07 + Math.sin(t * 0.53) * 0.03;
      head.current.rotation.y = Math.sin(t * 0.23) * 0.12;
    }

    if (eyes.current) {
      eyes.current.children.forEach((eye, i) => {
        // Irregular, never a clean pulse, and they do not blink together.
        eye.material.opacity = 0.55 + Math.pow(Math.max(0, Math.sin(t * (0.7 + i * 0.13) + i * 2.1)), 3) * 0.4;
      });
    }
  });

  return (
    <group ref={root} position={position} visible={visible} scale={scale}>
      <group ref={hips} position={[0, 0.94, 0]}>
        <group ref={torso} position={[0, 0.02, 0]}>
          {/* pelvis and ribcage, kept thin: it has not eaten in a long time */}
          <Joint radius={0.13} position={[0, 0.02, 0]} castShadow />
          <mesh position={[0, 0.4, -0.005]} castShadow>
            <capsuleGeometry args={[0.145, 0.44, 5, 12]} />
            <meshStandardMaterial {...SKIN} />
          </mesh>
          <mesh position={[0, 0.62, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
            <capsuleGeometry args={[0.05, 0.31, 4, 8]} />
            <meshStandardMaterial {...SKIN} />
          </mesh>

          {/* the shroud: shoulders to knees, open at the hem */}
          <group ref={shroud} position={[0, 0.16, 0]}>
            <mesh position={[0, 0, 0]} castShadow>
              <cylinderGeometry args={[0.165, 0.25, 0.88, 14, 1, true]} />
              <meshStandardMaterial {...CLOTH} side={THREE.DoubleSide} />
            </mesh>
            <mesh position={[0, 0.43, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[0.14, 0.026, 6, 16]} />
              <meshStandardMaterial {...CLOTH} />
            </mesh>
            {/* a torn hem, so it does not read as a clean cone */}
            {[0.4, 1.9, 3.4, 5.0].map((angle, i) => (
              <mesh
                key={angle}
                position={[Math.cos(angle) * 0.22, -0.45 - (i % 2) * 0.05, Math.sin(angle) * 0.22]}
                rotation={[0, -angle, 0]}
                castShadow
              >
                <boxGeometry args={[0.15, 0.16 + (i % 3) * 0.05, 0.01]} />
                <meshStandardMaterial {...CLOTH} side={THREE.DoubleSide} />
              </mesh>
            ))}
          </group>

          <group position={[0, 0.68, 0]}>
            <mesh position={[0, 0.04, 0]} castShadow>
              <cylinderGeometry args={[0.046, 0.056, 0.15, 8]} />
              <meshStandardMaterial {...SKIN} />
            </mesh>
            <group ref={head} position={[0, 0.14, 0]}>
              <mesh position={[0, 0.1, 0]} scale={[1, 1.12, 1.04]} castShadow>
                <sphereGeometry args={[0.108, 18, 16]} />
                <meshStandardMaterial {...SKIN} />
              </mesh>
              {/* jaw hangs a touch too low */}
              <mesh position={[0, 0.02, 0.05]} rotation={[0.22, 0, 0]} castShadow>
                <boxGeometry args={[0.105, 0.05, 0.095]} />
                <meshStandardMaterial {...SKIN} />
              </mesh>
              <group ref={eyes} position={[0.004, 0.112, 0.102]}>
                {[-0.04, 0.04].map((x) => (
                  <mesh key={x} position={[x, 0, 0]}>
                    <sphereGeometry args={[0.0115, 8, 8]} />
                    <meshStandardMaterial
                      color="#dfe6d6"
                      emissive="#eef4e2"
                      emissiveIntensity={1.5}
                      transparent
                      opacity={0.7}
                      toneMapped={false}
                    />
                  </mesh>
                ))}
              </group>
              {/* just enough light to find the face, not enough to explain it */}
              <pointLight position={[0, 0.09, 0.16]} color="#cfe0c8" intensity={0.32} distance={0.75} decay={2} />
            </group>
          </group>

          {/* arms: shoulder -> elbow -> hand, hanging past the knee */}
          {[-1, 1].map((side) => (
            <group key={side} ref={side < 0 ? leftArm : rightArm} position={[side * 0.235, 0.6, 0]} rotation={[0, 0, side * 0.13]}>
              <Joint radius={0.05} position={[0, 0, 0]} />
              <Limb length={0.47} radius={0.042} position={[0, -0.23, 0]} castShadow />
              <Joint radius={0.043} position={[0, -0.45, 0]} />
              <group ref={side < 0 ? leftFore : rightFore} position={[0, -0.45, 0]} rotation={[-0.2, 0, 0]}>
                <Limb length={0.46} radius={0.035} position={[0, -0.23, 0]} castShadow />
                <mesh position={[0, -0.485, 0.008]} castShadow>
                  <boxGeometry args={[0.05, 0.13, 0.075]} />
                  <meshStandardMaterial {...SKIN} />
                </mesh>
                {/* fingers, because hands are the thing you notice second */}
                {[-0.022, 0, 0.022].map((x) => (
                  <mesh key={x} position={[x, -0.575, 0.03]} rotation={[0.16, 0, 0]}>
                    <boxGeometry args={[0.012, 0.1, 0.014]} />
                    <meshStandardMaterial {...SKIN} />
                  </mesh>
                ))}
              </group>
            </group>
          ))}
        </group>

        {/* legs */}
        {[-1, 1].map((side) => (
          <group key={side} ref={side < 0 ? leftLeg : rightLeg} position={[side * 0.095, -0.02, 0]}>
            <Joint radius={0.052} position={[0, -0.02, 0]} />
            <Limb length={0.47} radius={0.047} position={[0, -0.24, 0]} castShadow />
            <Joint radius={0.042} position={[0, -0.46, 0]} />
            <group ref={side < 0 ? leftShin : rightShin} position={[0, -0.47, 0]}>
              <Limb length={0.46} radius={0.037} position={[0, -0.23, 0]} castShadow />
              <mesh position={[0, -0.47, 0.05]} castShadow>
                <boxGeometry args={[0.082, 0.05, 0.19]} />
                <meshStandardMaterial {...SKIN} />
              </mesh>
            </group>
          </group>
        ))}
      </group>

      {close && <pointLight position={[0, 1.82, 0.35]} color="#7f96a0" intensity={1.2} distance={2.4} decay={2} />}
    </group>
  );
}

/**
 * The kind that only moves when it is not being looked at.
 *
 * It stands in the room; if the player holds it in view, it is gone — and it is
 * somewhere else, closer, at an angle they are not covering. Looking at it is
 * the only thing that keeps it still, which means the safe move is the one that
 * gives it time.
 */
export function Weeping({ room, playerRef, onShift, start = 0.86 }) {
  const camera = useThree((state) => state.camera);
  const group = useRef();
  const shots = useRef(0);
  const seen = useRef(0);
  const [spot, setSpot] = useState(() => pickSpot(room, start, 0, null));

  const world = useMemo(() => new THREE.Vector3(), []);
  const ahead = useMemo(() => new THREE.Vector3(), []);

  useFrame((_, delta) => {
    if (!group.current) return;
    const cameraPosition = camera.position;

    group.current.position.set(spot.x, 0, spot.z);
    group.current.rotation.y = Math.atan2(cameraPosition.x - spot.x, cameraPosition.z - (room.centerZ + spot.z));

    world.set(spot.x, 1.5, room.centerZ + spot.z);
    camera.getWorldDirection(ahead);
    const toFigure = world.clone().sub(cameraPosition);
    const distance = toFigure.length();
    const angle = toFigure.normalize().angleTo(ahead);

    const observed = angle < 0.42 && distance < 16;
    if (!observed) {
      seen.current = Math.max(0, seen.current - delta * 0.6);
      return;
    }

    seen.current += delta;
    if (seen.current < 0.62) return;
    seen.current = 0;
    shots.current += 1;

    if (shots.current > 3) {
      // The fourth time you look, it is where your eyes already are.
      const forward = ahead.clone().setY(0).normalize().multiplyScalar(1.15);
      const close = {
        x: THREE.MathUtils.clamp(cameraPosition.x + forward.x, -room.width / 2 + 0.7, room.width / 2 - 0.7),
        z: THREE.MathUtils.clamp(cameraPosition.z + forward.z - room.centerZ, -room.depth / 2 + 0.7, room.depth / 2 - 0.7),
      };
      setSpot(close);
      onShift?.(true);
      return;
    }

    setSpot(pickSpot(room, 0.55, cameraPosition, spot));
    onShift?.(false);
  });

  return (
    <group ref={group}>
      <Apparition pose="stand" scale={1.02} />
    </group>
  );
}

function pickSpot(room, radiusScale, from, avoid) {
  const rng = makeRng((room.seed ^ 0x9e3779b9) + Math.floor(Math.random() * 1e6));
  const halfW = room.width / 2 - 0.9;
  const halfD = room.depth / 2 - 0.9;
  let best = null;
  let bestScore = -1;

  for (let i = 0; i < 14; i++) {
    const angle = rng.float(0, Math.PI * 2);
    const radius = rng.float(1.6, 2.8) * radiusScale + 1.2;
    const candidate = {
      x: THREE.MathUtils.clamp(Math.cos(angle) * radius, -halfW, halfW),
      z: THREE.MathUtils.clamp(Math.sin(angle) * radius, -halfD, halfD),
    };
    const distanceFromPlayer = from
      ? Math.hypot(from.x - candidate.x, from.z - (room.centerZ + candidate.z))
      : 4;
    const distanceFromLast = avoid ? Math.hypot(avoid.x - candidate.x, avoid.z - candidate.z) : 3;
    const score = distanceFromPlayer * 0.7 + Math.min(distanceFromLast, 3);
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }

  return best;
}
