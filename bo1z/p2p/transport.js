/**
 * Serverless peer transport: WebRTC DataChannels with manual (copy-paste) signaling.
 *
 * There is no lobby server, no matchmaking service, no relay and no backend of any
 * kind in the default configuration. Two peers each produce one opaque blob and
 * hand it to the other through whatever channel they already have - a DM, a paste
 * site, a QR code. That exchange is the rendezvous *and* the authentication.
 *
 *   host:  const host = new Peer({ role: 'host' });
 *          const offer = await host.createOffer();      // -> blob, send it to guest
 *   guest: const guest = new Peer({ role: 'guest' });
 *          const answer = await guest.acceptOffer(offer); // -> blob, send it back
 *   host:  await host.acceptAnswer(answer);
 *   both:  await peer.ready;  peer.sendJSON({ hello: 'world' });
 *
 * NAT traversal is the one honest asterisk on "no server", and it is a knob:
 *
 *   iceServers: []           default. Zero third-party infrastructure. Works when
 *                            both peers can reach each other directly - same
 *                            machine, same LAN, or a port-forwarded host.
 *   iceServers: ['stun:…']   opt-in. A STUN server only tells a peer its own
 *                            public address; no game data flows through it. Needed
 *                            for two players on different home networks.
 *   turns:…                  needed only when both sides sit behind symmetric NAT.
 *                            This is where "serverless" genuinely ends, and it is
 *                            why the vel.gg preservation project's own capability
 *                            table still lists forced TURN as unfinished.
 *
 * The same file runs in a browser and in node (via node-datachannel), which is what
 * makes test/run-tests.mjs able to open two real peers and actually connect them.
 */

import {
  MSG, PROTOCOL_VERSION, ProtocolError, chunkPayload, createReassembler, decodeBlob,
  decodeFrame, encodeBlob, encodeFrame, msgName, randomRoomCode, sdpFingerprint, utf8,
} from './protocol.js';

const isNode = typeof process !== 'undefined' && !!process.versions?.node;

/** Channel labels are part of the wire contract; both sides must agree. */
export const RELIABLE_LABEL = 'bo1z-rel';
export const UNRELIABLE_LABEL = 'bo1z-unrel';

export const STATE = Object.freeze({
  NEW: 'new', SIGNALING: 'signaling', CONNECTING: 'connecting', OPEN: 'open',
  CLOSING: 'closing', CLOSED: 'closed', FAILED: 'failed',
});

const DEFAULTS = Object.freeze({
  iceServers: [],
  heartbeatMs: 1000,
  timeoutMs: 8000,
  connectTimeoutMs: 30000,
  /** Grace period for a BYE to flush before the sockets are closed. */
  byeGraceMs: 150,
  /** How long to wait for ICE gathering before using whatever was found. */
  gatherTimeoutMs: 5000,
  maxUnreliableBytes: 1200,
  /**
   * node only: the local address libdatachannel binds for ICE. Browsers have no
   * equivalent - they enumerate interfaces themselves. Useful for pinning play to
   * one interface, and necessary in containers where interface enumeration yields
   * no candidate libdatachannel is willing to advertise (link-local or unusual
   * addresses). Leave unset for normal use.
   */
  bindAddress: null,
});

async function loadBackend() {
  if (!isNode) return null;
  const module = await import('node-datachannel');
  const api = module.default ?? module;
  // node-datachannel names the class PeerConnection; the browser global and other
  // shims name it RTCPeerConnection. Accept either.
  const Ctor = api.RTCPeerConnection ?? api.PeerConnection;
  if (typeof Ctor !== 'function') {
    throw new ProtocolError('node-datachannel exposes no PeerConnection class');
  }
  // libdatachannel's constructor is (name, configuration); the browser's is
  // (configuration). _init() supplies the name.
  return { Ctor, cleanup: api.cleanup };
}

/** node only: release libdatachannel's threads so the process can exit. */
export async function releaseBackend() {
  const backend = await loadBackend();
  backend?.cleanup?.();
}

