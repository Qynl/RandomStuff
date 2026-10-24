/* First person movement.
 *
 * The rooms are physically adjacent, so this is a continuous walk: no loading,
 * no teleport. Collision resolves against the union of walkable rectangles for
 * the current room pair, one axis at a time, which slides along walls and lets
 * you thread a doorway without snagging on the frame.
 */
import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { EYE, EXIT_INDEX, pointInRects, walkableRects } from '../lib/rooms.js';

const MOVE_KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];

export default function PlayerRig({ active, freeLook, rooms, roomIndex, doorOpen, spawn, onAdvance, onEscape, onFootstep, playerRef, interactRef }) {
  const camera = useThree((state) => state.camera);
  const gl = useThree((state) => state.gl);
  const debug = useMemo(() => (typeof window === 'undefined' ? false : new URLSearchParams(window.location.search).has('debug')), []);
  const keys = useRef({});
  const bob = useRef(0);
  const stride = useRef(0);
  const advancedAtIndex = useRef(-1);
  const escaped = useRef(false);

  const current = rooms[0];
  const next = rooms[1];

  const rects = useMemo(() => {
    const list = walkableRects(current, { doorOpen });
    if (next) list.push(...walkableRects(next, { doorOpen: false }));
    return list;
  }, [current, next, doorOpen]);

  const yaw = useRef(0);
  const pitch = useRef(0);
  const ignoreUntil = useRef(0);

  useEffect(() => {
    if (spawn) camera.position.set(spawn[0], spawn[1], spawn[2]);
    camera.rotation.order = 'YXZ';
    camera.rotation.set(0, 0, 0);
    yaw.current = 0;
    pitch.current = 0;
  }, [camera, spawn]);

  useEffect(() => {
    if (!debug) return undefined;
    const state = (window.__door ||= {});
    state.look = (degrees) => {
      yaw.current = (degrees * Math.PI) / 180;
      camera.rotation.set(pitch.current, yaw.current, 0);
    };
    state.warp = (z, x = 0) => {
      camera.position.x = x;
      camera.position.z = z;
    };
    return () => {
      delete state.look;
      delete state.warp;
    };
  }, [camera, debug]);

  // Mouse look. Movement deltas are clamped per event: the first event after
  // pointer lock can carry the whole distance from wherever the cursor was,
  // which otherwise snaps the camera sideways on entry.
  useEffect(() => {
    const onLock = () => {
      if (document.pointerLockElement) ignoreUntil.current = performance.now() + 170;
    };
    document.addEventListener('pointerlockchange', onLock);
    return () => document.removeEventListener('pointerlockchange', onLock);
  }, []);

  useEffect(() => {
    const onMove = (event) => {
      if (!document.pointerLockElement) return;
      if (performance.now() < ignoreUntil.current) return;
      const dx = THREE.MathUtils.clamp(event.movementX || 0, -110, 110);
      const dy = THREE.MathUtils.clamp(event.movementY || 0, -110, 110);
      yaw.current -= dx * 0.0022;
      pitch.current = THREE.MathUtils.clamp(pitch.current - dy * 0.0022, -1.35, 1.35);
      camera.rotation.set(pitch.current, yaw.current, 0);
    };
    document.addEventListener('mousemove', onMove);
    return () => document.removeEventListener('mousemove', onMove);
  }, [camera]);

  // Drag look, for every browser that refuses or lacks pointer lock. Same
  // numbers as the locked path, driven by press-and-drag on the canvas so it
  // works with a mouse, a trackpad and a finger alike.
  useEffect(() => {
    const element = gl.domElement;
    let dragging = false;
    let last = null;

    const down = (event) => {
      if (!active || !freeLook || document.pointerLockElement) return;
      dragging = true;
      last = { x: event.clientX, y: event.clientY };
      element.setPointerCapture?.(event.pointerId);
    };
    const move = (event) => {
      if (!dragging || !last) return;
      const dx = event.clientX - last.x;
      const dy = event.clientY - last.y;
      last = { x: event.clientX, y: event.clientY };
      yaw.current -= dx * 0.0042;
      pitch.current = THREE.MathUtils.clamp(pitch.current - dy * 0.0042, -1.35, 1.35);
      camera.rotation.set(pitch.current, yaw.current, 0);
    };
    const up = (event) => {
      dragging = false;
      last = null;
      if (element.hasPointerCapture?.(event.pointerId)) element.releasePointerCapture(event.pointerId);
    };

    element.addEventListener('pointerdown', down);
    element.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      element.removeEventListener('pointerdown', down);
      element.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, [active, camera, freeLook, gl]);

  useEffect(() => {
    const down = (event) => {
      if (MOVE_KEYS.includes(event.code)) keys.current[event.code] = true;
    };
    const up = (event) => {
      keys.current[event.code] = false;
    };
    const clear = () => {
      keys.current = {};
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', clear);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', clear);
    };
  }, []);

  useFrame((_, rawDelta) => {
    const position = camera.position;
    playerRef.current?.copy(position);
    if (debug) {
      const state = (window.__door ||= {});
      state.x = +position.x.toFixed(2);
      state.y = +position.y.toFixed(2);
      state.z = +position.z.toFixed(2);
      state.room = roomIndex;
      state.door = doorOpen;
      state.near = Boolean(interactRef?.current);
      state.backZ = +current.backZ.toFixed(2);
      state.frontZ = +current.frontZ.toFixed(2);
      state.nextFrontZ = next ? +next.frontZ.toFixed(2) : null;
      state.advancedAt = advancedAtIndex.current;
    }
    if (!active) return;

    const delta = Math.min(rawDelta, 0.05);
    const forward = Number(Boolean(keys.current.KeyW || keys.current.ArrowUp)) - Number(Boolean(keys.current.KeyS || keys.current.ArrowDown));
    const strafe = Number(Boolean(keys.current.KeyD || keys.current.ArrowRight)) - Number(Boolean(keys.current.KeyA || keys.current.ArrowLeft));

    if (forward || strafe) {
      const direction = new THREE.Vector3(strafe, 0, -forward).normalize().applyQuaternion(camera.quaternion);
      direction.y = 0;
      direction.normalize().multiplyScalar(2.5 * delta);

      const candidateX = position.x + direction.x;
      if (pointInRects(candidateX, position.z, rects)) position.x = candidateX;

      const candidateZ = position.z + direction.z;
      if (pointInRects(position.x, candidateZ, rects)) position.z = candidateZ;

      const travelled = Math.abs(forward) + Math.abs(strafe);
      bob.current += delta * (8.4 + travelled * 0.4);
      stride.current += Math.hypot(direction.x, direction.z);
      if (stride.current > 1.05) {
        stride.current = 0;
        onFootstep?.();
      }
    } else {
      bob.current += delta * 1.4;
    }

    const moving = Boolean(forward || strafe);
    position.y = EYE + Math.sin(bob.current) * (moving ? 0.018 : 0.004);

    // Interaction prompt: close enough to the door of this room.
    if (interactRef) {
      interactRef.current = Math.hypot(position.x, position.z - current.backZ) < 2.3;
    }

    // Walk into the next room: the room swap happens well past the threshold,
    // so the player never sees geometry appear or disappear.
    if (next && position.z < next.frontZ - 1.5 && advancedAtIndex.current !== roomIndex) {
      advancedAtIndex.current = roomIndex;
      onAdvance?.();
    }

    if (roomIndex === EXIT_INDEX && position.z < current.backZ - 0.7 && !escaped.current) {
      escaped.current = true;
      onEscape?.();
    }
  });

  return null;
}
