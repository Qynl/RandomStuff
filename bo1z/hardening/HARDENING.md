# Hardening vel.gg/bo1z

Everything the security review found that a player can turn off, and exactly how.
Two files here do the work:

| File | What it is |
| --- | --- |
| [`ublock-filters.txt`](ublock-filters.txt) | Two static filters. Blocks the telemetry endpoint at the network layer. |
| [`vel-gg-bo1z-hardening.user.js`](vel-gg-bo1z-hardening.user.js) | Userscript. Forces the site's own opt-out *and* pins egress to the audited hosts. |
| [`test-userscript.mjs`](test-userscript.mjs) | Runs that userscript in a `node:vm` sandbox. **19 checks, 0 failed.** |

## What was actually worth removing

One thing. The review ([../SECURITY-AUDIT.md](../SECURITY-AUDIT.md)) found **no**
tracker, **no** analytics, **no** ad network, **no** third-party script, **no**
cookie, **no** `localStorage`, **no** `indexedDB`, **no** credential access and
**no** service worker anywhere in the site's code. Its entire egress surface is
two first-party origins: `https://vel.gg` and `https://cdn.vel.gg` (a Cloudflare
R2 bucket, CORS-locked to `https://vel.gg`).

The single finding is a same-origin diagnostics endpoint, `/bo1z/telemetry`, that
POSTs:

| Category | Fields |
| --- | --- |
| Environment | user agent, platform, `hardwareConcurrency`, `deviceMemory`, screen geometry, `devicePixelRatio`, `crossOriginIsolated`, a headless-harness flag |
| Graphics | **unmasked WebGL `VENDOR` and `RENDERER`** — a real device fingerprint, plus `MAX_TEXTURE_SIZE` and extension/limit checks |
| Performance | rAF frame-time histogram, frames over 33 ms / 50 ms, worst 5 frames, WASM memory, audio underruns, JS heap, visibility, pointer-lock and fullscreen state |
| Location | `location.pathname + location.search` |
| On exit or crash | the last **300** console lines (each truncated to **2000** chars), the last **20** error records with full stack traces (messages truncated to 4000 chars) |

Constants are at `telemetry.js:12-15` (`periodMs = 10000`, `logTail = 300`,
`lineChars = 2000`, `beaconBytes = 60000`) and the tail/error slicing at
`:291-307`. Sends go out every 10 s, and on `end`/`crash` via `sendBeacon` when
the body is under 60 KB, otherwise a `keepalive` fetch.

Nothing here is hostile — it is a developer's own performance dashboard on their
own origin, and the console tail is genuinely how you debug a WASM port. But the
GPU string plus a 300-line console tail is more than most players want to hand
over, and the console tail can contain whatever you typed or whatever an error
message interpolated. So: turn it off.

## Three ways to turn it off

Ranked by how little they touch.

### 1. The URL knob — the site's own opt-out

```
https://vel.gg/bo1z/kino.html?telemetry=0
```

Read at `telemetry.js:115`, **before** anything is built or sent:

```js
const query = new URLSearchParams(location.search).get('telemetry');
let enabled = query === '0' || query === 'off' ? false : null, …
```

With `enabled === false`, `send()` returns at its first line and no record is
ever constructed. Both `0` and `off` work. Nothing else on the site reads the
flag, so no behaviour changes.

Bookmarklet — works on any bo1z page, keeps your existing parameters:

```js
javascript:(()=>{const u=new URL(location.href);u.searchParams.set('telemetry','0');location.replace(u)})()
```

**One precise caveat:** `?telemetry=0` stops every POST, but the start-up GET
probe at `telemetry.js:177` still runs unconditionally. It carries no payload —
just a request for `/bo1z/telemetry` — so it reveals nothing the page load did not
already reveal to the same origin. If you want that gone too, use option 2.

### 2. Block the endpoint

```
||vel.gg/bo1z/telemetry^
||vel.gg/telemetry^
```

uBlock Origin → Dashboard → *My filters* → paste → *Apply changes*. Identical in
AdGuard as a custom filter. Full file, with commentary: [`ublock-filters.txt`](ublock-filters.txt).

