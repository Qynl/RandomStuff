/* THE DOOR — a run of rooms.
 *
 * Twenty-one rooms are generated from one seed and stacked along -Z, drawn from
 * two dozen kinds of room. You open a door, walk into whatever is behind it, and
 * the building keeps going. Every door leads somewhere; none lead back.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState, Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';
import Scene from './components/Scene.jsx';
import { useTextures } from './lib/textures.js';
import { useAudio } from './lib/audio.js';
import { buildChain, EXIT_INDEX, ROOM_TOTAL, startPosition } from './lib/rooms.js';

/* ------------------------------------------------------------------- utils */

function formatTime(seconds) {
  const total = Math.max(0, Math.floor(seconds));
  const minutes = String(Math.floor(total / 60)).padStart(2, '0');
  const rest = String(total % 60).padStart(2, '0');
  return `${minutes}:${rest}`;
}

function roomNumber(index) {
  return String(index + 1).padStart(2, '0');
}

// Pointer lock is a convenience, not a requirement. Touchscreen laptops,
// hybrid tablets and browsers that report a coarse primary pointer can still
// ask for it, and plenty of desktops refuse it — so the door never depends on
// it. If the lock cannot be taken, the room turns under a drag instead.
function canUsePointerLock() {
  if (typeof document === 'undefined') return false;
  if (!('pointerLockElement' in document)) return false;
  return typeof Element !== 'undefined' && typeof Element.prototype.requestPointerLock === 'function';
}

/** A phone or a tablet: no mouse anywhere, so no keyboard worth speaking of. */
function isTouchOnly() {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(pointer: coarse)').matches && !window.matchMedia('(any-pointer: fine)').matches;
}

/* --------------------------------------------------------------------- HUD */

