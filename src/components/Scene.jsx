import React, { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Environment, Lightformer } from '@react-three/drei';
import { Bloom, ChromaticAberration, EffectComposer, Noise, Vignette } from '@react-three/postprocessing';
import * as THREE from 'three';
import Room from './Room.jsx';
import PlayerRig from './PlayerRig.jsx';
import { paletteFor } from '../lib/palette.js';

/** A weak light riding with the camera: eyes adjusting, not a torch. */
function EyeLight({ power }) {
  const light = useRef();
  const camera = useThree((state) => state.camera);

  useFrame(() => {
    if (!light.current) return;
    light.current.position.copy(camera.position);
    light.current.position.y -= 0.1;
  });

  return <pointLight ref={light} color="#cdc6ae" intensity={3.4 * power} distance={10} decay={2} />;
}

function Exposure({ value }) {
  const gl = useThree((state) => state.gl);
  useEffect(() => {
    gl.toneMappingExposure = value;
  }, [gl, value]);
  return null;
}

export default function Scene({
  room,
  next,
  tex,
  doorOpen,
  onDoor,
  power,
  apparition,
  playerRef,
  onCaught,
  onShift,
  onAdvance,
  onEscape,
  onFootstep,
  interactRef,
  lockRef,
  spawn,
  active,
  roomIndex,
  stalkerSpeed,
}) {
  const gl = useThree((state) => state.gl);
  const mood = room.mood;
  const palette = paletteFor(room.key);

  // Own the pointer lock: drei's control re-binds its listener to a DOM node
  // that can unmount, and Chrome delivers one huge movementX on the first
  // event after locking, which snaps the view sideways.
  useEffect(() => {
    lockRef.current = () => gl.domElement.requestPointerLock();
    return () => {
      lockRef.current = null;
    };
  }, [gl, lockRef]);

  return (
    <>
      <color attach="background" args={[mood.fog]} />
      <fog attach="fog" args={[mood.fog, mood.fogNear, mood.fogFar]} />
      <Exposure value={mood.exposure} />

      <ambientLight intensity={mood.ambientIntensity * power} color={mood.ambient} />
      {/* A little sky and a little bounce, kept low: the practical lights should
          own the room, and a strong fill is what flattens a dark interior into
          one even grey. */}
      <hemisphereLight args={[palette.fill, '#1e1c18', 0.34 * power]} />
      {/* cold fill from behind: separates silhouettes from the dark */}
      <directionalLight position={[2.5, 3.2, 5]} color={palette.fill} intensity={0.5 * power} />
      <EyeLight power={power} />

      <Room
        room={room}
        tex={tex}
        doorOpen={doorOpen}
        onDoor={onDoor}
        power={power}
        apparition={apparition}
        playerRef={playerRef}
        onCaught={onCaught}
        onShift={onShift}
        stalkerSpeed={stalkerSpeed}
      />
      {next && <Room room={next} tex={tex} power={power} doorOpen={false} />}

      <Environment resolution={64} environmentIntensity={0.3}>
        <Lightformer form="rect" intensity={1.3} color="#8d9a86" scale={[4, 4, 1]} position={[0, 3, -2]} />
        <Lightformer form="rect" intensity={0.7} color="#c9a878" scale={[2, 2, 1]} position={[-2, 1, 2]} rotation={[0, Math.PI, 0]} />
        <Lightformer form="rect" intensity={0.5} color="#7d8b7d" scale={[3, 3, 1]} position={[2, 2, 1]} rotation={[0, Math.PI, 0]} />
      </Environment>

      <EffectComposer multisampling={0}>
        <Bloom intensity={0.5} luminanceThreshold={0.84} luminanceSmoothing={0.3} mipmapBlur />
        <ChromaticAberration offset={new THREE.Vector2(0.0004, 0.0004)} radialModulation />
        <Noise opacity={0.011} />
        <Vignette eskil={false} offset={0.26} darkness={0.86} />
      </EffectComposer>

      <PlayerRig
        active={active}
        rooms={[room, next].filter(Boolean)}
        roomIndex={roomIndex}
        doorOpen={doorOpen}
        spawn={spawn}
        onAdvance={onAdvance}
        onEscape={onEscape}
        onFootstep={onFootstep}
        playerRef={playerRef}
        interactRef={interactRef}
      />
    </>
  );
}
