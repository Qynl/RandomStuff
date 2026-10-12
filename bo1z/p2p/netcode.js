/**
 * Host-authoritative netcode for peer-to-peer play, on top of transport.js.
 *
 * Topology is a star: one host, up to three guests (four players). Every guest
 * holds one data-channel connection to the host; guests never talk to each other.
 * That is what keeps the design server-free without asking every machine to
 * upload to every other machine.
 *
 *   host                              guest
 *    |  <-- {k:'in', inputs:[...]} -- |   unreliable, every 1/inputRate s
 *    |  -- {k:'snap', tick, ack,    -> |   unreliable, every 1/tickRate s
 *    |        players:{id:{...}}}      |
 *    |  <==== {k:'ev'} ============> |   reliable, application events
 *
 * Why host-authoritative rather than lockstep or rollback:
 *
 *   - It degrades instead of desyncing. A dropped snapshot costs one frame of
 *     smoothness. In lockstep one dropped packet stalls every peer, and with four
 *     players on four home connections something is always dropping.
 *   - The host cannot disagree with itself, and guests cannot cheat each other:
 *     a guest only ever controls its own avatar, and only through clamped input.
 *
 * Mechanisms:
 *
 *   1. Redundant input. Each input packet carries the last `inputBatch` inputs the
 *      guest has not seen acknowledged, not just the newest one. A single lost
 *      packet is therefore recovered by the next one, which is the cheapest
 *      loss-resilience there is (about 8 x 50 bytes at 60 Hz).
 *   2. In-order input application. The host applies every input it receives, in
 *      sequence, with the same clamped dt the guest used when predicting. Guest
 *      prediction and host authority then run the same arithmetic on the same
 *      inputs, so reconciliation has nothing to correct on a clean link.
 *   3. Adaptive interpolation. Remote players are drawn `interpolationMs` in the
 *      past. That delay follows measured arrival jitter (2 x jitter above a floor
 *      of two tick intervals) instead of a fixed guess, and it changes slowly so
 *      remote players never jump in time.
 *   4. Brief extrapolation. When the newest snapshot is late, remote players keep
 *      moving along their last velocity for up to `maxExtrapolateMs`, then hold.
 *      A short late packet looks like continuous motion rather than a freeze.
 *   5. Client-side prediction and reconciliation for the local avatar, with
 *      corrections smoothed over `snapMs` rather than snapped.
 *
 * The simulation is supplied by the caller, which keeps this file game-agnostic.
 * The contracts are documented on createHost() and createClient() below.
 */

import { ProtocolError } from './protocol.js';

export const NETCODE_VERSION = 1;

const DEFAULTS = Object.freeze({
  tickRate: 30,
  inputRate: 60,
  maxSnapshotBytes: 1100,
  inputQueueCap: 128,
  inputBatch: 8,
  maxGuests: 3,
  /** null = adaptive from measured jitter; a number pins the delay (tests use this). */
  interpolationMs: null,
  maxInterpolationMs: 250,
  maxExtrapolateMs: 100,
  snapMs: 120,
  snapshotBufferCap: 64,
  /** Longest input step the simulation will accept. Bounds what a bad client can do. */
  maxDtSeconds: 0.25,
});

/** Wire kinds. Short keys because snapshots go out 30x/second per guest. */
const K = Object.freeze({ INPUT: 'in', SNAPSHOT: 'snap', EVENT: 'ev', LEAVE: 'leave' });

