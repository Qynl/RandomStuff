# Serverless multiplayer (`p2p/`)

Up to four players (one host and three guests) connect directly to each other in a
browser with **no server in the back**: no signalling server, no relay, no TURN, no
database, no account. Connections are made from text the players copy between chat
windows.

**What this is:** a tested transport and netcode layer, running a movement sandbox.
Four coloured squares, one room, real WebRTC between the players.

**What this is not:** Black Ops Zombies. Wiring this into the real game needs the
vel.gg engine and its game data, neither of which is in this repository. See
[the last section](#what-it-would-take-to-run-the-real-game).

## How to play it with friends

1. **Host** opens `p2p/demo.html` and clicks **Open room**. You get one invite per
   slot: `p2`, `p3`, `p4`.
2. Send each friend **only the invite for their slot**, by any chat app.
3. **Friend** opens the same page, pastes their invite, clicks **Make my answer**,
   and sends the answer back.
4. **Host** pastes that answer into the friend's slot and clicks **Connect**.
   Repeat for each friend. Slots can fill in any order.
5. If someone leaves, their slot shows *free*. Click **New invite** for it and send
   a fresh invite to whoever is joining.

Everyone uses `WASD` or the arrow keys. Each invite is bound to its room and slot, and the
host accepts one answer per invite. **Anyone who obtains an invite before its slot is answered
can take that slot,** so send invites only to the people you mean, over a channel you trust.

Players who are not on the same network need a STUN server. Put
`stun:stun.l.google.com:19302` in the STUN field on both sides. STUN only tells each
player their public address; it never sees game traffic. The default is blank, which
keeps every connection on your own network.

## Files

```
p2p/
├── protocol.js        frames, chunking, reassembly, CRC-32, blob encoding
├── transport.js       one Peer: ICE/DTLS/SCTP, heartbeats, RTT, BYE, slot labels
├── netcode.js         createHost (star, up to 3 guests) and createClient
├── lobby.js           openLobby (one invite per slot) and joinLobby
├── demo.html          the four-player page
├── demo.js            the game, the lobby UI, and the stats panel
└── test/run-tests.mjs 27 checks: codec, real WebRTC, netcode, four players
```

`transport.js`, `protocol.js`, `netcode.js` and `lobby.js` have no DOM or Node
dependencies. The browser build uses the global `RTCPeerConnection`. Node uses
`node-datachannel` (a devDependency) so the tests can open real connections.

## Topology

A **star**. The host holds one connection to each guest, and guests never talk to
each other. A four-player room therefore has three connections, and each guest has
one.

| | Star (used) | Full mesh |
| --- | --- | --- |
| Connections, 4 players | 3 | 6 |
| Upload per guest | one stream | three streams |
| Who is authoritative | the host | everyone must agree |
| If the host leaves | the room ends | the room continues |

The star was chosen because the host is the authority, so cheating and disagreement
are both bounded. The cost is that **if the host leaves, the room ends.** Host
migration is not implemented. It is the main missing feature for real play.

## Invites and identity

- Each invite is a `BO1ZP2P1.<base64url json>.<crc32>` blob holding the SDP, the
  DTLS fingerprint, the room code and the **slot name** (`p2`, `p3` or `p4`).
- A guest adopts the slot from the offer, so it cannot end up in the wrong slot.
- The host checks that an answer's slot matches the invite it answers, so pasting
  p2's answer into p3's box is refused and nothing connects.
- The host decides who is who from **which connection a message arrives on**. A
  message that claims to be another player is ignored. The test suite checks this
  by sending input with a forged id.
- The DTLS fingerprint in the blob is what authenticates the connection. Whoever
  gives you the invite is the peer you end up connected to.

## Netcode

Built on the same primitives as before, with five changes that target lag:

1. **Redundant input.** Each input packet carries the last 8 inputs the host has not
   yet acknowledged, not just the newest one. A dropped packet is repaired by the
   next one. Measured: about 35% of received input entries are duplicates, which is
   the cost of this.
2. **In-order application with the guest's own `dt`.** The host applies every input
   it receives, in sequence, using the `dt` the guest predicted with. The guest's
   prediction and the host's result therefore come from the same arithmetic. On a
   clean link the guest never corrects: corrections = 0 in the measurement run.
3. **Adaptive interpolation.** Remote players are drawn `interpolationMs` in the past.
   That delay is `2 × tick interval + 2 × measured jitter`, clamped to 67–250 ms, and
   it eases toward its target so remote players never jump in time. Measured on the
   clean link: 67 ms, down from the earlier fixed 100 ms.
4. **Brief extrapolation.** If the newest snapshot is late, remote players keep moving
   along their last velocity for up to 100 ms, then hold. A short gap looks like
   motion instead of a freeze.
5. **A single movement function.** The game supplies `applyMove(axes, player, dt)`.
   The host and every guest run that same code. It clamps the axes and `dt`, so a
   modified client cannot teleport. The test suite checks that one forged input moves
   at most `SPEED × 0.25` units per axis for one input.

Snapshots are unreliable. A stale snapshot is worthless, and the next one arrives in
about 33 ms. An oversized snapshot is dropped and reported, never sent reliably.
Events (round changes, purchases, downs) are reliable and identified by connection.

### Measured (four players, real connections, clean link, 5 s window)

| Quantity | Value |
| --- | --- |
| Snapshot size, four players | 150 bytes |
| Host tick rate | 30.0 per second |
| Guest upload | 8.7 KB/s each |
| Host download, all three guests | 16.7 KB/s |
| Host upload, all three guests | 16.7 KB/s |
| Interpolation delay | 67 ms |
| Corrections | 0 |

These figures are from one loopback run in a sandbox. They say nothing about the real
internet, where latency is what limits play. Expect the interpolation delay to grow
with jitter and corrections to appear with loss.

### Under loss (automated)

| Injected loss | Result |
| --- | --- |
| 25%, two players | views stay within 1.5 units; estimator reads >5% |
| 30%, four players | every guest's drift stays under 2.5 units |

Loss was injected on unreliable traffic in both directions. Reliable traffic is left
alone, because SCTP retransmits it on real links.

Not measured: how the old netcode compares under the same conditions. There is no
before-and-after benchmark here, and none of the numbers above are presented as a
percentage improvement.

## Limits and failure modes

- **Host leaves = room ends.** No migration.
- **Guests drop cleanly.** Their avatar is removed for everyone, and the slot can be
  re-invited. A guest who vanishes without a BYE is detected by the heartbeat and
  removed the same way once `timeoutMs` passes (default 8 s; the tests use 3 s).
  Before the fix made in this round, a silent guest kept its slot indefinitely. The
  test suite now covers that path.
- **NAT.** Without STUN, players on different networks often cannot connect. With
  STUN, most home networks work. Symmetric NAT needs TURN, which is a server, so it
  is deliberately not used here.
- **Copy-paste is the rendezvous.** It is slow, and invites expire when the room
  closes. Nothing is stored anywhere.
- **Browser behaviour is unverified here.** The sandbox has no browser, and the
  browser download hosts are blocked, so `demo.html` has not been clicked through.
  Its element IDs were checked against the script. The protocol itself is tested
  over real connections using `node-datachannel`, not a browser.
- **Background tabs.** Browsers throttle timers in hidden tabs. A host with the tab
  hidden will tick slowly and stall the room. Keep the host tab focused.

## Test suite

`npm test` in `p2p/` runs 27 checks, about 20 seconds:

- **A. codec (7):** CRC, frame round-trip, malformed frames, 1 MiB chunking,
  reassembly abuse, blob tamper detection, room-code alphabet.
- **B. transport (8):** two peers connect from pasted blobs only; fingerprint
  travels in the blob; 1 MiB binary and JSON arrive intact; unreliable frames are
  size-capped; heartbeats measure RTT and detect a silent peer; BYE closes the far
  side; wrong-session blobs are refused; unknown data channels are refused.
- **C. netcode (5):** input converges both views; 25% loss converges; a stale
  snapshot is ignored; malformed messages are reported without killing the session;
  events cross reliably and carry the sender's identity.
- **D. four players (7):** invites are labelled and a wrong-slot answer is refused;
  four players converge and each guest moves; a forged id cannot move someone else
  and an impossible step is clamped; 30% loss; a leave is removed for everyone and
  the slot can be re-invited; a guest that vanishes without a goodbye is removed after
  the heartbeat timeout; a fourth guest and an unknown slot are refused.

Sections B to D run over real ICE/DTLS/SCTP. Section B asserts `iceServers` is empty,
so that run cannot have used a STUN server. Nothing in the test run contacts a server.

A note on the test harness: `close()` on a `Peer` waits `byeGraceMs` before tearing
down its sockets, so tests wait on each peer's `closed` promise rather than a fixed
delay. Earlier fixed delays produced intermittent failures under `node-datachannel`.

## Public API

```js
import { Peer } from './transport.js';
import { createHost, createClient } from './netcode.js';
import { openLobby, joinLobby } from './lobby.js';

// host: one invite per free slot
const lobby = await openLobby({
  room, peerOptions: { iceServers: [] },
  onConnect: (slot, peer) => host.addGuest(slot, peer),
  onDrop: slot => host.removeGuest(slot, 'closed'),
});
lobby.offerFor('p2');                 // the text to send that friend
await lobby.answer('p2', answerText); // their answer, pasted back
await lobby.invite('p2');             // a fresh invite for a free slot

// guest
const { slot, peer, answer } = await joinLobby(offerText);
// send `answer` back, then:
const client = createClient({ peer, readInput, applyInput, onRender });

// host session
const host = createHost({
  tickRate: 30, maxGuests: 3, initialState,
  simulate(state, inputs, dt, tick) {  // inputs: Map(id -> { queue, latest })
    for (const [id, player] of Object.entries(state)) {
      for (const input of inputs.get(id)?.queue ?? []) applyMove(input.axes, player, input.dt);
    }
  },
  stateFor: state => projectForGuests(state),       // keep it under ~1100 bytes
  onGuestJoin: (id) => { host.state[id] = spawn(id); },
  onGuestLeave: (id) => { delete host.state[id]; },
  onEvent: ({ from, name, payload }) => {},         // from = the guest's slot
});
host.emit('round', { n: 12 });                      // reliable, to everyone
```

`applyMove` must be the same function on the host and in every guest, or prediction
and authority will disagree.

## What it would take to run the real game

This repository does not contain the game. To put this transport under
Black Ops Zombies as it actually runs, you would need:

1. **The engine.** `KisakBlack-web.wasm` and the other vel.gg build artifacts. They
   are not here, and the sandbox cannot fetch them.
2. **The game data.** A local Steam install of Black Ops, or the vel.gg asset packs.
   Both are Activision/Treyarch copyright; this project does not distribute them.
3. **Engine integration.** The host would run the real simulation and project
   player state into `stateFor`. Guests would feed their input into the engine and
   render the projected state, rather than moving squares.
4. **A late-join state transfer.** A guest arriving mid-round needs a full state dump
   before snapshots make sense. That dump is not implemented.
5. **Host migration**, if the room should survive the host leaving.

Until those exist, this is the networking layer and a sandbox to test it with.
