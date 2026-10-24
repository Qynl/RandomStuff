/* One room: shell, doorway, dressing, lights, and whatever is standing in it.
 *
 * A room is rendered in its own local space (centred on 0,0,0) and shifted by
 * the layout's centerZ, so props can be positioned in plain local coordinates.
 */
import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { DOOR_HALF, DOOR_TOP, CORRIDOR_HALF, CORRIDOR_H } from '../lib/rooms.js';
import { makeRng } from '../lib/rng.js';
import Apparition, { Weeping } from './Apparition.jsx';
import {
  Barrel,
  Bed,
  BoardedWindow,
  Cabinet,
  CandleCluster,
  CeilingFan,
  Chair,
  Chains,
  Chalkboard,
  Column,
  Crate,
  Crib,
  Desk,
  DoorPanel,
  DoorSet,
  Drain,
  Dust,
  ExitSign,
  Fluorescent,
  GrandfatherClock,
  HangingBulb,
  HangingCloth,
  Mirror,
  Painting,
  Pew,
  Pipes,
  RockingHorse,
  RoomLight,
  Rubble,
  Rug,
  SchoolDesk,
  Sconce,
  Shelf,
  Sink,
  Staircase,
  Stall,
  Stove,
  Spot,
  Table,
  TallWindow,
  Trolley,
  Wardrobe,
  Washer,
  Water,
} from './props.jsx';

/* --------------------------------------------------------------- materials */

function surfaces(tex, key) {
  if (key === 'washroom') {
    return {
      wall: { map: tex.tile, bumpMap: tex.bumpTile, bumpScale: 0.02, color: '#c6d0c8', roughness: 0.5, metalness: 0.06 },
      floor: { map: tex.tileFloor, bumpMap: tex.bumpTile, bumpScale: 0.02, color: '#a8b2aa', roughness: 0.42, metalness: 0.08 },
      ceiling: { color: '#2b302c', roughness: 1 },
    };
  }
  if (key === 'office' || key === 'boiler') {
    return {
      wall: { map: tex.wallWide, bumpMap: tex.bumpWallWide, bumpScale: 0.03, color: '#b3b8b0', roughness: 0.9 },
      floor: { map: tex.floor, bumpMap: tex.bumpFloor, bumpScale: 0.03, color: '#9fa49c', roughness: 0.72, metalness: 0.1 },
      ceiling: { color: '#2a2d28', roughness: 1 },
    };
  }
  if (key === 'chapel') {
    return {
      wall: { map: tex.wallWide, bumpMap: tex.bumpWallWide, bumpScale: 0.03, color: '#a9aca2', roughness: 0.95 },
      floor: { map: tex.floor, bumpMap: tex.bumpFloor, bumpScale: 0.03, color: '#b6b3a6', roughness: 0.78 },
      ceiling: { color: '#262a2c', roughness: 1 },
    };
  }
  if (key === 'nursery') {
    return {
      wall: { map: tex.wallWide, bumpMap: tex.bumpWallWide, bumpScale: 0.03, color: '#c3b2ae', roughness: 0.94 },
      floor: { map: tex.wood, bumpMap: tex.bumpWood, bumpScale: 0.02, color: '#b0a08c', roughness: 0.7 },
      ceiling: { color: '#2b2824', roughness: 1 },
    };
  }
  if (key === 'exit') {
    return {
      wall: { map: tex.wallWide, bumpMap: tex.bumpWallWide, bumpScale: 0.02, color: '#d9dcd4', roughness: 0.9 },
      floor: { map: tex.floor, bumpMap: tex.bumpFloor, bumpScale: 0.02, color: '#cfd2c8', roughness: 0.8 },
      ceiling: { color: '#c6c9c0', roughness: 1 },
    };
  }
  if (key === 'bedroom' || key === 'library' || key === 'clockroom') {
    return {
      wall: { map: tex.wallWide, bumpMap: tex.bumpWallWide, bumpScale: 0.028, color: key === 'clockroom' ? '#b0a68f' : '#b3ada0', roughness: 0.94 },
      floor: { map: tex.wood, bumpMap: tex.bumpWood, bumpScale: 0.02, color: key === 'clockroom' ? '#a9967a' : '#a89a86', roughness: 0.68 },
      ceiling: { color: '#2a2722', roughness: 1 },
    };
  }
  if (key === 'kitchen') {
    return {
      wall: { map: tex.wallWide, bumpMap: tex.bumpWallWide, bumpScale: 0.026, color: '#b7bbae', roughness: 0.92 },
      floor: { map: tex.floor, bumpMap: tex.bumpFloor, bumpScale: 0.02, color: '#a3a89c', roughness: 0.74 },
      ceiling: { color: '#282b25', roughness: 1 },
    };
  }
  if (key === 'classroom') {
    return {
      wall: { map: tex.wallWide, bumpMap: tex.bumpWallWide, bumpScale: 0.026, color: '#b6bcb0', roughness: 0.96 },
      floor: { map: tex.wood, bumpMap: tex.bumpWood, bumpScale: 0.02, color: '#a89e8a', roughness: 0.74 },
      ceiling: { color: '#2c302a', roughness: 1 },
    };
  }
  if (key === 'stairwell') {
    return {
      wall: { map: tex.wall, bumpMap: tex.bumpWall, bumpScale: 0.03, color: '#a5a79b', roughness: 0.97 },
      floor: { map: tex.floor, bumpMap: tex.bumpFloor, bumpScale: 0.03, color: '#8f9086', roughness: 0.94 },
      ceiling: { color: '#242722', roughness: 1 },
    };
  }
  if (key === 'mirrorhall') {
    return {
      wall: { map: tex.wallWide, bumpMap: tex.bumpWallWide, bumpScale: 0.02, color: '#9aa8a8', roughness: 0.7 },
      floor: { map: tex.floor, bumpMap: tex.bumpFloor, bumpScale: 0.02, color: '#8b8f88', roughness: 0.4, metalness: 0.2 },
      ceiling: { color: '#232726', roughness: 1 },
    };
  }
  if (key === 'morgue' || key === 'laundry') {
    return {
      wall: { map: tex.tile, bumpMap: tex.bumpTile, bumpScale: 0.02, color: '#b9c6c6', roughness: 0.46, metalness: 0.08 },
      floor: { map: tex.tileFloor, bumpMap: tex.bumpTile, bumpScale: 0.02, color: '#9aa5a2', roughness: 0.38, metalness: 0.1 },
      ceiling: { color: '#2b302e', roughness: 1 },
    };
  }
  if (key === 'closet') {
    return {
      wall: { map: tex.wood, bumpMap: tex.bumpWood, bumpScale: 0.02, color: '#8a7c68', roughness: 0.9 },
      floor: { map: tex.woodSmall ?? tex.wood, bumpMap: tex.bumpWood, bumpScale: 0.02, color: '#8b7a63', roughness: 0.86 },
      ceiling: { color: '#241f1a', roughness: 1 },
    };
  }
  if (key === 'void') {
    return {
      wall: { map: tex.wall, bumpMap: tex.bumpWall, bumpScale: 0.03, color: '#9aa09a', roughness: 0.98 },
      floor: { map: tex.floor, bumpMap: tex.bumpFloor, bumpScale: 0.03, color: '#8d8f86', roughness: 0.95 },
      ceiling: { color: '#050606', roughness: 1 },
    };
  }
  return {
    wall: { map: tex.wall, bumpMap: tex.bumpWall, bumpScale: 0.03, color: '#b7bab0', roughness: 0.96 },
    floor: { map: tex.floor, bumpMap: tex.bumpFloor, bumpScale: 0.03, color: '#a7a396', roughness: 0.9 },
    ceiling: { color: '#2a2d28', roughness: 1 },
  };
}

/* ------------------------------------------------------------------- shell */

