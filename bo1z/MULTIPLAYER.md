# Serverless multiplayer for vel.gg/bo1z

The site ships single-player only. This folder adds a **peer-to-peer multiplayer
layer that needs no server at all** — no signalling server, no relay, no turn
server, no database, no account. Two browsers find each other by pasting a text
blob, then talk directly.

Everything here is **new code written for this review**, not scraped from
vel.gg. It is a plain ES-module trio with no dependencies and no build step, so
you can read all of it and drop it anywhere.

```
p2p/
├── protocol.js    wire format: frame codec, chunking, blob encoding, room codes
├── transport.js   Peer: one WebRTC data channel, reliable + unreliable streams
├── netcode.js     host-authoritative session: snapshots, prediction, reconciliation
├── demo.html      browser demo UI (no build step, no external assets)
├── demo.js        browser demo logic
├── test/
│   └── run-tests.mjs   20 checks: codec unit tests + two real peers + netcode
└── package.json   npm test / npm run demo
```

## Proof it works

```sh
cd p2p
npm install          # node-datachannel, the only dependency, test-only
npm test             # 20 passed, 0 failed
```

The test suite does not mock the network. Section B creates two real
`PeerConnection`s, exchanges a real SDP blob, completes a real
ICE / DTLS-SRTP / SCTP handshake over UDP loopback, and moves real bytes:

| What is asserted | Result |
| --- | --- |
| 1 MiB split into 683 frames and reassembled | byte-identical at the receiver |
| DTLS certificate fingerprint | matches the SDP **and** matches on both sides |
| Round-trip time over the real channel | measured, not assumed |
| Heartbeat | a vanished peer is declared gone |
| `BYE` | closes the far side cleanly, not as a failure |
| Guest input drives the host simulation | both views converge |
| **25 % of unreliable frames dropped in both directions** | drift stays bounded, reconciliation fires |
| Stale / out-of-order snapshot | ignored without rewinding local state |
| Malformed netcode message | reported, session survives |
| `iceServers` during all of the above | **`[]` — asserted empty** |

That last row is the point: the whole run completes with no STUN server, no TURN
server and no signalling service configured. The only thing that ever leaves the
machine is UDP to the other peer.

## Try it in a browser

```sh
cd p2p
npm run demo         # python3 -m http.server 8080 --bind 0.0.0.0
```

Open `http://localhost:8080/demo.html` **twice** — two tabs, or two machines on
the same LAN. Then:

1. Leave the room code as it is (both sides must agree on it), pick **Host** in
   tab A and **Guest** in tab B.
2. Leave **ICE servers** on `none (direct — no third party)`. With a STUN server
   selected the page would contact it for address discovery; with none, the page
   makes zero network requests after it loads.
3. Tab A: **Start connection** → an offer blob appears. Copy it into tab B's
   *their signalling blob* box.
4. Tab B: **Start connection** → an answer blob appears. Copy it into tab A's box
   and press **Accept their answer**.
5. Move with **WASD**. Both squares move in both tabs.

The demo includes a **simulated packet loss** selector (0 / 5 / 15 / 30 / 60 %).
Turn it up and watch: the guest keeps moving smoothly because it predicts
locally, and `corrections` climbs as the host's authoritative snapshots pull it
back into line. That is reconciliation doing its job on a deliberately bad link.

WebRTC needs a **secure context**, which `localhost` and any `https://` origin
both satisfy. Opening `demo.html` straight off disk (`file://`) will not work.

## How the connection is established without a server

The classic objection to peer-to-peer is *"you still need a signalling server"*.
Not if the signalling **is** the message. The blob carries everything:

```
BO1ZP2P1.<base64url of JSON>.<crc32 hex>

{ "v": 1, "kind": "offer" | "answer", "role": "host" | "guest",
  "room": "XY34-A79C", "sdp": "v=0...", "fp": "AA:BB:...:99" }
```