const ICE_URL = /^(stun|stuns|turn|turns):[A-Za-z0-9.-]+(:\d{1,5})?$/;

/** Canonical form: { urls, username?, password? }. Accepts strings or either
 *  backend's object shape, and rejects anything that is not a STUN/TURN URL. */
function normalizeIceServers(iceServers) {
  return (iceServers ?? []).map(entry => {
    const urls = typeof entry === 'string' ? entry
      : typeof entry?.urls === 'string' ? entry.urls
      : Array.isArray(entry?.urls) ? entry.urls[0]
      : entry?.hostname ? `${entry.relayType ?? 'stun'}:${entry.hostname}:${entry.port ?? 3478}`
      : null;
    if (!urls || !ICE_URL.test(urls)) {
      throw new ProtocolError(`iceServers entries must be stun:/turns: URLs, got ${JSON.stringify(entry)}`);
    }
    return { urls, username: entry?.username, password: entry?.password };
  });
}

/** Browsers take {urls}; libdatachannel takes the URL string, or an object when
 *  a TURN credential has to travel with it. */
function backendIceServers(servers, forNode) {
  return servers.map(entry => {
    if (!forNode) return { urls: entry.urls, username: entry.username, password: entry.password };
    if (!entry.username) return entry.urls;
    const [scheme, rest] = entry.urls.split(':');
    const [hostname, port] = rest.split(':');
    return { hostname, port: Number(port ?? 3478), username: entry.username,
             password: entry.password, relayType: scheme.startsWith('turn') ? 'turn' : undefined };
  });
}

function copyIfNeeded(bytes) {
  // A subarray view can be misread by native backends that look at the whole
  // underlying buffer, so hand them a dense copy instead.
  if (bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength) return bytes;
  return Uint8Array.from(bytes);
}

export class Peer {
  /**
   * @param {object} options
   * @param {'host'|'guest'} options.role  who creates the offer
   * @param {string} [options.room]        session label; mismatched blobs are refused
   * @param {string} [options.label]       slot name, e.g. 'p2'. The host sets it per
   *                                       invite; the guest adopts it from the offer, so a
   *                                       guest cannot end up in the wrong slot.
   * @param {string[]|object[]} [options.iceServers]  see the NAT note above
   * @param {(message:{type:string,data:Uint8Array|object,reliable:boolean,peer:Peer})=>void} [options.onMessage]
   * @param {(state:string, detail?:object)=>void} [options.onState]
   * @param {(rttMs:number)=>void} [options.onRtt]
   * @param {(error:Error)=>void} [options.onError]
   */
  constructor(options = {}) {
    const { role, room, label, onMessage, onState, onRtt, onError, ...rest } = options;
    if (role !== 'host' && role !== 'guest') throw new ProtocolError("role must be 'host' or 'guest'");
    if (label !== undefined && label !== null && (typeof label !== 'string' || !/^[A-Za-z0-9_-]{1,16}$/.test(label))) {
      throw new ProtocolError('label must be 1-16 letters, digits, _ or -');
    }
    this.role = role;
    this.room = room ?? randomRoomCode();
    this.label = label ?? null;
    this.config = { ...DEFAULTS, ...rest, iceServers: normalizeIceServers(rest.iceServers) };
    this.state = STATE.NEW;
    this.rttMs = null;
    this.bytesSent = 0;
    this.bytesReceived = 0;
    this.framesSent = 0;
    this.framesDropped = 0;

    this.onMessage = onMessage ?? (() => {});
    this.onState = onState ?? (() => {});
    this.onRtt = onRtt ?? (() => {});
    this.onError = onError ?? (error => { throw error; });

    this.nonce = randomRoomCode(); // per-session salt, echoed in HELLO/WELCOME
    this._pc = null;
    this._channels = new Map();
    this._reassembler = createReassembler();
    this._pingSeq = new Map();
    this._seq = 0;
    this._msgId = 0;
    this._heartbeat = null;
    this._lastSeen = 0;
    this._lastPingAt = 0;
    this._closed = false;
    this._remoteFingerprint = null;

    this.ready = new Promise((resolve, reject) => {
      this._resolveReady = resolve;
      this._rejectReady = reject;
    });
    // An unhandled ready rejection would surface as an uncaught promise error in
    // node even when the caller handles it elsewhere, so keep a no-op branch.
    this.ready.catch(() => {});
    this.closed = new Promise(resolve => { this._resolveClosed = resolve; });
    /** Resolves once HELLO/WELCOME has been exchanged and the room verified. */
    this.hello = new Promise((resolve, reject) => {
      this._resolveHello = resolve;
      this._rejectHello = reject;
    });
    this.hello.catch(() => {});
  }