function Shell({ room, tex, power }) {
  const { width, depth, height, entryGap, key } = room;
  const mats = useMemo(() => surfaces(tex, key), [tex, key]);
  const hw = width / 2;
  const bz = -depth / 2;
  const fz = depth / 2;
  const sideWidth = hw - DOOR_HALF;
  const lintelHeight = Math.max(0.3, height - DOOR_TOP);

  return (
    <group>
      <mesh position={[0, -0.14, 0]} receiveShadow>
        <boxGeometry args={[width, 0.28, depth]} />
        <meshStandardMaterial {...mats.floor} />
      </mesh>
      {key !== 'void' && (
        <mesh position={[0, height + 0.1, 0]}>
          <boxGeometry args={[width, 0.2, depth]} />
          <meshStandardMaterial {...mats.ceiling} />
        </mesh>
      )}

      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * (hw + 0.11), height / 2, 0]} receiveShadow castShadow>
          <boxGeometry args={[0.22, height + 0.4, depth + 0.4]} />
          <meshStandardMaterial {...mats.wall} />
        </mesh>
      ))}

      {/* back wall, built around the doorway */}
      <mesh position={[-(DOOR_HALF + sideWidth / 2), height / 2, bz - 0.11]} receiveShadow castShadow>
        <boxGeometry args={[sideWidth, height + 0.4, 0.22]} />
        <meshStandardMaterial {...mats.wall} />
      </mesh>
      <mesh position={[DOOR_HALF + sideWidth / 2, height / 2, bz - 0.11]} receiveShadow castShadow>
        <boxGeometry args={[sideWidth, height + 0.4, 0.22]} />
        <meshStandardMaterial {...mats.wall} />
      </mesh>
      <mesh position={[0, DOOR_TOP + lintelHeight / 2, bz - 0.11]} receiveShadow>
        <boxGeometry args={[DOOR_HALF * 2, lintelHeight + 0.4, 0.22]} />
        <meshStandardMaterial {...mats.wall} />
      </mesh>

      {/* front wall: the way you came in. Room 0 gets a solid wall instead. */}
      {room.index === 0 ? (
        <mesh position={[0, height / 2, fz + 0.11]} receiveShadow castShadow>
          <boxGeometry args={[width, height + 0.4, 0.22]} />
          <meshStandardMaterial {...mats.wall} />
        </mesh>
      ) : (
        <>
          <mesh position={[-(DOOR_HALF + sideWidth / 2), height / 2, fz + 0.11]} receiveShadow>
            <boxGeometry args={[sideWidth, height + 0.4, 0.22]} />
            <meshStandardMaterial {...mats.wall} />
          </mesh>
          <mesh position={[DOOR_HALF + sideWidth / 2, height / 2, fz + 0.11]} receiveShadow>
            <boxGeometry args={[sideWidth, height + 0.4, 0.22]} />
            <meshStandardMaterial {...mats.wall} />
          </mesh>
          <mesh position={[0, DOOR_TOP + lintelHeight / 2, fz + 0.11]} receiveShadow>
            <boxGeometry args={[DOOR_HALF * 2, lintelHeight + 0.4, 0.22]} />
            <meshStandardMaterial {...mats.wall} />
          </mesh>
        </>
      )}

      {/* baseboards and cornice */}
      {[-1, 1].map((side) => (
        <mesh key={`base${side}`} position={[side * (hw - 0.03), 0.11, 0]}>
          <boxGeometry args={[0.07, 0.22, depth - 0.02]} />
          <meshStandardMaterial color="#211e18" roughness={0.82} />
        </mesh>
      ))}
      <mesh position={[0, 0.11, fz - 0.03]}>
        <boxGeometry args={[width - 0.02, 0.22, 0.07]} />
        <meshStandardMaterial color="#211e18" roughness={0.82} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={`cornice${side}`} position={[side * (hw - 0.05), height - 0.16, 0]}>
          <boxGeometry args={[0.1, 0.14, depth]} />
          <meshStandardMaterial color="#232722" roughness={0.9} />
        </mesh>
      ))}

      {/* pilasters and a dado rail: cheap architecture, and it stops the side
          walls from reading as one flat plane */}
      {key !== 'washroom' &&
        [-1, 1].map((side) => {
          const count = Math.max(2, Math.round(depth / 2.9));
          return (
            <group key={`pil${side}`}>
              {Array.from({ length: count }, (_, i) => {
                const z = -depth / 2 + ((i + 0.5) * depth) / count;
                return (
                  <mesh key={z} position={[side * (hw - 0.045), height * 0.5 - 0.12, z]}>
                    <boxGeometry args={[0.09, height - 0.62, 0.17]} />
                    <meshStandardMaterial color="#2b2b24" roughness={0.88} />
                  </mesh>
                );
              })}
              <mesh position={[side * (hw - 0.04), 1.02, 0]}>
                <boxGeometry args={[0.07, 0.08, depth - 0.08]} />
                <meshStandardMaterial color="#38362c" roughness={0.8} />
              </mesh>
            </group>
          );
        })}

      {/* entry corridor: the space between the last room and this one */}
      {entryGap > 0.05 && (
        <group position={[0, 0, fz]}>
          <mesh position={[0, -0.14, entryGap / 2]} receiveShadow>
            <boxGeometry args={[CORRIDOR_HALF * 2 + 0.3, 0.28, entryGap]} />
            <meshStandardMaterial {...mats.floor} color="#8d8a80" />
          </mesh>
          <mesh position={[0, CORRIDOR_H + 0.1, entryGap / 2]}>
            <boxGeometry args={[CORRIDOR_HALF * 2 + 0.3, 0.2, entryGap]} />
            <meshStandardMaterial color="#111411" roughness={1} />
          </mesh>
          {[-1, 1].map((side) => (
            <mesh key={side} position={[side * (CORRIDOR_HALF + 0.11), CORRIDOR_H / 2, entryGap / 2]} receiveShadow>
              <boxGeometry args={[0.22, CORRIDOR_H, entryGap]} />
              <meshStandardMaterial {...mats.wall} color="#9a9d94" />
            </mesh>
          ))}
          <mesh position={[0, DOOR_TOP + (CORRIDOR_H - DOOR_TOP) / 2, 0.06]}>
            <boxGeometry args={[DOOR_HALF * 2 + 0.2, CORRIDOR_H - DOOR_TOP, 0.16]} />
            <meshStandardMaterial {...mats.wall} color="#9a9d94" />
          </mesh>
          <HangingBulb position={[0, CORRIDOR_H - 0.1, entryGap * 0.45]} drop={0.5} power={power * 0.55} flicker={0.3} seed={room.index + 3} />
          {/* the dark you came out of */}
          <mesh position={[0, CORRIDOR_H / 2, entryGap - 0.03]}>
            <planeGeometry args={[CORRIDOR_HALF * 2 + 0.3, CORRIDOR_H]} />
            <meshBasicMaterial color="#030404" />
          </mesh>
        </group>
      )}
    </group>
  );
}

/* ---------------------------------------------------------------- dressing */

function WaitingRoom({ room, tex, power }) {
  const bz = -room.depth / 2;
  const hw = room.width / 2;
  return (
    <group>
      <Sconce position={[-1.72, 2.45, bz + 0.22]} power={power} seed={1} />
      <Sconce position={[1.72, 2.45, bz + 0.22]} power={power} seed={2} />
      <Painting tex={tex} position={[-hw + 1.15, 2.2, bz + 0.14]} index={0} />
      <Painting tex={tex} position={[hw - 1.15, 2.2, bz + 0.14]} index={2} />
      <BoardedWindow position={[0.15, room.height * 0.52, room.depth / 2 - 0.1]} power={power} />

      <Table tex={tex} position={[-2.7, 0, -0.4]} width={1.15} depth={0.72} />
      <mesh position={[-2.7, 1.02, -0.4]}>
        <cylinderGeometry args={[0.075, 0.075, 0.16, 14]} />
        <meshStandardMaterial color="#e0c28f" emissive="#c28a47" emissiveIntensity={0.7 * power} transparent opacity={0.65} />
      </mesh>
      <RoomLight position={[-2.7, 1.14, -0.4]} color="#e8b36d" intensity={2.2} distance={3} power={power} />

      <Chair tex={tex} position={[2.6, 0, -0.6]} rotation={[0, -0.16, 0]} />
      <Chair tex={tex} position={[2.6, 0, 0.9]} rotation={[0, -0.1, 0]} />
      <Rug tex={tex} position={[0, 0.008, 0.3]} width={3.2} depth={4.1} />

      {/* corner floor lamp, so turning around is not a black void */}
      <group position={[hw - 0.85, 0, room.depth / 2 - 0.9]}>
        <mesh position={[0, 0.05, 0]} castShadow>
          <cylinderGeometry args={[0.18, 0.22, 0.1, 16]} />
          <meshStandardMaterial color="#211e18" metalness={0.45} roughness={0.5} />
        </mesh>
        <mesh position={[0, 0.85, 0]} castShadow>
          <cylinderGeometry args={[0.02, 0.02, 1.6, 8]} />
          <meshStandardMaterial color="#8a7048" metalness={0.7} roughness={0.36} />
        </mesh>
        <mesh position={[0, 1.74, 0]} castShadow>
          <cylinderGeometry args={[0.2, 0.28, 0.34, 20, 1, true]} />
          <meshStandardMaterial color="#dcc59c" emissive="#bd8a4d" emissiveIntensity={1.0 * power} transparent opacity={0.82} side={THREE.DoubleSide} />
        </mesh>
        <RoomLight position={[0, 1.68, 0]} color="#f2c489" intensity={28} distance={11} power={power} shadow />
      </group>

      <group position={[0, room.height - 0.12, 0]}>
        <mesh>
          <cylinderGeometry args={[0.34, 0.44, 0.14, 20]} />
          <meshStandardMaterial color="#292820" metalness={0.3} roughness={0.5} />
        </mesh>
        <mesh position={[0, -0.26, 0]}>
          <cylinderGeometry args={[0.12, 0.3, 0.46, 20, 1, true]} />
          <meshStandardMaterial color="#a28b66" emissive="#a87941" emissiveIntensity={0.5 * power} transparent opacity={0.5} side={THREE.DoubleSide} />
        </mesh>
        <RoomLight position={[0, -0.4, 0]} color="#c2a477" intensity={9} distance={8} power={power} flicker={0.05} seed={9} />
      </group>
      <Dust count={90} spread={[room.width, room.height, room.depth]} origin={[0, 0, 0]} seed={room.index + 2} />
    </group>
  );
}

