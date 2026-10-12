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
    if (process.env.BO1Z_DEBUG) console.log(error.stack);
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
  const decodeBlobLabel = blob => decodeBlob(blob).label;
  const assertRejects = async (fn, pattern) => {
    try { await fn(); } catch (error) {
      assert.match(error.message, pattern); return;
    }
    assert.fail(`expected a rejection matching ${pattern}`);
  };

  /** Two real peers, rendezvoused only by copy-pasted blobs. */
  async function connectPair(options = {}) {
    const shared = { room: options.room ?? 'TEST-1234', bindAddress: '127.0.0.1',
                     heartbeatMs: 200, timeoutMs: 3000,
                     iceServers: options.iceServers ?? [], ...options.peerOptions };
    const errors = [];
    const host = new Peer({ role: 'host', label: options.label, ...shared, onError: e => errors.push(['host', e]) });
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

  /** Close and wait for the sockets to actually be gone (close() defers by byeGraceMs). */
  const teardown = async (...peers) => {
    for (const peer of peers) { try { peer.close(); } catch { /* already closed */ } }
    await Promise.race([Promise.all(peers.map(peer => peer.closed)), wait(3000)]);
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

  /**
   * The one movement function. Host and guest both call it, which is what makes
   * prediction and authority agree. It clamps what a remote client sends, so a
   * modified client cannot teleport its avatar.
   */
  const SPEED = 6;   // units per second
  const clampAxis = v => (Number.isFinite(v) ? Math.min(1, Math.max(-1, v)) : 0);
  function applyMove(axes, player, dt) {
    const step = Number.isFinite(dt) ? Math.min(0.25, Math.max(0, dt)) : 0;
    player.x = (player.x ?? 0) + clampAxis(axes.mx) * SPEED * step;
    player.y = (player.y ?? 0) + clampAxis(axes.my) * SPEED * step;
  }
  /** Host side: apply every queued input in order, with the guest's own dt. */
  function simulate(state, inputs) {
    for (const [id, player] of Object.entries(state)) {
      for (const input of inputs.get(id)?.queue ?? []) applyMove(input.axes, player, input.dt);
    }
  }
  const stateFor = state => Object.fromEntries(
    Object.entries(state).map(([id, p]) => [id, { x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100 }]));

  await test('guest input drives host simulation and converges both views', async () => {
    const { host: hostPeer, guest: guestPeer } = await connectPair({ room: 'NET-1', label: 'p2' });
    const rendered = [];
    const host = createHost({ simulate, stateFor, tickRate: 30,
                              initialState: { p1: { x: 0, y: 0 }, p2: { x: 0, y: 0 } } });
    host.addGuest('p2', hostPeer);
    const client = createClient({
      peer: guestPeer, inputRate: 60, interpolationMs: 100,
      initialState: { x: 0, y: 0 },
      readInput: () => ({ mx: 1, my: 0.5 }),
      applyInput: applyMove,
      onRender: state => rendered.push(state),
    });
    try {
      await wait(2000);
      const authoritative = host.state.p2;
      const prediction = client.predicted();
      assert.ok(authoritative.x > 5, `host barely moved the guest: x=${authoritative.x}`);
      // Same function, same inputs, same dt: on a clean link the only gap is the
      // handful of inputs still in flight, and reconciliation should never fire.
      assert.ok(Math.abs(authoritative.x - prediction.x) < 1.5,
        `desync: host x=${authoritative.x.toFixed(3)} predicted x=${prediction.x.toFixed(3)}`);
      assert.ok(client.stats.corrections <= 2,
        `${client.stats.corrections} corrections on a clean link - prediction and authority disagree`);
      assert.ok(rendered.length > 50, `only ${rendered.length} renders in 2 s`);
      assert.ok(client.buffer() > 2, 'guest is not keeping an interpolation buffer');
      assert.ok(client.stats.inputsSent > 50, 'inputs were not being sent');
      assert.ok(client.stats.pendingAck < 20, `inputs are not acknowledged: ${client.stats.pendingAck} pending`);
      assert.ok(host.stats.ticks > 40, `host only ran ${host.stats.ticks} ticks`);
      assert.ok('p1' in rendered.at(-1).remote, 'the guest never saw the host avatar in its render state');
      assert.ok(!client.stats.oversizedSnapshots, 'snapshots exceeded the size budget');
      assert.ok(host.stats.snapshotBytes < 1100, 'snapshot is near the unreliable cap');
      assert.ok(host.stats.inputsAccepted > 50, 'the host accepted too few inputs');
    } finally {
      host.stop();
      client.stop();
      await teardown(hostPeer, guestPeer);
    }
  });

  await test('25% frame loss on both sides: input redundancy keeps the views together', async () => {
    const { host: hostPeer, guest: guestPeer } = await connectPair({ room: 'NET-2', label: 'p2' });
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

    const host = createHost({ simulate, stateFor, tickRate: 30,
                              initialState: { p1: { x: 0, y: 0 }, p2: { x: 0, y: 0 } } });
    host.addGuest('p2', hostPeer);
    const client = createClient({
      peer: guestPeer, inputRate: 60, interpolationMs: 120,
      initialState: { x: 0, y: 0 },
      readInput: () => ({ mx: 1, my: 0 }),
      applyInput: applyMove,
      onRender: () => {},
    });
    try {
      await wait(3000);
      const authoritative = host.state.p2.x;
      const prediction = client.predicted().x;
      assert.ok(authoritative > 5, `host barely advanced under loss: x=${authoritative}`);
      // Without redundancy, each dropped input would leave the host permanently
      // behind; with it, the next packet re-sends the gap.
      const drift = Math.abs(authoritative - prediction);
      assert.ok(drift < 1.5, `drift ${drift.toFixed(2)} under 25% loss is too large `
        + `(host ${authoritative.toFixed(2)} vs predicted ${prediction.toFixed(2)})`);
      assert.ok(hostPeer.framesDropped + guestPeer.framesDropped > 10,
        'the loss injection did not actually drop anything - this test proves nothing');
      assert.ok(client.stats.received > 20, 'too few snapshots survived');
      assert.ok(client.stats.snapshotLossPct > 5,
        `loss estimate is ${client.stats.snapshotLossPct}% with 25% injected`);
      assert.ok(host.stats.inputsDuplicate > 0, 'redundant batches were never de-duplicated');
    } finally {
      host.stop();
      client.stop();
      await teardown(hostPeer, guestPeer);
    }
  });

  await test('a late, out-of-order snapshot is ignored instead of rewinding', async () => {
    const { host: hostPeer, guest: guestPeer } = await connectPair({ room: 'NET-3', label: 'p2' });
    const host = createHost({ simulate, stateFor, tickRate: 30,
                              initialState: { p1: { x: 0, y: 0 }, p2: { x: 0, y: 0 } } });
    host.addGuest('p2', hostPeer);
    const client = createClient({
      peer: guestPeer, inputRate: 60, initialState: { x: 0, y: 0 },
      readInput: () => ({ mx: 1 }), applyInput: applyMove, onRender: () => {},
    });
    try {
      await wait(800);
      const before = client.predicted().x;
      const tick = client.stats.lastSnapshotTick;
      // Inject a stale snapshot directly, as if the network had reordered it.
      guestPeer.onMessage({ data: { k: 'snap', v: 1, tick: Math.max(1, tick - 5), t: 1,
                                    players: { p2: { x: -500, y: -500 } }, ack: -1 },
                            reliable: false });
      await wait(150);
      assert.ok(client.stats.outOfOrderSnapshots >= 1, 'the stale snapshot was not detected');
      assert.ok(client.predicted().x >= before - 1,
        `the client rewound to a stale snapshot (x went ${before} -> ${client.predicted().x})`);
    } finally {
      host.stop();
      client.stop();
      await teardown(hostPeer, guestPeer);
    }
  });

  await test('a malformed netcode message is reported and does not kill the session', async () => {
    const { host: hostPeer, guest: guestPeer } = await connectPair({ room: 'NET-4', label: 'p2' });
    const problems = [];
    const host = createHost({ simulate, stateFor, tickRate: 30,
                              onError: error => problems.push(error),
                              initialState: { p1: { x: 0, y: 0 }, p2: { x: 0, y: 0 } } });
    host.addGuest('p2', hostPeer);
    try {
      guestPeer.sendJSON({ k: 'in', v: 999, inputs: [] });   // wrong version
      guestPeer.sendJSON({ nonsense: true });                 // not netcode at all
      await wait(400);
      assert.ok(problems.length >= 1, 'a malformed message was silently accepted');
      assert.match(problems[0].message, /unknown shape|protocol/i);
      assert.equal(hostPeer.state, STATE.OPEN, 'the session died on bad input');
      const ticks = host.stats.ticks;
      await wait(300);
      assert.ok(host.stats.ticks > ticks, 'the host stopped simulating after a bad message');
    } finally {
      host.stop();
      await teardown(hostPeer, guestPeer);
    }
  });

  await test('application events cross reliably; the host learns the sender from the connection', async () => {
    const { host: hostPeer, guest: guestPeer } = await connectPair({ room: 'NET-5', label: 'p2' });
    const atHost = [];
    const atGuest = [];
    const joins = [];
    const host = createHost({ simulate, stateFor, tickRate: 30,
                              onEvent: event => atHost.push(event),
                              onGuestJoin: id => joins.push(id),
                              initialState: { p1: { x: 0, y: 0 }, p2: { x: 0, y: 0 } } });
    host.addGuest('p2', hostPeer);
    const client = createClient({ peer: guestPeer, inputRate: 60,
                                  onEvent: event => atGuest.push(event),
                                  initialState: { x: 0, y: 0 },
                                  readInput: () => ({}), applyInput: applyMove,
                                  onRender: () => {} });
    try {
      host.emit('round', { n: 12 });
      client.emit('downed', { by: 'zombie' });
      for (let attempt = 0; attempt < 60 && (!atHost.length || !atGuest.length); attempt++) await wait(50);
      assert.equal(atGuest.length, 1);
      assert.equal(atGuest[0].name, 'round');
      assert.deepEqual(atGuest[0].payload, { n: 12 });
      assert.equal(atHost.length, 1);
      assert.equal(atHost[0].name, 'downed');
      assert.deepEqual(atHost[0].payload, { by: 'zombie' });
      // Identity comes from the connection, not from anything the message says.
      assert.equal(atHost[0].from, 'p2');
      assert.deepEqual(joins, ['p2'], 'onGuestJoin did not fire for the guest');
    } finally {
      host.stop();
      client.stop();
      await teardown(hostPeer, guestPeer);
    }
  });

  /* ─────────────────────────────────────────────── D. four players ───── */
  section('D. four players (star topology, one invite per slot, no server)');

  const { openLobby, joinLobby } = await import('../lobby.js');
  const lobbyPeer = { bindAddress: '127.0.0.1', heartbeatMs: 200, timeoutMs: 3000, iceServers: [] };
  const SPAWN = {
    p1: { x: 100, y: 100 }, p2: { x: 700, y: 100 }, p3: { x: 100, y: 420 }, p4: { x: 700, y: 420 },
  };
  // Each guest walks in a different direction so the test can see every avatar move.
  const HEADING = { p2: { mx: 1, my: 0 }, p3: { mx: 0, my: 1 }, p4: { mx: -1, my: 0 } };

  /** Build a 4-player session and connect every guest through the lobby. */
  async function fourPlayers({ room, peerOptions = lobbyPeer, guestAxes = HEADING, drop = 0 } = {}) {
    const clients = new Map();
    const guestPeers = new Map();
    const events = { joins: [], leaves: [] };
    const host = createHost({
      simulate, stateFor, tickRate: 30, maxGuests: 3,
      initialState: { p1: { ...SPAWN.p1 } },
      onGuestJoin: (id) => { host.state[id] = { ...SPAWN[id] }; events.joins.push(id); },
      onGuestLeave: (id) => { delete host.state[id]; events.leaves.push(id); },
    });
    const lobby = await openLobby({
      room, peerOptions,
      onConnect: (slot, peer) => host.addGuest(slot, peer),
      onDrop: (slot) => { if (host.guests().includes(slot)) host.removeGuest(slot, 'closed'); },
      onError: () => {},
    });
    try {
      for (const slot of ['p2', 'p3', 'p4']) {
        const offer = lobby.offerFor(slot);
        const joined = await joinLobby(offer, { peerOptions });
        assert.equal(joined.slot, slot, 'the guest did not inherit its slot from the offer');
        guestPeers.set(slot, joined.peer);
        await lobby.answer(slot, joined.answer);
      }
    } catch (error) {
      // Never leak a half-built session into the next test.
      for (const peer of guestPeers.values()) { try { peer.close(); } catch { /* gone */ } }
      host.stop();
      await lobby.close();
      throw error;
    }
    for (const slot of ['p2', 'p3', 'p4']) {
      const peer = guestPeers.get(slot);
      const axes = guestAxes[slot] ?? {};
      if (drop) {
        const original = peer.send.bind(peer);
        peer.send = (data, options = {}) => {
          if (!options.reliable && options.reliable !== undefined && Math.random() < drop) {
            peer.framesDropped++;
            return false;
          }
          return original(data, options);
        };
      }
      clients.set(slot, createClient({
        peer, id: slot, inputRate: 60, initialState: { ...SPAWN[slot] },
        readInput: () => ({ ...axes }), applyInput: applyMove, onRender: () => {},
      }));
    }
    const deadline = Date.now() + 15000;
    while (host.guests().length < 3 && Date.now() < deadline) await wait(50);
    return { host, lobby, clients, guestPeers, events };
  }
  const teardown4 = async ({ host, lobby, clients, guestPeers }) => {
    for (const client of clients.values()) client.stop();
    host.stop();
    await lobby.close();
    for (const peer of guestPeers.values()) { try { peer.close(); } catch { /* gone */ } }
    await Promise.race([Promise.all([...guestPeers.values()].map(peer => peer.closed)), wait(3000)]);
  };

  await test('invites: one offer per slot, each labelled, and a wrong-slot answer is refused', async () => {
    const lobby = await openLobby({ room: 'LOBBY-1', peerOptions: lobbyPeer, onConnect: () => {} });
    try {
      const labels = ['p2', 'p3', 'p4'].map(slot => decodeBlobLabel(lobby.offerFor(slot)));
      assert.deepEqual(labels, ['p2', 'p3', 'p4']);
      const offers = new Set(['p2', 'p3', 'p4'].map(slot => lobby.offerFor(slot)));
      assert.equal(offers.size, 3, 'two slots shared an offer');
      // The p2 guest pastes their answer into the p3 slot: refused, and nothing connects.
      const guest = await joinLobby(lobby.offerFor('p2'), { peerOptions: lobbyPeer });
      await assertRejects(() => lobby.answer('p3', guest.answer), /slot "p2".*"p3"/);
      // Re-answering a slot that is already answered is refused too.
      await lobby.answer('p2', guest.answer);
      await assertRejects(() => lobby.answer('p2', guest.answer), /already been answered/);
      guest.peer.close();
    } finally {
      await lobby.close();
    }
  });

  await test('four players converge: every view contains the other three, and each guest moves', async () => {
    const session = await fourPlayers({ room: 'LOBBY-2' });
    try {
      await wait(2500);
      assert.deepEqual(session.host.guests().sort(), ['p2', 'p3', 'p4'], 'not all guests connected');
      assert.equal(session.host.guests().length, 3);
      for (const slot of ['p2', 'p3', 'p4']) {
        const moved = Math.hypot(session.host.state[slot].x - SPAWN[slot].x,
                                 session.host.state[slot].y - SPAWN[slot].y);
        assert.ok(moved > 5, `${slot} did not move on the host (moved ${moved.toFixed(2)})`);
        const client = session.clients.get(slot);
        const remote = client.renderState().remote;
        assert.deepEqual(Object.keys(remote).sort(), ['p1', ...['p2', 'p3', 'p4'].filter(s => s !== slot)].sort(),
          `${slot} sees ${Object.keys(remote).join(',')}`);
        const authoritative = session.host.state[slot];
        const predicted = client.predicted();
        assert.ok(Math.abs(authoritative.x - predicted.x) < 1.5 && Math.abs(authoritative.y - predicted.y) < 1.5,
          `${slot} prediction ${JSON.stringify(predicted)} disagrees with host ${JSON.stringify(authoritative)}`);
      }
      assert.ok(session.host.stats.ticks > 60);
    } finally {
      await teardown4(session);
    }
  });

  await test('a guest cannot move another player or send an impossible step', async () => {
    const session = await fourPlayers({ room: 'LOBBY-3', guestAxes: { p2: {}, p3: {}, p4: {} } });
    try {
      await wait(400);
      const before = JSON.parse(JSON.stringify(session.host.state));
      // p2's connection claims to be p3 and sends a huge, out-of-range step.
      session.guestPeers.get('p2').sendJSON({
        k: 'in', v: 1, id: 'p3',
        inputs: [{ seq: 1_000_000, axes: { mx: 1e9, my: -1e9 }, dt: 1000 }],
      });
      await wait(300);
      assert.equal(session.host.state.p3.x, before.p3.x, 'the spoofed id moved p3');
      assert.equal(session.host.state.p3.y, before.p3.y, 'the spoofed id moved p3 (y)');
      const jump = Math.hypot(session.host.state.p2.x - before.p2.x, session.host.state.p2.y - before.p2.y);
      assert.ok(jump <= SPEED * 0.25 * Math.SQRT2 + 1e-6,
        `one input moved p2 by ${jump.toFixed(2)} units, more than the clamped maximum`);
      assert.ok(session.host.stats.inputsAccepted > 0);
    } finally {
      await teardown4(session);
    }
  });

  await test('four players at 30% frame loss still stay together', async () => {
    const session = await fourPlayers({ room: 'LOBBY-4', drop: 0.3 });
    try {
      await wait(3000);
      for (const slot of ['p2', 'p3', 'p4']) {
        const client = session.clients.get(slot);
        const drift = Math.hypot(session.host.state[slot].x - client.predicted().x,
                                 session.host.state[slot].y - client.predicted().y);
        assert.ok(drift < 2.5, `${slot} drifted ${drift.toFixed(2)} units under 30% loss`);
        assert.ok(client.stats.received > 20, `${slot} received only ${client.stats.received} snapshots`);
      }
      assert.ok(session.host.stats.inputsDuplicate > 0, 'redundant input batches did nothing');
    } finally {
      await teardown4(session);
    }
  });

  await test('a guest leaving is removed for everyone, and the slot can be re-invited', async () => {
    const session = await fourPlayers({ room: 'LOBBY-5' });
    try {
      await wait(600);
      const leaving = session.guestPeers.get('p3');
      leaving.close();
      await wait(1200);
      assert.ok(!session.host.guests().includes('p3'), 'the host still lists p3');
      assert.ok(!('p3' in session.host.state), 'p3 is still in the simulation');
      assert.ok(session.events.leaves.includes('p3'), 'onGuestLeave did not fire');
      // The remaining two keep simulating through the departure.
      const ticks = session.host.stats.ticks;
      await wait(300);
      assert.ok(session.host.stats.ticks > ticks, 'the room stopped after a departure');
      assert.deepEqual(session.host.guests().sort(), ['p2', 'p4']);

      // Re-invite the slot and bring a fresh guest in.
      const offer = await session.lobby.invite('p3');
      const joined = await joinLobby(offer, { peerOptions: lobbyPeer });
      assert.equal(joined.slot, 'p3');
      await session.lobby.answer('p3', joined.answer);
      const deadline = Date.now() + 10000;
      while (!session.host.guests().includes('p3') && Date.now() < deadline) await wait(50);
      assert.ok(session.host.guests().includes('p3'), 'the re-invited guest never connected');
      joined.peer.close();
    } finally {
      await teardown4(session);
    }
  });

  await test('a guest that vanishes without a goodbye is removed after the heartbeat timeout', async () => {
    const session = await fourPlayers({ room: 'LOBBY-6' });
    try {
      await wait(500);
      // Kill p3's sockets with no BYE, as a closed laptop lid would.
      session.guestPeers.get('p3')._teardown();
      const deadline = Date.now() + 9000;
      while (session.host.guests().includes('p3') && Date.now() < deadline) await wait(100);
      assert.ok(!session.host.guests().includes('p3'), 'the silent guest still holds its slot');
      assert.ok(!('p3' in session.host.state), 'the silent guest is still in the simulation');
      assert.ok(session.events.leaves.includes('p3'), 'onGuestLeave did not fire for the silent guest');
      assert.ok(session.host.guests().includes('p2') && session.host.guests().includes('p4'),
        'the other guests were disturbed by the departure');
    } finally {
      await teardown4(session);
    }
  });

  await test('the room refuses a fourth guest and an unknown slot', async () => {
    const fake = () => ({ state: 'open', send() {}, closed: new Promise(() => {}), framesDropped: 0,
                          onMessage: () => {} });
    const host = createHost({ simulate, stateFor, maxGuests: 3, initialState: {} });
    try {
      host.addGuest('p2', fake());
      host.addGuest('p3', fake());
      host.addGuest('p4', fake());
      assert.throws(() => host.addGuest('p5', fake()), /room is full/);
      assert.throws(() => host.addGuest('p2', fake()), /already connected/);
    } finally {
      host.stop();
    }
    await assertRejects(() => openLobby({ room: 'X', slots: ['p9'], onConnect: () => {} }), /unknown slot/);
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
