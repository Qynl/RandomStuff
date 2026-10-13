/**
 * IRONWOOD - backend-free multiplayer.
 *
 * Two transports, one API:
 *
 *  1. "tab"  - BroadcastChannel. Zero setup, but only between tabs of the same
 *              browser on the same machine. Perfect for testing and couch play.
 *
 *  2. "rtc"  - WebRTC DataChannels, peer-to-peer, host-authoritative star
 *              topology. There is NO server: pairing is done by copy/pasting a
 *              short code back and forth (offer -> answer), exactly like
 *              "invite by code" in classic RTS games. Use a free public STUN
 *              server for address discovery.
 *
 * The rest of the game only ever talks to `Net`, so it does not care which
 * transport is underneath.
 */

export const MSG = {
  HELLO: 'hello',
  WELCOME: 'welcome',
  PEER_LIST: 'peers',
  LOBBY: 'lobby',
  START: 'start',
  INPUT: 'input',
  SNAPSHOT: 'snap',
  EVENT: 'event',
  CHAT: 'chat',
  PING: 'ping',
  PONG: 'pong',
  BYE: 'bye',
};

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

export function shortId(len = 6) {
  const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let s = '';
  const arr = new Uint32Array(len);
  if (globalThis.crypto?.getRandomValues) crypto.getRandomValues(arr);
  for (let i = 0; i < len; i++) {
    const r = arr[i] ? arr[i] / 4294967296 : Math.random();
    s += alphabet[Math.floor(r * alphabet.length)];
  }
  return s;
}

/* ------------------------------------------------------------------ */
/* Pairing codes                                                       */
/* ------------------------------------------------------------------ */