function Hall({ room, tex, power }) {
  const { width, depth, height } = room;
  const rng = useMemo(() => makeRng(room.seed), [room.seed]);
  const columns = useMemo(() => {
    const zs = [-depth * 0.33, 0, depth * 0.33];
    return zs.flatMap((z) => [-1, 1].map((side) => [side * (width / 2 - 0.85), z]));
  }, [depth, width]);

  return (
    <group>
      {columns.map(([x, z], i) => (
        <Column key={i} position={[x, 0, z]} height={height} radius={0.3} />
      ))}
      {[-depth * 0.31, depth * 0.02, depth * 0.34].map((z, i) => (
        <HangingBulb key={z} position={[0, height - 0.05, z]} drop={0.85 + rng.float(0, 0.35)} power={power} flicker={0.25} seed={i + 1} />
      ))}
      <Pipes position={[0, 0, -depth / 2 + 0.5]} rotation={[0, Math.PI / 2, 0]} length={depth - 1} count={3} height={height * 0.82} />
      <Pipes position={[0, 0, depth / 2 - 0.5]} rotation={[0, Math.PI / 2, 0]} length={depth - 1} count={2} height={height * 0.88} />
      <Chains position={[-width / 2 + 0.55, height - 0.2, 0]} count={2} length={1.2} />

      {/* standing water on the floor */}
      <mesh position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[width - 0.4, depth - 0.4]} />
        <meshStandardMaterial color="#131a1a" metalness={0.55} roughness={0.22} transparent opacity={0.55} />
      </mesh>
      <Dust count={70} spread={[width, height, depth]} seed={room.index + 5} size={0.006} />
    </group>
  );
}

function Nursery({ room, tex, power }) {
  const { width, depth, height } = room;
  const rng = useMemo(() => makeRng(room.seed), [room.seed]);
  const toys = useMemo(
    () =>
      Array.from({ length: 7 }, () => ({
        x: rng.float(-width / 2 + 0.8, width / 2 - 0.8),
        z: rng.float(-depth / 2 + 1, depth / 2 - 1.4),
        s: rng.float(0.1, 0.17),
        r: rng.float(0, Math.PI),
      })),
    [rng, width, depth],
  );

  return (
    <group>
      <Crib tex={tex} position={[-width / 2 + 1.35, 0, -1.1]} rotation={[0, Math.PI / 2, 0]} />
      <RockingHorse tex={tex} position={[width / 2 - 1.35, 0, 1.4]} rotation={[0, -0.7, 0]} />
      <Rug tex={tex} position={[0, 0.008, 0.2]} width={2.8} depth={3.4} />
      {toys.map((toy, i) => (
        <Crate key={i} tex={tex} position={[toy.x, 0, toy.z]} rotation={[0, toy.r, 0]} size={toy.s} />
      ))}

      <TallWindow position={[width / 2 - 0.14, height * 0.58, 0.2]} rotation={[0, -Math.PI / 2, 0]} power={power} height={2.2} />

      {/* mobile over the crib */}
      <group position={[-width / 2 + 1.35, height - 0.9, -1.1]}>
        <mesh>
          <cylinderGeometry args={[0.008, 0.008, 0.9, 5]} />
          <meshStandardMaterial color="#201c18" roughness={0.9} />
        </mesh>
        {[0, 1, 2, 3].map((i) => {
          const angle = (i / 4) * Math.PI * 2;
          return (
            <group key={i} position={[Math.cos(angle) * 0.26, -0.62, Math.sin(angle) * 0.26]}>
              <mesh>
                <sphereGeometry args={[0.055, 10, 8]} />
                <meshStandardMaterial color={i % 2 ? '#8d7f6a' : '#6f6455'} roughness={0.85} />
              </mesh>
            </group>
          );
        })}
      </group>

      <HangingBulb position={[0.4, height - 0.05, 0.8]} drop={1.4} power={power * 0.85} flicker={0.18} seed={4} />
      <HangingBulb position={[-width / 2 + 1.35, height - 0.05, -1.1]} drop={1.9} power={power * 0.5} flicker={0.06} seed={9} cold />
      <RoomLight position={[-width / 2 + 2.2, 1.3, -1.4]} color="#f0c79a" intensity={7} distance={5.2} power={power} flicker={0.1} seed={6} />
      <Dust count={70} spread={[width, height, depth]} seed={room.index + 7} size={0.007} />
    </group>
  );
}

function Chapel({ room, tex, power }) {
  const { width, depth, height } = room;
  const pews = useMemo(() => {
    const rows = [-depth * 0.22, -depth * 0.06, depth * 0.1, depth * 0.26];
    return rows.flatMap((z) => [-1, 1].map((side) => ({ x: side * (width / 4), z })));
  }, [depth, width]);

  return (
    <group>
      {pews.map((pew, i) => (
        <Pew key={i} tex={tex} position={[pew.x, 0, pew.z]} length={width / 2 - 1.4} />
      ))}

      <group position={[0, 0, depth / 2 - 1.5]}>
        <Table tex={tex} position={[0, 0, 0]} width={2.4} depth={0.9} height={0.95} />
        <mesh position={[0, 1.85, 0]}>
          <boxGeometry args={[0.14, 1.7, 0.12]} />
          <meshStandardMaterial color="#5b4a34" metalness={0.2} roughness={0.7} />
        </mesh>
        <mesh position={[0, 2.3, 0]}>
          <boxGeometry args={[1.1, 0.14, 0.12]} />
          <meshStandardMaterial color="#5b4a34" metalness={0.2} roughness={0.7} />
        </mesh>
        {[-0.75, 0.75].map((x) => (
          <CandleCluster key={x} position={[x, 0.95, 0]} power={power} count={4} seed={room.index + x * 10} />
        ))}
        <Spot
          position={[0, height - 0.2, 0]}
          target={[0, 0.9, 0]}
          roomZ={room.centerZ}
          angle={0.55}
          intensity={34}
          distance={height + 4}
          color="#bfd4f0"
          power={power}
          shadow
        />
      </group>

      {[-1, 1].map((side) => (
        <group key={side}>
          <TallWindow position={[side * (width / 2 - 0.12), height * 0.6, -depth * 0.2]} rotation={[0, side * Math.PI / 2, 0]} power={power * 0.9} height={2.6} />
          <TallWindow position={[side * (width / 2 - 0.12), height * 0.6, depth * 0.2]} rotation={[0, side * Math.PI / 2, 0]} power={power * 0.9} height={2.6} />
        </group>
      ))}
      <Dust count={110} spread={[width, height, depth]} seed={room.index + 11} size={0.01} />
    </group>
  );
}

