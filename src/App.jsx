import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { ContactShadows, Environment, Float, Html, PointerLockControls, Sparkles, Text, useTexture } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette, Noise, ChromaticAberration } from '@react-three/postprocessing';
import * as THREE from 'three';

const C = {
  wall: '#343936', wallDark: '#202522', wood: '#392820', woodLight: '#5b4030',
  brass: '#a88a58', green: '#a6ad91', lamp: '#e7c99a', black: '#080a09'
};

function ProceduralTextures() {
  const maps = useMemo(() => {
    const make = (kind, base, accent, count = 1800) => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 512;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = base; ctx.fillRect(0, 0, 512, 512);
      for (let i = 0; i < count; i++) {
        const x = Math.random() * 512, y = Math.random() * 512;
        ctx.globalAlpha = Math.random() * (kind === 'wall' ? .1 : .18);
        ctx.fillStyle = Math.random() > .5 ? accent : '#050505';
        if (kind === 'wood') {
          ctx.fillRect(x, y, 1 + Math.random() * 3, 8 + Math.random() * 90);
        } else {
          ctx.beginPath(); ctx.arc(x, y, Math.random() * 2.1, 0, Math.PI * 2); ctx.fill();
        }
      }
      if (kind === 'wall') {
        ctx.globalAlpha = .16; ctx.strokeStyle = '#080a08'; ctx.lineWidth = 2;
        for (let y = 0; y < 512; y += 64) {
          ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(512, y); ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
      const texture = new THREE.CanvasTexture(canvas);
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 4;
      return texture;
    };
    const wall = make('wall', '#444740', '#b0ad94');
    wall.repeat.set(2, 1.4);
    const wood = make('wood', '#39271e', '#a27a51');
    wood.repeat.set(1, 1);
    const floor = make('floor', '#302c25', '#827764');
    floor.repeat.set(4, 4);
    return { wall, wood, floor };
  }, []);
  return maps;
}

function Dust() {
  const ref = useRef();
  const positions = useMemo(() => {
    const p = new Float32Array(450 * 3);
    for (let i = 0; i < 450; i++) {
      p[i * 3] = (Math.random() - .5) * 9;
      p[i * 3 + 1] = Math.random() * 4.8;
      p[i * 3 + 2] = (Math.random() - .5) * 9;
    }
    return p;
  }, []);
  useFrame((_, delta) => { if (ref.current) ref.current.rotation.y += delta * .008; });
  return <points ref={ref} position={[0, 0, 0]}>
    <bufferGeometry><bufferAttribute attach="attributes-position" args={[positions, 3]} /></bufferGeometry>
    <pointsMaterial color="#e4d7b8" size={0.018} transparent opacity={0.42} sizeAttenuation depthWrite={false} />
  </points>;
}

function WallPanel({ position, rotation = [0,0,0], width = 1, height = 1, color = C.wallDark }) {
  return <mesh position={position} rotation={rotation} castShadow receiveShadow>
    <boxGeometry args={[width, height, .11]} />
    <meshStandardMaterial color={color} roughness={.94} />
  </mesh>;
}

function BrassHinge({ position }) {
  return <group position={position}>
    <mesh castShadow><boxGeometry args={[.09,.32,.045]} /><meshStandardMaterial color="#66543a" metalness={.82} roughness={.31} /></mesh>
    {[-.11,0,.11].map(y => <mesh key={y} position={[0,y,.026]}><sphereGeometry args={[.018,8,8]} /><meshStandardMaterial color="#c1a16a" metalness={.85} roughness={.25} /></mesh>)}
  </group>;
}

function Door({ textures, onInteract, opened }) {
  const door = useRef();
  const knob = useRef();
  const [hover, setHover] = useState(false);
  useFrame((state, delta) => {
    if (!door.current) return;
    const target = opened ? -1.02 : 0;
    door.current.rotation.y = THREE.MathUtils.damp(door.current.rotation.y, target, 2.4, delta);
    if (knob.current) knob.current.rotation.y = Math.sin(state.clock.elapsedTime * 1.3) * .025;
  });
  return <group position={[0, 0, -3.82]}>
    <mesh position={[-.99, 1.56, -.035]} castShadow>
      <boxGeometry args={[.08, 3.12, .16]} />
      <meshStandardMaterial color="#151815" roughness={.9} />
    </mesh>
    <mesh position={[.99, 1.56, -.035]} castShadow>
      <boxGeometry args={[.08, 3.12, .16]} />
      <meshStandardMaterial color="#151815" roughness={.9} />
    </mesh>
    <mesh position={[0, 3.1, -.035]} castShadow>
      <boxGeometry args={[2.02, .08, .16]} />
      <meshStandardMaterial color="#151815" roughness={.9} />
    </mesh>
    <mesh position={[-1.04, 1.57, 0]} castShadow>
      <boxGeometry args={[.12, 3.3, .32]} />
      <meshStandardMaterial color="#33271e" roughness={.78} />
    </mesh>
    <mesh position={[1.04, 1.57, 0]} castShadow>
      <boxGeometry args={[.12, 3.3, .32]} />
      <meshStandardMaterial color="#33271e" roughness={.78} />
    </mesh>
    <mesh position={[0, 3.2, 0]} castShadow>
      <boxGeometry args={[2.2, .13, .32]} />
      <meshStandardMaterial color="#33271e" roughness={.78} />
    </mesh>
    <group ref={door} position={[-.92, 0, .08]}>
      <mesh position={[.92, 1.53, 0]} castShadow receiveShadow
        onPointerOver={(e) => { e.stopPropagation(); setHover(true); document.body.style.cursor = 'pointer'; }}
        onPointerOut={() => { setHover(false); document.body.style.cursor = 'auto'; }}
        onClick={(e) => { e.stopPropagation(); onInteract(); }}>
        <boxGeometry args={[1.82, 3.02, .12]} />
        <meshStandardMaterial map={textures.wood} color={hover ? '#8a6a4a' : '#fff'} roughness={.53} metalness={.04} />
      </mesh>
      {[.35, 1.52, 2.7].map((y) => <BrassHinge key={y} position={[.13,y,.09]} />)}
      <mesh position={[1.55, 1.35, .09]}><boxGeometry args={[.15,.34,.025]} /><meshStandardMaterial color="#6e5738" metalness={.78} roughness={.28} /></mesh>
      {[.58, 1.7, 2.48].map((y, i) => <mesh key={y} position={[.92, y, .067]} castShadow>
        <boxGeometry args={[1.56, i === 1 ? .68 : .36, .035]} />
        <meshStandardMaterial color="#241a14" roughness={.55} />
      </mesh>)}
      {[.58, 1.7, 2.48].map((y, i) => <mesh key={'in'+y} position={[.92, y, .09]}>
        <boxGeometry args={[1.43, i === 1 ? .55 : .24, .018]} />
        <meshStandardMaterial color="#3c2a1f" roughness={.62} />
      </mesh>)}
      <group ref={knob} position={[1.57, 1.35, .12]}>
        <mesh castShadow><sphereGeometry args={[.075, 20, 16]} /><meshStandardMaterial color={C.brass} metalness={.78} roughness={.23} /></mesh>
        <mesh position={[-.08, 0, 0]} rotation={[0,0,Math.PI/2]}><cylinderGeometry args={[.025,.025,.13,12]} /><meshStandardMaterial color={C.brass} metalness={.8} roughness={.22} /></mesh>
      </group>
      <mesh position={[.18, 1.52, .079]}><boxGeometry args={[.035, 2.8, .018]} /><meshStandardMaterial color="#92704b" metalness={.3} roughness={.5} /></mesh>
    </group>
    <pointLight position={[0, 2.1, -.18]} color="#ad8154" intensity={opened ? 2.7 : .55} distance={3.8} decay={2} />
  </group>;
}

function Sconce({ position, flicker = 0 }) {
  const light = useRef();
  const [seed] = useState(() => Math.random() * 10);
  useFrame(({ clock }) => {
    if (light.current) {
      const t = clock.elapsedTime + seed;
      light.current.intensity = 2.1 + Math.sin(t * 5.1) * .11 + (Math.sin(t * 17) > .97 ? -.65 : 0);
    }
  });
  return <group position={position}>
    <mesh position={[0, -.16, 0]} castShadow><boxGeometry args={[.24, .42, .12]} /><meshStandardMaterial color="#29251e" metalness={.5} roughness={.45} /></mesh>
    <mesh position={[0, .04, -.015]}><cylinderGeometry args={[.105, .14, .24, 16, 1, true]} /><meshStandardMaterial color="#d0b98e" emissive="#a16c35" emissiveIntensity={1.8} transparent opacity={.72} side={THREE.DoubleSide} /></mesh>
    <pointLight ref={light} position={[0, .02, .15]} color="#ffc982" intensity={2.1} distance={4.8} decay={2} castShadow />
  </group>;
}

function Painting({ position, rotation = [0,0,0] }) {
  return <group position={position} rotation={rotation}>
    <mesh castShadow><boxGeometry args={[.92, 1.2, .09]} /><meshStandardMaterial color="#191a16" roughness={.85} /></mesh>
    <mesh position={[0,0,.052]}><boxGeometry args={[.78, 1.04, .025]} /><meshStandardMaterial color="#796f5b" roughness={1} /></mesh>
    <mesh position={[0,0,.07]}><planeGeometry args={[.68,.92]} /><meshStandardMaterial color="#242c27" roughness={1} /></mesh>
    <mesh position={[0,-.12,.085]}><circleGeometry args={[.17,32]} /><meshStandardMaterial color="#111612" roughness={1} /></mesh>
    <mesh position={[0,.17,.09]}><circleGeometry args={[.105,32]} /><meshStandardMaterial color="#171c17" roughness={1} /></mesh>
    <mesh position={[0,.03,.091]}><boxGeometry args={[.12,.28,.015]} /><meshStandardMaterial color="#171c17" roughness={1} /></mesh>
  </group>;
}

function Corridor({ entered, apparition }) {
  const lampA = useRef();
  const lampB = useRef();
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (lampA.current) lampA.current.intensity = 1.05 + Math.sin(t * 4.7) * .08 + (Math.sin(t * 13) > .985 ? -.5 : 0);
    if (lampB.current) lampB.current.intensity = .62 + Math.sin(t * 3.1 + 1.7) * .05;
  });
  return <group>
    <mesh position={[0,-.16,-8.9]} receiveShadow><boxGeometry args={[2.85,.22,9.3]} /><meshStandardMaterial color="#171814" roughness={.98} /></mesh>
    <mesh position={[0,3.72,-8.9]} receiveShadow><boxGeometry args={[2.85,.16,9.3]} /><meshStandardMaterial color="#11130f" roughness={1} /></mesh>
    {[-1.39,1.39].map((x, i) => <group key={x}>
      <mesh position={[x,1.8,-8.9]} receiveShadow castShadow><boxGeometry args={[.12,3.7,9.3]} /><meshStandardMaterial color={i ? "#282920" : "#20221c"} roughness={.96} /></mesh>
      {[-6.2,-8.5,-10.8].map((z,j) => <mesh key={z} position={[x + (i ? -.07 : .07),1.8,z]}><boxGeometry args={[.025,3.3,.035]} /><meshStandardMaterial color="#494435" roughness={.9} /></mesh>)}
    </group>)}
    <mesh position={[0,1.8,-13.48]} receiveShadow><boxGeometry args={[2.85,3.7,.14]} /><meshStandardMaterial color="#171a15" roughness={1} /></mesh>
    <mesh position={[0,1.8,-13.39]}><boxGeometry args={[.8,1.45,.035]} /><meshStandardMaterial color="#24251d" roughness={1} /></mesh>
    <mesh position={[0,1.8,-13.36]}><boxGeometry args={[.57,1.16,.025]} /><meshStandardMaterial color="#0c0e0b" roughness={1} /></mesh>
    {[-6.2,-9.9].map((z,i) => <group key={z} position={[i ? .93 : -.93,2.48,z]}>
      <mesh castShadow><boxGeometry args={[.18,.3,.1]} /><meshStandardMaterial color="#393326" metalness={.38} roughness={.6} /></mesh>
      <mesh position={[0,.04,.065]}><sphereGeometry args={[.07,12,10]} /><meshStandardMaterial color="#d3ad72" emissive="#b17a3c" emissiveIntensity={1.1} /></mesh>
      <pointLight ref={i ? lampB : lampA} position={[0,0,.12]} color="#d9ad70" intensity={1} distance={3.6} decay={2} />
    </group>)}
    {[-5.8,-8.4,-11].map((z,i) => <group key={z} position={[i ? 1.325 : -1.325,1.72,z]} rotation={[0,i ? -Math.PI/2 : Math.PI/2,0]}>
      <mesh castShadow><boxGeometry args={[.76,1.6,.07]} /><meshStandardMaterial color="#30271d" roughness={.88} /></mesh>
      <mesh position={[0,0,.045]}><boxGeometry args={[.6,1.4,.025]} /><meshStandardMaterial color="#1c1c17" roughness={1} /></mesh>
      <mesh position={[.22,-.05,.065]}><sphereGeometry args={[.025,8,8]} /><meshStandardMaterial color="#9d8051" metalness={.7} roughness={.3} /></mesh>
    </group>)}
    <mesh position={[0,.002,-8.8]} rotation={[-Math.PI/2,0,0]}><planeGeometry args={[2.5,8.5]} /><meshStandardMaterial color="#29261e" roughness={1} transparent opacity={.55} /></mesh>
    <group position={[0,0,-10.55]} visible={apparition}>
      <mesh position={[0,1.42,0]} castShadow><sphereGeometry args={[.22,16,14]} /><meshStandardMaterial color="#030403" roughness={1} /></mesh>
      <mesh position={[0,.83,0]} rotation={[0,0,-.04]} castShadow><capsuleGeometry args={[.23,.9,5,9]} /><meshStandardMaterial color="#050605" roughness={1} /></mesh>
      <mesh position={[-.19,.18,0]} rotation={[0,0,-.04]}><capsuleGeometry args={[.085,.58,4,7]} /><meshStandardMaterial color="#050605" roughness={1} /></mesh>
      <mesh position={[.18,.18,.015]} rotation={[0,0,.03]}><capsuleGeometry args={[.085,.58,4,7]} /><meshStandardMaterial color="#050605" roughness={1} /></mesh>
      <pointLight position={[0,1.25,-.12]} color="#777b68" intensity={.08} distance={1.2} />
    </group>
  </group>;
}

