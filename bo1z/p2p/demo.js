/**
 * Four-player demo. Nothing here talks to a server: every connection is made from
 * blobs the players copy between chat windows (see lobby.js).
 *
 * Host (p1): open a room, copy one invite per free slot to each friend, paste each
 * friend's answer back, click Connect.
 * Guest (p2-p4): paste your invite, copy the answer back to the host.
 */

import { openLobby, joinLobby, GUEST_SLOTS } from './lobby.js';
import { createHost, createClient } from './netcode.js';
import { randomRoomCode } from './protocol.js';

const $ = id => document.getElementById(id);
const canvas = $('game');
const ctx = canvas.getContext('2d');

/* ----------------------------------------------------------- the game */

const W = 800;
const H = 520;
const SPEED = 220;          // px per second
const PAD = 14;             // half the square's size; keeps squares on the canvas
const MAX_DT = 0.25;
const TICK_MS = 1000 / 30;
const SPAWN = {
  p1: { x: 120, y: 120 }, p2: { x: 680, y: 120 }, p3: { x: 120, y: 400 }, p4: { x: 680, y: 400 },
};
const COLOUR = { p1: '#58a6ff', p2: '#f0883e', p3: '#7ee787', p4: '#d2a8ff' };
const round2 = value => Math.round(value * 100) / 100;

/**
 * THE movement function. Host and guests both run this exact code on the same
 * inputs, which is what keeps prediction and authority identical. It clamps every
 * value, so a modified client cannot teleport or leave the arena.
 */
export function applyMove(axes, player, dt) {
  const step = Number.isFinite(dt) ? Math.min(MAX_DT, Math.max(0, dt)) : 0;
  const x = (player.x ?? 0) + clampAxis(axes?.mx) * SPEED * step;
  const y = (player.y ?? 0) + clampAxis(axes?.my) * SPEED * step;
  player.x = Math.min(W - PAD, Math.max(PAD, x));
  player.y = Math.min(H - PAD, Math.max(PAD, y));
}
function clampAxis(value) {
  return Number.isFinite(value) ? Math.min(1, Math.max(-1, value)) : 0;
}

const KEY_AXIS = {
  KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0],
  KeyW: [0, -1], ArrowUp: [0, -1], KeyS: [0, 1], ArrowDown: [0, 1],
};
const keys = new Set();
addEventListener('keydown', event => {
  if (KEY_AXIS[event.code]) { keys.add(event.code); event.preventDefault(); }
});
addEventListener('keyup', event => keys.delete(event.code));
addEventListener('blur', () => keys.clear());
function keyAxes() {
  let mx = 0;
  let my = 0;
  for (const key of keys) { mx += KEY_AXIS[key][0]; my += KEY_AXIS[key][1]; }
  return { mx: clampAxis(mx), my: clampAxis(my) };
}

/* ------------------------------------------------------------ helpers */

function log(message, kind = '') {
  const line = document.createElement('div');
  if (kind) line.className = kind;
  line.textContent = `${new Date().toLocaleTimeString()}  ${message}`;
  $('log').prepend(line);
}

const ICE = () => {
  const value = $('ice').value.trim();
  return value ? [value] : [];
};

/** Simulated packet loss on unreliable traffic only, in the outgoing direction. */
const lossRate = () => Number($('loss').value) / 100;
function withLoss(peer) {
  const original = peer.send.bind(peer);
  peer.send = (data, options = {}) => {
    if (options.reliable === false && Math.random() < lossRate()) {
      peer.framesDropped++;
      return false;
    }
    return original(data, options);
  };
  return peer;
}

/* --------------------------------------------------------------- host */

let host = null;
let lobby = null;
let hostFrames = { prev: {}, cur: {}, at: 0 };   // for smooth display of the 30 Hz host state

function hostSimulate(state, inputs, dt) {
  const prev = JSON.parse(JSON.stringify(state));
  for (const [id, player] of Object.entries(state)) {
    if (id === 'p1') {
      applyMove(keyAxes(), player, dt);          // the host's own avatar, sampled on the tick
    } else {
      // Every input the guest sent since the last tick, in order, with its own dt.
      for (const input of inputs.get(id)?.queue ?? []) applyMove(input.axes, player, input.dt);
    }
  }
  hostFrames = { prev, cur: JSON.parse(JSON.stringify(state)), at: performance.now() };
}