function Store({ room, tex, power }) {
  const { width, depth, height } = room;
  const rng = useMemo(() => makeRng(room.seed), [room.seed]);
  const crates = useMemo(
    () =>
      Array.from({ length: 9 }, (_, i) => {
        const stack = i % 3;
        return {
          x: rng.float(-width / 2 + 0.9, width / 2 - 0.9),
          z: rng.float(-depth / 2 + 1.1, depth / 2 - 1.6),
          s: 0.55 + rng.float(0, 0.3),
          y: stack * 0.55,
          r: rng.float(-0.3, 0.3),
        };
      }),
    [rng, width, depth],
  );

  return (
    <group>
      <Shelf tex={tex} position={[-width / 2 + 0.45, 0, -depth * 0.25]} rotation={[0, Math.PI / 2, 0]} width={2} height={2.3} />
      <Shelf tex={tex} position={[width / 2 - 0.45, 0, depth * 0.1]} rotation={[0, -Math.PI / 2, 0]} width={2.2} height={2.1} />
      {crates.map((crate, i) => (
        <Crate key={i} tex={tex} position={[crate.x, crate.y, crate.z]} rotation={[0, crate.r, 0]} size={crate.s} />
      ))}
      <HangingBulb position={[0, height - 0.05, -depth * 0.15]} drop={1.15} power={power} flicker={0.42} seed={2} />
      <HangingBulb position={[width / 2 - 1.6, height - 0.05, depth * 0.3]} drop={1.5} power={power * 0.6} flicker={0.1} seed={6} />
      <Pipes position={[0, 0, -depth / 2 + 0.4]} rotation={[0, Math.PI / 2, 0]} length={depth - 1.2} count={2} height={height * 0.9} />

      {/* hanging plastic sheeting */}
      {[-1.4, 0.1, 1.5].map((x, i) => (
        <mesh key={x} position={[x, height / 2 - 0.2, depth * 0.22 + i * 0.4]} rotation={[0, 0.06 * (i - 1), 0]}>
          <planeGeometry args={[1.1, height - 0.6]} />
          <meshStandardMaterial color="#c9d2c6" transparent opacity={0.09} roughness={0.4} side={THREE.DoubleSide} />
        </mesh>
      ))}
      <Chains position={[width / 2 - 1.1, height - 0.15, -depth * 0.3]} count={3} length={1.5} />
      <Dust count={80} spread={[width, height, depth]} seed={room.index + 13} size={0.007} />
    </group>
  );
}

function Washroom({ room, tex, power }) {
  const { width, depth, height } = room;
  return (
    <group>
      {[-1, 1].map((side) => (
        <group key={side}>
          {[0, 1, 2].map((i) => (
            <Stall
              key={i}
              position={[side * (width / 2 - 1.05), 0, -depth * 0.26 + i * 1.15]}
              rotation={[0, (side * Math.PI) / 2, 0]}
              width={1.1}
            />
          ))}
        </group>
      ))}

      <group position={[0, 0, -depth / 2 + 0.55]}>
        {[-3.35, -2.1, 2.1, 3.35].map((x) => (
          <Sink key={x} tex={tex} position={[x, 0, 0]} />
        ))}
      </group>
      <group position={[0, 2.05, -depth / 2 + 0.32]}>
        {[-3.35, -2.1, 2.1, 3.35].map((x) => (
          <Mirror key={x} tex={tex} position={[x, 0, 0]} width={0.95} height={1.15} power={power} />
        ))}
      </group>

      <Fluorescent position={[0, height - 0.12, -depth * 0.18]} power={power} flicker={0.5} seed={1} />
      <Fluorescent position={[0, height - 0.12, depth * 0.22]} power={power * 0.75} flicker={0.7} seed={3} />

      <mesh position={[0, 0.014, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[width - 0.6, depth - 0.6]} />
        <meshStandardMaterial color="#2a3833" metalness={0.6} roughness={0.18} transparent opacity={0.34} />
      </mesh>
      <Dust count={55} spread={[width, height, depth]} seed={room.index + 17} size={0.006} />
    </group>
  );
}

function Office({ room, tex, power }) {
  const { width, depth, height } = room;
  const rng = useMemo(() => makeRng(room.seed), [room.seed]);
  const papers = useMemo(
    () =>
      Array.from({ length: 14 }, () => ({
        x: rng.float(-width / 2 + 0.7, width / 2 - 0.7),
        z: rng.float(-depth / 2 + 0.9, depth / 2 - 0.9),
        r: rng.float(0, Math.PI * 2),
      })),
    [rng, width, depth],
  );

  return (
    <group>
      <Desk tex={tex} position={[-width / 4, 0, -depth * 0.05]} rotation={[0, 0.12, 0]} />
      <Desk tex={tex} position={[width / 4, 0, depth * 0.26]} rotation={[0, Math.PI + 0.1, 0]} />
      <Cabinet tex={tex} position={[-width / 2 + 0.6, 0, depth * 0.3]} height={1.5} />
      <Cabinet tex={tex} position={[width / 2 - 0.55, 0, -depth * 0.32]} height={1.2} />

      {papers.map((paper, i) => (
        <mesh key={i} position={[paper.x, 0.012, paper.z]} rotation={[-Math.PI / 2, 0, paper.r]}>
          <planeGeometry args={[0.21, 0.29]} />
          <meshStandardMaterial color="#b4ad98" roughness={1} />
        </mesh>
      ))}

      <Fluorescent position={[-width / 4, height - 0.12, -depth * 0.1]} power={power} flicker={0.32} seed={2} />
      <Fluorescent position={[width / 4, height - 0.12, depth * 0.24]} power={power * 0.6} flicker={0.6} seed={5} />
      <ExitSign position={[0, 2.5, -depth / 2 + 0.3]} power={power} />
      <Dust count={50} spread={[width, height, depth]} seed={room.index + 19} size={0.006} />
    </group>
  );
}

function Flooded({ room, tex, power }) {
  const { width, depth, height } = room;
  return (
    <group>
      <Water width={width - 0.3} depth={depth - 0.3} y={0.055} />
      {[
        [-width / 3, -depth * 0.25],
        [width / 3, -depth * 0.25],
        [-width / 3, depth * 0.22],
        [width / 3, depth * 0.22],
      ].map(([x, z], i) => (
        <Column key={i} position={[x, 0, z]} height={height} radius={0.28} />
      ))}
      <HangingBulb position={[0, height - 0.05, 0]} drop={1.6} power={power} flicker={0.2} seed={7} />
      <Chair tex={tex} position={[0.6, 0.1, -depth * 0.28]} rotation={[0, 2.4, 0.06]} />
      <Pipes position={[0, 0, -depth / 2 + 0.45]} rotation={[0, Math.PI / 2, 0]} length={depth - 1} count={3} height={height * 0.78} />
      <RoomLight position={[0, 0.4, -depth * 0.3]} color="#6f9bb4" intensity={5} distance={5} power={power} />
      <Dust count={60} spread={[width, height, depth]} seed={room.index + 23} size={0.007} />
    </group>
  );
}

function Gallery({ room, tex, power }) {
  const { width, depth, height } = room;
  const rng = useMemo(() => makeRng(room.seed), [room.seed]);
  const hang = useMemo(() => {
    const list = [];
    [-1, 1].forEach((side) => {
      for (let i = 0; i < 4; i++) {
        list.push({
          side,
          z: -depth * 0.33 + i * (depth * 0.22),
          y: 2.0 + rng.float(-0.12, 0.2),
          index: Math.floor(rng.float(0, 6)),
          scale: rng.float(0.85, 1.15),
        });
      }
    });
    return list;
  }, [rng, depth]);

  return (
    <group>
      {hang.map((item, i) => (
        <Painting
          key={i}
          tex={tex}
          position={[item.side * (width / 2 - 0.16), item.y, item.z]}
          rotation={[0, (item.side * Math.PI) / 2, 0]}
          index={item.index}
          scale={item.scale}
        />
      ))}
      <Spot
        position={[0, height - 0.3, depth * 0.1]}
        target={[0, 2, -depth * 0.3]}
        roomZ={room.centerZ}
        angle={0.55}
        intensity={40}
        distance={height + 6}
        color="#ffe3b0"
        power={power}
        shadow
      />
      {[-1, 1].map((side) => (
        <Sconce key={side} position={[side * Math.min(2.5, width / 2 - 0.9), 2.4, -depth / 2 + 0.25]} power={power * 0.8} seed={4 + side} />
      ))}
      <Pew tex={tex} position={[0, 0, depth * 0.18]} length={Math.min(3, width - 3)} />
      <Dust count={90} spread={[width, height, depth]} seed={room.index + 29} size={0.009} />
    </group>
  );
}

function Boiler({ room, tex, power }) {
  const { width, depth, height } = room;
  return (
    <group>
      <group position={[-width / 2 + 1.5, 0, -depth * 0.28]}>
        <mesh position={[0, 1.15, 0]} castShadow>
          <capsuleGeometry args={[0.85, 1.1, 6, 16]} />
          <meshStandardMaterial color="#4a4038" metalness={0.5} roughness={0.62} />
        </mesh>
        {[0.35, 1.9].map((y) => (
          <mesh key={y} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.86, 0.05, 6, 20]} />
            <meshStandardMaterial color="#2f2a24" metalness={0.6} roughness={0.5} />
          </mesh>
        ))}
        <mesh position={[0.5, 1.3, 0.7]}>
          <cylinderGeometry args={[0.1, 0.1, 0.5, 10]} />
          <meshStandardMaterial color="#6a5a44" metalness={0.6} roughness={0.45} />
        </mesh>
      </group>

      <Pipes position={[-width / 2 + 0.35, 0, 0]} rotation={[0, 0, 0]} length={depth - 1} count={4} height={height * 0.82} />
      <Pipes position={[width / 2 - 0.35, 0, 0]} rotation={[0, 0, 0]} length={depth - 1} count={3} height={height * 0.88} />

      <RoomLight position={[0, height - 0.6, 0]} color="#ff6a3c" intensity={22} distance={11} power={power} flicker={0.35} seed={3} />
      <mesh position={[0, height - 0.35, 0]}>
        <sphereGeometry args={[0.09, 10, 8]} />
        <meshStandardMaterial color="#ff8a5c" emissive="#ff5a24" emissiveIntensity={1.6 * power} toneMapped={false} />
      </mesh>
      <HangingBulb position={[width / 2 - 1.2, height - 0.05, depth * 0.25]} drop={1.3} power={power * 0.5} flicker={0.6} seed={8} />
      <Dust count={80} spread={[width, height, depth]} seed={room.index + 31} size={0.008} />
    </group>
  );
}

