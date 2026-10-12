/**
 * Host-authoritative netcode for peer-to-peer play, on top of transport.js.
 *
 * The shape follows what the vel.gg preservation project demonstrated works for
 * this engine, and what source-engine-derived games have always done: one peer
 * owns the simulation, everyone else sends inputs and renders snapshots.
 *
 *   host                          guests
 *    |  <-- {k:'in', seq, axes} -- |   unreliable, per input frame
 *    |  -- {k:'snap', tick, ack,   |   unreliable, per tick
 *    |        players:{id:{...}}} ->|
 *
 * Why host-authoritative rather than lockstep or rollback:
 *
 *   - The engine already is. BO1 Zombies runs a listen server; the host's view is
 *     the truth and other players are interpolated. Mirroring that means the host
 *     needs no prediction at all and cannot disagree with itself.
 *   - Zombies is 30 Hz-tolerant. Round state, points and purchases are discrete
 *     and forgiving; only local movement feels bad at low update rates, which is
 *     exactly what client-side prediction below removes.
 *   - It degrades instead of desyncing. A dropped snapshot costs one frame of
 *     smoothness. In lockstep a dropped packet stalls every peer.
 *
 * Three mechanisms, all standard, all implemented here:
 *
 *   1. Snapshot interpolation - a guest renders the world `interpolationMs` in the
 *      past and interpolates between the two snapshots bracketing that time, so a
 *      30 Hz stream with jitter still looks smooth.
 *   2. Client-side prediction - the guest applies its own input to its own avatar
 *      immediately, so local movement has zero perceived latency.
 *   3. Server reconciliation - every snapshot carries the last input sequence the
 *      host actually applied for that guest. The guest rewinds to the authoritative
 *      state and re-applies only the inputs the host has not yet seen. Corrections
 *      are smoothed rather than snapped, over `snapMs`, so a late packet does not
 *      teleport the player.
 *
 * The simulation itself is supplied by the caller (`simulate`, `applyInput`,
 * `stateFor`), which keeps this file game-agnostic and lets the tests run a real
 * deterministic simulation without a browser, a GPU or 6 GB of assets.
 */

import { ProtocolError } from './protocol.js';

export const NETCODE_VERSION = 1;

const DEFAULTS = Object.freeze({
  tickRate: 30,
  inputRate: 60,
  interpolationMs: 100,
  snapMs: 120,
  maxSnapshotBytes: 1100,
  inputQueueCap: 128,
  snapshotBufferCap: 64,
});

/** Wire kinds. Short keys because snapshots go out 30x/second per peer. */
const K = Object.freeze({ INPUT: 'in', SNAPSHOT: 'snap', EVENT: 'ev', JOIN: 'join', LEAVE: 'leave' });

