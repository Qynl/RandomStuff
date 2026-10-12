/**
 * Browser demo for the serverless transport. No build step, no bundler, no
 * dependencies: the ES modules are loaded straight off disk.
 *
 * Serve it over http(s) - WebRTC needs a secure context, which localhost and any
 * https origin both satisfy:
 *
 *     python3 -m http.server 8080        # then open http://localhost:8080/demo.html
 *
 * Open the page twice, make one Host and one Guest, agree on a room code, and swap
 * the two blobs. With ICE servers left at "none" the page makes zero network
 * requests after loading: the only packets that move are between the two peers.
 */

import { Peer, STATE } from './transport.js';
import { createHost, createClient } from './netcode.js';
import { randomRoomCode } from './protocol.js';

const $ = id => document.getElementById(id);
const logBox = $('log');

function log(message, kind = '') {
  const line = document.createElement('div');
  if (kind) line.className = kind;
  const stamp = new Date().toISOString().slice(11, 19);
  line.textContent = `${stamp}  ${message}`;
  logBox.append(line);
  logBox.scrollTop = logBox.scrollHeight;
}

/* ------------------------------------------------------------------ world */

const ARENA = { w: 800, h: 520 };
const PLAYER = 26;
const SPEED = 220;                 // world units per second
const TICK_RATE = 30;
const INPUT_RATE = 60;

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

/** Both peers run the same movement rule; only the host is allowed to own it. */
function move(player, axes, dt) {
  player.x = clamp(player.x + (axes.mx ?? 0) * SPEED * dt, PLAYER / 2, ARENA.w - PLAYER / 2);
  player.y = clamp(player.y + (axes.my ?? 0) * SPEED * dt, PLAYER / 2, ARENA.h - PLAYER / 2);
}

const keys = new Set();
addEventListener('keydown', event => {
  const key = event.key.toLowerCase();
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(key)) event.preventDefault();
  keys.add(key);
});
addEventListener('keyup', event => keys.delete(event.key.toLowerCase()));
addEventListener('blur', () => keys.clear());

function readAxes() {
  const mx = (keys.has('d') || keys.has('arrowright') ? 1 : 0)
           - (keys.has('a') || keys.has('arrowleft') ? 1 : 0);
  const my = (keys.has('s') || keys.has('arrowdown') ? 1 : 0)
           - (keys.has('w') || keys.has('arrowup') ? 1 : 0);
  // Normalise diagonals so they are not faster than straight lines.
  const length = Math.hypot(mx, my) || 1;
  return { mx: mx / length, my: my / length };
}

/* ------------------------------------------------------------------- view */

const view = { self: { x: ARENA.w * 0.3, y: ARENA.h / 2 },
               remote: null, role: null, connected: false };
const canvas = $('game');
const context = canvas.getContext('2d');

function drawSquare(x, y, colour, label) {
  context.fillStyle = colour;
  context.fillRect(x - PLAYER / 2, y - PLAYER / 2, PLAYER, PLAYER);
  context.fillStyle = '#9aa0a6';
  context.font = '11px ui-monospace, monospace';
  context.textAlign = 'center';
  context.fillText(label, x, y - PLAYER / 2 - 6);
}

function frame() {
  context.clearRect(0, 0, ARENA.w, ARENA.h);
  context.strokeStyle = '#20242c';
  context.lineWidth = 1;
  for (let x = 0; x < ARENA.w; x += 40) {
    context.beginPath(); context.moveTo(x, 0); context.lineTo(x, ARENA.h); context.stroke();
  }
  for (let y = 0; y < ARENA.h; y += 40) {
    context.beginPath(); context.moveTo(0, y); context.lineTo(ARENA.w, y); context.stroke();
  }
  if (!view.connected) {
    context.fillStyle = '#7d8590';
    context.font = '13px ui-monospace, monospace';
    context.textAlign = 'center';
    context.fillText('not connected — swap blobs above, then move with WASD',
                     ARENA.w / 2, ARENA.h / 2);
  }
  // The remote player is drawn from interpolated snapshots; without one yet, draw
  // nothing rather than a stale square in the wrong place.
  const remote = view.role === 'host' ? hostRemote() : view.remote;
  if (remote) drawSquare(remote.x, remote.y, '#4a7fb5', 'peer (interpolated)');
  const self = view.role === 'host' ? hostSelf() : view.self;
  if (self) drawSquare(self.x, self.y, '#b5654a', 'you (predicted)');
  requestAnimationFrame(frame);
}

