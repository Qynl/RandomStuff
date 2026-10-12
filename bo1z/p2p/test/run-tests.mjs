#!/usr/bin/env node
/**
 * Test suite for the serverless P2P layer. Run: npm test  (or node test/run-tests.mjs)
 *
 * Three sections:
 *
 *   A. codec      - pure functions, no network: framing, chunking, reassembly
 *                   bounds, blob integrity, CRC-32, base64url.
 *   B. transport  - two REAL peers over real ICE/DTLS/SCTP via node-datachannel,
 *                   rendezvoused by copy-paste blobs. No signaling server, no
 *                   STUN server, no relay: iceServers is empty and both peers bind
 *                   loopback, so the connection is genuinely serverless.
 *   C. netcode    - the same real connection running a host-authoritative
 *                   simulation, including a run with 25% of unreliable frames
 *                   deliberately dropped on both sides.
 *
 * Section B and C are skipped with a clear notice if node-datachannel is absent
 * (a browser-only checkout), so `npm test` never fails for want of a native module.
 */

import assert from 'node:assert/strict';
import {
  BLOB_MAGIC, HEADER_BYTES, MAX_CHUNK_PAYLOAD, MSG, PROTOCOL_VERSION, ProtocolError,
  chunkPayload, crc32, createReassembler, decodeBlob, decodeFrame, encodeBlob,
  encodeFrame, msgName, randomRoomCode, sdpFingerprint, utf8,
} from '../protocol.js';

const results = [];
let currentSection = '';

function section(name) {
  currentSection = name;
  console.log(`\n── ${name} ${'─'.repeat(Math.max(0, 62 - name.length))}`);
}

async function test(name, fn) {
  const started = Date.now();
  try {
    await fn();
    results.push({ section: currentSection, name, ok: true, ms: Date.now() - started });
    console.log(`  ok    ${name}${' '.repeat(Math.max(1, 52 - name.length))} ${Date.now() - started} ms`);
  } catch (error) {
    results.push({ section: currentSection, name, ok: false, error });
    console.log(`  FAIL  ${name}\n          ${error.message.split('\n').slice(0, 4).join('\n          ')}`);
  }
}

const throws = async (fn, match, label) => {
  try {
    await fn();
  } catch (error) {
    if (match && !new RegExp(match, 'i').test(error.message)) {
      throw new Error(`${label}: wrong error ${JSON.stringify(error.message)}`);
    }
    return error;
  }
  throw new Error(`${label}: expected a throw, got success`);
};

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

/* ══════════════════════════════════════════════════════ A. codec ═════ */

section('A. codec (pure)');

await test('crc32 matches the published check value', () => {
  assert.equal(crc32(utf8.encode('123456789')), 0xcbf43926);
  assert.equal(crc32(new Uint8Array(0)), 0);
});

await test('frame round-trips every header field', () => {
  const payload = utf8.encode('hello zombies');
  const frame = encodeFrame({ type: MSG.APP, seq: 0xdeadbeef, payload });
  assert.equal(frame.length, HEADER_BYTES + payload.length);
  const back = decodeFrame(frame);
  assert.equal(back.version, PROTOCOL_VERSION);
  assert.equal(back.type, MSG.APP);
  assert.equal(back.seq, 0xdeadbeef);
  assert.equal(back.msgId, 0);
  assert.equal(back.chunkCount, 1);
  assert.equal(utf8.decode(back.payload), 'hello zombies');
});