function Nowhere({ room, tex, power }) {
  return (
    <group>
      <Chair tex={tex} position={[0, 0, 0]} rotation={[0, 0, 0]} />
      <HangingBulb position={[0, room.height - 0.05, 0]} drop={1.9} power={power} flicker={0.12} seed={5} />
      <Painting tex={tex} position={[0, 2.3, -room.depth / 2 + 0.14]} index={room.index % 6} scale={1.25} />
      <Dust count={40} spread={[room.width, room.height, room.depth]} seed={room.index + 37} size={0.006} />
    </group>
  );
}

function ExitRoom({ room, tex, power }) {
  const { width, depth, height } = room;
  return (
    <group>
      <RoomLight position={[0, height - 0.8, -depth * 0.2]} color="#e8f2ea" intensity={18} distance={18} power={power} shadow />
      <mesh position={[0, height - 0.2, 0]}>
        <boxGeometry args={[2.2, 0.06, 0.2]} />
        <meshStandardMaterial color="#ffffff" emissive="#e6f4ea" emissiveIntensity={2.2 * power} toneMapped={false} />
      </mesh>
      <RoomLight position={[0, 1.1, -depth * 0.42]} color="#ffe9c4" intensity={9} distance={6} power={power} />
      <Dust count={40} spread={[width, height, depth]} seed={room.index + 41} size={0.005} />
    </group>
  );
}

function Dressing({ room, tex, power }) {
  switch (room.key) {
    case 'waiting':
      return <WaitingRoom room={room} tex={tex} power={power} />;
    case 'hall':
      return <Hall room={room} tex={tex} power={power} />;
    case 'nursery':
      return <Nursery room={room} tex={tex} power={power} />;
    case 'chapel':
      return <Chapel room={room} tex={tex} power={power} />;
    case 'store':
      return <Store room={room} tex={tex} power={power} />;
    case 'washroom':
      return <Washroom room={room} tex={tex} power={power} />;
    case 'office':
      return <Office room={room} tex={tex} power={power} />;
    case 'flooded':
      return <Flooded room={room} tex={tex} power={power} />;
    case 'gallery':
      return <Gallery room={room} tex={tex} power={power} />;
    case 'boiler':
      return <Boiler room={room} tex={tex} power={power} />;
    case 'nowhere':
      return <Nowhere room={room} tex={tex} power={power} />;
    case 'bedroom':
      return <Bedroom room={room} tex={tex} power={power} />;
    case 'kitchen':
      return <Kitchen room={room} tex={tex} power={power} />;
    case 'library':
      return <Library room={room} tex={tex} power={power} />;
    case 'classroom':
      return <Classroom room={room} tex={tex} power={power} />;
    case 'stairwell':
      return <Stairwell room={room} tex={tex} power={power} />;
    case 'mirrorhall':
      return <MirrorHall room={room} tex={tex} power={power} />;
    case 'morgue':
      return <Morgue room={room} tex={tex} power={power} />;
    case 'laundry':
      return <Laundry room={room} tex={tex} power={power} />;
    case 'clockroom':
      return <ClockRoom room={room} tex={tex} power={power} />;
    case 'closet':
      return <Closet room={room} tex={tex} power={power} />;
    case 'void':
      return <VoidRoom room={room} tex={tex} power={power} />;
    case 'exit':
      return <ExitRoom room={room} tex={tex} power={power} />;
    default:
      return null;
  }
}

/* ------------------------------------------------------------------- stalker */

function Stalker({ room, playerRef, speed, onCaught }) {
  const holder = useRef();
  const caught = useRef(false);

  // Spawn at whichever end of the room the player is not standing in. It used
  // to appear in the entry doorway, which meant walking in and dying on the
  // spot if the roll came up early: a scare you never got to see.
  const from = useRef(null);
  if (from.current === null) {
    const player = playerRef?.current;
    const ends = [
      { z: room.depth / 2 - 1.1, worldZ: room.centerZ + room.depth / 2 - 1.1 },
      { z: -room.depth / 2 + 1.2, worldZ: room.centerZ - room.depth / 2 + 1.2 },
    ];
    if (!player) from.current = ends[1];
    else from.current = Math.abs(player.z - ends[0].worldZ) > Math.abs(player.z - ends[1].worldZ) ? ends[0] : ends[1];
  }

  useFrame((_, delta) => {
    if (!holder.current || caught.current) return;
    const player = playerRef.current;
    if (!player) return;
    const dx = player.x - holder.current.position.x;
    const dz = player.z - room.centerZ - holder.current.position.z;
    const distance = Math.hypot(dx, dz);
    if (distance < 0.95) {
      caught.current = true;
      onCaught();
      return;
    }
    const step = Math.min(distance - 0.9, speed * Math.min(delta, 0.05));
    holder.current.position.x += (dx / distance) * step;
    holder.current.position.z += (dz / distance) * step;
    holder.current.rotation.y = Math.atan2(dx, dz);
  });

  return (
    <group ref={holder} position={[0, 0, from.current.z]}>
      <Apparition visible pose="walk" scale={1.06} />
      <pointLight position={[0, 1.85, 0.3]} color="#7f96a0" intensity={1.8} distance={2.6} decay={2} />
    </group>
  );
}

/* ---------------------------------------------------------------------- room */

export default function Room({ room, tex, doorOpen, onDoor, power = 1, apparition, playerRef, onCaught, onShift, stalkerSpeed = 1.2 }) {
  const bz = -room.depth / 2;

  return (
    <group position={[0, 0, room.centerZ]}>
      <Shell room={room} tex={tex} power={power} />

      <Dressing room={room} tex={tex} power={power} />
      <Extras room={room} tex={tex} power={power} />

      <DoorSet tex={tex} wallZ={bz} open={doorOpen} onInteract={onDoor} power={power} />

      <ambientLight intensity={0.1 * power} color={room.mood.ambient} />

      {apparition?.mode === 'static' && (
        <group position={[apparition.x, 0, apparition.z]} rotation={[0, apparition.facing ?? 0, 0]}>
          <Apparition visible close={apparition.close} pose={apparition.pose ?? 'idle'} stagger={0.3} />
        </group>
      )}

      {/* three of them, standing in a row, facing the wall */}
      {apparition?.mode === 'procession' && (
        <group position={[0, 0, -room.depth * 0.12]}>
          {[-2.2, 0, 2.2].map((x, i) => (
            <group key={x} position={[x, 0, i === 1 ? 0.35 : 0]} rotation={[0, Math.PI, 0]}>
              <Apparition pose="idle" scale={i === 1 ? 1.04 : 0.98} stagger={i * 0.31} />
            </group>
          ))}
        </group>
      )}

      {/* it only moves when you do not look at it */}
      {apparition?.mode === 'weeping' && <Weeping room={room} playerRef={playerRef} onShift={onShift} />}

      {/* standing in the doorway you are walking toward */}
      {apparition?.mode === 'doorway' && (
        <group position={[0, 0, bz + 0.55]} rotation={[0, 0, 0]}>
          <Apparition pose="idle" close scale={1.05} />
        </group>
      )}

      {/* in the room you have just walked out of */}
      {apparition?.mode === 'behind' && (
        <group position={[0, 0, room.depth / 2 - 0.9]} rotation={[0, Math.PI, 0]}>
          <Apparition pose="idle" scale={1.02} stagger={0.6} />
        </group>
      )}

      {apparition?.mode === 'stalker' && (
        <Stalker room={room} playerRef={playerRef} speed={stalkerSpeed} onCaught={onCaught} />
      )}
    </group>
  );
}