  /* ----------------------------------------------------------- signalling */

  async createOffer() {
    if (this.role !== 'host') throw new ProtocolError('only the host creates an offer');
    await this._init();
    const description = await this._createDescription('offer');
    return this._finishLocalDescription(description);
  }

  async acceptOffer(offerBlob) {
    if (this.role !== 'guest') throw new ProtocolError('only the guest accepts an offer');
    const offer = decodeBlob(offerBlob, { expectRoom: this.room, expectKind: 'offer' });
    if (offer.label) this.label = offer.label;          // adopt the slot the host invited us to
    await this._init();
    this._remoteFingerprint = sdpFingerprint(offer.sdp);
    await this._setRemote({ type: 'offer', sdp: offer.sdp });
    const description = await this._createDescription('answer');
    return this._finishLocalDescription(description);
  }

  async acceptAnswer(answerBlob) {
    if (this.role !== 'host') throw new ProtocolError('only the host accepts an answer');
    const answer = decodeBlob(answerBlob, { expectRoom: this.room, expectKind: 'answer' });
    if (this.label !== null && answer.label !== this.label) {
      throw new ProtocolError(`that answer is for slot ${JSON.stringify(answer.label)}, `
        + `but this invite is for slot ${JSON.stringify(this.label)}`);
    }
    this._remoteFingerprint = sdpFingerprint(answer.sdp);
    await this._setRemote({ type: 'answer', sdp: answer.sdp });
    return this.fingerprint;
  }

  _finishLocalDescription(description) {
    const sdp = description.sdp;
    this.fingerprint = sdpFingerprint(sdp);
    this._localDescription = description;
    this._setState(STATE.SIGNALING);
    return encodeBlob({ kind: description.type, sdp, room: this.room,
                        nonce: this.nonce, label: this.label });
  }

  /* ------------------------------------------------------------ lifecycle */

  async _init() {
    if (this._pc) return;
    const backend = await loadBackend();
    this._backend = backend;
    const servers = backendIceServers(this.config.iceServers, !!backend);
    // libdatachannel negotiates automatically unless told otherwise, which collides
    // with manual signaling: it would answer the remote offer itself and then reject
    // our explicit setLocalDescription('answer'). Browsers are already explicit.
    const config = { iceServers: servers, ...(backend ? { disableAutoNegotiation: true } : {}) };
    if (backend && this.config.bindAddress) config.bindAddress = this.config.bindAddress;
    this._pc = backend
      ? new backend.Ctor(`bo1z-${this.role}-${this.room}-${this.nonce}`, config)
      : new RTCPeerConnection(config);

    if (backend) {
      this._pc.onStateChange(state => this._onConnectionState(String(state).toLowerCase()));
      this._pc.onDataChannel(channel => this._adoptChannel(channel, true));
      this._pc.onError?.(error => this._fail(new Error(`peer connection: ${error}`)));
    } else {
      this._pc.addEventListener('connectionstatechange',
        () => this._onConnectionState(this._pc.connectionState));
      this._pc.addEventListener('iceconnectionstatechange', () => {
        if (this._pc.iceConnectionState === 'failed') {
          this._fail(new Error('ICE failed: no route between peers. '
            + 'On two different networks, add a STUN server (see the NAT note in transport.js).'));
        }
      });
      this._pc.addEventListener('datachannel', event => this._adoptChannel(event.channel, true));
    }

    if (this.role === 'host') {
      // The host owns both channels; the guest receives them. The two backends
      // spell "unordered and not retransmitted" differently.
      this._adoptChannel(this._createDataChannel(RELIABLE_LABEL,
        this._backend ? {} : { ordered: true }), false);
      this._adoptChannel(this._createDataChannel(UNRELIABLE_LABEL,
        this._backend ? { unordered: true, maxRetransmits: 0 }
                      : { ordered: false, maxRetransmits: 0 }), false);
    }
    this._setState(STATE.CONNECTING);
  }

