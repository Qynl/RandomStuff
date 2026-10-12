# Performance

## Read this first

**Nothing here made vel.gg/bo1z faster, and this document does not claim to.**
This sandbox has no browser, no `artifacts/KisakBlack-web.wasm` and none of the
6.35 GB of asset packs, so there was nothing to measure and nothing to optimise.
Any claim of "I made it less laggy" would be a guess dressed as a result.

What this *is*: a map of the performance machinery that already exists in the six
captured modules, with file:line citations; the knobs you can actually turn; the
site's own measured numbers, quoted from its comments; and a diagnostic ladder for
when it feels slow. Everything below is verifiable against `site/`.

The one place this review adds runtime work rather than removing it is
[`p2p/`](p2p/) — see [the cost section](#what-the-multiplayer-layer-costs) at the
end, which is measured rather than asserted.

## If it is laggy, check these in order

Most "lag" reports against a WASM port are gates or boot-order effects, not frame
rate. Work down the list.

### 1. Are you actually running, or did a capability gate stop you?

`capabilities.js` refuses to start at all — before the download — if any of these
fail. A refusal looks like a hang or an error screen, not like slowness:

| Gate | Line | What it needs |
| --- | --- | --- |
| Secure + isolated context | `capabilities.js:15` | `crossOriginIsolated === true` **and** `SharedArrayBuffer` present. Needs the site's COOP/COEP headers; extensions that strip them break this. |
| Threads + SIMD | `capabilities.js:39-45` | Validates two hand-written WASM byte arrays and allocates a 24,576-page shared memory = **1.5 GiB game heap** "plus room for graphics and sound". A 32-bit browser or a low-memory machine fails here. |
| JSPI | `capabilities.js:48-51` | `WebAssembly.Suspending` must be a function. The comment names the exact trap: **Edge's "Enhance your security on the web"** runs unfamiliar WASM in a sandbox without it, and players hit `WebAssembly.Suspending is not a constructor` *after* the download had started. |
| WebGL2 | `capabilities.js:58-113` | Needs a WebGL2 context plus eight limits at or above: `MAX_TEXTURE_SIZE ≥ 2048`, `MAX_3D_TEXTURE_SIZE ≥ 256`, `MAX_TEXTURE_IMAGE_UNITS ≥ 16`, `MAX_VERTEX_TEXTURE_IMAGE_UNITS ≥ 4`, `MAX_COMBINED_TEXTURE_IMAGE_UNITS ≥ 20`, `MAX_VERTEX_UNIFORM_VECTORS ≥ 264`, `MAX_FRAGMENT_UNIFORM_VECTORS ≥ 264`, `MAX_VERTEX_ATTRIBS ≥ 16`. |
| OffscreenCanvas in a worker | `capabilities.js:73` | An 8 s timeout, then "unavailable". |

Also probed: OPFS + `navigator.locks`, AudioWorklet, pointer lock, WASM exception
handling. Mobile is refused outright.

### 2. Is hardware acceleration on?

Check `chrome://gpu` (or `about:support` in Firefox). If WebGL2 is falling back to
a software rasteriser, the limits above may still *pass* while every frame costs
10–100× more. This is the single most common cause of "the game runs at 5 fps" and
it is an OS/browser setting, not a site setting. Nothing in the captured code can
fix it, and nothing in the captured code works around it.

### 3. Is the boot download ordering fighting you?

This is the interesting one, and it is a *perceived* lag: the engine starts
**during** the download and then waits per file
(`src/web/browser/pack_gate.cpp`, referenced at `download-worker.js:762`). So the
order in which files land decides how long the loading screen stalls, at the same
total bandwidth. The site's own comments record what it measured:

> Shader packs go first: the link rate is shared, so a shader pack started after
> the IWDs got a third of it and the engine waited **6.5–9.5 s at renderer init**.
> — `download-worker.js:763-766`

> `sounds.pack` (Opus, ~24 MB wire + decode) next: it lands during wasm start-up,
> before `FS_Startup` needs the IWDs; after the IWDs it shared the link with the
> big zones and **sound init waited 1–13 s**.
> — `download-worker.js:772-774`

> The loading screen opens `zone/Common/.ff` (pack-gate "early stat", then
> "waited … (open)": **2.7–4.4 s at 90 Mbit**, 2.9 s live) about 2 s before
> `DB_SyncXAssets` needs `common_zombie.ff`; with common first the engine idled on
> the map zone while common had already landed. Same bytes, same end time.
> — `download-worker.js:779-783`

The knob is the `order` option of the worker's `download()` message
(`download-worker.js:687`, default `'b2'`), which the site's comment calls
`?overlap=`:

| Value | Effect (`download-worker.js:770-786`) |
| --- | --- |
| `b0` | A/B-test only. Root + `main/` first, shader packs last. |
| `b2` | **Default.** Shader packs first, then root + `main/`, small zones, `web/sound/`, `web/`, `common_*`, map zones. |
| `b3` | Like `b2` but the **map zone lands before `common_*`**, which is what the third quote above says the gate actually wanted. |

`b3` is the site's own conclusion about `zone/Common/.ff`. If your loading screen
stalls at the same point the comment describes, that is the value to try. Caveat,
stated plainly: the URL parsing for `?overlap=` lives in one of the 12 modules this
sandbox could not capture, so the accepted spellings cannot be confirmed from here
— `tools/mirror-site.py` would settle it.

### 4. Did the CDN get demoted?

`download-worker.js:22-28`: **any** CDN failure — network error, CORS error, HTTP
error, bad `Content-Length`, or a SHA-256 mismatch — sets `cdnDown = true` and
moves *the rest of that download* to the same-origin Worker path. It is sticky for
the session and it is silent apart from `metrics.cdnError` (truncated to 160
chars). One transient blip therefore costs you direct-from-R2 downloads for the
whole map load. If a load is slower than usual, look for that demotion rather than
assuming your link got worse. Retries are "CDN → Worker, up to 3 attempts, then an
error screen" (`:30-31`).

### 5. Are you hitting the stall timers?

Two constants decide when a slow-but-alive connection is treated as dead. Neither
is exposed as a URL parameter:

| Constant | Value | Line | Behaviour |
| --- | --- | --- | --- |
| `FETCH_STALL_MS` | 30 s | `download-worker.js:32` | A pack request with no response, or a body delivering no bytes, for 30 s is aborted and the retry paths take over. |
| `OPUS_STALL_MS` | 15 s | `download-worker.js:251` | An audio clip that has not decoded in 15 s gets a fresh worker and is re-sent. |
| `OPUS_RESTARTS` | 3 | `download-worker.js:252` | After three restarts the clip hard-fails (`:463`). The comment names the trigger: **Firefox 157 occasionally never answers a clip** (`:382-384`). |

On a very slow link, a 30 s no-byte window is reachable, and the resulting restart
costs more than waiting would have. That is a genuine trade-off in the site's
design, not a bug.

## What the site already optimised

Worth knowing before trying to improve any of it — each of these was a fix for a
measured problem, and the comments say so:

- **Incremental SHA-256 over streamed bytes, including the resumed prefix**
  (`download-worker.js:518`, `:647`). Verification is not a separate pass, so
  integrity checking costs a hashing pass over data that was already in cache, not
  a re-read from disk.
- **One reused OPFS sync access handle.** `:112` records that reopening a handle
  per entry "stalled `createSyncAccessHandle` on the 1,858-file" pack. Do not
  "optimise" this by opening handles eagerly.
- **One fetch of `opus-worker.js`, reused as a `blob:` URL for the whole pool.**
  `:247-249`: each `new Worker(url)` used to refetch the script with `no-store` —
  "4 per `.kop` file, ~60 Worker requests per first map load". Now one fetch.
- **Resume at Brotli part boundaries** (`:518`, `:647`) with a 206 +
  `Content-Range` check (`:639`) so a resumed range is verified rather than
  trusted.
- **Boot-class ordering with a stable tie-break** (`:768-786`) and a hard cap on
  concurrency: `parallel` defaults to 3 and is clamped to 1…4 (`:685`, `:788`).
- **SHA-256-prefixed CDN keys** (`:20-21`) so a re-uploaded file gets a fresh
  edge-cache key instead of serving stale bytes.

## Knobs you can turn

| Knob | Where | Perf effect |
| --- | --- | --- |
| `order` / `?overlap=b0\|b2\|b3` | `download-worker.js:687`, `:770-786` | **Real.** Changes how long the loading screen stalls at a given bandwidth. `b3` matches the gate behaviour the comments describe. |
| `parallel` (message option, not URL) | `download-worker.js:685`, clamped `:788` | Marginal, and capped at 4 regardless. Raising it fights the shared link rate that the ordering fix exists to manage. |
| `?packOrigin=0` | `maps.js:97` | Sends pack bytes through the Worker instead of `cdn.vel.gg`. A privacy knob, **not** a speed knob — it adds a hop. Use it to remove the second origin. |
| `?packOrigin=<url>` | `maps.js:97-100` | **Inert unless you are on `127.0.0.1`/`localhost`/`[::1]`.** Cannot be used to speed up (or redirect) a live page. |
| `?telemetry=0` | `telemetry.js:115` | **Effectively zero.** Turn it off for privacy, not for frames — see below. |
| `?horde=1` / `?mode=horde` | `maps.js:84-85` | Loads the horde manifest instead. Changes what is downloaded, not how fast. |

### Turning telemetry off does not buy frames

A reasonable guess, and the code contradicts it. `telemetry.js:4-6`:

> Sampling is cheap: frame intervals are read from a shared WASM ring every 10 s
> (no per-frame messages), and the periodic memory sample avoids `mallinfo` (a full
> heap walk under the allocator lock).

So the sampler was specifically written to avoid the two expensive things a
telemetry system usually does. Disable it because it uploads your GPU string and a
300-line console tail (see [hardening/HARDENING.md](hardening/HARDENING.md)), not
because you expect a frame-time win.

The trade is that you lose the site's own diagnostics. It samples, every 10 s
(`periodMs`, `telemetry.js:12`): frame-time histogram with median/p95, frames over
33 ms and 50 ms, the worst 5 frames, WASM memory, audio underruns, JS heap,
visibility, and pointer-lock/fullscreen state. With telemetry off, measure locally:

```js
// Frame-time histogram, 10 s, no dependencies. Paste into the console.
(() => {
  const samples = [];
  let last = performance.now();
  const tick = now => {
    samples.push(now - last); last = now;
    if (now - samples.start < 10000) return requestAnimationFrame(tick);
    samples.sort((a, b) => a - b);
    const pct = p => samples[Math.min(samples.length - 1, (p * samples.length) | 0)].toFixed(1);
    console.table({
      frames: samples.length, fps: (samples.length / 10).toFixed(1),
      medianMs: pct(0.5), p95Ms: pct(0.95), worstMs: pct(1),
      over33ms: samples.filter(s => s > 33).length,
      jsHeapMB: performance.memory ? (performance.memory.usedJSHeapSize / 1048576).toFixed(0) : 'n/a',
    });
  };
  samples.start = performance.now();
  requestAnimationFrame(tick);
})();
```

```js
// How much of the pack is already on disk (OPFS counts against your site quota).
navigator.storage.estimate().then(e =>
  console.log(`used ${(e.usage / 1073741824).toFixed(2)} GiB of ${(e.quota / 1073741824).toFixed(2)} GiB`));
```

**`perf-overlay.js` exists in the deployment** — it is listed in the independent
capture index (`inventory/SHA256SUMS.capture.txt`) — but its contents were not
retrievable from this sandbox, so its activation parameter is unknown here. This
document deliberately does not guess one. Fetch it with `tools/mirror-site.py` and
read it; a HUD that already exists beats a console snippet.

## The native build's tunables

These belong to
[`MisaDev4/bo1-zombies-decompiled`](https://github.com/MisaDev4/bo1-zombies-decompiled),
the **native** engine decompile — not to the web port. Verified against its
source, with the registration line, default and range for each:

| Dvar | Default / range | Registration | What it does (quoted description) |
| --- | --- | --- | --- |
| `r_mod_skinCacheMB` | 8, 8–256 | `src/gfx_d3d/r_dvars.cpp:1055` | "skinned vertex cache MB per pool (retail 8)". The adjacent note: "dense hordes need more than 64 MB". Consumed at `r_buffers.cpp:350` (`<< 20`), sizing the pool used by `r_dobj_skin.cpp:473`. |
| `r_mod_gfxEnts` | 256, 256–2048 | `src/gfx_d3d/r_dvars.cpp:1056` | "special models (zombies, corpses, the view weapon) drawn per frame (retail 256)". `r_dpvs.cpp:971` records that retail's 256 clamp "aliased slots" — it handed the same slot out twice. |
| `bo1_mod_pcore` | 0, 0–2 | `src/qcommon/common.cpp:2377-2378` | "hybrid CPUs: 1 = server thread on P-cores + above-normal priority, 2 = also the client threads; no-op on non-hybrid CPUs". `mods/horde/README.md:57` says the launcher's horde flags set 1. |
| `bo1_mod_priority` | 0, 0–2 | `src/qcommon/common.cpp:2379-2380` | "1 = process priority class above normal + main thread above normal, 2 = high class; 0 = as started". |
| `cg_mod_asyncServer` | false | `src/server_mp/sv_main_mp.cpp:1546-1547` | "the client draws frames while the listen server's frame still runs, instead of waiting for it (large hordes)". Set by `tools/horde_flags.js` for large hordes. |

Whether the **web** build carries any of these is unknown from this sandbox:
`KisakBlack-web.wasm` is not auditable here. The web port's equivalent knobs are
the JavaScript ones in the table above, plus browser settings. Do not expect to
type `r_mod_skinCacheMB` into vel.gg and have it work.

The native dvars do tell you something transferable, though: the mod author's
measured bottlenecks for large hordes were **skinned-vertex cache size**, **per-frame
special-model slots**, **thread affinity on hybrid CPUs** and **server/client frame
coupling**. If the web port is slow specifically in dense hordes rather than
everywhere, those four are the subsystems to look at, in that order.

## What the multiplayer layer costs

[`p2p/`](p2p/) is the one thing here that adds runtime work, so it should be
costed rather than waved at. Defaults from `netcode.js`:

| Stream | Rate | Channel | Size |
| --- | --- | --- | --- |
| Snapshot (host → guest) | `tickRate` = 30 Hz | **unreliable, unordered** | capped at `maxSnapshotBytes` = 1100 B; over budget it is dropped and counted (`oversizedSnapshots`), never thrown |
| Input (guest → host) | `inputRate` = 60 Hz | **unreliable, unordered** | ~40–80 B |
| App events (both ways) | on demand | **reliable, ordered** | small JSON |
| Heartbeat `PING`/`PONG` | 1 Hz | reliable | ~30 B |

Arithmetic, clearly labelled as arithmetic: worst case is
`1100 × 30 ≈ 33 KB/s` per guest, but a real two-player snapshot
(`{tick, t, ack, players:{host:{x,y}, guest:{x,y}}}` rounded to a tenth) is
roughly 150 B, so **≈ 4.5 KB/s** — well under a single 64 KiB SCTP message and
comparable to a slow video stream. The demo's `bytes sent / received` tiles show
the actual numbers for your session.

Design choices that keep it off the frame budget:

- **Unreliable for state, reliable only for events.** A lost snapshot is skipped,
  not retransmitted — the next one supersedes it. Round-start and perk purchases go
  reliable so they cannot be lost or reordered.
- **Interpolation, not extrapolation.** Remotes render at
  `now − interpolationMs − clockOffset` (default 100 ms behind), in the host's clock
  domain, using an RTT-derived offset smoothed 0.9/0.1. No guessing where a player
  "should" be, so no rubber-banding when a packet is late.
- **Prediction + reconciliation on the guest.** Local input applies immediately, so
  your own movement never waits for the network. Corrections larger than 0.5 units
  are smoothed over `snapMs` (120 ms by default) with a smoothstep rather than
  snapped.
  The test suite proves this holds under 25 % loss in both directions: drift stays
  bounded and reconciliation fires (`p2p/test/run-tests.mjs`).
- **Stale snapshots are ignored, not applied.** A late snapshot cannot rewind local
  state (`outOfOrderSnapshots`).
- **No timers that outlive the session.** Every `setInterval` is cleared in
  `stop()` and `unref()`'d under Node, and an oversized snapshot is reported through
  `onError` instead of throwing from inside an interval — which would otherwise kill
  the host's tick loop mid-frame.

**The new constraint is the host's tick budget.** A host now runs the simulation
*and* serialises a snapshot 30 times a second. That is cheap in isolation and
unmeasured against the real engine — if you splice this into `play.js`, profile the
host's `stateFor` first, because it is the one function that runs per tick per
guest and touches game state.