await test('malformed frames are rejected, not guessed at', async () => {
  const good = encodeFrame({ type: MSG.APP, payload: utf8.encode('x') });
  await throws(() => decodeFrame(new Uint8Array(4)), 'too short', 'short frame');
  const badVersion = Uint8Array.from(good);
  badVersion[0] = 99;
  await throws(() => decodeFrame(badVersion), 'unsupported protocol version', 'bad version');
  const badType = Uint8Array.from(good);
  badType[1] = 200;
  await throws(() => decodeFrame(badType), 'unknown message type', 'bad type');
  const lying = Uint8Array.from(good);
  new DataView(lying.buffer).setUint32(12, 9999);
  await throws(() => decodeFrame(lying), 'disagrees with declared', 'lying length');
  await throws(() => encodeFrame({ type: 42 }), 'unknown message type', 'encode bad type');
  await throws(() => encodeFrame({ type: MSG.APP, chunkCount: 3, chunkIndex: 5 }),
    'beyond chunkCount', 'chunk index past count');
  await throws(() => encodeFrame({ type: MSG.APP, msgId: 7 }),
    'unchunked frame must have msgId 0', 'msgId on single frame');
  assert.equal(msgName(MSG.BYE), 'BYE');
});

await test('a 1 MiB payload chunks and reassembles byte-identically', () => {
  const payload = new Uint8Array(1024 * 1024);
  for (let index = 0; index < payload.length; index++) payload[index] = (index * 31 + 7) % 251;
  const frames = chunkPayload(payload, { seq: 1, msgId: 1 });
  assert.equal(frames.length, Math.ceil(payload.length / MAX_CHUNK_PAYLOAD));
  const reassembler = createReassembler();
  let message = null;
  for (const frame of frames) {
    message = reassembler.push(decodeFrame(frame)) ?? message;
  }
  assert.ok(message, 'no message reassembled');
  assert.equal(message.payload.length, payload.length);
  assert.deepEqual(message.payload, payload);
});

await test('reassembly refuses to be abused by a hostile peer', () => {
  const reassembler = createReassembler();
  const chunk = (msgId, index, count, total, fill) => decodeFrame(encodeFrame({
    type: MSG.APP, seq: index, msgId, chunkIndex: index, chunkCount: count,
    totalBytes: total, payload: new Uint8Array(MAX_CHUNK_PAYLOAD).fill(fill),
  }));
  // duplicate chunk must not advance the count twice
  reassembler.push(chunk(11, 0, 2, MAX_CHUNK_PAYLOAD * 2, 1));
  assert.equal(reassembler.push(chunk(11, 0, 2, MAX_CHUNK_PAYLOAD * 2, 1)), null);
  assert.equal(reassembler.pending, 1);
  // shape change mid-message
  assert.throws(() => reassembler.push(chunk(11, 1, 3, MAX_CHUNK_PAYLOAD * 3, 1)),
    /changed shape mid-message/);
  assert.equal(reassembler.pending, 0, 'a rejected message must be dropped, not kept');
  // declaring more bytes than the cap
  const over = encodeFrame({ type: MSG.APP, seq: 1, msgId: 12, chunkIndex: 0, chunkCount: 2,
                             totalBytes: MAX_CHUNK_PAYLOAD * 400, payload: new Uint8Array(10) });
  assert.throws(() => decodeFrame(over), /exceeds the .* cap/);
  // inflight cap evicts the oldest partial rather than growing without bound
  for (let id = 100; id < 100 + 12; id++) reassembler.push(chunk(id, 0, 3, MAX_CHUNK_PAYLOAD * 3, 2));
  assert.ok(reassembler.pending <= 8, `inflight partials ${reassembler.pending} should be capped at 8`);
});