export class NetcodeError extends Error {
  constructor(message) {
    super(message);
    this.name = 'NetcodeError';
  }
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

function assertPeer(peer) {
  if (!peer || typeof peer.send !== 'function') {
    throw new NetcodeError('a connected transport Peer is required');
  }
}

/**
 * Shared plumbing: attaches to a Peer, routes message kinds, and tracks loss.
 * @param {object} options
 * @param {import('./transport.js').Peer} options.peer
 * @param {(event:object)=>void} [options.onEvent]  application-level events
 * @param {(error:Error)=>void} [options.onError]
 */
function createBase({ peer, onEvent = () => {}, onRender = () => {}, onError = () => {}, ...rest }) {
  assertPeer(peer);
  const config = { ...DEFAULTS, ...rest };
  const stats = { received: 0, malformed: 0, events: 0, startedAt: now() };

  const previous = peer.onMessage;
  peer.onMessage = message => {
    const data = message.data;
    // Binary frames belong to whoever else is using this peer; pass them through.
    if (!(data && typeof data === 'object') || data instanceof Uint8Array) {
      previous?.(message);
      return;
    }
    if (typeof data.k !== 'string' || data.v !== NETCODE_VERSION) {
      stats.malformed++;
      onError(new ProtocolError(`netcode message with unknown shape: ${JSON.stringify(data).slice(0, 80)}`));
      return;
    }
    stats.received++;
    handle(data, message);
  };

  let handle = () => {};
  let timer = null;
  const api = {
    config, stats, peer,
    get rttMs() { return peer.rttMs; },
    /** Application-level reliable event (round change, purchase, down state…). */
    emit(name, payload = {}) {
      if (typeof name !== 'string' || !name) throw new NetcodeError('event name required');
      peer.send({ k: K.EVENT, v: NETCODE_VERSION, n: name, p: payload });
      stats.events++;
    },
    onEvent,
    onRender,
    onError,
    stop() {
      peer.onMessage = previous;
      if (timer) clearInterval(timer);
      timer = null;
    },
  };
  return { api, config, stats, setHandle: fn => { handle = fn; }, K,
           setTimer: fn => { timer = fn; } };
}

/**
 * The authoritative peer. Runs the simulation at `tickRate` and broadcasts state.
 *
 * @param {object} options
 * @param {(state:object, inputs:Map<string,object>, dtSeconds:number, tick:number)=>void} options.simulate
 *        Mutates `state` in place. Called once per tick. `inputs` maps guest id to
 *        the freshest input received from that guest since the last tick.
 * @param {(state:object)=>object} options.stateFor
 *        Projects the authoritative state into the small object guests may see.
 *        Keep it tiny: this is what has to fit in `maxSnapshotBytes`.
 * @param {object} [options.initialState]
 */
export function createHost(options) {
  const { peer, simulate, stateFor, initialState = {}, onGuestJoin = () => {}, onGuestLeave = () => {} } = options;
  if (typeof simulate !== 'function') throw new NetcodeError('host needs simulate(state, inputs, dt, tick)');
  if (typeof stateFor !== 'function') throw new NetcodeError('host needs stateFor(state)');

  const base = createBase(options);
  const { api, config, stats, setHandle, K: kinds, setTimer } = base;
  const state = options.initialState;
  const guests = new Map();   // id -> { lastInput, lastSeq, seenAt, pending }
  let tick = 0;
  let lastTickAt = now();

  setHandle((data, message) => {
    switch (data.k) {
      case kinds.INPUT: {
        const id = data.id;
        if (typeof id !== 'string' || !id) { stats.malformed++; return; }
        let guest = guests.get(id);
        if (!guest) {
          guest = { lastInput: null, lastSeq: -1, seenAt: now(), dropped: 0, outOfOrder: 0 };
          guests.set(id, guest);
          onGuestJoin(id, guest);
        }
        guest.seenAt = now();
        // Unreliable transport: a stale input arriving late must not overwrite a
        // newer one, or the guest would visibly rubber-band backwards.
        if (Number.isInteger(data.seq) && data.seq <= guest.lastSeq) {
          guest.outOfOrder++;
          return;
        }
        if (guest.pending?.length >= config.inputQueueCap) {
          guest.pending.shift();
          guest.dropped++;
        }
        guest.pending = guest.pending ?? [];
        guest.pending.push({ seq: data.seq, axes: data.axes ?? {}, dt: data.dt ?? 0 });
        guest.lastInput = guest.pending.at(-1);
        guest.lastSeq = guest.lastInput.seq ?? guest.lastSeq;
        return;
      }
      case kinds.EVENT:
        api.onEvent({ kind: 'event', name: data.n, payload: data.p ?? {}, from: data.id ?? null });
        return;
      case kinds.JOIN:
        api.onEvent({ kind: 'join', id: data.id });
        return;
      default:
        stats.malformed++;
    }
  });

  const sendSnapshot = () => {
    const t = now();
    const dt = Math.min(0.25, (t - lastTickAt) / 1000);
    lastTickAt = t;
    tick++;

    const inputs = new Map();
    for (const [id, guest] of guests) {
      // Drain everything queued since the last tick so no input is silently lost;
      // the simulation sees them in arrival order.
      const queue = guest.pending ?? [];
      guest.pending = [];
      if (queue.length) inputs.set(id, { queue, latest: queue.at(-1) });
      // A guest that has been silent for too long is treated as idle, not deleted;
      // the transport's own heartbeat decides when a peer is really gone.
      if (t - guest.seenAt > config.inputQueueCap * 100) {
        guests.delete(id);
        onGuestLeave(id);
        peer.send({ k: kinds.LEAVE, v: NETCODE_VERSION, id });
      }
    }

    simulate(state, inputs, dt, tick);

    const projection = stateFor(state);
    const acks = {};
    for (const [id, guest] of guests) acks[id] = guest.lastSeq;
    const snapshot = { k: kinds.SNAPSHOT, v: NETCODE_VERSION, tick, t: Math.round(t),
                       ack: acks, players: projection };
    // Snapshots go unreliable: a stale one is worthless, and a guest that missed it
    // gets the next in ~33 ms. An oversized snapshot must never be pushed onto the
    // reliable channel, where it would queue behind a map load - so it is dropped
    // and reported. stateFor() is the thing to shrink when that happens.
    const encoded = JSON.stringify(snapshot).length;
    if (encoded > config.maxSnapshotBytes) {
      stats.oversizedSnapshots = (stats.oversizedSnapshots ?? 0) + 1;
      stats.snapshotBytes = encoded;
      api.onError(new NetcodeError(`snapshot is ${encoded} bytes, over the `
        + `${config.maxSnapshotBytes} budget; reduce what stateFor() projects`));
      return;
    }
    stats.snapshotBytes = encoded;
    peer.send(snapshot, { reliable: false });
    stats.ticks = tick;
    stats.guests = guests.size;
    if (peer.framesDropped) stats.snapshotDrops = peer.framesDropped;
  };

  const interval = setInterval(sendSnapshot, Math.round(1000 / config.tickRate));
  interval.unref?.();   // node only: an idle session must not hold the process open
  setTimer(interval);
  api.state = state;
  api.tick = () => tick;
  api.guests = () => [...guests.keys()];
  api.guestStats = id => {
    const guest = guests.get(id);
    return guest ? { lastSeq: guest.lastSeq, outOfOrder: guest.outOfOrder, dropped: guest.dropped } : null;
  };
  // node only: let the process exit while a session is idle.
  api.unref = () => { /* interval handle is internal; tests stop() explicitly */ };
  return api;
}

/**
 * A non-authoritative peer. Predicts locally, interpolates everyone else.
 *
 * @param {object} options
 * @param {string} options.id            this player's id, agreed with the host
 * @param {()=>object} options.readInput  sampled at `inputRate`; must be small
 * @param {(input:object, predicted:object, dtSeconds:number)=>void} options.applyInput
 *        Mutates `predicted` - the local prediction of this player's own state.
 * @param {(render:object, meta:object)=>void} options.onRender
 *        Called every animation frame with the state to draw.
 * @param {(state:object)=>object} [options.initialPredicted]
 */
export function createClient(options) {
  const { peer, id, readInput, applyInput, onRender, initialState = {} } = options;
  if (typeof id !== 'string' || !id) throw new NetcodeError('client needs an id');
  if (typeof readInput !== 'function') throw new NetcodeError('client needs readInput()');
  if (typeof applyInput !== 'function') throw new NetcodeError('client needs applyInput(input, predicted, dt)');

  const base = createBase(options);
  const { api, config, stats, setHandle, K: kinds, setTimer } = base;

  const snapshots = [];              // ascending by host tick
  let clockOffset = null;            // local ms - host ms, smoothed; see below
  let lastAppliedSeq = -1;           // from snapshot.ack[id]
  const unacked = [];                // inputs sent but not yet acknowledged
  let predicted = { ...initialState };
  let inputSeq = 0;
  let lastInputAt = now();
  let correction = null;             // { from, to, startedAt } for smoothing
  let renderState = { ...initialState };

  setHandle(data => {
    switch (data.k) {
      case kinds.SNAPSHOT: {
        const localAt = now();
        const authoritative = data.players?.[id];
        if (snapshots.length && data.tick <= snapshots.at(-1).tick) {
          stats.outOfOrderSnapshots = (stats.outOfOrderSnapshots ?? 0) + 1;
          return;                    // a late duplicate: ignore, never rewind
        }
        snapshots.push({ tick: data.tick, t: data.t, players: data.players ?? {}, ack: data.ack ?? {} });
        if (snapshots.length > config.snapshotBufferCap) snapshots.shift();

        // Snapshot timestamps are the host's performance.now(), which shares no
        // epoch with ours. Estimate the offset as (arrival - half RTT - host time)
        // and smooth it, so interpolation compares like with like on two machines
        // whose clocks differ by anything from milliseconds to minutes.
        const hostTime = Number.isFinite(data.t) ? data.t : localAt;
        const estimate = localAt - (peer.rttMs ?? 0) / 2 - hostTime;
        clockOffset = clockOffset === null ? estimate : clockOffset * 0.9 + estimate * 0.1;
        stats.clockOffsetMs = Math.round(clockOffset);

        const ackedSeq = Number(data.ack?.[id] ?? -1);
        if (Number.isInteger(ackedSeq) && ackedSeq > lastAppliedSeq) {
          lastAppliedSeq = ackedSeq;
          while (unacked.length && unacked[0].seq <= ackedSeq) unacked.shift();
          if (authoritative) reconcile(authoritative);
        }
        stats.lastSnapshotTick = data.tick;
        stats.latencyMs = Math.max(0, Math.round(localAt - clockOffset - hostTime));
        return;
      }
      case kinds.EVENT:
        api.onEvent({ kind: 'event', name: data.n, payload: data.p ?? {}, from: data.id ?? null });
        return;
      case kinds.LEAVE:
        api.onEvent({ kind: 'leave', id: data.id });
        return;
      default:
        stats.malformed++;
    }
  });

  /** Rewind to the host's state for us, then re-run only unacknowledged input. */
  function reconcile(authoritative) {
    const before = { ...predicted };
    predicted = { ...authoritative };
    let dt = 0;
    for (const entry of unacked) {
      applyInput(entry.axes, predicted, entry.dt);
      dt += entry.dt;
    }
    // Only smooth a correction that is actually visible; a sub-pixel difference is
    // not worth a 120 ms blend, and blending every tick would look like lag.
    const distance = Math.hypot((predicted.x ?? 0) - (before.x ?? 0), (predicted.y ?? 0) - (before.y ?? 0));
    if (distance > 0.5) {
      correction = { from: before, to: { ...predicted }, startedAt: now() };
      stats.corrections = (stats.corrections ?? 0) + 1;
      stats.lastCorrectionDistance = distance;
    }
  }

  const sendInput = () => {
    const t = now();
    const dt = Math.min(0.25, (t - lastInputAt) / 1000);
    lastInputAt = t;
    const axes = readInput() ?? {};
    const seq = ++inputSeq;
    const input = { seq, axes, dt };
    unacked.push(input);
    if (unacked.length > config.inputQueueCap) unacked.shift();
    // Predict immediately: this is what makes local movement feel instant.
    applyInput(axes, predicted, dt);
    peer.send({ k: kinds.INPUT, v: NETCODE_VERSION, id, seq, axes, dt }, { reliable: false });
    stats.inputsSent = seq;
    stats.pendingAck = unacked.length;
  };

  /** Interpolate remote players at (now - interpolationMs). */
  function remoteAt(renderTimeMs) {
    if (!snapshots.length) return {};
    let lower = snapshots[0];
    let upper = snapshots.at(-1);
    for (let index = 0; index < snapshots.length - 1; index++) {
      if (snapshots[index].t <= renderTimeMs && snapshots[index + 1].t >= renderTimeMs) {
        lower = snapshots[index];
        upper = snapshots[index + 1];
        break;
      }
    }
    const span = upper.t - lower.t;
    const alpha = span > 0 ? Math.min(1, Math.max(0, (renderTimeMs - lower.t) / span)) : 1;
    const out = {};
    for (const [playerId, upperState] of Object.entries(upper.players)) {
      if (playerId === id) continue;
      const lowerState = lower.players[playerId] ?? upperState;
      out[playerId] = {};
      for (const [key, value] of Object.entries(upperState)) {
        const previous = lowerState[key];
        out[playerId][key] = typeof value === 'number' && typeof previous === 'number'
          ? previous + (value - previous) * alpha
          : value;
      }
    }
    return out;
  }

  const render = () => {
    const t = now();
    let mine = predicted;
    if (correction) {
      const progress = (t - correction.startedAt) / config.snapMs;
      if (progress >= 1) {
        correction = null;
      } else {
        // Smoothstep: no visible velocity discontinuity at either end.
        const ease = progress * progress * (3 - 2 * progress);
        mine = {};
        for (const key of Object.keys(correction.to)) {
          const from = correction.from[key];
          const to = correction.to[key];
          mine[key] = typeof from === 'number' && typeof to === 'number'
            ? from + (to - from) * ease : to;
        }
      }
    }
    const renderHostTime = t - config.interpolationMs - (clockOffset ?? 0);
    renderState = { self: mine, remote: remoteAt(renderHostTime), tick: snapshots.at(-1)?.tick ?? 0 };
    stats.buffered = snapshots.length;
    stats.pending = unacked.length;
    api.onRender(renderState, { rttMs: peer.rttMs, latencyMs: stats.latencyMs ?? 0 });
  };

  const interval = setInterval(() => { sendInput(); render(); }, Math.round(1000 / config.inputRate));
  interval.unref?.();
  setTimer(interval);
  peer.send({ k: kinds.JOIN, v: NETCODE_VERSION, id });
  api.predicted = () => predicted;
  api.buffer = () => snapshots.length;
  api.pendingInputs = () => unacked.length;
  api.renderState = () => renderState;
  return api;
}