/* ------------------------------------------------------- the later rooms */

function Bedroom({ room, tex, power }) {
  const { width, depth, height } = room;
  const bz = -depth / 2;
  const rng = useMemo(() => makeRng(room.seed), [room.seed]);
  const side = room.variant % 2 === 0 ? -1 : 1;

  return (
    <group>
      <Bed tex={tex} position={[side * (width / 2 - 1.35), 0, -depth * 0.06]} rotation={[0, side * Math.PI / 2, 0]} made={room.variant !== 2} />
      <Wardrobe tex={tex} position={[-side * (width / 2 - 0.5), 0, depth * 0.3]} rotation={[0, -side * Math.PI / 2, 0]} height={2.1} ajar={rng.float(0.02, 0.2)} />
      <group position={[side * (width / 2 - 0.55), 0, -depth * 0.34]}>
        <mesh position={[0, 0.28, 0]} castShadow>
          <boxGeometry args={[0.52, 0.56, 0.5]} />
          <meshStandardMaterial color="#47382a" roughness={0.88} />
        </mesh>
        <mesh position={[0, 0.6, 0]}>
          <cylinderGeometry args={[0.055, 0.09, 0.2, 12]} />
          <meshStandardMaterial color="#d8c39a" emissive="#b4803f" emissiveIntensity={0.85 * power} transparent opacity={0.8} />
        </mesh>
        <RoomLight position={[0, 0.68, 0]} color="#f0bd80" intensity={9} distance={5.4} power={power} flicker={0.08} seed={room.index + 3} />
      </group>

      <Painting tex={tex} position={[side * (width / 2 - 0.14), 2.05, -depth * 0.06]} rotation={[0, -side * Math.PI / 2, 0]} index={(room.index + 2) % 6} />
      <Rug tex={tex} position={[0, 0.008, depth * 0.16]} width={2.5} depth={2.9} />
      <Chair tex={tex} position={[-side * (width / 2 - 0.75), 0, -depth * 0.3]} rotation={[0, side * 1.1, 0]} />

      <TallWindow position={[0, height * 0.56, bz + 0.13]} power={power * 0.85} height={1.8} />
      {[-1, 1].map((s) => (
        <HangingCloth key={s} position={[s * 0.95, height * 0.56, bz + 0.24]} width={0.62} height={2.1} opacity={0.17} seed={room.index + s} />
      ))}

      <CeilingFan position={[0, height - 0.16, depth * 0.08]} power={power * 0.8} speed={0.24} />
      <Dust count={60} spread={[width, height, depth]} seed={room.index + 43} size={0.006} />
    </group>
  );
}

function Kitchen({ room, tex, power }) {
  const { width, depth, height } = room;
  const bz = -depth / 2;
  const side = room.variant % 2 === 0 ? -1 : 1;
  const counterX = side * (width / 2 - 0.45);

  return (
    <group>
      {/* run of units down one wall */}
      {[-2.6, -1.2, 0.2, 1.6, 3.0].map((z, i) => (
        <group key={z} position={[counterX, 0, z]}>
          <mesh position={[0, 0.44, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.62, 0.88, 1.32]} />
            <meshStandardMaterial color={i % 2 ? '#8f9388' : '#7d8178'} metalness={0.2} roughness={0.6} />
          </mesh>
          <mesh position={[0, 0.9, 0]}>
            <boxGeometry args={[0.68, 0.05, 1.34]} />
            <meshStandardMaterial color="#5c6058" metalness={0.3} roughness={0.45} />
          </mesh>
        </group>
      ))}
      <Sink tex={tex} position={[counterX, 0.93, -0.5]} rotation={[0, -side * Math.PI / 2, 0]} />
      <Stove tex={tex} position={[counterX, 0, 3.0]} rotation={[0, -side * Math.PI / 2, 0]} />

      <Table tex={tex} position={[0, 0, depth * 0.1]} width={1.6} depth={0.95} />
      <Chair tex={tex} position={[-0.6, 0, depth * 0.1 + 0.9]} rotation={[0, Math.PI, 0]} />
      <Chair tex={tex} position={[0.6, 0, depth * 0.1 - 0.9]} rotation={[0, 0, 0]} />

      {/* fridge, tucked into the back corner rather than in front of the door */}
      <mesh position={[-side * (width / 2 - 0.55), 0.5, bz + 0.55]} castShadow>
        <boxGeometry args={[0.7, 1.0, 0.66]} />
        <meshStandardMaterial color="#b9bcb0" metalness={0.25} roughness={0.55} />
      </mesh>
      <mesh position={[-side * (width / 2 - 0.9), 0.62, bz + 0.55]}>
        <boxGeometry args={[0.03, 0.9, 0.03]} />
        <meshStandardMaterial color="#5e625a" metalness={0.6} roughness={0.4} />
      </mesh>

      <Fluorescent position={[0, height - 0.12, -depth * 0.2]} power={power} flicker={0.3} seed={room.index + 2} />
      <Drain position={[0, 0.014, depth * 0.16]} />
      {room.extras.puddle && (
        <mesh position={[counterX * 0.4, 0.012, depth * 0.24]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[1.9, 2.6]} />
          <meshStandardMaterial color="#101719" metalness={0.65} roughness={0.12} transparent opacity={0.5} />
        </mesh>
      )}
      <Dust count={50} spread={[width, height, depth]} seed={room.index + 47} size={0.006} />
    </group>
  );
}

function Library({ room, tex, power }) {
  const { width, depth, height } = room;
  const rng = useMemo(() => makeRng(room.seed), [room.seed]);
  const aisles = [-1, 0, 1];

  return (
    <group>
      {aisles.map((slot) =>
        [-1, 1].map((side) => (
          <Shelf
            key={`${slot}${side}`}
            tex={tex}
            position={[slot * (width / 4), 0, side * (depth * 0.16) - 0.35]}
            rotation={[0, side > 0 ? Math.PI : 0, 0]}
            width={1.9}
            height={rng.float(2.0, 2.5)}
          />
        )),
      )}
      <Table tex={tex} position={[width / 4, 0, depth * 0.06]} width={1.5} depth={0.85} />
      <Chair tex={tex} position={[width / 4, 0, depth * 0.06 + 0.8]} rotation={[0, Math.PI, 0]} />
      <CandleCluster position={[width / 4 + 0.4, 0.8, depth * 0.06]} power={power} count={3} seed={room.index + 5} />

      <Sconce position={[-width / 2 + 0.2, 2.35, depth * 0.1]} power={power * 0.8} seed={room.index + 1} />
      <HangingBulb position={[0, height - 0.05, -depth * 0.2]} drop={1.4} power={power * 1.05} flicker={0.16} seed={11} />
      <HangingBulb position={[0, height - 0.05, depth * 0.24]} drop={1.6} power={power * 0.7} flicker={0.1} seed={13} />
      <Dust count={100} spread={[width, height, depth]} seed={room.index + 53} size={0.008} />
    </group>
  );
}

function Classroom({ room, tex, power }) {
  const { width, depth, height } = room;
  const bz = -depth / 2;
  const desks = useMemo(() => {
    const list = [];
    for (let row = 0; row < 3; row++) {
      for (const side of [-1, 1]) {
        list.push({ x: side * width * 0.19, z: depth * 0.04 - row * 1.5 });
      }
    }
    return list;
  }, [width, depth]);

  return (
    <group>
      {/* the board goes on the side wall: on the back wall it would be a lid
          over the only door in the room */}
      <Chalkboard
        position={[-width / 2 + 0.15, height * 0.52, -depth * 0.12]}
        rotation={[0, Math.PI / 2, 0]}
        width={Math.min(3.4, depth * 0.34)}
        height={1.35}
      />
      <group position={[width * 0.28, 0, bz + 1.35]}>
        <Table tex={tex} position={[0, 0, 0]} width={1.5} depth={0.7} height={0.82} />
        <Chair tex={tex} position={[0.95, 0, 0.15]} rotation={[0, -Math.PI / 2, 0]} />
      </group>
      {desks.map((desk, i) => (
        <SchoolDesk key={i} tex={tex} position={[desk.x, 0, desk.z]} rotation={[0, i % 2 ? 0.04 : -0.03, 0]} />
      ))}

      {[-1, 1].map((side) => (
        <TallWindow
          key={side}
          position={[side * (width / 2 - 0.13), height * 0.6, depth * 0.18]}
          rotation={[0, side * -Math.PI / 2, 0]}
          power={power * 0.85}
          height={2.1}
        />
      ))}

      <Fluorescent position={[0, height - 0.1, -depth * 0.24]} power={power * 0.9} flicker={0.55} seed={room.index + 7} />
      <Fluorescent position={[0, height - 0.1, depth * 0.2]} power={power * 0.7} flicker={0.4} seed={room.index + 9} />
      <Dust count={70} spread={[width, height, depth]} seed={room.index + 59} size={0.007} />
    </group>
  );
}