await test('signaling blobs round-trip and reject tampering', async () => {
  const sdp = 'v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\na=fingerprint:sha-256 '
    + 'AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99\r\n';
  const blob = encodeBlob({ kind: 'offer', sdp, room: 'KINO-1234', nonce: 'n1' });
  assert.ok(blob.startsWith(`${BLOB_MAGIC}.`));
  const back = decodeBlob(blob, { expectRoom: 'KINO-1234', expectKind: 'offer' });
  assert.equal(back.sdp, sdp);
  assert.equal(back.nonce, 'n1');
  assert.equal(sdpFingerprint(sdp).length, 95);
  assert.equal(sdpFingerprint(back.sdp), sdpFingerprint(sdp));

  // flip one character in the body: the checksum must catch it
  const flipped = blob.split('.');
  flipped[1] = (flipped[1][0] === 'A' ? 'B' : 'A') + flipped[1].slice(1);
  await throws(() => decodeBlob(flipped.join('.')), 'checksum mismatch', 'tampered body');
  // a damaged checksum, and a missing part, are both caught before any WebRTC
  // object ever sees the blob
  await throws(() => decodeBlob(blob.slice(0, blob.length - 3)), 'checksum', 'truncated checksum');
  const [magicPart, bodyPart, sumPart] = blob.split('.');
  const wrongSum = ((parseInt(sumPart, 16) + 1) % 0x100000000).toString(16).padStart(8, '0');
  await throws(() => decodeBlob([magicPart, bodyPart, wrongSum].join('.')),
    'checksum mismatch', 'corrupted checksum');
  // a body edited without fixing the checksum is the actual tampering case
  const editedBody = (bodyPart[0] === 'A' ? 'B' : 'A') + bodyPart.slice(1);
  await throws(() => decodeBlob([magicPart, editedBody, sumPart].join('.')),
    'checksum mismatch', 'edited body');
  await throws(() => decodeBlob(blob.split('.').slice(0, 2).join('.')),
    'three dot-separated parts', 'missing part');
  // wrong room, wrong kind, wrong magic
  await throws(() => decodeBlob(blob, { expectRoom: 'OTHER-9999' }), 'room code mismatch', 'wrong room');
  await throws(() => decodeBlob(blob, { expectKind: 'answer' }), 'expected a answer', 'wrong kind');
  await throws(() => decodeBlob('NOPE.' + blob.split('.').slice(1).join('.')), 'not a BO1ZP2P1', 'wrong magic');
  await throws(() => decodeBlob(blob.replace(/\./g, ' ')), 'three dot-separated parts', 'mangled');
  // non-ASCII cannot be smuggled into a blob
  await throws(() => encodeBlob({ kind: 'offer', sdp: 'v=0\u00e9vil', room: 'R' }),
    'not printable ASCII', 'non-ascii in sdp');
});

await test('room codes avoid characters that are ambiguous over voice chat', () => {
  for (let attempt = 0; attempt < 500; attempt++) {
    const code = randomRoomCode();
    assert.match(code, /^[ACDEFGHJKLMNPQRTUVWXY3479]{4}-[ACDEFGHJKLMNPQRTUVWXY3479]{4}$/);
  }
});

/* ══════════════════════════════════════════════════ B/C. real WebRTC ═════ */

let backend = null;
try {
  await import('node-datachannel');
  backend = await import('../transport.js');
} catch (error) {
  console.log(`\n── B. transport ─────────────────────────────────────────────\n`
    + `  SKIP  node-datachannel is not installed (${error.message.split('\n')[0]})\n`
    + `        Sections B and C need it. npm install, then re-run.`);
}