function toBase64Url(bytes) {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(str) {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function deflate(bytes) {
  if (typeof CompressionStream === 'undefined') return null;
  try {
    const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
    const buf = await new Response(stream).arrayBuffer();
    return new Uint8Array(buf);
  } catch (err) {
    void err;
    return null;
  }
}

async function inflate(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}

/** Pack a JS object into a copy/paste friendly code. */
export async function packCode(obj) {
  const json = JSON.stringify(obj);
  const bytes = new TextEncoder().encode(json);
  const packed = await deflate(bytes);
  if (packed && packed.length > 8) return 'Z' + toBase64Url(packed);
  return 'P' + toBase64Url(bytes);
}

/** Unpack a code produced by packCode. */
export async function unpackCode(code) {
  const clean = String(code || '').trim().replace(/\s+/g, '');
  if (!clean) throw new Error('Empty code');
  const tag = clean[0];
  const body = fromBase64Url(clean.slice(1));
  const bytes = tag === 'Z' ? await inflate(body) : body;
  return JSON.parse(new TextDecoder().decode(bytes));
}

/** Turn a long code into wrapped lines so it survives chat apps. */
export function formatCode(code, width = 64) {
  const out = [];
  for (let i = 0; i < code.length; i += width) out.push(code.slice(i, i + width));
  return out.join('\n');
}

/* ------------------------------------------------------------------ */
/* Tiny event emitter                                                  */
/* ------------------------------------------------------------------ */

class Emitter {
  constructor() {
    this._handlers = new Map();
  }
  on(event, cb) {
    if (!this._handlers.has(event)) this._handlers.set(event, new Set());
    this._handlers.get(event).add(cb);
    return () => this.off(event, cb);
  }
  off(event, cb) {
    this._handlers.get(event)?.delete(cb);
  }
  emit(event, ...args) {
    const set = this._handlers.get(event);
    if (!set) return;
    for (const cb of [...set]) {
      try {
        cb(...args);
      } catch (err) {
        console.error(`[net] handler for "${event}" threw`, err);
      }
    }
  }
  clear() {
    this._handlers.clear();
  }
}

/* ------------------------------------------------------------------ */
/* Transports                                                          */
/* ------------------------------------------------------------------ */

/** Transport interface: send(msg, toId?), onMessage(cb), onPeer(cb), close() */

class TabTransport extends Emitter {
  constructor(roomCode, { name, isHost, id }) {
    super();
    this.kind = 'tab';
    this.id = id;
    this.name = name;
    this.isHost = isHost;
    this.roomCode = roomCode;
    this.channel = new BroadcastChannel(`ironwood:${roomCode}`);
    this.closed = false;
    this.channel.onmessage = (ev) => {
      const m = ev.data;
      if (!m || m.__ironwood !== 1) return;
      if (m.from === this.id) return;
      if (m.to && m.to !== this.id) return;
      if (m.t === 'hello') {
        this.emit('peer', { id: m.from, name: m.name, meta: m.meta });
        return;
      }
      if (m.t === 'bye') {
        this.emit('peerLeave', { id: m.from });
        return;
      }
      this.emit('message', m.payload, m.from);
    };
  }
  send(payload, to) {
    if (this.closed) return;
    this.channel.postMessage({ __ironwood: 1, t: 'msg', from: this.id, to: to || null, payload });
  }
  announce(meta) {
    this.channel.postMessage({ __ironwood: 1, t: 'hello', from: this.id, name: this.name, meta: meta || null });
  }
  leave() {
    if (this.closed) return;
    try {
      this.channel.postMessage({ __ironwood: 1, t: 'bye', from: this.id });
    } catch (err) {
      void err;
    }
  }
  close() {
    this.closed = true;
    this.leave();
    try {
      this.channel.close();
    } catch (err) {
      void err;
    }
    this.clear();
  }
}

class RtcPeerLink extends Emitter {
  constructor(dc) {
    super();
    this.kind = 'rtc';
    this.dc = dc;
    this.id = null;
    dc.onmessage = (ev) => {
      let msg;
      try {
        msg = JSON.parse(ev.data);
      } catch (err) {
        console.warn('[net] bad frame', err);
        return;
      }
      this.emit('message', msg, this.id);
    };
    dc.onclose = () => this.emit('close', this.id);
    dc.onerror = (err) => this.emit('error', err);
  }
  send(payload) {
    if (this.dc.readyState !== 'open') return false;
    this.dc.send(JSON.stringify(payload));
    return true;
  }
  close() {
    try {
      this.dc.close();
    } catch (err) {
      void err;
    }
    this.clear();
  }
}

/* ------------------------------------------------------------------ */
/* Net - the game facing facade                                        */
/* ------------------------------------------------------------------ */

let netInstance = null;

export class Net extends Emitter {
  /**
   * @param {object} opts
   * @param {object} opts.transport  one of the transports above (network core)
   * @param {boolean} opts.isHost
   * @param {object} opts.identity   { id, name }
   */
  constructor({ transport, isHost, identity }) {
    super();
    this.transport = transport;
    this.isHost = !!isHost;
    this.id = identity.id;
    this.name = identity.name;
    this.peers = new Map(); // id -> { id, name, link?, lastSeen, ping }
    this.ping = 0;
    this.connected = true;
    this._pingTimer = 0;
    this._lastPingSent = 0;

    transport.on('message', (payload, fromId) => {
      const peer = this.peers.get(fromId);
      if (peer) peer.lastSeen = performance.now();
      this._handleControl(payload, fromId);
      this.emit('message', payload, fromId);
    });
    transport.on('peer', (info) => {
      if (info.id === this.id) return;
      const existing = this.peers.get(info.id);
      if (existing) {
        existing.lastSeen = performance.now();
        if (info.name) existing.name = info.name;
        return;
      }
      const peer = { id: info.id, name: info.name || 'Operator', lastSeen: performance.now(), ping: 0 };
      this.peers.set(info.id, peer);
      this.emit('peerJoin', peer);
      if (this.isHost) {
        this.sendTo(info.id, { t: MSG.WELCOME, hostId: this.id, peers: this.peerList() });
        this.emit('requestLobby', peer);
      } else {
        this.sendTo(info.id, { t: MSG.PEER_LIST, peers: this.peerList() });
      }
    });
    transport.on('peerLeave', ({ id }) => {
      if (this.peers.delete(id)) this.emit('peerLeave', id);
    });
    if (transport.kind === 'rtc') {
      transport.on('message', () => {});
    }
  }

  static get current() {
    return netInstance;
  }
  static set current(v) {
    netInstance = v;
  }

  peerList() {
    return [...this.peers.values()].map((p) => ({ id: p.id, name: p.name }));
  }

  _handleControl(payload, fromId) {
    if (!payload || typeof payload !== 'object') return;
    switch (payload.t) {
      case MSG.PING:
        this.sendTo(fromId, { t: MSG.PONG, ts: payload.ts });
        break;
      case MSG.PONG: {
        const rtt = performance.now() - payload.ts;
        this.ping = this.ping ? this.ping * 0.7 + rtt * 0.3 : rtt;
        const peer = this.peers.get(fromId);
        if (peer) peer.ping = rtt;
        break;
      }
      case MSG.PEER_LIST:
        if (payload.peers) {
          for (const p of payload.peers) {
            if (p.id === this.id || this.peers.has(p.id)) continue;
            const peer = { id: p.id, name: p.name, lastSeen: performance.now(), ping: 0 };
            this.peers.set(p.id, peer);
            this.emit('peerJoin', peer);
          }
        }
        break;
      default:
        break;
    }
  }

  /** Client -> host, host -> everybody. */
  send(msg) {
    if (this.isHost) this.broadcast(msg);
    else this.transport.send(msg, null);
  }

  sendTo(peerId, msg) {
    if (peerId === this.id) return;
    this.transport.send(msg, peerId);
  }

  broadcast(msg) {
    this.transport.send(msg, null);
  }

  update(dt) {
    this._pingTimer -= dt;
    if (this._pingTimer <= 0) {
      this._pingTimer = 0.5;
      const now = performance.now();
      this._lastPingSent = now;
      this.transport.send({ t: MSG.PING, ts: now }, null);
    }
  }

  close() {
    this.connected = false;
    this.transport.close();
    this.clear();
    if (netInstance === this) netInstance = null;
  }
}

/* ------------------------------------------------------------------ */
/* Factories                                                           */
/* ------------------------------------------------------------------ */

/**
 * Create a host session.
 * @param {object} opts
 * @param {'tab'|'rtc'} opts.transport
 * @param {string} [opts.roomCode] required for tab transport
 * @param {string} [opts.name]
 * @returns {Promise<{net: Net, roomCode: string, createInvite?: Function, acceptAnswer?: Function}>}
 */
export async function createHost({ transport = 'tab', roomCode, name = 'Host' } = {}) {
  const id = shortId();
  const identity = { id, name };

  if (transport === 'tab') {
    const code = (roomCode || shortId(4)).toUpperCase();
    const tr = new TabTransport(code, { name, isHost: true, id });
    const net = new Net({ transport: tr, isHost: true, identity });
    Net.current = net;
    tr.announce({ host: true });
    return { net, roomCode: code, transportLabel: 'Same-device tabs' };
  }

  // WebRTC star topology: one RTCPeerConnection per guest.
  const pending = new Map(); // peerId -> {pc, dc, resolve}
  const links = new Map(); // peerId -> RtcPeerLink
  const tr = new Emitter();
  tr.kind = 'rtc';
  tr.send = (payload, to) => {
    if (to) {
      const link = links.get(to);
      if (link) link.send(payload);
      return;
    }
    for (const link of links.values()) link.send(payload);
  };
  tr.close = () => {
    for (const link of links.values()) link.close();
    for (const p of pending.values()) {
      try {
        p.pc.close();
      } catch (err) {
        void err;
      }
    }
  };

  const net = new Net({ transport: tr, isHost: true, identity });
  Net.current = net;

  const attachDataChannel = (pc, resolve) => {
    pc.ondatachannel = (ev) => {
      const dc = ev.channel;
      const link = new RtcPeerLink(dc);
      dc.onopen = () => {
        const peerId = link.id || shortId();
        link.id = peerId;
        links.set(peerId, link);
        link.on('message', (payload) => tr.emit('message', payload, peerId));
        link.on('close', () => {
          links.delete(peerId);
          tr.emit('peerLeave', { id: peerId });
        });
        resolve(peerId);
      };
      link.send({ t: MSG.HELLO, from: id, name });
    };
  };

  /**
   * Build an invite code. Call once per friend who wants to join, paste the
   * result to them, then feed their answer code to acceptAnswer().
   */
  const createInvite = async () => {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pc.createDataChannel('ironwood', { ordered: false, maxRetransmits: 0 });
    const dcChannel = pc.createDataChannel('ironwood-reliable', { ordered: true });
    let connectedResolve;
    const connected = new Promise((res) => {
      connectedResolve = res;
    });
    const link = new RtcPeerLink(dcChannel);
    dcChannel.onopen = () => {
      connectedResolve();
    };
    // Reliable channel carries gameplay; unreliable one is optional fast path.
    void dcChannel;
    // Reuse the same wiring as ondatachannel by resolving on open.
    const peerIdPromise = new Promise((resolve) => {
      attachDataChannel(pc, resolve);
      connected.then(() => {
        // Fallback id if the unreliable channel never opens.
        if (!link.id) link.id = shortId();
      });
    });
    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'failed') tr.emit('error', new Error('ICE failed'));
      if (pc.iceConnectionState === 'connected') {
        if (!link.id) link.id = shortId();
        if (!links.has(link.id)) {
          links.set(link.id, link);
          link.on('message', (payload) => tr.emit('message', payload, link.id));
          link.on('close', () => {
            links.delete(link.id);
            tr.emit('peerLeave', { id: link.id });
          });
          tr.emit('peer', { id: link.id, name: 'Operator' });
        }
      }
    };
    link.on('message', (payload) => tr.emit('message', payload, link.id));

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await gatherIce(pc, 2500);
    const code = await packCode({ v: 1, role: 'offer', sdp: pc.localDescription.sdp });
    return {
      code,
      peerId: await peerIdPromise.catch(() => null),
      connection: pc,
    };
  };

  /** Feed the answer code the guest sent back. Returns the peer id. */
  const acceptAnswer = async (code) => {
    const data = await unpackCode(code);
    if (data.role !== 'answer') throw new Error('That is not an answer code');
    const entry = pendingOffers.pop();
    if (!entry) throw new Error('No pending invite - create one first');
    await entry.connection.setRemoteDescription({ type: 'answer', sdp: data.sdp });
    return entry.peerId;
  };

  const pendingOffers = [];
  const createInviteTracked = async () => {
    const invite = await createInvite();
    pendingOffers.push(invite);
    return invite.code;
  };

  return { net, roomCode: null, transportLabel: 'Peer-to-peer (WebRTC)', createInvite: createInviteTracked, acceptAnswer };
}