- `sdp` — the session description, including the peer's ICE candidates.
- `fp` — the SHA-256 fingerprint of that peer's DTLS certificate. Because each
  side learns the other's fingerprint *before* connecting, it can be compared
  out-of-band: if the two blobs did not really come from the two people who
  pasted them, the fingerprints will not match and the call fails closed.
  WebRTC's DTLS handshake enforces the fingerprint itself; the blob just lets a
  human verify it too.
- `crc32` — catches truncation and typos, which is the realistic failure mode
  when a blob travels through a chat window.
- `room` — four-plus-four characters from an unambiguous alphabet
  (`[ACDEFGHJKLMNPQRTUVWXY3479]{4}-…`), so nobody confuses `0` with `O` or `1`
  with `I`. It is **not** a secret and not a discovery mechanism; it only labels
  the channel so a wrong paste is detected rather than silently accepted.

Copy-paste is the transport for the handshake, exactly like
[`wasm-webrtc`](https://github.com/wasmerio/) demos, `ShareDrop`, or SSH's
out-of-band key verification. Anything that can carry text works: a chat app, a
QR code, a USB stick.

### Which ICE servers, and what they cost

| Mode | What it contacts | What you get |
| --- | --- | --- |
| `iceServers: []` | **nothing** | Direct connection. Works same-LAN and same-machine always; works across the internet when both peers have public or port-forwarded addresses. |
| one STUN URL | that STUN server (address discovery only) | Also works across NAT for most home connections — STUN tells each peer its public address. No media or messages pass through it. |
| TURN | a relay you must operate | Guarantees connectivity even behind symmetric NAT, but it *is* a server in the back, so it is deliberately not used here. |

The code accepts the browser form (`{urls, username, credential}`) and translates
it for Node. Two public STUN servers are offered in the demo UI, unselected by
default: `stun:stun.l.google.com:19302` and `stun:stun.cloudflare.com:3478`
(the latter is the only non-local URL the preservation project's overlay uses).

## Architecture

### 1. `protocol.js` — framing

One data channel carries several logical streams, so every message gets an
11-byte header:

```
 0      1      2             6             10            11
 +------+------+------+-------------+--------------+--------+
 | ver  | kind | flags|      seq    |  total bytes |  chan  |
 +------+------+------+-------------+--------------+--------+
 | payload ...                                              |
```

- `kind`: `HELLO` `WELCOME` `PING` `PONG` `BYE` `DATA` `EVENT`.
- `flags` bit 0 = reliable, bit 1 = part of a chunk.
- SCTP data channels cap a single message (the negotiated maximum is read from
  the channel, defaulting to 64 KiB), so anything larger is split into chunks
  and reassembled by `Reassembler`. It caps inflight partial messages at 8,
  rejects a chunk whose shape changes mid-message, and drops — rather than
  throws on — anything malformed, so one bad frame cannot kill a session.
- `encodeBlob` / `decodeBlob` / `sdpFingerprint` / `randomRoomCode` handle the
  copy-paste signalling described above.

### 2. `transport.js` — the channel

`Peer` is deliberately backend-agnostic. It uses the global `RTCPeerConnection`
in a browser and [`node-datachannel`](https://github.com/murat-dogan/node-datachannel)
under Node, behind the same API:

```js
const host = new Peer({ role: 'host', room, iceServers: [] });
const offer = await host.createOffer();       // → paste to guest
const guest = new Peer({ role: 'guest', room, iceServers: [] });
const answer = await guest.acceptOffer(offer); // → paste back to host
await host.acceptAnswer(answer);

await host.hello;                              // handshake done, roles verified
host.send({ any: 'json' });                    // reliable, ordered
host.send(bytes, { reliable: false });         // unreliable, unordered
host.onEvent = ({ type, payload, from }) => { … };
host.close();                                  // sends BYE first
```

Three promises sequence the lifecycle: `ready` (channel open) → `hello`
(HELLO/WELCOME exchanged, so `peerRole` and `peerNonce` are known) → `closed`.
States are `connecting` `open` `closing` `closed` `failed`.

Under the hood:

- **Liveness.** A `PING` every 1 s carrying a sequence number; the `PONG` echoes
  it *in its JSON body* (not the frame header), so RTT is measured per probe.
  `peerTimeoutMs` of silence declares the peer gone. The transport owns liveness;
  the netcode layer deliberately does not duplicate it.
- **Close.** `close()` sets state to `closing` immediately but defers socket
  teardown by `byeGraceMs` (150 ms) so the queued `BYE` actually flushes. Without
  that grace period the far side always saw a `failed` transition instead of a
  clean close. Receiving a `BYE` closes locally at once.
- **Binary.** `sendMessageBinary` for bytes (`sendMessage` is text-only in
  node-datachannel — sending bytes through it throws). The boolean it returns is
  checked: an unreliable send that does not fit the buffer is counted as
  `framesDropped` and silently lost, which is exactly what an unreliable channel
  should do; a reliable send that fails is fatal.
- **Channel adoption.** Only the label the session negotiated is accepted; a
  channel opened by anything else is rejected, and text frames are refused on a
  binary channel.
- **`stats`** exposes `iceServers`, `bindAddress`, `candidates`, `bytesSent`,
  `bytesReceived`, `framesDropped` and `remoteFingerprint`, which is what makes
  the "no server was used" claim testable rather than rhetorical.

### 3. `netcode.js` — the model

Host-authoritative, which is the right choice for a co-op game with a host that
already owns all the state:

```js
// host: owns the simulation
const host = createHost({
  peer, tickRate: 30, initialState,
  simulate(state, inputs, dt) { /* move everything, in arrival order */ },
  stateFor(state) { /* trim to what guests need, round it, keep it small */ },
});

// guest: predicts locally, renders remotes interpolated
const client = createClient({
  peer, id: 'guest', inputRate: 60, interpolationMs: 100, initialState,
  readInput() { return { mx, my }; },
  applyInput(axes, predicted, dt) { /* same rule the host runs */ },
  onRender({ self, remote, tick, hostTime }) { draw(self, remote); },
});
```

Message kinds are `in` (input), `snap` (snapshot), `ev` (app event), `join`,
`leave`, each carrying `v: 1` so a future change is rejected instead of
misread.

- **Host.** Drains each guest's input queue once per tick, rejecting stale and
  duplicate sequence numbers (`outOfOrder`), and sends a snapshot with
  `ack: {id: lastSeq}` embedded so the guest learns how far the host got. A
  snapshot over `maxSnapshotBytes` (1100 — safely inside one unreliable datagram)
  is dropped and counted (`oversizedSnapshots`) rather than thrown from inside a
  timer. A guest is only forgotten after prolonged silence.
- **Guest.** Keeps a bounded snapshot buffer, **predicts** by applying its own
  input immediately, and **reconciles** when an ack arrives: any input the host
  has not yet consumed is re-applied on top of the authoritative state. A
  correction larger than 0.5 units is smoothed over `snapMs` (120 ms by default)
  with a smoothstep, so a lost packet produces a glide instead of a teleport. Late or
  out-of-order snapshots are ignored rather than rewinding local state.
- **Clocks.** The client estimates its offset to the host from the measured RTT
  (`localAt − rtt/2 − hostTime`, smoothed 0.9/0.1) and interpolates remote
  players at `now − interpolationMs − clockOffset` **in the host's clock domain**.
  That is what makes a remote player move smoothly at 30 Hz snapshots while the
  local player renders at the display's refresh rate.

## Attaching this to the real game

**This is the honest limitation.** The stack above is complete and tested, but
wiring it into vel.gg/bo1z as it actually runs needs two things this sandbox does
not have: `artifacts/KisakBlack-web.wasm` and the 6.35 GB asset capture. So the
splice below is designed against the site's code but **not executed** — treat it
as a plan with verified primitives, not a finished co-op mode.

The seam is `play.js`, which owns the simulation and the frame loop:

1. **Expose state.** `stateFor` returns only what a guest must render — player
   position/orientation, health, current wave, and a hash of anything else the
   guest can derive locally. Round it (`Math.round(x * 10) / 10`); a tenth of a
   unit is invisible and it keeps snapshots inside the byte budget.
2. **Feed input.** `readInput` returns the axis vector `input.js` already
   produces; `applyInput` reuses the *same* movement function the engine uses, so
   prediction and authority cannot diverge by construction.
3. **Who simulates.** The host keeps running the real engine. A guest runs the
   engine too, but its `simulate` is a no-op for anything it does not own: the
   authoritative snapshot overwrites position, health and wave state each render.
   Zombie AI stays on the host — that is the whole benefit of host authority.
4. **Events, not state.** Round start, perk purchase, downed player, door
   purchase: send these as `peer.send({type}, {reliable: true})` so they are
   ordered and never lost. Only continuous values ride the unreliable snapshot
   stream. `onEvent` on both sides is the hook.
5. **Late join.** A guest joining mid-round needs a full state dump before the
   first interpolated snapshot; `initialState` plus one reliable `ev` covers it.
6. **Determinism is not required.** Because the host is authoritative and the
   guest reconciles, the wasm does not need deterministic float behaviour. That
   is deliberate: requiring determinism across browsers would have made this
   unusable.

**Prior art in the same problem space.** The preservation project
([`VinceGuyMan/vel-gg-bo1z-preservation`](https://github.com/VinceGuyMan/vel-gg-bo1z-preservation))
ships an experimental co-op overlay worth reading before building anything
serious: `overlay/rtc-transport.js`, `overlay/ws-transport.js`,
`overlay/signaling.py`, `overlay/peer-schema.js` and
`overlay/engine-recipe.json`. Its transport can fall back to a **WebSocket
signalling server** (`ws-transport.js` + `signaling.py`), which is precisely the
"server in the back" this folder avoids; `rtc-transport.js` is the comparable
serverless path. Note also that `overlay/free_host.py` publishes a **public**
`*.trycloudflare.com` tunnel — convenient, but it exposes your machine to the
internet, which is why it is not used here.

## Caveats you will hit

- **`bindAddress` (Node only).** A container whose only interfaces are
  `lo 127.0.0.1/8` and a link-local `eth0 169.254.0.21/30` advertises **zero** ICE
  candidates with default configuration; `enableIceTcp` does not help. Setting
  `bindAddress: '127.0.0.1'` produces a host candidate and the test suite uses it.
  A normal desktop or LAN machine does **not** need it — do not hardcode it. When
  gathering produces no candidate, `transport.js` throws a diagnostic error naming
  `bindAddress` and STUN as the fixes instead of hanging.
- **NAT.** Without STUN or TURN, two peers behind different NATs will often not
  connect. Same LAN and same machine always work. This is a property of WebRTC,
  not of this code.
- **Blob freshness.** An SDP blob is single-use: ICE candidates and the DTLS
  fingerprint are generated per `Peer`. Re-running **Start connection** invalidates
  any blob already copied.
- **`byeGraceMs` and `peer.hello` exist for reasons.** Both were added after tests
  showed the naive versions were wrong — closing too eagerly looked like a crash,
  and `ready` resolving before the handshake meant role-dependent assertions read
  `undefined`. If you fork this, keep both.
- **Two peers, by design.** The session model is 1:1 (one host, one guest). More
  players means a mesh (host opens N peers, each guest one) or a host that
  re-broadcasts state; `netcode.js` already keys everything by guest id, so the
  host side generalises, but it is untested beyond two.

## Not covered

No encryption beyond DTLS-SRTP (which is mandatory in WebRTC and authenticated by
the fingerprint check). No authentication of *who* is on the other end — the room
code is a label, not a password. No NAT traversal guarantee. No persistence: when
a peer closes, the session is gone. All four are correct properties for a
co-op game between friends and all four would be wrong for anything handling
secrets.