if (backend) {
  const { Peer, STATE, releaseBackend } = backend;
  const { createHost, createClient } = await import('../netcode.js');

  /** Two real peers, rendezvoused only by copy-pasted blobs. */
  async function connectPair(options = {}) {
    const shared = { room: options.room ?? 'TEST-1234', bindAddress: '127.0.0.1',
                     heartbeatMs: 200, timeoutMs: 3000,
                     iceServers: options.iceServers ?? [], ...options.peerOptions };
    const errors = [];
    const host = new Peer({ role: 'host', ...shared, onError: e => errors.push(['host', e]) });
    const guest = new Peer({ role: 'guest', ...shared, onError: e => errors.push(['guest', e]) });
    const offer = await host.createOffer();
    const answer = await guest.acceptOffer(offer);
    await host.acceptAnswer(answer);
    await Promise.race([
      Promise.all([host.ready, guest.ready]),
      wait(15000).then(() => { throw new Error(`peers did not connect; errors: `
        + errors.map(([who, e]) => `${who}: ${e.message}`).join(' | ') || 'none'); }),
    ]);
    return { host, guest, offer, answer, errors };
  }

  const teardown = async (...peers) => {
    for (const peer of peers) { try { peer.close(); } catch { /* already closed */ } }
    await wait(50);
  };

  section('B. transport (real ICE/DTLS/SCTP, no server of any kind)');

  await test('two peers connect using only copy-pasted blobs', async () => {
    const { host, guest, offer } = await connectPair();
    try {
      assert.equal(host.state, STATE.OPEN);
      assert.equal(guest.state, STATE.OPEN);
      // `ready` fires on channel open; the handshake that verifies the room and
      // reveals the peer's role completes a moment later.
      await Promise.race([Promise.all([host.hello, guest.hello]), wait(5000).then(() => {
        throw new Error('HELLO/WELCOME never completed');
      })]);
      assert.equal(host.peerRole, 'guest');
      assert.equal(guest.peerRole, 'host');
      assert.equal(host.peerNonce, guest.nonce);
      assert.ok(offer.startsWith(`${BLOB_MAGIC}.`), 'blob is not self-describing');
      assert.ok(host.stats.candidates >= 1, 'host advertised no ICE candidate');
      assert.deepEqual(host.stats.iceServers, [], 'a STUN server was used - this test must be serverless');
    } finally {
      await teardown(host, guest);
    }
  });

  await test('the DTLS fingerprint travels inside the blob (out-of-band auth)', async () => {
    const { host, guest, offer, answer } = await connectPair();
    try {
      // The blob is the only channel these two ever used, so its fingerprint is
      // what authenticates the peer: a man in the middle cannot produce a blob
      // whose fingerprint matches the DTLS handshake it then performs.
      assert.ok(host.fingerprint, 'host has no local fingerprint');
      assert.equal(host.fingerprint, sdpFingerprint(decodeBlob(offer).sdp),
        'the host fingerprint is not the one carried in its own offer blob');
      assert.equal(guest.fingerprint, sdpFingerprint(decodeBlob(answer).sdp),
        'the guest fingerprint is not the one carried in its own answer blob');
      assert.notEqual(host.fingerprint, guest.fingerprint, 'both peers claim one certificate');
      assert.equal(guest.stats.remoteFingerprint, host.fingerprint);
      assert.equal(host.stats.remoteFingerprint, guest.fingerprint);
    } finally {
      await teardown(host, guest);
    }
  });

  await test('JSON and 1 MiB chunked binary both arrive intact', async () => {
    const { host, guest } = await connectPair();
    const atGuest = [];
    const atHost = [];
    guest.onMessage = message => atGuest.push(message);
    host.onMessage = message => atHost.push(message);
    try {
      const big = new Uint8Array(1024 * 1024);
      for (let index = 0; index < big.length; index++) big[index] = (index * 37 + 11) % 251;
      host.sendJSON({ map: 'kino', round: 100, nested: { perks: ['jugg', 'speed'] } });
      host.send(big);
      guest.send(new Uint8Array([1, 2, 3, 250]));

      for (let attempt = 0; attempt < 100 && (atGuest.length < 2 || atHost.length < 1); attempt++) {
        await wait(50);
      }
      assert.equal(atGuest.length, 2, `guest got ${atGuest.length} messages`);
      assert.deepEqual(atGuest[0].data, { map: 'kino', round: 100, nested: { perks: ['jugg', 'speed'] } });
      const received = atGuest[1].data;
      assert.equal(received.length, big.length);
      assert.deepEqual(received, big, 'the chunked 1 MiB transfer was corrupted');
      assert.equal(atGuest[1].reliable, true);
      assert.deepEqual(atHost[0].data, new Uint8Array([1, 2, 3, 250]));
    } finally {
      await teardown(host, guest);
    }
  });

  await test('the unreliable channel delivers and refuses oversized frames', async () => {
    const { host, guest } = await connectPair();
    const got = [];
    guest.onMessage = message => got.push(message);
    try {
      assert.equal(host.send(new Uint8Array(900).fill(3), { reliable: false }), true);
      for (let attempt = 0; attempt < 60 && !got.length; attempt++) await wait(25);
      assert.equal(got.length, 1, 'unreliable frame did not arrive');
      assert.equal(got[0].reliable, false);
      assert.equal(got[0].data.length, 900);
      // A fragmented unreliable message cannot survive loss, so it is refused
      // rather than silently sent in pieces.
      assert.throws(() => host.send(new Uint8Array(60_000), { reliable: false }),
        /exceeds .* use the reliable channel/);
    } finally {
      await teardown(host, guest);
    }
  });

  await test('heartbeats measure RTT; a silent peer is declared gone', async () => {
    const { host, guest } = await connectPair({ peerOptions: { heartbeatMs: 100, timeoutMs: 600 } });
    try {
      for (let attempt = 0; attempt < 50 && host.rttMs === null; attempt++) await wait(50);
      assert.ok(host.rttMs !== null, 'no RTT sample after 2.5 s of heartbeats');
      assert.ok(host.rttMs >= 0 && host.rttMs < 1000, `implausible RTT ${host.rttMs}`);
      assert.ok(host.stats.bytesSent > 0 && host.stats.bytesReceived > 0);
    } finally {
      await teardown(host, guest);
    }

    // Kill one side without a BYE: the survivor must notice via heartbeat silence.
    const pair = await connectPair({ peerOptions: { heartbeatMs: 100, timeoutMs: 500 } });
    const failure = new Promise(resolve => {
      pair.host.onError = error => resolve(error);
    });
    pair.guest._teardown();     // simulate a crash: sockets gone, no BYE sent
    const error = await Promise.race([failure, wait(6000).then(() => null)]);
    assert.ok(error, 'the host never noticed its peer had vanished');
    assert.match(error.message, /silent for|failed|closed/i);
    await teardown(pair.host);
  });

  await test('BYE closes the far side cleanly', async () => {
    const { host, guest } = await connectPair();
    const hostClosed = new Promise(resolve => { host.onState = state => resolve(state); });
    try {
      guest.close();
      const state = await Promise.race([hostClosed, wait(5000).then(() => 'timeout')]);
      assert.equal(state, STATE.CLOSED, `host ended in ${state} after the guest said BYE`);
      // The guest lingers in 'closing' for byeGraceMs while its BYE flushes.
      assert.equal(guest.state, STATE.CLOSING, 'the closer should hold its sockets briefly');
      await Promise.race([guest.closed, wait(3000).then(() => { throw new Error('closer never finished'); })]);
      assert.equal(guest.state, STATE.CLOSED);
    } finally {
      await teardown(host);
    }
  });

  await test('a blob from the wrong session is refused before connecting', async () => {
    const host = new Peer({ role: 'host', room: 'KINO-1111', bindAddress: '127.0.0.1' });
    const stranger = new Peer({ role: 'guest', room: 'MOON-9999', bindAddress: '127.0.0.1' });
    try {
      const offer = await host.createOffer();
      await throws(() => stranger.acceptOffer(offer), 'room code mismatch', 'cross-session blob');
    } finally {
      await teardown(host, stranger);
    }
  });

  await test('an unknown data channel is refused, not read from', async () => {
    const { host, guest } = await connectPair();
    try {
      // A channel the protocol does not define is either a version mismatch or
      // something unwanted. Opening one for real would need renegotiation, so
      // drive the refusal path with a stand-in that behaves like a remote channel.
      const failure = new Promise(resolve => { host.onError = error => resolve(error); });
      let closed = false;
      host._adoptChannel({
        getLabel: () => 'evil-extra',
        close: () => { closed = true; },
        onOpen: () => {}, onMessage: () => {}, onClosed: () => {}, onError: () => {},
        isOpen: () => false,
      }, true);
      const error = await Promise.race([failure, wait(2000).then(() => null)]);
      assert.ok(error, 'an unexpected data channel was silently accepted');
      assert.match(error.message, /unknown data channel/);
      assert.ok(closed, 'the unwanted channel was left open');
      assert.ok(!host._channels.has('evil-extra'), 'the unwanted channel was registered');
    } finally {
      await teardown(host, guest);
    }
  });

  section('C. netcode (host-authoritative, over the same real connection)');

  /** A tiny deterministic simulation: two avatars with velocity from input axes. */
  const SPEED = 6;   // units per second
  function makeWorld(ids) {
    return Object.fromEntries(ids.map(id => [id, { x: 0, y: 0, hp: 100 }]));
  }
  function simulate(state, inputs, dt) {
    for (const [id, player] of Object.entries(state)) {
      const queue = inputs.get(id)?.queue ?? [];
      for (const input of queue) {
        player.x += (input.axes.mx ?? 0) * SPEED * (input.dt || dt);
        player.y += (input.axes.my ?? 0) * SPEED * (input.dt || dt);
      }
    }
  }
  const stateFor = state => JSON.parse(JSON.stringify(state));

  await test('guest input drives host simulation and converges both views', async () => {
    const { host: hostPeer, guest: guestPeer } = await connectPair({ room: 'NET-1' });
    const rendered = [];
    const hostSession = createHost({
      peer: hostPeer, simulate, stateFor, tickRate: 30,
      initialState: makeWorld(['host', 'guest']),
    });
    const clientSession = createClient({
      peer: guestPeer, id: 'guest', inputRate: 60, interpolationMs: 100,
      initialState: { x: 0, y: 0, hp: 100 },
      readInput: () => ({ mx: 1, my: 0.5 }),          // hold right and down
      applyInput: (axes, predicted, dt) => {
        predicted.x += (axes.mx ?? 0) * SPEED * dt;
        predicted.y += (axes.my ?? 0) * SPEED * dt;
      },
      onRender: state => rendered.push(state),
    });

    try {
      await wait(2000);
      const authoritative = hostSession.state.guest;
      const prediction = clientSession.predicted();
      assert.ok(authoritative.x > 5, `host barely moved the guest: x=${authoritative.x}`);
      // Prediction and authority are computed from the same inputs and the same
      // SPEED, so over a clean loopback link they must agree closely.
      assert.ok(Math.abs(authoritative.x - prediction.x) < 1.5,
        `desync: host x=${authoritative.x.toFixed(3)} predicted x=${prediction.x.toFixed(3)}`);
      assert.ok(Math.abs(authoritative.y - prediction.y) < 1.5, 'y axis desynced');
      assert.ok(rendered.length > 50, `only ${rendered.length} renders in 2 s`);
      assert.ok(clientSession.buffer() > 2, 'guest is not keeping an interpolation buffer');
      assert.ok(clientSession.stats.inputsSent > 50, 'inputs were not being sent');
      assert.ok(clientSession.stats.pendingAck < 20,
        `inputs are not being acknowledged: ${clientSession.stats.pendingAck} pending`);
      assert.ok(hostSession.stats.ticks > 40, `host only ran ${hostSession.stats.ticks} ticks`);
      assert.ok(clientSession.stats.buffered > 0);
      // The remote player (the host avatar) is interpolated into the render state.
      assert.ok(rendered.at(-1).remote && 'host' in rendered.at(-1).remote,
        'the guest never saw the host player in its render state');
      assert.ok(!clientSession.stats.oversizedSnapshots, 'snapshots exceeded the size budget');
      assert.ok(hostSession.stats.snapshotBytes < 1100, 'snapshot is near the unreliable cap');
    } finally {
      hostSession.stop();
      clientSession.stop();
      await teardown(hostPeer, guestPeer);
    }
  });

  await test('25% frame loss on both sides still converges (degrades, never desyncs)', async () => {
    const { host: hostPeer, guest: guestPeer } = await connectPair({ room: 'NET-2' });
    // Drop a quarter of all unreliable frames in both directions. The reliable
    // channel is left alone, because that is what a real lossy link looks like:
    // SCTP retransmits reliable streams, and only the unreliable one loses data.
    const lossy = (peer, rate) => {
      const original = peer.send.bind(peer);
      peer.send = (data, options = {}) => {
        if (!options.reliable && options.reliable !== undefined && Math.random() < rate) {
          peer.framesDropped++;
          return false;
        }
        return original(data, options);
      };
    };
    lossy(hostPeer, 0.25);
    lossy(guestPeer, 0.25);

    const hostSession = createHost({ peer: hostPeer, simulate, stateFor, tickRate: 30,
                                     initialState: makeWorld(['host', 'guest']) });
    const clientSession = createClient({
      peer: guestPeer, id: 'guest', inputRate: 60, interpolationMs: 120,
      initialState: { x: 0, y: 0, hp: 100 },
      readInput: () => ({ mx: 1, my: 0 }),
      applyInput: (axes, predicted, dt) => { predicted.x += (axes.mx ?? 0) * SPEED * dt; },
      onRender: () => {},
    });
    try {
      await wait(3000);
      const authoritative = hostSession.state.guest.x;
      const prediction = clientSession.predicted().x;
      assert.ok(authoritative > 5, `host barely advanced under loss: x=${authoritative}`);
      // Reconciliation is what keeps this bounded: without it, every dropped input
      // would leave the guest permanently ahead of the host.
      const drift = Math.abs(authoritative - prediction);
      assert.ok(drift < 3.0, `drift ${drift.toFixed(2)} under 25% loss is too large `
        + `(host ${authoritative.toFixed(2)} vs predicted ${prediction.toFixed(2)})`);
      assert.ok(clientSession.stats.corrections > 0 || drift < 1,
        'no reconciliation happened despite heavy loss');
      assert.ok(hostPeer.framesDropped + guestPeer.framesDropped > 10,
        'the loss injection did not actually drop anything - this test proves nothing');
      assert.ok(clientSession.stats.received > 20, 'too few snapshots survived');
    } finally {
      hostSession.stop();
      clientSession.stop();
      await teardown(hostPeer, guestPeer);
    }
  });

  await test('a late, out-of-order snapshot is ignored instead of rewinding', async () => {
    const { host: hostPeer, guest: guestPeer } = await connectPair({ room: 'NET-3' });
    const hostSession = createHost({ peer: hostPeer, simulate, stateFor, tickRate: 30,
                                     initialState: makeWorld(['host', 'guest']) });
    const clientSession = createClient({
      peer: guestPeer, id: 'guest', inputRate: 60,
      initialState: { x: 0, y: 0, hp: 100 }, readInput: () => ({ mx: 1 }),
      applyInput: (axes, predicted, dt) => { predicted.x += (axes.mx ?? 0) * SPEED * dt; },
      onRender: () => {},
    });
    try {
      await wait(800);
      const before = clientSession.predicted().x;
      const tick = clientSession.stats.lastSnapshotTick;
      // Inject a stale snapshot directly, as if the network had reordered it.
      guestPeer.onMessage({ data: { k: 'snap', v: 1, tick: Math.max(1, tick - 5), t: Date.now(),
                                    players: { guest: { x: -500, y: -500, hp: 1 } }, ack: {} },
                          reliable: false });
      await wait(150);
      assert.ok(clientSession.stats.outOfOrderSnapshots >= 1, 'the stale snapshot was not detected');
      assert.ok(clientSession.predicted().x >= before - 1,
        `the client rewound to a stale snapshot (x went ${before} -> ${clientSession.predicted().x})`);
    } finally {
      hostSession.stop();
      clientSession.stop();
      await teardown(hostPeer, guestPeer);
    }
  });

  await test('a malformed netcode message is reported and does not kill the session', async () => {
    const { host: hostPeer, guest: guestPeer } = await connectPair({ room: 'NET-4' });
    const problems = [];
    const hostSession = createHost({ peer: hostPeer, simulate, stateFor, tickRate: 30,
                                     onError: error => problems.push(error),
                                     initialState: makeWorld(['host', 'guest']) });
    try {
      guestPeer.sendJSON({ k: 'in', v: 999, id: 'guest', seq: 1 });  // wrong version
      guestPeer.sendJSON({ nonsense: true });                          // not netcode at all
      await wait(400);
      assert.ok(problems.length >= 1, 'a malformed message was silently accepted');
      assert.match(problems[0].message, /unknown shape|protocol/i);
      assert.ok(hostSession.stats.received >= 0);
      assert.equal(hostPeer.state, STATE.OPEN, 'the session died on bad input');
      // and the host still ticks afterwards
      const ticks = hostSession.stats.ticks;
      await wait(300);
      assert.ok(hostSession.stats.ticks > ticks, 'the host stopped simulating after a bad message');
    } finally {
      hostSession.stop();
      await teardown(hostPeer, guestPeer);
    }
  });

  await test('application events cross reliably in both directions', async () => {
    const { host: hostPeer, guest: guestPeer } = await connectPair({ room: 'NET-5' });
    const atHost = [];
    const atGuest = [];
    const hostSession = createHost({ peer: hostPeer, simulate, stateFor, tickRate: 30,
                                     onEvent: event => atHost.push(event),
                                     initialState: makeWorld(['host', 'guest']) });
    const clientSession = createClient({ peer: guestPeer, id: 'guest', inputRate: 60,
                                         onEvent: event => atGuest.push(event),
                                         initialState: { x: 0, y: 0, hp: 100 },
                                         readInput: () => ({}), applyInput: () => {},
                                         onRender: () => {} });
    try {
      hostSession.emit('round', { n: 12 });
      clientSession.emit('downed', { by: 'zombie' });
      const apps = list => list.filter(event => event.kind === 'event');
      for (let attempt = 0; attempt < 60 && (!apps(atHost).length || !apps(atGuest).length); attempt++) {
        await wait(50);
      }
      assert.equal(apps(atGuest).length, 1);
      assert.equal(apps(atGuest)[0].name, 'round');
      assert.deepEqual(apps(atGuest)[0].payload, { n: 12 });
      assert.equal(apps(atHost).length, 1);
      assert.equal(apps(atHost)[0].name, 'downed');
      assert.deepEqual(apps(atHost)[0].payload, { by: 'zombie' });
      assert.equal(apps(atHost)[0].from, null, 'events are anonymous unless the sender identifies itself');
      // The client's JOIN is surfaced too, which is how a host learns who arrived.
      assert.ok(atHost.some(event => event.kind === 'join' && event.id === 'guest'),
        'the host never saw the guest join');
    } finally {
      hostSession.stop();
      clientSession.stop();
      await teardown(hostPeer, guestPeer);
    }
  });

  await releaseBackend();
}

/* ══════════════════════════════════════════════════════════ summary ═════ */

const failed = results.filter(result => !result.ok);
console.log(`\n${'═'.repeat(64)}`);
console.log(`${results.length - failed.length}/${results.length} checks passed`
  + (failed.length ? ` — ${failed.length} FAILED` : ', 0 failed'));
if (failed.length) {
  for (const result of failed) console.log(`  ✗ ${result.section} / ${result.name}`);
  process.exitCode = 1;
}
const skipped = !backend;
console.log(skipped ? 'note: real-WebRTC sections were skipped (no node-datachannel)'
  : 'note: sections B and C ran over real ICE/DTLS with iceServers: [] — no server was involved');
process.exit(process.exitCode ?? 0);