  _createDataChannel(label, options) {
    return this._backend
      ? this._pc.createDataChannel(label, options)
      : this._pc.createDataChannel(label, options);
  }

  async _createDescription(kind) {
    if (this._backend) {
      // libdatachannel has no createOffer/createAnswer. setLocalDescription(kind)
      // starts gathering; onLocalDescription fires as soon as the description
      // exists, which is *before* candidates are in it, so the SDP has to be
      // re-read once gathering reports complete. Callbacks first, then negotiate.
      const gathered = new Promise((resolve, reject) => {
        const finish = () => {
          clearTimeout(timer);
          try {
            const description = this._pc.localDescription();
            if (!description?.sdp) throw new ProtocolError('backend produced no local description');
            resolve({ sdp: description.sdp,
                      type: description.type === 'unspec' ? kind : description.type });
          } catch (error) {
            reject(error);
          }
        };
        const timer = setTimeout(finish, this.config.gatherTimeoutMs);
        this._pc.onGatheringStateChange(state => {
          if (String(state).toLowerCase() === 'complete') finish();
        });
      });
      this._pc.setLocalDescription(kind);
      const description = await gathered;
      if (!/a=candidate:/m.test(description.sdp)) {
        throw new ProtocolError(
          'ICE gathered no candidates, so there is nothing for the peer to connect to. '
          + 'Causes: no usable network interface, or an environment whose addresses the '
          + 'ICE stack will not advertise (link-local/container ranges). Fixes: set '
          + 'bindAddress to a real local address, add a STUN server to iceServers for '
          + 'cross-network play, or run both peers on the same reachable network.');
      }
      return description;
    }
    const description = await (kind === 'offer' ? this._pc.createOffer() : this._pc.createAnswer());
    await this._pc.setLocalDescription(description);
    return { type: kind, sdp: (await this._awaitGathering()).sdp };
  }