async function openRoom() {
  if (host) return;
  const room = randomRoomCode();
  $('room').textContent = room;
  host = createHost({
    tickRate: 30,
    maxGuests: 3,
    simulate: hostSimulate,
    stateFor: state => Object.fromEntries(
      Object.entries(state).map(([id, p]) => [id, { x: round2(p.x), y: round2(p.y) }])),
    initialState: { p1: { ...SPAWN.p1 } },
    onGuestJoin: id => { host.state[id] = { ...SPAWN[id] }; log(`${id} is in the room`, 'ok'); },
    onGuestLeave: (id, reason) => { delete host.state[id]; log(`${id} left (${reason})`, 'warn'); },
    onEvent: event => log(`${event.from}: ${event.name} ${JSON.stringify(event.payload)}`),
    onError: error => log(`host: ${error.message}`, 'err'),
  });
  lobby = await openLobby({
    room,
    peerOptions: { iceServers: ICE() },
    onConnect: (slot, peer) => {
      try {
        host.addGuest(slot, withLoss(peer));
        setSlot(slot, 'connected');
      } catch (error) {
        log(`${slot}: ${error.message}`, 'err');
      }
    },
    onDrop: slot => {
      if (host.guests().includes(slot)) host.removeGuest(slot, 'closed');
      setSlot(slot, 'dropped');
      log(`${slot} disconnected`, 'warn');
    },
    onError: (error, slot) => log(`${slot}: ${error.message}`, 'err'),
  });
  for (const slot of GUEST_SLOTS) {
    $(`offer-${slot}`).value = lobby.offerFor(slot);
    setSlot(slot, 'offer');
  }
  log(`room ${room} open. Send each friend the invite for their slot.`, 'ok');
  $('open-room').disabled = true;
}

function setSlot(slot, state) {
  const labels = {
    offer: 'waiting for their answer', answered: 'connecting…',
    connected: 'connected', dropped: 'free — send a new invite',
  };
  const pill = $(`pill-${slot}`);
  pill.textContent = labels[state];
  pill.className = `pill ${state === 'connected' ? 'open' : state === 'dropped' ? 'failed' : ''}`;
  $(`reinvite-${slot}`).hidden = state !== 'dropped';
  $(`connect-${slot}`).disabled = state === 'connected' || state === 'answered';
  $(`answer-${slot}`).disabled = state === 'connected' || state === 'answered';
}

async function connectAnswer(slot) {
  try {
    await lobby.answer(slot, $(`answer-${slot}`).value.trim());
    setSlot(slot, 'answered');
    $(`answer-${slot}`).value = '';
    log(`${slot} answered; connecting`);
  } catch (error) {
    log(`${slot}: ${error.message}`, 'err');
  }
}

async function reinvite(slot) {
  try {
    const offer = await lobby.invite(slot);
    $(`offer-${slot}`).value = offer;
    setSlot(slot, 'offer');
    log(`new invite for ${slot}`);
  } catch (error) {
    log(`${slot}: ${error.message}`, 'err');
  }
}

function buildSlotRows() {
  $('slots').innerHTML = GUEST_SLOTS.map(slot => `
    <div class="slot">
      <div class="row"><b style="color:${COLOUR[slot]}">${slot}</b>
        <span class="pill" id="pill-${slot}">not open</span></div>
      <label>Invite for ${slot} (send to your friend)</label>
      <div class="row"><textarea id="offer-${slot}" readonly></textarea></div>
      <button id="copy-${slot}">Copy invite</button>
      <button id="reinvite-${slot}" hidden>New invite</button>
      <label>Their answer (paste here)</label>
      <textarea id="answer-${slot}" placeholder="BO1ZP2P1.…"></textarea>
      <button class="primary" id="connect-${slot}">Connect ${slot}</button>
    </div>`).join('');
  for (const slot of GUEST_SLOTS) {
    $(`copy-${slot}`).onclick = () => copy($(`offer-${slot}`).value, `invite for ${slot}`);
    $(`connect-${slot}`).onclick = () => connectAnswer(slot);
    $(`reinvite-${slot}`).onclick = () => reinvite(slot);
  }
}

/* -------------------------------------------------------------- guest */

let client = null;
let guest = null;