function Stairwell({ room, tex, power }) {
  const { width, depth, height } = room;
  const side = room.variant % 2 === 0 ? -1 : 1;

  return (
    <group>
      <Staircase tex={tex} position={[side * (width / 2 - 1.15), 0, depth * 0.3]} steps={10} width={1.7} />
      {[-1, 1].map((s) => (
        <mesh key={s} position={[side * (width / 2 - 0.2), height * 0.45, depth * 0.06 + s * 1.4]} castShadow>
          <boxGeometry args={[0.24, height * 0.9, 0.24]} />
          <meshStandardMaterial color="#9a9a8d" roughness={0.95} />
        </mesh>
      ))}
      <Pipes position={[side * -1 * (width / 2 - 0.4), 0, 0]} rotation={[0, 0, 0]} length={depth - 1} count={2} height={height * 0.9} />

      <HangingBulb position={[0, height - 0.05, depth * 0.02]} drop={1.5} power={power * 1.15} flicker={0.28} seed={room.index + 2} />
      <RoomLight position={[side * (width / 2 - 1.2), 3.4, depth * 0.3 - 1.8]} color="#d8c39c" intensity={8} distance={7} power={power * 0.7} flicker={0.2} seed={room.index + 4} />
      <RoomLight position={[side * -(width / 2 - 2), 2.0, -depth * 0.25]} color="#9fb0b8" intensity={5} distance={8} power={power * 0.6} />

      <TallWindow position={[side * -1 * (width / 2 - 0.13), height * 0.6, depth * 0.2]} rotation={[0, side * Math.PI / 2, 0]} power={power * 0.8} height={2.2} />
      <Rubble position={[side * (width / 2 - 1.6), 0, -depth * 0.3]} seed={room.seed} count={7} spread={1.4} />
      <Dust count={80} spread={[width, height, depth]} seed={room.index + 61} size={0.008} />
    </group>
  );
}

function MirrorHall({ room, tex, power }) {
  const { width, depth, height } = room;
  const rng = useMemo(() => makeRng(room.seed), [room.seed]);
  const doors = useMemo(() => {
    const list = [];
    for (const side of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        list.push({ side, z: -depth * 0.3 + i * (depth * 0.3), open: rng.chance(0.25), glow: rng.chance(0.2) ? 0.3 : 0 });
      }
    }
    return list;
  }, [depth, rng]);

  return (
    <group>
      {[-1, 1].map((side) => (
        <Mirror
          key={side}
          position={[side * (width / 2 - 0.12), 1.62, -depth * 0.05]}
          rotation={[0, side * -Math.PI / 2, 0]}
          width={2.6}
          height={2.5}
          power={power}
        />
      ))}
      {doors.map((door, i) => (
        <DoorPanel
          key={i}
          tex={tex}
          position={[door.side * (width / 2 - 0.1), 0, door.z]}
          rotation={[0, door.side * -Math.PI / 2, 0]}
          open={door.open}
          glow={door.glow}
        />
      ))}

      <HangingBulb position={[0, height - 0.05, 0]} drop={1.1} power={power * 0.9} flicker={0.12} seed={room.index + 6} />
      <RoomLight position={[0, 1.4, depth * 0.3]} color="#a8c4cc" intensity={5} distance={7} power={power * 0.5} />
      <Dust count={60} spread={[width, height, depth]} seed={room.index + 67} size={0.007} />
    </group>
  );
}

function Morgue({ room, tex, power }) {
  const { width, depth, height } = room;
  const bz = -depth / 2;
  const cols = 5;
  const rows = 4;

  return (
    <group>
      {/* two banks of drawers, either side of the door: the door still has to
          be the thing you see when you look at the end of the room */}
      {[-1, 1].map((side) => (
        <group key={side} position={[side * (width / 2 - 1.5), 0, bz + 0.22]}>
          {Array.from({ length: rows }, (_, r) =>
            Array.from({ length: 2 }, (_, c) => {
              const x = (c - 0.5) * 0.92;
              const y = 0.45 + r * 0.62;
              const pulled = (r * 2 + c + (side > 0 ? 3 : 0)) % 7 === 3;
              return (
                <group key={`${r}-${c}`} position={[x, y, 0]}>
                  <mesh castShadow receiveShadow>
                    <boxGeometry args={[0.88, 0.56, 0.08]} />
                    <meshStandardMaterial color="#8c9698" metalness={0.62} roughness={0.38} />
                  </mesh>
                  <mesh position={[0, 0, 0.055]}>
                    <boxGeometry args={[0.32, 0.045, 0.03]} />
                    <meshStandardMaterial color="#5d6668" metalness={0.7} roughness={0.3} />
                  </mesh>
                  {pulled && (
                    <mesh position={[0, -0.06, 0.28]} castShadow>
                      <boxGeometry args={[0.84, 0.5, 0.5]} />
                      <meshStandardMaterial color="#79827f" metalness={0.5} roughness={0.45} />
                    </mesh>
                  )}
                </group>
              );
            }),
          )}
        </group>
      ))}

      <Trolley tex={tex} position={[-width / 4, 0, -depth * 0.05]} rotation={[0, 0.12, 0]} covered={room.variant !== 1} />
      <Trolley tex={tex} position={[width / 4, 0, depth * 0.24]} rotation={[0, -0.06, 0]} covered={room.variant !== 3} />

      <Fluorescent position={[0, height - 0.1, -depth * 0.3]} power={power} flicker={0.42} seed={room.index + 1} />
      <Fluorescent position={[0, height - 0.1, depth * 0.24]} power={power * 0.7} flicker={0.66} seed={room.index + 3} />
      <Drain position={[0, 0.014, depth * 0.06]} />
      <Dust count={40} spread={[width, height, depth]} seed={room.index + 71} size={0.005} />
    </group>
  );
}

function Laundry({ room, tex, power }) {
  const { width, depth, height } = room;
  const side = room.variant % 2 === 0 ? -1 : 1;

  return (
    <group>
      {[0, 1, 2].map((i) => (
        <Washer
          key={i}
          position={[side * (width / 2 - 0.55), 0, -depth * 0.28 + i * 0.78]}
          rotation={[0, -side * Math.PI / 2, 0]}
          spinning={i !== 1}
          seed={i}
        />
      ))}
      <Shelf tex={tex} position={[-side * (width / 2 - 0.4), 0, depth * 0.05]} rotation={[0, side * Math.PI / 2, 0]} width={1.8} height={1.9} />

      {[-1.2, 0.4, 1.7].map((x, i) => (
        <HangingCloth key={x} position={[x, height - 1.35, depth * 0.24 + i * 0.18]} width={1.5} height={2.0} opacity={0.19} seed={room.index + i} />
      ))}

      <Barrel tex={tex} position={[-side * (width / 2 - 0.6), 0, -depth * 0.32]} height={0.62} radius={0.26} />
      <Barrel tex={tex} position={[-side * (width / 2 - 0.62), 0.62, -depth * 0.32]} height={0.44} radius={0.22} />
      <Fluorescent position={[0, height - 0.12, -depth * 0.05]} power={power} flicker={0.6} seed={room.index + 2} />
      <mesh position={[side * -0.5, 0.013, depth * 0.3]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[2.6, 2.0]} />
        <meshStandardMaterial color="#101817" metalness={0.62} roughness={0.14} transparent opacity={0.42} />
      </mesh>
      <Dust count={55} spread={[width, height, depth]} seed={room.index + 73} size={0.006} />
    </group>
  );
}