  _awaitGathering() {
    if (this._pc.iceGatheringState === 'complete') {
      return Promise.resolve(this._pc.localDescription);
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        // Some environments never fire 'complete' on a host-candidate-only gather;
        // what has been gathered by now is enough to connect on a LAN.
        resolve(this._pc.localDescription);
      }, 2000);
      this._pc.addEventListener('icegatheringstatechange', () => {
        if (this._pc.iceGatheringState === 'complete') {
          clearTimeout(timer);
          resolve(this._pc.localDescription);
        }
      });
    });
  }

  async _setRemote(description) {
    // libdatachannel's signature is (sdp, type); the browser takes the object.
    if (this._backend) this._pc.setRemoteDescription(description.sdp, description.type);
    else await this._pc.setRemoteDescription(description);
  }

  _adoptChannel(channel, remote) {
    const label = this._backend ? channel.getLabel() : channel.label;
    if (label !== RELIABLE_LABEL && label !== UNRELIABLE_LABEL) {
      // An unexpected channel is either a version mismatch or something unwanted;
      // refuse it rather than reading from it.
      channel.close?.();
      this._fail(new ProtocolError(`peer opened an unknown data channel ${JSON.stringify(label)}`));
      return;
    }
    if (this._channels.has(label)) return;
    if (!this._backend) channel.binaryType = 'arraybuffer';
    this._channels.set(label, channel);

    const onOpen = () => {
      if (label === RELIABLE_LABEL) this._onReliableOpen();
    };
    const onMessage = raw => {
      // node: Buffer (binary) or string (text). Browser: ArrayBuffer, because
      // binaryType is set above. Anything textual is a protocol violation.
      if (typeof raw === 'string') {
        this._report(new ProtocolError(`peer sent a text frame on ${label}; this protocol is binary`));
        return;
      }
      const bytes = raw instanceof Uint8Array ? raw : new Uint8Array(raw);
      this._onFrame(label, bytes);
    };
    const onClose = () => this._onChannelClosed(label);

    if (this._backend) {
      channel.onOpen(onOpen);
      channel.onMessage(message => onMessage(message));
      channel.onClosed?.(onClose);
      channel.onError?.(error => this._fail(new Error(`channel ${label}: ${error}`)));
      if (channel.isOpen?.()) onOpen();
    } else {
      channel.addEventListener('open', onOpen);
      channel.addEventListener('message', event => onMessage(event.data ?? event));
      channel.addEventListener('close', onClose);
      channel.addEventListener('error', error => this._fail(new Error(`channel ${label}: ${error}`)));
      if (channel.readyState === 'open') onOpen();
    }
    if (remote) this._remoteOpened = (this._remoteOpened ?? 0) + 1;
  }

  _onReliableOpen() {
    if (this.state === STATE.OPEN) return;
    this._setState(STATE.OPEN);
    this._lastSeen = Date.now();
    this._sendControl(MSG.HELLO, {
      role: this.role, room: this.room, nonce: this.nonce, version: PROTOCOL_VERSION,
    });
    this._heartbeat = setInterval(() => this._tick(), this.config.heartbeatMs);
    if (typeof this._heartbeat.unref === 'function') this._heartbeat.unref();
    this._resolveReady(this);
  }

  _onChannelClosed(label) {
    this._channels.delete(label);
    if (label === RELIABLE_LABEL && !this._closed) {
      this._fail(new Error('the reliable channel closed unexpectedly'));
    }
  }

  _onConnectionState(state) {
    if (state === 'failed') {
      this._fail(new Error('peer connection failed (ICE/DTLS). Check NAT settings.'));
    } else if (state === 'closed' || state === 'disconnected') {
      if (!this._closed && this.state === STATE.OPEN) {
        // Give the heartbeat a chance to recover before declaring the peer gone.
        this._setState(STATE.CONNECTING, { reason: state });
      }
    }
  }

  /* ---------------------------------------------------------------- frames */

  _nextSeq() {
    this._seq = (this._seq + 1) >>> 0;
    return this._seq;
  }

  _transmit(label, frame) {
    const channel = this._channels.get(label);
    if (!channel) return false;
    const open = this._backend ? channel.isOpen?.() : channel.readyState === 'open';
    if (!open) return false;
    const bytes = copyIfNeeded(frame);
    try {
      // libdatachannel splits text and binary sends; this protocol is binary only.
      // Both return false when the send buffer refused the frame.
      const sent = this._backend ? channel.sendMessageBinary(bytes) : (channel.send(bytes), true);
      if (!sent) {
        this.framesDropped++;
        if (label === UNRELIABLE_LABEL) return false;
        this._fail(new Error(`the reliable channel refused a ${bytes.length}-byte frame`));
        return false;
      }
    } catch (error) {
      // An unreliable channel legitimately fails when the send buffer is full;
      // that is a dropped frame, not a dead peer.
      if (label === UNRELIABLE_LABEL) {
        this.framesDropped++;
        return false;
      }
      this._fail(error instanceof Error ? error : new Error(String(error)));
      return false;
    }
    this.framesSent++;
    this.bytesSent += bytes.length;
    return true;
  }

  _sendControl(type, object) {
    const payload = utf8.encode(JSON.stringify(object ?? {}));
    return this._transmit(RELIABLE_LABEL, encodeFrame({ type, seq: this._nextSeq(), payload }));
  }

  /**
   * Send application data. JSON-serialisable objects and Uint8Array are both
   * accepted; anything larger than one frame is chunked automatically on the
   * reliable channel. Unreliable sends are never chunked - a frame that will not
   * fit is refused, because a fragmented unreliable message cannot be reassembled
   * by a peer that may be dropping packets.
   */
  send(data, { reliable = true } = {}) {
    if (this.state !== STATE.OPEN) throw new ProtocolError(`cannot send in state ${this.state}`);
    const payload = data instanceof Uint8Array ? copyIfNeeded(data)
      : utf8.encode(JSON.stringify({ json: data }));
    if (!reliable) {
      if (payload.length > this.config.maxUnreliableBytes) {
        throw new ProtocolError(`unreliable payload of ${payload.length} bytes exceeds `
          + `${this.config.maxUnreliableBytes}; use the reliable channel`);
      }
      return this._transmit(UNRELIABLE_LABEL,
        encodeFrame({ type: MSG.APP, seq: this._nextSeq(), payload }));
    }
    const frames = chunkPayload(payload, { seq: this._nextSeq(), msgId: ++this._msgId });
    for (const frame of frames) {
      if (!this._transmit(RELIABLE_LABEL, frame)) return false;
    }
    return true;
  }

  sendJSON(object, options) {
    return this.send(object, options);
  }

  _onFrame(label, bytes) {
    this.bytesReceived += bytes.length;
    this._lastSeen = Date.now();
    let frame;
    try {
      frame = decodeFrame(bytes);
    } catch (error) {
      this.framesDropped++;
      this._report(error);
      return;
    }

    switch (frame.type) {
      case MSG.PING: {
        const view = new DataView(frame.payload.buffer, frame.payload.byteOffset, frame.payload.byteLength);
        this._sendControl(MSG.PONG, { echo: frame.seq, sentAt: view.getBigUint64(0).toString() });
        return;
      }
      case MSG.PONG: {
        // The echoed ping sequence travels in the body; the frame's own seq is new.
        let echo = null;
        try {
          echo = JSON.parse(utf8.decode(frame.payload)).echo;
        } catch {
          return;
        }
        if (this._pingSeq.has(echo)) {
          const sentAt = this._pingSeq.get(echo);
          this._pingSeq.delete(echo);
          this.rttMs = Date.now() - sentAt;
          this.onRtt(this.rttMs);
        }
        return;
      }
      case MSG.HELLO:
      case MSG.WELCOME: {
        this._onHandshake(frame);
        return;
      }
      case MSG.BYE:
        this.close({ remote: true });
        return;
      default:
        break;
    }

    if (frame.type !== MSG.APP) {
      this._report(new ProtocolError(`unexpected frame ${msgName(frame.type)} on ${label}`));
      return;
    }
    let message;
    try {
      message = this._reassembler.push(frame);
    } catch (error) {
      this._report(error);
      return;
    }
    if (!message) return;

    const raw = message.payload;
    let data = raw;
    // A JSON payload is wrapped as {"json": …} by send(); anything else is binary.
    if (raw.length > 1 && raw[0] === 0x7b) {
      try {
        const parsed = JSON.parse(utf8.decode(raw));
        if (parsed && typeof parsed === 'object' && 'json' in parsed) data = parsed.json;
      } catch {
        /* not JSON after all - deliver the bytes as received */
      }
    }
    this.onMessage({ type: 'app', data, reliable: label === RELIABLE_LABEL, peer: this });
  }

  _onHandshake(frame) {
    let hello;
    try {
      hello = JSON.parse(utf8.decode(frame.payload));
    } catch (error) {
      this._fail(new ProtocolError(`unreadable handshake: ${error.message}`));
      return;
    }
    if (hello.version !== PROTOCOL_VERSION) {
      this._fail(new ProtocolError(`peer speaks protocol ${hello.version}, we speak ${PROTOCOL_VERSION}`));
      return;
    }
    if (hello.room !== this.room) {
      this._fail(new ProtocolError(`peer is in room ${JSON.stringify(hello.room)}, `
        + `this session is ${JSON.stringify(this.room)}`));
      return;
    }
    this.peerRole = hello.role;
    this.peerNonce = hello.nonce;
    this._resolveHello?.(this);
    if (frame.type === MSG.HELLO && this.role === 'host') {
      this._sendControl(MSG.WELCOME, { role: this.role, room: this.room, nonce: this.nonce,
                                      version: PROTOCOL_VERSION });
    }
  }

  _tick() {
    if (this._closed) return;
    const now = Date.now();
    if (now - this._lastSeen > this.config.timeoutMs) {
      this._fail(new Error(`peer silent for ${now - this._lastSeen} ms; treating it as gone`));
      return;
    }
    const seq = this._nextSeq();
    this._pingSeq.set(seq, now);
    if (this._pingSeq.size > 32) {
      const oldest = this._pingSeq.keys().next().value;
      this._pingSeq.delete(oldest);
    }
    const payload = new Uint8Array(8);
    new DataView(payload.buffer).setBigUint64(0, BigInt(now));
    this._transmit(RELIABLE_LABEL, encodeFrame({ type: MSG.PING, seq, payload }));
    this._lastPingAt = now;
  }

  /* ----------------------------------------------------------------- close */

  _setState(state, detail) {
    if (this.state === state) return;
    this.state = state;
    try {
      this.onState(state, detail);
    } catch (error) {
      this._report(error);
    }
  }

  _report(error) {
    try {
      this.onError(error);
    } catch {
      /* a throwing error handler must not take the peer down */
    }
  }

  _fail(error) {
    if (this._closed) return;
    this._closed = true;
    this._setState(STATE.FAILED, { message: error.message });
    this._report(error);
    this._rejectReady(error);
    this._rejectHello?.(error);
    this._teardown();
    // A failed peer is gone, so `closed` must resolve. Otherwise whoever tracks the
    // connection (a host's roster, a lobby's slots) never hears about a guest that
    // vanished without a BYE, and its slot is held forever.
    this._resolveClosed(this);
  }

  close({ remote = false } = {}) {
    if (this._closed) return;
    if (!remote && this.state === STATE.OPEN) this._sendControl(MSG.BYE, { reason: 'close' });
    this._closed = true;
    this._setState(remote ? STATE.CLOSED : STATE.CLOSING);
    const finish = () => {
      this._teardown();
      this._setState(STATE.CLOSED);
      this._resolveClosed(this);
    };
    // SCTP will not necessarily flush a queued BYE before the association is torn
    // down, so hold the sockets open for one grace period. State is already CLOSED
    // for the caller; only the sockets linger.
    if (!remote && this.config.byeGraceMs > 0) {
      const timer = setTimeout(finish, this.config.byeGraceMs);
      timer.unref?.();
    } else {
      finish();
    }
  }

  _teardown() {
    if (this._heartbeat) {
      clearInterval(this._heartbeat);
      this._heartbeat = null;
    }
    for (const channel of this._channels.values()) {
      try { channel.close?.(); } catch { /* already gone */ }
    }
    this._channels.clear();
    try { this._pc?.close?.(); } catch { /* already gone */ }
    this._pc = null;
    if (isNode && this._backend?.cleanup) {
      // libdatachannel keeps the process alive otherwise; only safe once nothing
      // else in the process is using it, so tests call it explicitly instead.
      this._backendNeedsCleanup = true;
    }
  }

  get stats() {
    return {
      state: this.state, role: this.role, room: this.room, label: this.label, rttMs: this.rttMs,
      bytesSent: this.bytesSent, bytesReceived: this.bytesReceived,
      framesSent: this.framesSent, framesDropped: this.framesDropped,
      fingerprint: this.fingerprint ?? null, remoteFingerprint: this._remoteFingerprint ?? null,
      pendingMessages: this._reassembler.pending,
      iceServers: this.config.iceServers.map(entry => entry.urls),
      bindAddress: this.config.bindAddress,
      candidates: this._localDescription ? (this._localDescription.sdp.match(/a=candidate:/gm) ?? []).length : 0,
    };
  }
}

export { PROTOCOL_VERSION, ProtocolError, msgName, randomRoomCode, isNode };