function Room({ onDoor, opened, onUncanny, apparition }) {
  const textures = ProceduralTextures();
  return <group>
    {/* room shell */}
    <mesh position={[0,-.13,0]} receiveShadow>
      <boxGeometry args={[9.2,.25,9.1]} />
      <meshStandardMaterial map={textures.floor} roughness={.92} />
    </mesh>
    <mesh position={[0,4.15,0]} receiveShadow>
      <boxGeometry args={[9.2,.18,9.1]} />
      <meshStandardMaterial color="#191c19" roughness={1} />
    </mesh>
    <mesh position={[0,2,4.45]} receiveShadow><boxGeometry args={[9.2,4.2,.2]} /><meshStandardMaterial map={textures.wall} roughness={.97} /></mesh>
    {/* The rear wall is built around a real opening, so the door reveals depth. */}
    <mesh position={[-2.98,2,-4.45]} receiveShadow><boxGeometry args={[3.24,4.2,.2]} /><meshStandardMaterial map={textures.wall} roughness={.97} /></mesh>
    <mesh position={[2.98,2,-4.45]} receiveShadow><boxGeometry args={[3.24,4.2,.2]} /><meshStandardMaterial map={textures.wall} roughness={.97} /></mesh>
    <mesh position={[0,3.78,-4.45]} receiveShadow><boxGeometry args={[2.72,.64,.2]} /><meshStandardMaterial map={textures.wall} roughness={.97} /></mesh>
    <Corridor entered={opened} apparition={apparition} />
    <mesh position={[-4.55,2,0]} receiveShadow><boxGeometry args={[.2,4.2,9.1]} /><meshStandardMaterial map={textures.wall} roughness={.97} /></mesh>
    <mesh position={[4.55,2,0]} receiveShadow><boxGeometry args={[.2,4.2,9.1]} /><meshStandardMaterial map={textures.wall} roughness={.97} /></mesh>
    {/* aged architectural trim and layered shadow lines */}
    {[-1,1].map(side => <group key={'trim'+side} position={[side*4.37,0,0]}>
      <mesh position={[0,2.05,0]} castShadow><boxGeometry args={[.12,4.08,9.02]} /><meshStandardMaterial color="#24231e" roughness={.84} /></mesh>
      <mesh position={[-side*.068,2.05,0]}><boxGeometry args={[.035,3.92,8.82]} /><meshStandardMaterial color="#4a4334" roughness={.82} /></mesh>
    </group>)}
    {/* dark panelled back wall */}
    {[-3.95,-2.9,-1.85,-.9,.9,1.85,2.9,3.95].filter(x => Math.abs(x) > 2).map(x => <WallPanel key={x} position={[x,2,-4.32]} width={.035} height={3.9} color="#252a25" />)}
    {[.22,3.72].map(y => <mesh key={y} position={[0,y,-4.31]}><boxGeometry args={[9,.045,.08]} /><meshStandardMaterial color="#282a23" roughness={.8} /></mesh>)}
    {/* skirting */}
    {[-1,1].map(side => <mesh key={side} position={[side*4.42,.12,0]}><boxGeometry args={[.08,.23,8.8]} /><meshStandardMaterial color="#211e18" roughness={.8} /></mesh>)}
    <mesh position={[0,.12,4.32]}><boxGeometry args={[8.9,.23,.08]} /><meshStandardMaterial color="#211e18" roughness={.8} /></mesh>
    <Door textures={textures} onInteract={onDoor} opened={opened} />
    <Sconce position={[-1.7,2.45,-4.12]} />
    <Sconce position={[1.7,2.45,-4.12]} />
    <Painting position={[-3.25,2.15,-4.3]} />
    <Painting position={[3.25,2.15,-4.3]} />
    {/* ceiling beams catch only a little of the warm practical light */}
    {[-3,-1.5,0,1.5,3].map(x => <mesh key={'beam'+x} position={[x,4.02,0]} castShadow>
      <boxGeometry args={[.12,.13,8.85]} /><meshStandardMaterial color="#211e18" roughness={.88} />
    </mesh>)}
    {/* foreground side table */}
    <group position={[-2.8,0,-.6]}>
      <mesh position={[0,.76,0]} castShadow receiveShadow><boxGeometry args={[1.1,.12,.72]} /><meshStandardMaterial map={textures.wood} roughness={.65} /></mesh>
      {[-.43,.43].flatMap(x => [-.25,.25].map(z => <mesh key={x+'-'+z} position={[x,.37,z]} castShadow><boxGeometry args={[.075,.72,.075]} /><meshStandardMaterial color="#30231b" roughness={.8} /></mesh>))}
      <mesh position={[0,.48,-.01]} castShadow><boxGeometry args={[.8,.24,.57]} /><meshStandardMaterial color="#38291e" roughness={.8} /></mesh>
      <mesh position={[.12,.88,0]} castShadow><cylinderGeometry args={[.12,.16,.14,16]} /><meshStandardMaterial color="#777263" roughness={.8} /></mesh>
      <mesh position={[.12,1.02,0]}><cylinderGeometry args={[.075,.075,.15,16]} /><meshStandardMaterial color="#e0c28f" emissive="#c28a47" emissiveIntensity={.6} transparent opacity={.6} /></mesh>
      <pointLight position={[.12,1.1,0]} color="#e8b36d" intensity={.5} distance={2.3} />
    </group>
    {/* old rug */}
    <mesh position={[0,-.002,.3]} rotation={[-Math.PI/2,0,0]} receiveShadow>
      <planeGeometry args={[3.2,4.3]} /><meshStandardMaterial color="#302c25" roughness={1} />
    </mesh>
    <mesh position={[0,.006,.3]} rotation={[-Math.PI/2,0,0]}>
      <ringGeometry args={[1.25,1.29,4]} /><meshStandardMaterial color="#70634b" roughness={1} />
    </mesh>
    {/* ceiling fixture, mostly lost in shadow */}
    <group position={[0,4.02,0]}>
      <mesh><cylinderGeometry args={[.34,.44,.13,24]} /><meshStandardMaterial color="#292820" metalness={.3} roughness={.5} /></mesh>
      <mesh position={[0,-.25,0]}><cylinderGeometry args={[.12,.29,.45,24,1,true]} /><meshStandardMaterial color="#a28b66" emissive="#a87941" emissiveIntensity={.7} transparent opacity={.5} side={THREE.DoubleSide} /></mesh>
      <pointLight position={[0,-.35,0]} color="#c2a477" intensity={.45} distance={4.5} />
    </group>
    <Dust />
  </group>;
}