Blocking is safe, and provably so:

- The probe's failure path is `.catch(() => null)` (`telemetry.js:181`), and
  `enabled = Boolean(info?.enabled)` then evaluates to `false`. **A blocked probe
  disables every send and drops the whole queued batch** — so blocking alone
  switches the module off from the outside, with no code edits.
- Every send path swallows its own errors: `.catch(() => {})` on the POST
  (`:158`), `.catch(() => null)` on the probe (`:181`), and `sendBeacon`'s boolean
  return is checked before falling through (`:148`). A blocked request cannot
  produce an unhandled rejection or break the game.

### 3. The userscript — opt-out plus enforcement

[`vel-gg-bo1z-hardening.user.js`](vel-gg-bo1z-hardening.user.js) does option 1
automatically *and* adds a layer the other two cannot:

- **Layer 1.** At `document-start`, if the URL lacks `telemetry=0|off`, it calls
  `history.replaceState` to add it, preserving every other parameter. ES modules
  are deferred, so this lands before `telemetry.js` reads `location.search`. You
  can never forget the flag, and no link you paste needs it.
- **Layer 2.** Wraps `fetch`, `navigator.sendBeacon`, `XMLHttpRequest.prototype.open`,
  `WebSocket` and `EventSource`, and refuses anything that is not
  `vel.gg` / `cdn.vel.gg` over https or wss (plus `blob:` and `data:` for the opus
  worker pool and canvas transfer). Refusals are logged and counted.

Layer 2 is the part worth having. Today's deploy has nothing else to block — the
audit checked. But the review could only see the code that exists **now**; the
allowlist means a future deploy cannot add a tracker, an error reporter or a
third-party socket without you seeing a console warning naming it. It converts an
observed property into an enforced one.

Install: Tampermonkey or Violentmonkey → *Create new script* → paste → save.
Requires `@grant none` (page-context injection); patching `fetch` from a sandboxed
userscript world would not affect the page's copy. Adds no requests of its own, so
it cannot disturb the `crossOriginIsolated` / SharedArrayBuffer requirement.

Inspect it live:

```js
__bo1zHardening.report()
// { telemetryOptedOut: true, urlRewritten: true, allowedRequests: 41,
//   blockedRequests: 1, blocked: [ { reason: 'telemetry endpoint', … } ] }
```

A small badge appears bottom-left for four seconds, then removes itself so it is
gone before pointer lock or fullscreen is requested.

**Known limits.** The host allowlist is exact-match: a new subdomain (say
`stats.vel.gg`) is blocked and logged rather than silently allowed. That is the
intended default — add it to `ALLOWED_HOSTS` if a future deploy genuinely needs
it. Blocking at the network layer (option 2) also prevents the request from being
*constructed*; the userscript constructs it and refuses it, which shows up as a
rejected promise the site already handles.

### Test it

```sh
node hardening/test-userscript.mjs      # 19 passed, 0 failed
```

No browser needed: the userscript runs in a `node:vm` sandbox with stubbed
`location`, `history`, `document`, `navigator`, `fetch`, `XMLHttpRequest`,
`WebSocket` and `EventSource`. The suite asserts the rewrite adds the flag without
losing `?map`/`?horde`, that `?telemetry=off` is left alone, that both first-party
origins and relative URLs pass, that the telemetry endpoint is refused in absolute
and relative form, that third-party origins, plaintext downgrades, unknown schemes
and unaudited subdomains are refused, that `blob:`/`data:` pass, that
`sendBeacon` returns `false` instead of sending, that `wss://vel.gg` still opens,
and that `report()` summarises the session. Writing it caught two real bugs in the
script: `wss://vel.gg` was being refused as an unknown scheme, and an http
downgrade reported a confusing reason.

## Everything else in the knobs table

Verified against the captured source, with the line that reads each one. Only
`telemetry` is privacy-relevant; the rest are here because they change what the
page does and you should know they exist.