let hostSession = null;
const hostSelf = () => hostSession?.state?.[myId()] ?? null;
const hostRemote = () => hostSession?.state?.[myId() === 'host' ? 'guest' : 'host'] ?? null;
const myId = () => $('role').value;

/* ---------------------------------------------------------------- session */

let peer = null;
let clientSession = null;
let lossRate = 0;

function setStatePill(state) {
  const pill = $('state');
  pill.textContent = state;
  pill.className = `pill ${state === 'open' ? 'open' : state === 'failed' ? 'failed' : ''}`;
  $('s-state').textContent = state;
}

/**
 * Drop a fraction of unreliable frames, locally, to make the loss behaviour
 * visible without needing a bad network. Reliable frames are never touched, which
 * is what a real lossy link looks like: SCTP retransmits the reliable stream.
 */
function installLoss(peerInstance) {
  const original = peerInstance.send.bind(peerInstance);
  peerInstance.send = (data, options = {}) => {
    if (options.reliable === false && lossRate > 0 && Math.random() < lossRate) {
      peerInstance.framesDropped++;
      return false;
    }
    return original(data, options);
  };
}

async function startHost() {
  peer = new Peer({
    role: 'host',
    room: $('room').value.trim(),
    iceServers: $('ice').value ? [$('ice').value] : [],
    onState: state => { setStatePill(state); log(`state: ${state}`, state === 'failed' ? 'err' : 'dim'); },
    onError: error => log(`error: ${error.message}`, 'err'),
    onRtt: rtt => { $('s-rtt').textContent = `${rtt} ms`; },
  });
  installLoss(peer);
  const blob = await peer.createOffer();
  $('out').value = blob;
  $('copy').disabled = false;
  $('accept').disabled = false;
  $('accept').textContent = 'Accept their answer';
  log(`offer blob ready (${blob.length} chars, `
    + `${peer.stats.candidates} ICE candidate(s), ${peer.stats.iceServers.length} ICE server(s))`);
  log(peer.stats.iceServers.length ? 'using a public STUN server for address discovery'
    : 'no ICE server configured — nothing outside this page will be contacted', 'ok');
  $('start').disabled = true;          // a second Start would build a second Peer
  peer.hello.then(beginSession, error => log(`handshake failed: ${error.message}`, 'err'));
}

async function startGuest() {
  const offer = $('in').value.trim();
  if (!offer) { log('paste the host’s offer blob first', 'warn'); return; }
  peer = new Peer({
    role: 'guest',
    room: $('room').value.trim(),
    iceServers: $('ice').value ? [$('ice').value] : [],
    onState: state => { setStatePill(state); log(`state: ${state}`, state === 'failed' ? 'err' : 'dim'); },
    onError: error => log(`error: ${error.message}`, 'err'),
    onRtt: rtt => { $('s-rtt').textContent = `${rtt} ms`; },
  });
  installLoss(peer);
  try {
    const blob = await peer.acceptOffer(offer);
    $('out').value = blob;
    $('copy').disabled = false;
    log(`answer blob ready (${blob.length} chars) — send it back to the host`, 'ok');
  } catch (error) {
    log(error.message, 'err');
    setStatePill('failed');
    return;
  }
  $('start').disabled = true;
  peer.hello.then(beginSession, error => log(`handshake failed: ${error.message}`, 'err'));
}