function ClockRoom({ room, tex, power }) {
  const { width, depth, height } = room;
  const clocks = useMemo(
    () => [
      { x: -width / 2 + 0.6, z: -depth * 0.24, ry: Math.PI / 2 },
      { x: width / 2 - 0.6, z: -depth * 0.24, ry: -Math.PI / 2 },
      { x: -width / 2 + 0.6, z: depth * 0.2, ry: Math.PI / 2 },
      { x: width / 2 - 0.6, z: depth * 0.2, ry: -Math.PI / 2 },
    ],
    [width, depth],
  );

  return (
    <group>
      {clocks.map((clock, i) => (
        <GrandfatherClock key={i} tex={tex} position={[clock.x, 0, clock.z]} rotation={[0, clock.ry, 0]} height={i === 1 ? 2.6 : 2.2} />
      ))}
      <Chair tex={tex} position={[1.35, 0, 0.9]} rotation={[0, Math.PI + 0.4, 0]} />
      <HangingBulb position={[0, height - 0.05, -depth * 0.1]} drop={2.1} power={power * 0.85} flicker={0.1} seed={room.index + 4} />
      <Sconce position={[0, 2.3, -depth / 2 + 0.24]} power={power * 0.7} seed={room.index + 2} />
      <Dust count={65} spread={[width, height, depth]} seed={room.index + 79} size={0.007} />
    </group>
  );
}

function Closet({ room, tex, power }) {
  const { width, depth, height } = room;
  return (
    <group>
      {/* coats on the walls, not hanging in the middle of a room you can cross
          in three steps */}
      {[-1, 1].map((side) => (
        <group key={side} rotation={[0, 0, 0]}>
          <HangingCloth
            position={[side * (width / 2 - 0.16), height - 1.2, -depth * 0.12]}
            rotation={[0, (side * Math.PI) / 2, 0]}
            width={1.5}
            height={1.9}
            opacity={0.42}
            seed={room.index + side}
          />
        </group>
      ))}
      <Barrel tex={tex} position={[-width / 2 + 0.45, 0, depth * 0.26]} height={0.5} radius={0.22} />
      <Crate tex={tex} position={[width / 2 - 0.5, 0, depth * 0.22]} size={0.42} />
      <Chair tex={tex} position={[width / 2 - 0.55, 0, -depth * 0.3]} rotation={[0, -0.8, 0]} scale={0.88} />

      {/* a bare bulb with no cone: standing under a volumetric cone in a room
          this size turns the whole screen into fog */}
      <group position={[0, height - 0.4, -depth * 0.14]}>
        <mesh position={[0, 0.24, 0]}>
          <cylinderGeometry args={[0.006, 0.006, 0.48, 4]} />
          <meshStandardMaterial color="#1b1813" roughness={0.9} />
        </mesh>
        <mesh>
          <sphereGeometry args={[0.055, 12, 10]} />
          <meshStandardMaterial color="#e8d3a6" emissive="#c08c4c" emissiveIntensity={1.2 * power} toneMapped={false} />
        </mesh>
        <RoomLight position={[0, -0.12, 0]} color="#e0b581" intensity={6} distance={5.5} power={power} flicker={0.4} seed={room.index + 1} />
      </group>
      <Dust count={26} spread={[width, height, depth]} seed={room.index + 83} size={0.005} />
    </group>
  );
}

function VoidRoom({ room, tex, power }) {
  const { width, depth, height } = room;
  return (
    <group>
      {[
        [-width / 2 + 1.1, -depth * 0.3],
        [width / 2 - 1.1, -depth * 0.3],
        [-width / 2 + 1.1, depth * 0.24],
        [width / 2 - 1.1, depth * 0.24],
      ].map(([x, z], i) => (
        <Column key={i} position={[x, 0, z]} height={height} radius={0.33} />
      ))}
      {/* the bulb hangs low enough to be part of the room, and the walls
          simply stop above it */}
      <group position={[0, 0, depth * 0.04]}>
        <Chair tex={tex} position={[1.15, 0, 0.2]} rotation={[0, Math.PI + 0.35, 0]} />
        <mesh position={[0, (height + 3.3) / 2, 0]}>
          <cylinderGeometry args={[0.006, 0.006, height - 3.3, 4]} />
          <meshStandardMaterial color="#16140f" roughness={1} />
        </mesh>
        <mesh position={[0, 3.24, 0]}>
          <sphereGeometry args={[0.08, 12, 10]} />
          <meshStandardMaterial color="#e8d3a6" emissive="#c08c4c" emissiveIntensity={1.2 * power} toneMapped={false} />
        </mesh>
        <RoomLight position={[0, 3.1, 0]} color="#d8b27c" intensity={16} distance={16} power={power * 0.85} flicker={0.16} seed={room.index + 2} />
      </group>
      {/* a broken edge where the ceiling used to be, and cold air above it */}
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * (width / 2 - 0.9), height - 0.12, -depth * 0.15]} rotation={[0, side * 0.2, side * 0.06]} castShadow>
          <boxGeometry args={[2.4, 0.16, depth * 0.55]} />
          <meshStandardMaterial color="#2c2f2b" roughness={0.98} />
        </mesh>
      ))}
      <RoomLight position={[0, height - 0.4, 0]} color="#5f7684" intensity={7} distance={12} power={power * 0.5} />
      <RoomLight position={[0, 2.2, -depth * 0.3]} color="#6f8894" intensity={5} distance={9} power={power * 0.5} />
      <Dust count={150} spread={[width, height, depth]} seed={room.index + 89} size={0.01} />
    </group>
  );
}

/* --------------------------------------------------------- random dressing */

/** Per-room chance details. These are what stop two rooms of the same kind from
 *  being the same room, and they are drawn from the run seed, not at runtime. */
function Extras({ room, tex, power }) {
  const seed = room.seed ^ 0x5bf03635;
  const rng = useMemo(() => makeRng(seed), [seed]);
  const extras = room.extras;
  const side = rng.sign();
  const spots = useMemo(() => {
    const local = makeRng(seed + 7);
    return {
      puddle: [local.float(-room.width * 0.25, room.width * 0.25), local.float(-room.depth * 0.2, room.depth * 0.24)],
      rubble: [local.float(-room.width * 0.36, room.width * 0.36), local.float(-room.depth * 0.34, room.depth * 0.3)],
      doorZ: local.float(-room.depth * 0.3, room.depth * 0.26),
      cloth: [local.float(-room.width * 0.35, room.width * 0.35), local.float(-room.depth * 0.25, room.depth * 0.2)],
    };
  }, [seed, room.width, room.depth]);

  // The door is at the centre of the back wall, so the wall either side of it
  // is the one you look at for the length of the room. Even a bare room gets
  // something there: it is the difference between a room and a corridor.
  const flank = Math.min(2.15, room.width / 2 - 0.85);
  const bareBackWall = !['waiting', 'gallery', 'nowhere', 'closet', 'exit'].includes(room.key);

  if (!extras) return null;

  return (
    <group>
      {bareBackWall && (
        <>
          <Sconce position={[-flank, 2.28, -room.depth / 2 + 0.2]} power={power * 0.72} seed={room.index + 1} />
          <Painting
            tex={tex}
            position={[flank, 2.0, -room.depth / 2 + 0.14]}
            index={(room.index + 3) % 6}
            scale={0.94}
          />
        </>
      )}
      {extras.puddle && (
        <mesh position={[spots.puddle[0], 0.013, spots.puddle[1]]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[1.7, 2.3]} />
          <meshStandardMaterial color="#0d1517" metalness={0.6} roughness={0.16} transparent opacity={0.42} />
        </mesh>
      )}
      {extras.rubble && <Rubble position={[spots.rubble[0], 0, spots.rubble[1]]} seed={seed} count={8} spread={1.5} />}
      {extras.falseDoor && room.key !== 'closet' && room.key !== 'exit' && (
        <DoorPanel
          tex={tex}
          position={[side * (room.width / 2 - 0.1), 0, spots.doorZ]}
          rotation={[0, side * -Math.PI / 2, 0]}
          open={rng.chance(0.3)}
          glow={rng.chance(0.25) ? 0.26 : 0}
        />
      )}
      {extras.fan && room.height > 3.6 && room.key !== 'void' && (
        <CeilingFan position={[0, room.height - 0.16, -room.depth * 0.1]} power={power * 0.55} speed={0.3} />
      )}
      {extras.cloth && room.key !== 'void' && (
        <HangingCloth position={[spots.cloth[0], room.height - 1.5, spots.cloth[1]]} width={1.1} height={2.2} opacity={0.2} seed={seed} />
      )}
      {extras.collapse && (
        <group position={[-side * (room.width * 0.3), 0, -room.depth * 0.33]}>
          <mesh position={[0, 0.5, 0]} rotation={[0.02, 0.3, 0.05]} castShadow>
            <boxGeometry args={[0.9, 0.06, 1.7]} />
            <meshStandardMaterial color="#6f6a5c" roughness={0.95} />
          </mesh>
          <Rubble position={[0.2, 0, 0.6]} seed={seed + 11} count={6} spread={1.1} />
        </group>
      )}
    </group>
  );
}