/**
 * Join a host session.
 * @param {object} opts
 * @param {'tab'|'rtc'} opts.transport
 * @param {string} [opts.roomCode] for tab transport
 * @param {string} [opts.inviteCode] for rtc transport
 * @param {string} [opts.name]
 * @returns {Promise<{net: Net, answerCode?: string}>}
 */
export async function createClient({ transport = 'tab', roomCode, inviteCode, name = 'Operator' } = {}) {
  const id = shortId();
  const identity = { id, name };

  if (transport === 'tab') {
    const code = (roomCode || '').toUpperCase();
    if (!code) throw new Error('Room code required');
    const tr = new TabTransport(code, { name, isHost: false, id });
    const net = new Net({ transport: tr, isHost: false, identity });
    Net.current = net;
    tr.announce({ host: false });
    return { net };
  }

  const data = await unpackCode(inviteCode);
  if (data.role !== 'offer') throw new Error('That is not an invite code');
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  const tr = new Emitter();
  tr.kind = 'rtc';
  let link = null;
  tr.send = (payload) => {
    if (link) link.send(payload);
  };
  tr.close = () => {
    if (link) link.close();
    try {
      pc.close();
    } catch (err) {
      void err;
    }
  };

  pc.ondatachannel = (ev) => {
    link = new RtcPeerLink(ev.channel);
    link.id = 'host';
    link.on('message', (payload) => tr.emit('message', payload, 'host'));
    link.on('close', () => tr.emit('peerLeave', { id: 'host' }));
    tr.emit('peer', { id: 'host', name: 'Host' });
  };

  const net = new Net({ transport: tr, isHost: false, identity });
  Net.current = net;

  await pc.setRemoteDescription({ type: 'offer', sdp: data.sdp });
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  await gatherIce(pc, 2500);
  const answerCode = await packCode({ v: 1, role: 'answer', sdp: pc.localDescription.sdp });
  return { net, answerCode };
}

/** Wait for ICE gathering to finish (or time out) so codes are self-contained. */
function gatherIce(pc, timeout) {
  return new Promise((resolve) => {
    if (pc.iceGatheringState === 'complete') return resolve();
    const done = () => {
      pc.removeEventListener('icegatheringstatechange', onChange);
      clearTimeout(timer);
      resolve();
    };
    const onChange = () => {
      if (pc.iceGatheringState === 'complete') done();
    };
    const timer = setTimeout(done, timeout);
    pc.addEventListener('icegatheringstatechange', onChange);
  });
}

/** Transport support probe for the UI. */
export function multiplayerSupport() {
  return {
    tab: typeof BroadcastChannel !== 'undefined',
    rtc: typeof RTCPeerConnection !== 'undefined',
    compression: typeof CompressionStream !== 'undefined',
    secure: globalThis.isSecureContext !== false,
  };
}