function beginSession() {
  view.role = peer.role;
  view.connected = true;
  log(`connected to ${peer.peerRole} in room ${peer.room}`, 'ok');
  log(`DTLS fingerprint verified out-of-band: ${peer.fingerprint?.slice(0, 23)}…`, 'dim');

  if (peer.role === 'host') {
    hostSession = createHost({
      peer,
      tickRate: TICK_RATE,
      initialState: { host: { x: ARENA.w * 0.3, y: ARENA.h / 2 },
                      guest: { x: ARENA.w * 0.7, y: ARENA.h / 2 } },
      // The host is authoritative: it applies its own input and every queued
      // guest input, in arrival order, once per tick.
      simulate: (state, inputs, dt) => {
        move(state.host, readAxes(), dt);
        for (const input of inputs.get('guest')?.queue ?? []) move(state.guest, input.axes, input.dt || dt);
      },
      stateFor: state => ({ host: { x: Math.round(state.host.x * 10) / 10,
                                    y: Math.round(state.host.y * 10) / 10 },
                            guest: { x: Math.round(state.guest.x * 10) / 10,
                                     y: Math.round(state.guest.y * 10) / 10 } }),
      onGuestJoin: id => log(`guest ${id} joined`, 'ok'),
      onGuestLeave: id => log(`guest ${id} went silent`, 'warn'),
      onError: error => log(`netcode: ${error.message}`, 'warn'),
    });
    log(`hosting: simulating at ${TICK_RATE} Hz, guests are interpolated`, 'ok');
  } else {
    clientSession = createClient({
      peer,
      id: 'guest',
      inputRate: INPUT_RATE,
      interpolationMs: 100,
      initialState: { x: ARENA.w * 0.7, y: ARENA.h / 2 },
      readInput: readAxes,
      applyInput: (axes, predicted, dt) => move(predicted, axes, dt),
      onRender: state => {
        view.self = state.self;
        view.remote = state.remote?.host ?? null;
      },
      onError: error => log(`netcode: ${error.message}`, 'warn'),
    });
    log(`joined: predicting locally at ${INPUT_RATE} Hz, rendering the host 100 ms behind`, 'ok');
  }
  $('close').disabled = false;
  $('start').disabled = true;
  $('accept').disabled = true;
}

/* --------------------------------------------------------------------- ui */

$('room').value = randomRoomCode();
$('reroll').onclick = () => { $('room').value = randomRoomCode(); };
$('copy').onclick = async () => {
  try {
    await navigator.clipboard.writeText($('out').value);
    log('blob copied to the clipboard', 'dim');
  } catch {
    $('out').select();
    log('clipboard blocked — the blob is selected, copy it manually', 'warn');
  }
};
$('start').onclick = () => ($('role').value === 'host' ? startHost() : startGuest());
$('accept').onclick = async () => {
  if (!peer || peer.role !== 'host') return;
  try {
    await peer.acceptAnswer($('in').value.trim());
    log('answer accepted — connecting', 'dim');
  } catch (error) {
    log(error.message, 'err');
    setStatePill('failed');
  }
};
$('close').onclick = () => {
  hostSession?.stop();
  clientSession?.stop();
  hostSession = clientSession = null;
  peer?.close();
  peer = null;
  view.connected = false;
  $('start').disabled = false;
  $('close').disabled = true;
  log('disconnected', 'dim');
};
$('loss').onchange = event => {
  lossRate = Number(event.target.value);
  log(`simulated unreliable-frame loss set to ${(lossRate * 100).toFixed(0)} %`, 'warn');
};
$('role').onchange = () => {
  $('accept').textContent = 'Connect';
  $('accept').disabled = true;
};

setInterval(() => {
  if (!peer) return;
  const stats = peer.stats;
  $('s-tick').textContent = hostSession ? hostSession.stats.ticks ?? 0
    : clientSession?.stats.lastSnapshotTick ?? 0;
  $('s-buffer').textContent = clientSession?.buffer() ?? '—';
  $('s-pending').textContent = clientSession?.pendingInputs() ?? '—';
  $('s-corr').textContent = clientSession?.stats.corrections ?? 0;
  $('s-dropped').textContent = stats.framesDropped;
  $('s-bytes').textContent = `${(stats.bytesSent / 1024).toFixed(1)} / ${(stats.bytesReceived / 1024).toFixed(1)} KB`;
}, 250);

setStatePill(STATE.NEW);
requestAnimationFrame(frame);
log('ready. Open this page in a second tab or on a second machine to play.');