function Hud({ room, index, nearDoor, doorOpen, stalking, freeLook }) {
  const objective =
    index >= EXIT_INDEX
      ? 'Whatever is behind that door, go through it.'
      : stalking
        ? 'Do not let it reach you. Get to the door.'
        : nearDoor
          ? doorOpen ? 'Go on, then.' : 'Open it.'
          : 'Find the next door.';

  return (
    <div className="hud">
      <div className="hud-top">
        <span className="hud-mark">
          T<span>.</span>D
        </span>
        <span className="hud-location">
          ROOM {roomNumber(index)} <i>/</i> {room.label}
        </span>
        <span className="hud-record">
          <span /> REC
        </span>
      </div>

      <div className="crosshair">
        <span />
        <span />
      </div>

      <div className="hud-side">
        <span className="hud-label">DEPTH</span>
        <span className="hud-depth">
          {roomNumber(index)}<em>/{roomNumber(ROOM_TOTAL - 1)}</em>
        </span>
      </div>

      <div className="hud-bottom">
        <div>
          <span className="hud-label">OBJECTIVE</span>
          <span className="hud-objective">{objective}</span>
        </div>
        <div className="controls-note">
          <kbd>W</kbd>
          <kbd>A</kbd>
          <kbd>S</kbd>
          <kbd>D</kbd> MOVE <span className="note-divider">/</span> <kbd>{freeLook ? 'DRAG' : 'MOUSE'}</kbd> LOOK{' '}
          <span className="note-divider">/</span> <kbd>E</kbd> DOOR <span className="note-divider">/</span> <kbd>M</kbd> SOUND
        </div>
      </div>

      {nearDoor && (
        <div className={`center-prompt${doorOpen ? ' is-open' : ''}`}>
          <kbd>E</kbd> {doorOpen ? 'CLOSE THE DOOR' : 'OPEN THE DOOR'}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ title screen */

function TitleScreen({ paused, canLock, touchOnly, soundOn, onEnter, onToggleSound, room, elapsed }) {
  // The button is always here. Pointer lock is offered, never required: if the
  // browser will not hold a lock, the rooms open anyway and you turn by
  // dragging. Hiding the way in behind a capability check just looks broken.

  return (
    <div className="start-screen">
      <div className="start-grid" />
      <div className="start-top">
        <span>
          <span className="status-dot" /> {paused ? 'PAUSED' : 'A SHORT HORROR PIECE'} <span className="top-divider">/</span> BUILD 002
        </span>
        <span>{paused ? `${room.label} — ROOM ${roomNumber(room.index)}` : `${ROOM_TOTAL - 1} ROOMS`}</span>
      </div>

      <div className="start-center">
        <div className="eyebrow">{paused ? 'THE BUILDING IS WAITING' : "SOMEWHERE YOU SHOULDN'T BE"}</div>
        <h1>
          THE<span> </span>DOOR<span className="title-period">.</span>
        </h1>
        <div className="title-rule">
          <span />
        </div>
        <p className="subtitle">
          {paused ? (
            <>
              You are {roomNumber(room.index)} rooms in.
              <br />
              {formatTime(elapsed)} spent finding out what is behind them.
            </>
          ) : (
            <>
              There is a door in every room.
              <br />
              None of them lead back the way you came.
            </>
          )}
        </p>
        {!canLock || touchOnly ? (
          <div className="device-note">
            {canLock ? 'BEST PLAYED ON A DESKTOP.' : 'THIS BROWSER WILL NOT HOLD YOUR CURSOR.'}
            <br />
            {touchOnly ? 'DRAG TO LOOK. WALKING NEEDS A KEYBOARD.' : 'DRAG TO LOOK. WALK WITH WASD OR THE ARROW KEYS.'}
          </div>
        ) : null}
        <button id="enter-room" className="enter-button" onClick={onEnter}>
          <span>{paused ? 'KEEP GOING' : 'OPEN THE FIRST DOOR'}</span>
          <span className="button-arrow">↗</span>
        </button>
        <div className="microcopy">
          {canLock ? 'HEADPHONES RECOMMENDED' : 'DRAG TO LOOK'} <span>·</span> {soundOn ? 'SOUND ON' : 'SOUND OFF'}{' '}
          <span>·</span>{' '}
          <button className="microcopy-link" onClick={onToggleSound}>
            {soundOn ? 'MUTE' : 'ENABLE SOUND'}
          </button>
        </div>
      </div>

      <div className="start-bottom">
        <span>{paused ? 'PRESS ESC TO RESUME FROM THE ROOM' : `${ROOM_TOTAL - 1} ROOMS — ONE OF THEM IS THE WAY OUT`}</span>
        <span>YOU ARE NOT EXPECTED</span>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- end screen */

function EndScreen({ cause, index, elapsed, onRestart }) {
  const escaped = cause === 'escape';
  return (
    <div className={`end-screen${escaped ? ' is-escape' : ''}`}>
      <div className="end-inner">
        <div className="eyebrow">
          {escaped ? 'THE END OF THE HALL' : `ROOM ${roomNumber(index)} — IT FOUND YOU`}
        </div>
        <h2>
          {escaped ? (
            <>
              YOU LEFT
              <br />
              THE DOOR<span className="title-period">.</span>
            </>
          ) : (
            <>
              YOU DID NOT
              <br />
              GET THROUGH<span className="title-period">.</span>
            </>
          )}
        </h2>
        <div className="title-rule">
          <span />
        </div>
        <p className="subtitle">
          {escaped ? (
            <>
              {ROOM_TOTAL - 1} doors. Then air, and the sound of something
              <br />
              closing quietly behind you.
            </>
          ) : (
            <>
              It did not make a sound until it was close enough
              <br />
              that the sound did not matter.
            </>
          )}
        </p>
        <button className="enter-button" onClick={onRestart}>
          <span>{escaped ? 'GO BACK IN' : 'TRY AGAIN'}</span>
          <span className="button-arrow">↗</span>
        </button>
        <div className="end-meta">
          {escaped ? `${ROOM_TOTAL} ROOMS` : `${roomNumber(index)} ROOMS`} <span>·</span> {formatTime(elapsed)} IN THE
          BUILDING <span>·</span> {escaped ? 'STILL WAITING' : 'STILL HUNGRY'}
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- app */

export default function App() {
  const [runSeed, setRunSeed] = useState(() => (Math.random() * 1e9) | 0);
  const chain = useMemo(() => buildChain(runSeed), [runSeed]);
  const spawn = useMemo(() => startPosition(chain), [chain]);

  const [roomIndex, setRoomIndex] = useState(0);
  const [doorOpen, setDoorOpen] = useState(false);
  const [phase, setPhase] = useState('title');
  const [locked, setLocked] = useState(false);
  const [power, setPower] = useState(1);
  const [apparition, setApparition] = useState(null);
  const [nearDoor, setNearDoor] = useState(false);
  const [runId, setRunId] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [cause, setCause] = useState('escape');
  const [stalkerSpeed, setStalkerSpeed] = useState(1.1);
  const [calm, setCalm] = useState(false);
  // Crossing a threshold is a cut, not a stumble. Building the room you are
  // walking into compiles its shaders, which costs a few hundred milliseconds
  // on a new light set — so the black goes up first, the room is built behind
  // it, and it comes back down once the new room has actually drawn a frame.
  const [crossing, setCrossing] = useState(false);
  const crossingRef = useRef(false);
  const cutTimer = useRef(0);
  const lastEvent = useRef('');
  const extraTimers = useRef(new Set());
  const doorRef = useRef(false);
  const figureSeq = useRef(0);

  const tex = useTextures();
  const { soundOn, toggle, autoStart, cue, setTension } = useAudio();

  const room = chain[roomIndex];
  const next = chain[roomIndex + 1];

  const lockRef = useRef(null);
  const interactRef = useRef(false);
  const nearRef = useRef(false);
  const dreadRef = useRef({ stalker: false });
  const startedAt = useRef(null);
  const pendingLock = useRef(false);
  const playerRef = useRef(new THREE.Vector3());
  const canLock = useRef(canUsePointerLock());
  const touchOnly = useRef(isTouchOnly());
  const [freeLook, setFreeLook] = useState(false);
  const freeLookRef = useRef(false);
  const lockFallback = useRef(0);

  /* --- look control ----------------------------------------------------- */
  // Free look is drag-to-turn. It is the fallback for every machine that cannot
  // hold a pointer lock, which is why the start button is never hidden behind
  // a capability check.
  const startFree = useCallback(() => {
    window.clearTimeout(lockFallback.current);
    freeLookRef.current = true;
    setFreeLook(true);
    setLocked(false);
    setPhase((current) => (current === 'title' || current === 'play' ? 'play' : current));
  }, []);

  const stopFree = useCallback(() => {
    freeLookRef.current = false;
    setFreeLook(false);
  }, []);

  useEffect(() => {
    const onChange = () => {
      const isLocked = Boolean(document.pointerLockElement);
      setLocked(isLocked);
      if (isLocked) {
        window.clearTimeout(lockFallback.current);
        stopFree();
      }
      setPhase((current) => {
        if (current === 'ending' || current === 'end' || current === 'dead') return current;
        if (isLocked || freeLookRef.current) return 'play';
        return 'title';
      });
    };
    // A refused request — a sandboxed frame, no user activation, another lock
    // still held — must not leave the player at a title screen that ignores
    // them. It falls back to drag look instead.
    const onError = () => startFree();
    document.addEventListener('pointerlockchange', onChange);
    document.addEventListener('pointerlockerror', onError);
    return () => {
      document.removeEventListener('pointerlockchange', onChange);
      document.removeEventListener('pointerlockerror', onError);
    };
  }, [startFree, stopFree]);

  useEffect(() => {
    if (phase === 'play' && startedAt.current === null) startedAt.current = Date.now();
  }, [phase]);

  useEffect(() => {
    doorRef.current = doorOpen;
  }, [doorOpen]);

  /* --- clock ----------------------------------------------------------- */
  useEffect(() => {
    if (phase !== 'play') return undefined;
    const id = window.setInterval(() => {
      if (startedAt.current) setElapsed((Date.now() - startedAt.current) / 1000);
    }, 400);
    return () => window.clearInterval(id);
  }, [phase]);

  /* --- door ------------------------------------------------------------ */
  const toggleDoor = useCallback(() => {
    setDoorOpen((value) => {
      cue(value ? 'close' : 'door');
      return !value;
    });
  }, [cue]);

  useEffect(() => {
    const onKey = (event) => {
      if (event.code === 'KeyM') {
        toggle();
      } else if (event.code === 'Escape' && document.pointerLockElement) {
        document.exitPointerLock();
      } else if (event.code === 'Escape' && freeLook) {
        // No lock to give back, so pausing is ours to do.
        stopFree();
        setPhase('title');
      } else if (event.code === 'KeyE' && phase === 'play' && (locked || freeLook) && interactRef.current) {
        toggleDoor();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, locked, freeLook, stopFree, toggle, toggleDoor]);

  /* --- moving on ------------------------------------------------------- */
  const releaseCut = useCallback(() => {
    window.clearTimeout(cutTimer.current);
    if (!crossingRef.current) return;
    crossingRef.current = false;
    setCrossing(false);
  }, []);

  // The index is advanced functionally. A step through a doorway can arrive on
  // two frames in a row, and reading roomIndex from the closure made the second
  // call write the same index again — which lost a room and could stop a run
  // dead a few rooms in.
  const advance = useCallback(() => {
    if (crossingRef.current) return;
    crossingRef.current = true;
    setCrossing(true);
    // One frame to paint the black, one more to be sure it reached the screen:
    // the room you are stepping into is built and its shaders compiled on the
    // main thread, and none of that should happen where you can see it.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setRoomIndex((current) => Math.min(current + 1, EXIT_INDEX));
        setDoorOpen(false);
        setApparition(null);
        figureSeq.current += 1;
        setTension(0);
        dreadRef.current.stalker = false;
      });
    });
    // If no frame ever arrives to lift the cut, lift it anyway.
    window.clearTimeout(cutTimer.current);
    cutTimer.current = window.setTimeout(() => {
      crossingRef.current = false;
      setCrossing(false);
    }, 2600);
  }, [setTension]);

  // Some rooms are already dark when you step into them, and take a moment to
  // admit that they have lights at all.
  useEffect(() => {
    const entered = chain[roomIndex];
    if (!entered) return undefined;
    if (entered.extras?.darkEntry) {
      setPower(0.22);
      const id = window.setTimeout(() => setPower(1), 1400);
      extraTimers.current.add(id);
      return () => window.clearTimeout(id);
    }
    setPower(1);
    return undefined;
  }, [chain, roomIndex]);

  const finish = useCallback((kind) => {
    setPhase('ending');
    setCause(kind);
    cue(kind === 'escape' ? 'exit' : 'caught');
    setTension(kind === 'escape' ? 0 : 1);
    setElapsed(startedAt.current ? (Date.now() - startedAt.current) / 1000 : 0);
  }, [cue, setTension]);

  useEffect(() => {
    if (phase !== 'ending') return undefined;
    if (document.pointerLockElement) document.exitPointerLock();
    setPower(cause === 'escape' ? 1.6 : 0.02);
    const id = window.setTimeout(() => setPhase(cause === 'escape' ? 'end' : 'dead'), 2000);
    return () => window.clearTimeout(id);
  }, [phase, cause]);

  const escape = useCallback(() => finish('escape'), [finish]);
  const caught = useCallback(() => finish('caught'), [finish]);

  /* --- dread scheduler -------------------------------------------------- */
  useEffect(() => {
    if (calm) return undefined;
    if (phase !== 'play' || !locked) return undefined;
    if (roomIndex >= EXIT_INDEX) return undefined;

    let cancelled = false;
    const timers = new Set();

    const later = (fn, ms) => {
      const id = window.setTimeout(() => {
        timers.delete(id);
        if (!cancelled) fn();
      }, ms);
      timers.add(id);
      return id;
    };

    // Every staged figure gets a token, so the "now take it away" timer of an
    // earlier scare can never reach in and clear a figure staged after it.
    const show = (value, ms = 0) => {
      const token = ++figureSeq.current;
      setApparition(value);
      if (ms) {
        later(() => {
          if (figureSeq.current !== token) return;
          setApparition(null);
          setTension(0);
        }, ms);
      }
    };

    const step = () => {
      if (cancelled) return;
      const depth = roomIndex;
      if (depth >= EXIT_INDEX) return;

      // The deeper you are, the less time the building gives you between
      // events — but never so little that it stops being a rhythm.
      const gap = 4600 + Math.random() * 6200 - Math.min(2800, depth * 220);

      if (dreadRef.current.stalker) {
        later(step, 4200);
        return;
      }

      const stalkChance = depth >= 5 ? Math.min(0.34, 0.05 + depth * 0.018) : 0;
      if (Math.random() < stalkChance) {
        dreadRef.current.stalker = true;
        lastEvent.current = 'stalker';
        setStalkerSpeed(0.72 + depth * 0.045);
        show({ mode: 'stalker' });
        setTension(0.95);
        cue('slam');
        later(() => cue('breath'), 1100);
        later(() => setTension(0.62), 9000);
        later(step, 20000);
        return;
      }

      const pool = ['flicker', 'whisper', 'steps'];
      if (depth >= 1) pool.push('flicker', 'peek', 'slam', 'pass');
      if (depth >= 2) pool.push('procession', 'blackout');
      if (depth >= 3) pool.push('behind', 'gaze', 'gaze', 'steps');
      if (depth >= 4) pool.push('doorway', 'blackout');
      if (depth >= 6) pool.push('stare', 'procession', 'doorway');

      let kind = pool[Math.floor(Math.random() * pool.length)];
      if (kind === lastEvent.current) kind = pool[(pool.indexOf(kind) + 1) % pool.length];
      lastEvent.current = kind;

      switch (kind) {
        case 'flicker':
          cue('whisper');
          setTension(0.35);
          setPower(0.16);
          later(() => setPower(0.7), 80);
          later(() => setPower(0.08), 190);
          later(() => {
            setPower(1);
            setTension(0);
          }, 340);
          break;

        case 'blackout':
          cue('slam');
          setTension(0.75);
          setPower(0.02);
          later(() => setPower(0.3), 250);
          later(() => setPower(0.02), 470);
          later(() => cue('breath'), 620);
          later(() => {
            setPower(1);
            setTension(0);
          }, 1080);
          break;

        case 'slam':
          // The door you left open is shut when you look back at it.
          cue('slam');
          setPower(0.28);
          later(() => setPower(1), 260);
          later(() => {
            if (doorRef.current) setDoorOpen(false);
          }, 500);
          break;

        case 'whisper':
          cue('whisper');
          later(() => cue('whisper'), 700 + Math.random() * 700);
          break;

        case 'steps':
          // Footsteps that are not yours, behind you, and getting no closer.
          cue('step');
          later(() => cue('step'), 430);
          later(() => cue('step'), 900);
          later(() => cue('step'), 1420);
          setTension(0.4);
          later(() => setTension(0), 2600);
          break;

        case 'peek': {
          show(
            {
              mode: 'static',
              x: Math.random() > 0.5 ? room.width * 0.22 : -room.width * 0.22,
              z: -room.depth / 2 + 0.5,
              facing: 0,
              close: false,
              pose: 'idle',
            },
            1500 + Math.random() * 1000,
          );
          cue('creak');
          setTension(0.42);
          later(() => cue('sting'), 1200);
          break;
        }

        case 'procession':
          show({ mode: 'procession' }, 7000);
          cue('whisper');
          setTension(0.55);
          later(() => cue('breath'), 1600);
          later(() => cue('sting'), 6800);
          break;

        case 'pass':
          // It crosses the room while you are looking at it.
          show({ mode: 'pass' }, 1900);
          cue('rush');
          setTension(0.72);
          later(() => cue('step'), 260);
          later(() => cue('step'), 520);
          later(() => cue('sting'), 980);
          break;

        case 'behind':
          // It is standing in the doorway you came through. Most players never
          // turn around, which is the point.
          show({ mode: 'behind' }, 6500);
          cue('creak');
          setTension(0.5);
          break;

        case 'gaze':
          show({ mode: 'weeping' }, 20000);
          cue('whisper');
          setTension(0.72);
          break;

        case 'doorway':
          show({ mode: 'doorway' }, 8000);
          cue('slam');
          setTension(0.82);
          later(() => cue('breath'), 900);
          later(() => cue('sting'), 7800);
          break;

        case 'stare':
          show(
            {
              mode: 'static',
              x: (Math.random() > 0.5 ? 1 : -1) * room.width * 0.18,
              z: -1.1,
              facing: 0,
              close: true,
              pose: 'idle',
            },
            3200 + Math.random() * 1600,
          );
          cue('sting');
          setTension(0.66);
          break;

        default:
          break;
      }

      later(step, Math.max(3000, gap));
    };

    later(step, 3600 + Math.random() * 2400);

    return () => {
      cancelled = true;
      timers.forEach((id) => window.clearTimeout(id));
      timers.clear();
      // A flicker can be interrupted by a room change; never leave the lights
      // dimmed because its restore timer was cleared with it.
      setPower(1);
    };
  }, [calm, phase, locked, room.index, roomIndex, room.width, room.depth, cue, setTension]);

  /* --- the thing following you ------------------------------------------ */
  useEffect(() => {
    if (phase !== 'play' || !locked) return undefined;
    if (apparition?.mode !== 'stalker') return undefined;
    let id;
    const beat = () => {
      cue('step');
      id = window.setTimeout(beat, 520 + Math.random() * 280);
    };
    id = window.setTimeout(beat, 700);
    return () => window.clearTimeout(id);
  }, [phase, locked, apparition, cue]);

  /* --- ambience --------------------------------------------------------- */
  useEffect(() => {
    if (phase !== 'play' || !locked) return undefined;
    const kind = room.key;
    const sound = ['flooded', 'washroom', 'boiler', 'hall', 'kitchen'].includes(kind)
      ? 'drip'
      : kind === 'clockroom'
        ? 'tick'
        : ['laundry', 'mirrorhall', 'morgue'].includes(kind)
          ? 'hum'
          : null;
    if (!sound) return undefined;
    const beat = sound === 'tick' ? 1000 : 4800 + Math.random() * 4200;
    const id = window.setInterval(() => cue(sound), beat);
    return () => window.clearInterval(id);
  }, [phase, locked, room.key, cue]);

  /* --- proximity prompt -------------------------------------------------- */
  useEffect(() => {
    if (phase !== 'play') return undefined;
    const id = window.setInterval(() => {
      const near = Boolean(interactRef.current);
      if (near !== nearRef.current) {
        nearRef.current = near;
        setNearDoor(near);
      }
    }, 140);
    return () => window.clearInterval(id);
  }, [phase]);

  /* --- start / restart --------------------------------------------------- */
  const begin = useCallback(() => {
    if (!canLock.current) {
      startFree();
      return;
    }
    lockRef.current?.();
    // If the browser sits on the request, open the rooms anyway. Nothing is
    // worse than a start button that appears to do nothing.
    window.clearTimeout(lockFallback.current);
    lockFallback.current = window.setTimeout(() => {
      if (!document.pointerLockElement) startFree();
    }, 700);
  }, [startFree]);

  const enter = () => {
    autoStart();
    begin();
  };

  useEffect(() => {
    if (!pendingLock.current) return undefined;
    const id = window.setTimeout(() => {
      pendingLock.current = false;
      lockRef.current?.();
    }, 90);
    return () => window.clearTimeout(id);
  }, [runId]);

  const restart = () => {
    window.clearTimeout(cutTimer.current);
    crossingRef.current = false;
    setCrossing(false);
    setRunSeed((Math.random() * 1e9) | 0);
    setRoomIndex(0);
    setDoorOpen(false);
    setPower(1);
    setApparition(null);
    setNearDoor(false);
    setElapsed(0);
    setCause('escape');
    setTension(0);
    dreadRef.current.stalker = false;
    startedAt.current = null;
    setPhase('title');
    setRunId((value) => value + 1);
    autoStart();
    if (freeLookRef.current) {
      // Already in the world by drag; go straight back to it.
      setPhase('play');
      return;
    }
    pendingLock.current = true;
  };

  /* --- debug hooks (?debug) ---------------------------------------------- */
  // Everything here is behind a query flag and only exists so the scene can be
  // driven by a headless browser: jump to a room, stage a scare, check state.
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    if (!new URLSearchParams(window.location.search).has('debug')) return undefined;
    const api = (window.__run ||= {});
    api.rooms = chain.map((item) => ({
      index: item.index,
      key: item.key,
      label: item.label,
      centerZ: item.centerZ,
      frontZ: item.frontZ,
      backZ: item.backZ,
      depth: item.depth,
      width: item.width,
    }));
    api.skip = (index) => {
      setRoomIndex(Math.max(0, Math.min(EXIT_INDEX, index)));
      setDoorOpen(false);
      setApparition(null);
      setPower(1);
    };
    api.figure = (value) => {
      figureSeq.current += 1;
      setApparition(value);
    };
    api.door = (value) => setDoorOpen(Boolean(value));
    api.power = (value) => setPower(value);
    api.phase = (value) => setPhase(value);
    api.calm = (value) => setCalm(Boolean(value));
    api.state = () => ({ roomIndex, phase, locked, doorOpen, calm });
    return () => {
      delete api.skip;
      delete api.figure;
      delete api.door;
      delete api.power;
      delete api.phase;
      delete api.calm;
      delete api.rooms;
    };
  }, [chain, roomIndex, phase, locked, doorOpen, calm]);

  const playing = phase === 'play' && (locked || freeLook);

  return (
    <main className={`experience${apparition?.mode === 'stalker' ? ' is-stalking' : ''}${freeLook ? ' is-freelook' : ''}`}>
      <Canvas
        shadows
        dpr={[1, 1.5]}
        camera={{ position: spawn, fov: 64, near: 0.05, far: 45 }}
        gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
        onCreated={({ gl }) => {
          gl.toneMappingExposure = room.mood.exposure;
        }}
      >
        <Suspense fallback={null}>
          <Scene
            key={runId}
            room={room}
            next={next}
            tex={tex}
            doorOpen={doorOpen}
            onDoor={toggleDoor}
            power={phase === 'ending' && cause !== 'escape' ? 0.04 : power}
            apparition={apparition}
            playerRef={playerRef}
            onCaught={caught}
            onAdvance={advance}
            onEscape={escape}
            onFootstep={() => cue('step')}
            onRoomDrawn={releaseCut}
            onShift={(upClose) => {
              cue(upClose ? 'sting' : 'whisper');
              setTension(upClose ? 0.85 : 0.6);
            }}
            interactRef={interactRef}
            lockRef={lockRef}
            spawn={spawn}
            active={playing}
            freeLook={freeLook}
            roomIndex={roomIndex}
            stalkerSpeed={stalkerSpeed}
          />
        </Suspense>
      </Canvas>      {playing && (
        <Hud
          room={room}
          index={roomIndex}
          nearDoor={nearDoor}
          doorOpen={doorOpen}
          stalking={apparition?.mode === 'stalker'}
          freeLook={freeLook}
        />
      )}

      {phase === 'title' && (
        <TitleScreen
          paused={startedAt.current !== null}
          canLock={canLock.current}
          touchOnly={touchOnly.current}
          soundOn={soundOn}
          onEnter={enter}
          onToggleSound={toggle}
          room={room}
          elapsed={elapsed}
        />
      )}

      {(phase === 'ending' || phase === 'dead') && (
        <>
          <div className={`ending-flash${cause === 'escape' ? ' is-white' : ''}`} />
          <div className="ending-fade" />
        </>
      )}

      {(phase === 'end' || phase === 'dead') && (
        <EndScreen cause={cause} index={roomIndex} elapsed={elapsed} onRestart={restart} />
      )}

      <button
        type="button"
        className={`sound-toggle${soundOn ? ' is-on' : ''}`}
        onClick={toggle}
        aria-label={soundOn ? 'Mute ambient sound' : 'Enable ambient sound'}
      >
        <span className="sound-bars">
          <i />
          <i />
          <i />
          <i />
        </span>
        <span>{soundOn ? 'SOUND ON' : 'SOUND OFF'}</span>
      </button>

      {/* the cut over a threshold: raised before the next room is built, lifted
          once it has drawn, so its first frame never lands on screen */}
      <div
        className={`room-cut${crossing ? ' is-down' : ''}`}
        style={{ transition: crossing ? 'none' : 'opacity 340ms ease-out' }}
      />
      <div className="film-grain" />
      <div className="edge-shade" />
      <div className="danger-pulse" />
    </main>
  );
}