export class NetcodeError extends Error {
  constructor(message) {
    super(message);
    this.name = 'NetcodeError';
  }
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const clamp = (value, lo, hi) => Math.min(hi, Math.max(lo, value));
const safeDt = (value, max) => (Number.isFinite(value) ? clamp(value, 0, max) : 0);

/**
 * Attach to a Peer's message stream without displacing whoever else uses it.
 * Returns a detach function. Binary frames are passed through untouched.
 */
function attach(peer, handler) {
  if (!peer || typeof peer.send !== 'function') {
    throw new NetcodeError('a connected transport Peer is required');
  }
  const previous = peer.onMessage;
  const wrapped = message => {
    const data = message.data;
    if (!(data && typeof data === 'object') || data instanceof Uint8Array) {
      previous?.(message);
      return;
    }
    handler(data);
  };
  peer.onMessage = wrapped;
  return () => { if (peer.onMessage === wrapped) peer.onMessage = previous; };
}

function validNetcodeMessage(data) {
  return typeof data.k === 'string' && data.v === NETCODE_VERSION;
}

/* ================================================================== host === */

/**
 * The authoritative side. Owns the simulation and broadcasts state to guests.
 *
 * @param {object} options
 * @param {(state:object, inputs:Map<string,{queue:Array,latest:object}>, dtSeconds:number, tick:number)=>void} options.simulate
 *        Mutates `state` in place, once per tick. `inputs` maps guest id to
 *        `queue`, every input received from that guest since the last tick, in
 *        sequence order, and `latest`, the last of them. Each queue entry is
 *        `{seq, axes, dt}`. Apply the queue in order with each entry's own dt for
 *        exact agreement with the guest's prediction; `latest` is for games that
 *        only care about the current input.
 * @param {(state:object)=>object} options.stateFor
 *        Projects authoritative state into what guests may see. Keep it small:
 *        this is what has to fit in `maxSnapshotBytes`.
 * @param {object} [options.initialState]
 * @param {(id:string, guest:object)=>void} [options.onGuestJoin]   spawn the avatar here
 * @param {(id:string, reason:string)=>void} [options.onGuestLeave] remove it here
 * @param {(event:object)=>void} [options.onEvent]                  guest events
 * @param {(error:Error)=>void} [options.onError]
 */
export function createHost(options = {}) {
  const {
    simulate, stateFor, initialState = {},
    onGuestJoin = () => {}, onGuestLeave = () => {},
    onEvent = () => {}, onError = () => {},
    ...rest
  } = options;
  if (typeof simulate !== 'function') throw new NetcodeError('host needs simulate(state, inputs, dt, tick)');
  if (typeof stateFor !== 'function') throw new NetcodeError('host needs stateFor(state)');
  const config = { ...DEFAULTS, ...rest };

  const state = initialState;
  const guests = new Map();     // id -> { id, peer, lastSeq, queue, seenAt, dropped, detach }
  const stats = {
    ticks: 0, guests: 0, received: 0, malformed: 0, events: 0,
    inputsAccepted: 0, inputsDuplicate: 0, inputsDropped: 0,
    snapshotBytes: 0, oversizedSnapshots: 0, framesDropped: 0,
  };
  let tick = 0;
  let lastTickAt = now();
  let stopped = false;

  const report = error => { try { onError(error); } catch { /* a throwing handler must not stop the tick */ } };

  function safeSend(peer, message, reliable = true) {
    if (peer.state !== 'open') return false;
    try {
      peer.send(message, { reliable });
      return true;
    } catch (error) {
      stats.framesDropped++;
      if (reliable) report(error instanceof Error ? error : new Error(String(error)));
      return false;
    }
  }

  function handleGuest(guest, data) {
    stats.received++;
    guest.seenAt = now();
    switch (data.k) {
      case K.INPUT: {
        if (!Array.isArray(data.inputs)) { stats.malformed++; return; }
        for (const entry of data.inputs.slice(-config.inputBatch)) {
          if (!entry || !Number.isInteger(entry.seq)) { stats.malformed++; continue; }
          // Redundant batches overlap, so most entries are already known. Accepting
          // only newer sequence numbers keeps a late packet from rewinding anyone.
          if (entry.seq <= guest.lastSeq) { stats.inputsDuplicate++; continue; }
          if (guest.queue.length >= config.inputQueueCap) {
            guest.queue.shift();
            guest.dropped++;
            stats.inputsDropped++;
          }
          guest.queue.push({ seq: entry.seq, axes: entry.axes ?? {},
                             dt: safeDt(entry.dt, config.maxDtSeconds) });
          guest.lastSeq = entry.seq;
          stats.inputsAccepted++;
        }
        return;
      }
      case K.EVENT:
        if (typeof data.n !== 'string' || !data.n) { stats.malformed++; return; }
        stats.events++;
        // The sender is identified by its connection, never by a field it sends.
        onEvent({ kind: 'event', name: data.n, payload: data.p ?? {}, from: guest.id });
        return;
      default:
        stats.malformed++;
    }
  }

  /**
   * Add a guest on an open connection. Its id is the slot it was invited to, and
   * is trusted only because the host chose it when creating the invite.
   */
  function addGuest(id, peer) {
    if (typeof id !== 'string' || !id) throw new NetcodeError('guest id required');
    if (guests.has(id)) throw new NetcodeError(`guest ${id} is already connected`);
    if (guests.size >= config.maxGuests) {
      throw new NetcodeError(`room is full: ${config.maxGuests} guests is the limit`);
    }
    const guest = { id, peer, lastSeq: -1, queue: [], seenAt: now(), dropped: 0, detach: null };
    guest.detach = attach(peer, data => {
      if (guests.get(id) !== guest) return;   // a stale handler after removal
      if (!validNetcodeMessage(data)) {
        stats.malformed++;
        report(new ProtocolError(`netcode message with unknown shape: ${JSON.stringify(data).slice(0, 80)}`));
        return;
      }
      handleGuest(guest, data);
    });
    guests.set(id, guest);
    peer.closed?.then(() => { if (guests.get(id) === guest) removeGuest(id, 'closed'); });
    onGuestJoin(id, guest);
    return api;
  }

  function removeGuest(id, reason = 'left') {
    const guest = guests.get(id);
    if (!guest) return false;
    guests.delete(id);
    guest.detach?.();
    for (const other of guests.values()) {
      safeSend(other.peer, { k: K.LEAVE, v: NETCODE_VERSION, id });
    }
    onGuestLeave(id, reason);
    return true;
  }

  const sendSnapshot = () => {
    if (stopped) return;
    const t = now();
    const dt = Math.min(config.maxDtSeconds, (t - lastTickAt) / 1000);
    lastTickAt = t;
    tick++;

    const inputs = new Map();
    for (const guest of guests.values()) {
      if (!guest.queue.length) continue;
      inputs.set(guest.id, { queue: guest.queue, latest: guest.queue.at(-1) });
      guest.queue = [];
    }

    try {
      simulate(state, inputs, dt, tick);
    } catch (error) {
      // Report and skip this tick; a bug in the game must not silently freeze the room.
      report(error instanceof Error ? error : new Error(String(error)));
      return;
    }

    const projection = stateFor(state);
    stats.ticks = tick;
    stats.guests = guests.size;

    // Snapshots are unreliable: a stale one is worthless and the next arrives in
    // ~33 ms. An oversized one is dropped and reported rather than pushed onto the
    // reliable channel, where it would queue behind everything else.
    for (const guest of guests.values()) {
      const snapshot = { k: K.SNAPSHOT, v: NETCODE_VERSION, tick, t: Math.round(t),
                         ack: guest.lastSeq, players: projection };
      const encoded = JSON.stringify(snapshot).length;
      if (encoded > config.maxSnapshotBytes) {
        stats.oversizedSnapshots++;
        stats.snapshotBytes = encoded;
        report(new NetcodeError(`snapshot is ${encoded} bytes, over the `
          + `${config.maxSnapshotBytes} budget; reduce what stateFor() projects`));
        continue;
      }
      stats.snapshotBytes = encoded;
      safeSend(guest.peer, snapshot, false);
    }
    stats.framesDropped = [...guests.values()].reduce((sum, g) => sum + g.peer.framesDropped, 0);
  };

  const interval = setInterval(sendSnapshot, Math.round(1000 / config.tickRate));
  interval.unref?.();   // node only: an idle room must not hold the process open

  const api = {
    state, config, stats,
    addGuest, removeGuest,
    tick: () => tick,
    guests: () => [...guests.keys()],
    guestStats(id) {
      const guest = guests.get(id);
      return guest ? { lastSeq: guest.lastSeq, dropped: guest.dropped, queued: guest.queue.length,
                       rttMs: guest.peer.rttMs } : null;
    },
    /** Reliable event to every guest. */
    emit(name, payload = {}) {
      if (typeof name !== 'string' || !name) throw new NetcodeError('event name required');
      for (const guest of guests.values()) {
        safeSend(guest.peer, { k: K.EVENT, v: NETCODE_VERSION, n: name, p: payload });
      }
      stats.events++;
    },
    /** Reliable event to one guest. */
    emitTo(id, name, payload = {}) {
      const guest = guests.get(id);
      if (!guest) return false;
      return safeSend(guest.peer, { k: K.EVENT, v: NETCODE_VERSION, n: name, p: payload });
    },
    stop() {
      stopped = true;
      clearInterval(interval);
      for (const id of [...guests.keys()]) removeGuest(id, 'stopped');
    },
  };
  return api;
}

/* ================================================================== guest == */

/**
 * A non-authoritative peer. Predicts its own avatar and interpolates the others.
 *
 * @param {object} options
 * @param {import('./transport.js').Peer} options.peer
 * @param {string} [options.id]          defaults to the slot the host invited us to
 * @param {()=>object} options.readInput  sampled at `inputRate`; keep it small
 * @param {(axes:object, predicted:object, dtSeconds:number)=>void} options.applyInput
 *        Mutates `predicted`. THIS MUST BE THE SAME FUNCTION THE HOST USES inside
 *        simulate(), or prediction and authority will disagree. Clamp `axes` here.
 * @param {(render:object, meta:object)=>void} options.onRender  every animation frame
 * @param {object} [options.initialState]
 */
export function createClient(options = {}) {
  const {
    peer, readInput, applyInput, onRender = () => {}, onEvent = () => {}, onError = () => {},
    initialState = {}, ...rest
  } = options;
  const id = options.id ?? peer?.label;
  if (typeof id !== 'string' || !id) throw new NetcodeError('client needs an id (or a peer with a slot label)');
  if (typeof readInput !== 'function') throw new NetcodeError('client needs readInput()');
  if (typeof applyInput !== 'function') throw new NetcodeError('client needs applyInput(axes, predicted, dt)');
  const config = { ...DEFAULTS, ...rest };
  const minInterp = config.minInterpolationMs ?? (2000 / config.tickRate);

  const stats = {
    received: 0, malformed: 0, events: 0, outOfOrderSnapshots: 0,
    inputsSent: 0, pendingAck: 0, buffered: 0, corrections: 0,
    clockOffsetMs: 0, latencyMs: 0, jitterMs: 0, interpMs: 0,
    snapshotLossPct: 0, lastSnapshotTick: -1, lastCorrectionDistance: 0,
  };
  const report = error => { try { onError(error); } catch { /* keep running */ } };

  const snapshots = [];              // ascending by host tick
  let clockOffset = null;            // local ms - host ms, smoothed
  let lastArrival = null;            // { local, host } of the previous snapshot
  let jitterMs = 0;
  let lossEwma = 0;
  let lastTick = null;
  let lastAppliedSeq = -1;           // from snapshot.ack
  const unacked = [];                // inputs sent but not yet acknowledged
  let predicted = { ...initialState };
  let inputSeq = 0;
  let lastInputAt = now();
  let correction = null;             // { from, to, startedAt }
  let interpMs = config.interpolationMs ?? minInterp;
  let renderState = { self: { ...initialState }, remote: {}, tick: 0 };

  function reconcile(authoritative) {
    const before = { ...predicted };
    predicted = { ...authoritative };
    for (const entry of unacked) applyInput(entry.axes, predicted, entry.dt);
    // Only smooth a correction that is actually visible. Blending sub-pixel
    // differences every tick would itself look like lag.
    const distance = Math.hypot((predicted.x ?? 0) - (before.x ?? 0), (predicted.y ?? 0) - (before.y ?? 0));
    if (distance > 0.5) {
      correction = { from: before, to: { ...predicted }, startedAt: now() };
      stats.corrections++;
      stats.lastCorrectionDistance = Math.round(distance * 100) / 100;
    }
  }

  const detach = attach(peer, data => {
    if (!validNetcodeMessage(data)) {
      stats.malformed++;
      report(new ProtocolError(`netcode message with unknown shape: ${JSON.stringify(data).slice(0, 80)}`));
      return;
    }
    stats.received++;
    switch (data.k) {
      case K.SNAPSHOT: {
        const localAt = now();
        if (typeof data.tick !== 'number' || !Number.isFinite(data.t)) { stats.malformed++; return; }
        if (snapshots.length && data.tick <= snapshots.at(-1).tick) {
          stats.outOfOrderSnapshots++;
          return;                    // a late duplicate: ignore, never rewind
        }
        const hostTime = data.t;

        // Loss estimate: how many ticks did the host send that we never saw?
        if (lastTick !== null) {
          const missing = Math.max(0, data.tick - lastTick - 1);
          lossEwma += ((missing / (missing + 1)) - lossEwma) * 0.05;
        }
        lastTick = data.tick;

        // Jitter: how far each arrival strays from the spacing the host sent.
        if (lastArrival) {
          const deviation = Math.abs((localAt - lastArrival.local) - (hostTime - lastArrival.host));
          jitterMs += (deviation - jitterMs) / 16;
        }
        lastArrival = { local: localAt, host: hostTime };

        snapshots.push({ tick: data.tick, t: hostTime, players: data.players ?? {} });
        if (snapshots.length > config.snapshotBufferCap) snapshots.shift();

        // Snapshot timestamps are the host's performance.now(), which shares no
        // epoch with ours. Estimate the offset as arrival - half RTT - host time.
        const estimate = localAt - (peer.rttMs ?? 0) / 2 - hostTime;
        clockOffset = clockOffset === null ? estimate : clockOffset * 0.9 + estimate * 0.1;

        const ackedSeq = Number.isInteger(data.ack) ? data.ack : -1;
        if (ackedSeq > lastAppliedSeq) {
          lastAppliedSeq = ackedSeq;
          while (unacked.length && unacked[0].seq <= ackedSeq) unacked.shift();
          const authoritative = data.players?.[id];
          if (authoritative) reconcile(authoritative);
        }
        stats.lastSnapshotTick = data.tick;
        stats.latencyMs = Math.max(0, Math.round(localAt - clockOffset - hostTime));
        return;
      }
      case K.EVENT:
        stats.events++;
        onEvent({ kind: 'event', name: data.n, payload: data.p ?? {}, from: 'host' });
        return;
      case K.LEAVE:
        onEvent({ kind: 'leave', id: data.id });
        return;
      default:
        stats.malformed++;
    }
  });

  const sendInput = () => {
    if (peer.state !== 'open') return;
    const t = now();
    const dt = safeDt((t - lastInputAt) / 1000, config.maxDtSeconds);
    lastInputAt = t;
    const axes = readInput() ?? {};
    const seq = ++inputSeq;
    unacked.push({ seq, axes, dt });
    if (unacked.length > config.inputQueueCap) unacked.shift();
    // Predict immediately: this is what makes local movement feel instant.
    applyInput(axes, predicted, dt);
    // Send the whole unacknowledged tail, not just this input. Losing one packet
    // then costs nothing, because the next one repeats what it carried.
    const batch = unacked.slice(-config.inputBatch);
    try {
      peer.send({ k: K.INPUT, v: NETCODE_VERSION, inputs: batch }, { reliable: false });
    } catch (error) {
      report(error instanceof Error ? error : new Error(String(error)));
    }
    stats.inputsSent = seq;
    stats.pendingAck = unacked.length;
  };

  /**
   * Remote players, drawn `interpMs` in the past. Interpolates between the two
   * snapshots that bracket the render time; if the render time is past the newest
   * snapshot, extrapolates along the last two for at most maxExtrapolateMs.
   */
  function remoteAt(renderTimeMs) {
    const n = snapshots.length;
    if (!n) return {};
    let lower;
    let upper;
    if (renderTimeMs >= snapshots[n - 1].t) {
      lower = snapshots[Math.max(0, n - 2)];
      upper = snapshots[n - 1];
    } else {
      lower = snapshots[0];
      upper = snapshots[Math.min(1, n - 1)];
      for (let index = 0; index < n - 1; index++) {
        if (snapshots[index].t <= renderTimeMs && snapshots[index + 1].t >= renderTimeMs) {
          lower = snapshots[index];
          upper = snapshots[index + 1];
          break;
        }
      }
    }
    const span = upper.t - lower.t;
    let alpha = 0;
    if (span > 0) {
      alpha = (renderTimeMs - lower.t) / span;
      alpha = clamp(alpha, 0, 1 + config.maxExtrapolateMs / span);
    }
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
        // Smoothstep: no velocity discontinuity at either end of the blend.
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

    // Adaptive delay: enough buffer to ride out this link's jitter, no more.
    const target = config.interpolationMs
      ?? clamp(minInterp + 2 * jitterMs, minInterp, config.maxInterpolationMs);
    interpMs += (target - interpMs) * 0.1;      // ease, so remote players never jump in time

    const renderHostTime = t - interpMs - (clockOffset ?? 0);
    renderState = { self: mine, remote: remoteAt(renderHostTime), tick: snapshots.at(-1)?.tick ?? 0 };

    stats.buffered = snapshots.length;
    stats.pendingAck = unacked.length;
    stats.jitterMs = Math.round(jitterMs * 10) / 10;
    stats.interpMs = Math.round(interpMs);
    stats.clockOffsetMs = Math.round(clockOffset ?? 0);
    stats.snapshotLossPct = Math.round(lossEwma * 1000) / 10;
    onRender(renderState, { rttMs: peer.rttMs, latencyMs: stats.latencyMs ?? 0 });
  };

  const interval = setInterval(() => { sendInput(); render(); }, Math.round(1000 / config.inputRate));
  interval.unref?.();

  const api = {
    id, config, stats,
    get rttMs() { return peer.rttMs; },
    /** Reliable application event to the host. */
    emit(name, payload = {}) {
      if (typeof name !== 'string' || !name) throw new NetcodeError('event name required');
      peer.send({ k: K.EVENT, v: NETCODE_VERSION, n: name, p: payload });
      stats.events++;
    },
    onEvent, onRender,
    predicted: () => predicted,
    buffer: () => snapshots.length,
    pendingInputs: () => unacked.length,
    renderState: () => renderState,
    stop() {
      clearInterval(interval);
      detach();
    },
  };
  return api;
}

export { DEFAULTS as NETCODE_DEFAULTS };