| Knob | Read at | Effect |
| --- | --- | --- |
| `?telemetry=0` or `=off` | `site/telemetry.js:115` | Checked first. Disables every send. |
| `?map=<slug>` | `site/maps.js:81` | Selects the map. Ignored unless the slug is in `MAPS`; also readable from `<html data-map>`. |
| `?horde=1` or `?mode=horde` | `site/maps.js:84-85` | Horde mode, but only for maps with `horde: true`. Switches the manifest to `pack/web-manifest-horde.json` and appends `mode=horde` to worker URLs. |
| `?packOrigin=0` | `site/maps.js:97` | Forces pack bytes through the Worker (same-origin) instead of the `cdn.vel.gg` R2 bucket. Privacy knob, not a speed knob: it removes the second origin at the cost of losing direct-from-bucket downloads. |
| `?packOrigin=<url>` | `site/maps.js:97-100` | **Inert unless the page is on `127.0.0.1`, `localhost` or `[::1]`.** A local-testing escape hatch that cannot be used to redirect a live page's downloads. Integrity does not depend on it: every file is SHA-256-checked either way. |
| `?overlap=b0` / `b2` / `b3` | `site/download-worker.js:770` (as `order`, default `'b2'`) | Boot download ordering. See [../PERFORMANCE.md](../PERFORMANCE.md). |

Note that the URL parser for `?overlap=` itself lives in one of the 12 modules this
sandbox could not capture (`engine.js`/`play.js`); `download-worker.js` receives it
as the `order` option of its `download()` message. `tools/mirror-site.py` would
confirm the exact accepted values.

## Hardening the *other* two repositories

The review covered three targets. The site is the safe one; the risks in the other
two are about running them, not about malice.

**[`MisaDev4/bo1-zombies-decompiled`](https://github.com/MisaDev4/bo1-zombies-decompiled)**
— no malicious code found, but it ships binaries you would execute:

- Five Steam DLLs are Authenticode-signed. **`binkw32.dll` (176,128 B), `vpx.dll`
  (1,765,376 B — libvpx 1.5.0, 2016) and three `libsteam_api.so` are unsigned.**
  An unsigned `binkw32.dll` is a classic DLL-search-order hijack name; if you run
  this, verify those files against a known-good copy or delete them and let the
  build fail loudly.
- `setup.ps1` robocopies your own Steam install — expect it to read your game
  directory. `Play.bat` launches with `+set net_ip 127.0.0.1`, which is the right
  default: keep it. Do not point `net_ip` at a public interface.
- `mod-launcher.hta` clamps its inputs with `parseInt` to 24–1024, so there is no
  argument injection, but an `.hta` runs with your full user rights. Prefer
  `Play.bat`.
- Zero download commands repo-wide. It builds from what you already own.

**[`VinceGuyMan/vel-gg-bo1z-preservation`](https://github.com/VinceGuyMan/vel-gg-bo1z-preservation)**
— clean and defensive: exactly one `exec`, in `overlay/portable_replay.py:30`,
gated on a self-consistent SHA-256; no CI workflows; `restore_research_archive.py`
is zip-slip and symlink safe; it downloads nothing. The real hazard is exposure,
not code:

- **`overlay/free_host.py` publishes a public `*.trycloudflare.com` tunnel** to
  whatever it serves. That is an open door onto your machine for anyone who learns
  the URL. Do not run it on an untrusted network, and do not leave it running.
- Its only non-local URL is `stun:stun.cloudflare.com:3478` — address discovery
  only, no media through it. The serverless stack in [../p2p/](../p2p/) defaults to
  no ICE server at all.
- Its co-op overlay can fall back to `overlay/ws-transport.js` +
  `overlay/signaling.py`, i.e. a signalling server. That is the "server in the
  back" [../MULTIPLAYER.md](../MULTIPLAYER.md) avoids.

## Not a hardening step, but read it anyway

`artifacts/KisakBlack-web.wasm` — the compiled engine — could not be fetched as
text from this sandbox and cannot be meaningfully audited as source anywhere. It
is the largest residual unknown in the whole review, and no filter or userscript
changes that. If you need certainty about the binary itself, that is a
reverse-engineering task on a machine you control, not a browser-side one.