function CameraRig({ active, opened, onUncanny }) {
  const controls = useRef();
  const keys = useRef({});
  const enteredCorridor = useRef(false);
  const lookedAway = useRef(false);
  const triggered = useRef(false);
  useEffect(() => {
    const camera = controls.current?.getObject();
    if (camera) camera.position.set(0, 1.65, 3.25);
  }, []);
  useEffect(() => {
    const down = (e) => { if (['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)) keys.current[e.code] = true; };
    const up = (e) => { keys.current[e.code] = false; };
    const clear = () => { keys.current = {}; };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', clear);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', clear); };
  }, []);
  useFrame((_, delta) => {
    if (!active || !controls.current?.isLocked) return;
    const camera = controls.current.getObject();
    const forward = Number(keys.current.KeyW || keys.current.ArrowUp) - Number(keys.current.KeyS || keys.current.ArrowDown);
    const side = Number(keys.current.KeyD || keys.current.ArrowRight) - Number(keys.current.KeyA || keys.current.ArrowLeft);
    if (!forward && !side) return;
    const speed = 2.15 * Math.min(delta, .04);
    const direction = new THREE.Vector3(side, 0, -forward).normalize().applyQuaternion(camera.quaternion);
    direction.y = 0;
    camera.position.addScaledVector(direction.normalize(), speed);
    camera.position.y = 1.65;
    if (camera.position.z < -4.15 && !opened) camera.position.z = -4.15;
    if (camera.position.z < -4.05) {
      camera.position.x = THREE.MathUtils.clamp(camera.position.x, -1.02, 1.02);
      camera.position.z = Math.max(camera.position.z, -12.75);
      enteredCorridor.current = true;
    } else {
      camera.position.x = THREE.MathUtils.clamp(camera.position.x, -3.8, 3.8);
      camera.position.z = THREE.MathUtils.clamp(camera.position.z, -4.15, 3.8);
    }
    if (enteredCorridor.current && !triggered.current) {
      const direction = new THREE.Vector3();
      camera.getWorldDirection(direction);
      if (direction.z > .35) lookedAway.current = true;
      if (lookedAway.current && direction.z < -.55) {
        triggered.current = true;
        onUncanny?.();
      }
    }
  });
  return <PointerLockControls ref={controls} selector="#enter-room" />;
}

function Scene({ opened, setOpened, onUncanny, apparition }) {
  const [started, setStarted] = useState(false);
  useEffect(() => {
    const onLock = () => { setStarted(document.pointerLockElement !== null); };
    document.addEventListener('pointerlockchange', onLock);
    return () => document.removeEventListener('pointerlockchange', onLock);
  }, []);
  useEffect(() => {
    const onKey = (e) => {
      if (e.code === 'KeyE' && started) setOpened(v => !v);
      if (e.code === 'Escape') setStarted(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [started, setOpened]);
  return <>
    <color attach="background" args={['#080a09']} />
    <fog attach="fog" args={['#101411', 5.1, 13.5]} />
    <ambientLight intensity={0.13} color="#b9c0ad" />
    <directionalLight position={[-3,4,2]} color="#c6b99a" intensity={0.18} />
    <hemisphereLight args={['#8e9a88','#17130f',0.22]} />
    <Room onDoor={() => setOpened(v => !v)} opened={opened} onUncanny={onUncanny} apparition={apparition} />
    <Environment preset="warehouse" environmentIntensity={0.12} />
    <ContactShadows position={[0,.005,0]} opacity={.45} scale={12} blur={2.6} far={4} resolution={256} color="#000000" />
    <Sparkles count={50} scale={[8,3.5,8]} size={1.2} speed={.12} opacity={.24} color="#d6c9a9" />
    <EffectComposer multisampling={0}>
      <Bloom intensity={.48} luminanceThreshold={.72} luminanceSmoothing={.28} mipmapBlur />
      <ChromaticAberration offset={new THREE.Vector2(.00045,.00045)} radialModulation />
      <Noise opacity={.075} />
      <Vignette eskil={false} offset={.22} darkness={.86} />
    </EffectComposer>
    <CameraRig active={started} opened={opened} onUncanny={onUncanny} />
    {!started && <Html fullscreen>
      <div className="start-screen">
        <div className="start-grid" />
        <div className="start-top"><span className="status-dot" /> VISUAL PROTOTYPE <span className="top-divider">/</span> BUILD 001</div>
        <div className="start-center">
          <div className="eyebrow">SOMEWHERE YOU SHOULDN'T BE</div>
          <h1>THE<span> </span>DOOR<span className="title-period">.</span></h1>
          <div className="title-rule"><span /></div>
          <p className="subtitle">There is a room. There is a door.<br/>You don't remember coming here.</p>
          <button id="enter-room" className="enter-button" onClick={() => { setStarted(true); }}><span>ENTER ROOM</span><span className="button-arrow">↗</span></button>
          <div className="microcopy">HEADPHONES RECOMMENDED <span>·</span> LIGHTS LOW</div>
        </div>
        <div className="start-bottom"><span>ROOM 001 — THE WAITING ROOM</span><span>YOU ARE NOT EXPECTED</span></div>
      </div>
    </Html>}
    {started && <Html fullscreen>
      <div className="hud">
        <div className="hud-top"><span className="hud-mark">T<span>.</span>D</span><span className="hud-location">ROOM 001 <i>/</i> THE WAITING ROOM</span><span className="hud-record"><span/> REC</span></div>
        <div className="crosshair"><span/><span/></div>
        <div className="hud-bottom"><div><span className="hud-label">OBJECTIVE</span><span className="hud-objective">Find a way out.</span></div><div className="controls-note"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> MOVE <span className="note-divider">/</span> <kbd>MOUSE</kbd> LOOK <span className="note-divider">/</span> <kbd>E</kbd> {opened ? 'CLOSE DOOR' : 'INTERACT'}</div></div>
        <div className="center-prompt">{apparition ? 'IT WAS NOT THERE BEFORE' : opened ? 'THE DARKNESS IS WAITING' : 'SOMETHING IS ON THE OTHER SIDE'}</div>
      </div>
    </Html>}
  </>;
}

export default function App() {
  const [opened, setOpened] = useState(false);
  const [apparition, setApparition] = useState(false);
  const [soundOn, setSoundOn] = useState(false);
  const audioRef = useRef(null);
  const toggleSound = async () => {
    if (!audioRef.current) {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const master = ctx.createGain(); master.gain.value = .022; master.connect(ctx.destination);
      const low = ctx.createOscillator(); low.type = 'sine'; low.frequency.value = 48;
      const lowGain = ctx.createGain(); lowGain.gain.value = .6; low.connect(lowGain); lowGain.connect(master); low.start();
      const hum = ctx.createOscillator(); hum.type = 'triangle'; hum.frequency.value = 60.4;
      const humGain = ctx.createGain(); humGain.gain.value = .16; hum.connect(humGain); humGain.connect(master); hum.start();
      audioRef.current = { ctx, master, low, hum };
    }
    const next = !soundOn;
    if (next) await audioRef.current.ctx.resume();
    else await audioRef.current.ctx.suspend();
    setSoundOn(next);
  };
  useEffect(() => () => { if (audioRef.current) audioRef.current.ctx.close(); }, []);
  return <main className="experience">
    <Canvas shadows dpr={[1,1.6]} camera={{ position:[0,1.65,3.25], fov:62, near:.05, far:40 }} gl={{ antialias:true, alpha:false, powerPreference:'high-performance' }}>
      <Suspense fallback={null}><Scene opened={opened} setOpened={setOpened} apparition={apparition} onUncanny={() => setApparition(true)} /></Suspense>
    </Canvas>
    <div className="brand-corner"><span className="brand-icon">T<span>.</span>D</span><span className="brand-caption">AN INTERACTIVE HORROR EXPERIENCE</span></div>
    <button className={'sound-toggle '+(soundOn?'is-on':'')} onClick={toggleSound} aria-label="Toggle ambient sound"><span className="sound-bars"><i/><i/><i/><i/></span><span>{soundOn?'SOUND ON':'SOUND OFF'}</span></button>
    <div className="film-grain" />
    <div className="edge-shade" />
  </main>;
}