async function joinRoom() {
  if (guest) return;
  const offer = $('join-offer').value.trim();
  try {
    guest = await joinLobby(offer, {
      peerOptions: { iceServers: ICE() },
      onError: error => log(`guest: ${error.message}`, 'err'),
    });
  } catch (error) {
    log(`that invite did not work: ${error.message}`, 'err');
    guest = null;
    return;
  }
  withLoss(guest.peer);
  $('answer-out').value = guest.answer;
  $('me').textContent = guest.slot;
  $('me').style.color = COLOUR[guest.slot] ?? '#e6e6e6';
  log(`you are ${guest.slot} in room ${guest.room}. Send the answer back to the host.`, 'ok');
  guest.peer.hello.then(() => {
    client = createClient({
      peer: guest.peer,
      id: guest.slot,
      inputRate: 60,
      initialState: { ...SPAWN[guest.slot] },
      readInput: keyAxes,
      applyInput: applyMove,
      onRender: () => {},
      onEvent: event => log(`${event.kind === 'leave' ? event.id + ' left' : 'host: ' + event.name}`),
    });
    log('connected to the host', 'ok');
  }, () => { /* the handshake failure is reported through the peer's onError */ });
  guest.peer.closed.then(() => log('disconnected from the host', 'warn'));
}

/* ------------------------------------------------------------ drawing */

function drawSquare(id, x, y, label) {
  ctx.fillStyle = COLOUR[id] ?? '#cccccc';
  ctx.fillRect(x - PAD, y - PAD, PAD * 2, PAD * 2);
  ctx.fillStyle = '#e6e6e6';
  ctx.font = '12px ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.fillText(label ?? id, x, y - PAD - 6);
}

function draw() {
  ctx.fillStyle = '#0d0f13';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#1b2029';
  ctx.strokeRect(0.5, 0.5, W - 1, H - 1);

  if (host) {
    // Interpolate the 30 Hz authoritative state across display frames.
    const alpha = Math.min(1, Math.max(0, (performance.now() - hostFrames.at) / TICK_MS));
    for (const [id, cur] of Object.entries(hostFrames.cur)) {
      const prev = hostFrames.prev[id] ?? cur;
      drawSquare(id, prev.x + (cur.x - prev.x) * alpha, prev.y + (cur.y - prev.y) * alpha,
                 id === 'p1' ? 'p1 (host)' : id);
    }
  } else if (client) {
    const render = client.renderState();
    for (const [id, player] of Object.entries(render.remote ?? {})) {
      drawSquare(id, player.x, player.y);
    }
    if (render.self) drawSquare(guest.slot, render.self.x, render.self.y, `${guest.slot} (you)`);
  } else {
    ctx.fillStyle = '#7d8590';
    ctx.font = '14px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('open a room or join one to start', W / 2, H / 2);
  }
}

function renderStats() {
  const rows = [];
  if (host) {
    const s = host.stats;
    rows.push(['role', 'host (p1)'], ['players', 1 + host.guests().length + '/4'],
              ['tick', host.tick()], ['snapshot', `${s.snapshotBytes} B`],
              ['inputs in', s.inputsAccepted], ['dupes skipped', s.inputsDuplicate]);
    for (const id of host.guests()) {
      const g = host.guestStats(id);
      rows.push([`${id} ping`, g?.rttMs == null ? '…' : `${Math.round(g.rttMs)} ms`],
                [`${id} queued`, g?.queued ?? 0]);
    }
  } else if (client) {
    const s = client.stats;
    rows.push(['role', `guest (${guest.slot})`],
              ['ping', client.rttMs == null ? '…' : `${Math.round(client.rttMs)} ms`],
              ['jitter', `${s.jitterMs} ms`], ['interp delay', `${s.interpMs} ms`],
              ['snapshot loss', `${s.snapshotLossPct}%`], ['corrections', s.corrections],
              ['inputs sent', s.inputsSent], ['unacked', s.pendingAck]);
  }
  $('stats').innerHTML = rows.map(([name, value]) =>
    `<div class="stat"><b>${name}</b><span>${value}</span></div>`).join('');
}

async function copy(text, what) {
  try {
    await navigator.clipboard.writeText(text);
    log(`copied ${what}`);
  } catch {
    log(`copy failed: select the text and copy it by hand (${what})`, 'warn');
  }
}

/* ------------------------------------------------------------- start */

buildSlotRows();
$('open-room').onclick = () => openRoom().catch(error => log(error.message, 'err'));
$('join').onclick = () => joinRoom();
$('copy-answer').onclick = () => copy($('answer-out').value, 'answer');

let lastStats = 0;
function frame(now) {
  requestAnimationFrame(frame);
  draw();
  if (now - lastStats > 250) { lastStats = now; renderStats(); }
}
requestAnimationFrame(frame);
log('keys: WASD or arrow keys. Players: up to four (host + three guests).');
