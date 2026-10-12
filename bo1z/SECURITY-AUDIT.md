# Security audit — vel.gg/bo1z and its related repositories

Reviewed 2026-10-12. Scope: everything publicly reachable about the browser port at
`vel.gg/bo1z`, plus the two GitHub repositories that circulate alongside it.

## Verdict

| Target | What it is | Verdict |
| --- | --- | --- |
| **vel.gg/bo1z** client code | 18 ES modules + pages serving a WASM game engine | **No malicious behaviour found.** Two first-party origins only, no dynamic code, no HTML injection, no service worker, no third-party script. Every downloaded byte is SHA-256-pinned. One privacy finding: same-origin telemetry including GPU model and console tail. |
| **VinceGuyMan/vel-gg-bo1z-preservation** | Independent Oct 8 capture + tooling + experimental co-op overlay | **Clean, and unusually defensive.** Downloads nothing, pins every binary it will execute by SHA-256, refuses to run if an existing tunnel config is present, zip-extractor is traversal-safe. Real risk is *exposure*, not malware: its optional "free internet host" publishes a public tunnel to your machine. |
| **MisaDev4/bo1-zombies-decompiled** | Native BO1 Zombies engine decompile (C/C++, 17 MB) | **No malicious code found**, but it is the riskiest of the three to *run*: it ships prebuilt proprietary binaries — five Authenticode-signed Valve DLLs, plus **unsigned** `binkw32.dll` (RAD Bink) and `vpx.dll` (libvpx **1.5.0**, a 2016 release) — and an HTA launcher that executes with `mshta`'s full trust. |
| `artifacts/KisakBlack-web.wasm` | The engine binary itself | **Not auditable.** See "Largest residual unknown". |

Nothing in any of the three tried to download and execute a payload, persist on the
machine, touch credentials, mine cryptocurrency, or contact a host that is not the
project's own.

## Method

Static review only. No file from any of these projects was executed, and nothing was
installed. What was actually done:

- Fetched the live site's modules through the sandbox's text proxy, reconstructed and
  syntax-validated them (`tools/reconstruct.py`), then scanned for danger patterns
  (`tools/audit-scan.py` → `inventory/audit-scan.json`, 34 hits, all accounted for below).
- Executed one reconstructed file in a *harness I wrote*, not in a browser:
  `sha256.js` against `node:crypto`, 1510 known-answer checks, all passing.
- Downloaded both GitHub repositories as tarballs from `codeload.github.com` and read
  every script, launcher, workflow and config; parsed PE certificate tables to check
  which shipped DLLs are signed and extracted signer identities from the PKCS#7 blobs.
- Cross-checked the preservation project's pinned constants against its own published
  capture index.

## vel.gg/bo1z

### Egress surface

Every absolute URL in the reconstructed modules, from `inventory/audit-scan.json`:

| Origin | Used for | Where |
| --- | --- | --- |
| `https://vel.gg` | pages, manifests, workers, telemetry endpoint, range-requested cinematics | `maps.js:102` |
| `https://cdn.vel.gg` | pack bytes only — a Cloudflare R2 custom domain on the same bucket, CORS-restricted to `https://vel.gg` | `maps.js:101`, `download-worker.js:37` |

Absent entirely: `WebSocket`, `EventSource`, `XMLHttpRequest`, `importScripts`,
`serviceWorker.register`, `beforeinstallprompt`, `Notification`, any ad/analytics/CDN
third party. The only network primitives are `fetch` (4 call sites in
`download-worker.js`, 3 in `telemetry.js`) and `navigator.sendBeacon` (1, telemetry).

### Integrity chain

This is the strongest part of the design. `download-worker.js` validates the manifest
before trusting anything in it (line 100–112): schema must be `1`, `version` must be
64 hex chars, every entry needs a relative path with no empty/`.`/`..` segment, a
non-negative safe-integer size, a 64-hex SHA-256, a priority present in
`manifest.classes`, no case-insensitive duplicate path, and the sizes must sum exactly
to `total_bytes`.

Then, per file:

- bytes are hashed **incrementally as they stream** (`StreamingSHA256`), including any
  already-on-disk prefix when resuming — a cached file is never trusted by size alone;
- digest mismatch retries once from byte 0, then fails hard (`:663-664`); a CDN mismatch
  permanently demotes the rest of the download to the first-party Worker origin;
- `Content-Length` must equal the remaining size and a `206` response's `Content-Range`
  must match the requested offset exactly;
- bodies are capped — `File exceeds manifest size` aborts an over-long response;
- writes go to OPFS through `createSyncAccessHandle`, serialised by a cross-tab
  `navigator.locks.request('five-pack-download', …)`;
- stalled transfers abort at 30 s, opus decode workers restart at most 3 times before
  falling back to the original audio parts.

Practical consequence: a compromised or swapped CDN could cause a download to fail, but
could not substitute game data — the manifest, fetched `no-store` from the site origin,
pins every hash.

### One privacy finding: telemetry

`telemetry.js` is the only module that sends anything about you anywhere.

| | |
| --- | --- |
| Destination | same origin, `new URL('./telemetry', import.meta.url)` (`:10`) — no third party, no beacon to an analytics vendor |
| Gate | a `GET` probe decides; if the endpoint is absent or not `ok`, **every** send is disabled (`:179-182`) |
| Opt-out | `?telemetry=0` or `?telemetry=off`, evaluated before the probe, so it always wins (`:115`) |
| Identity | `crypto.randomUUID()` per page load. No persistent ID; `localStorage`, `sessionStorage`, `document.cookie`, `indexedDB` and `navigator.credentials` appear **nowhere** in any audited module |
| `start` record | userAgent, platform, `hardwareConcurrency`, `deviceMemory`, screen geometry + colour depth, devicePixelRatio, viewport, rAF timing, **unmasked WebGL vendor and renderer** (`:32-33` — your actual GPU string), whether a headless test harness is present, and `location.pathname + search` |
| `periodic`, every 10 s | frame-time distribution, WASM memory, audio underruns, JS heap, visibility/focus, pointer-lock and fullscreen state, console-error counters |
| `end` / `crash` | timings, last 20 error records, stacks, and **the last 300 console lines truncated to 2000 chars each**, via `sendBeacon` (≤60 KB) or a `keepalive` fetch |

Assessment: legitimate performance diagnostics, honestly implemented — server-gated,
opt-outable, same-origin, no cross-site identifier. Two things a privacy-conscious
visitor would not expect: the unmasked GPU string is a durable fingerprint component,
and the console tail forwards whatever the engine printed to a server. Neither is
covert, and neither reaches a third party. Play with `?telemetry=0` if you want neither.

### Design details worth recording

**The `?packOrigin=` override cannot be abused.** `maps.js:104-107` reads a
`packOrigin` query parameter, but on any non-loopback page it is ignored unless the
page origin is exactly `https://vel.gg` — in which case it is forced to the hard-coded
`PACK_ORIGIN` constant. A crafted link such as
`vel.gg/bo1z/five?packOrigin=https://evil.example` therefore cannot redirect pack
downloads, and even if it could, the manifest's per-file SHA-256 pins would make a
hostile origin produce failures rather than content. Only a loopback page (local
testing) honours an arbitrary value.

**The opus worker runs from a `blob:` URL** (`download-worker.js:255`). The blob is
built from the response text of a same-origin `fetch(new URL('./opus-worker.js',
import.meta.url), {cache:'no-store'})` — an optimisation that avoids ~60 script
refetches per map load, not a remote-code path. Worth knowing when auditing: the
worker's code will not appear in devtools under its real URL.

**The page demands cross-origin isolation.** `capabilities.js` refuses to run without
`crossOriginIsolated` and `SharedArrayBuffer`, i.e. the server sends COOP/COEP. That
is a requirement of the threaded engine, and a side benefit: the page is resistant to
embedding and cannot read cross-origin resources.

**Capability probing is honest.** The WASM threads/SIMD checks are tiny hand-written
byte arrays validated with `WebAssembly.validate`, and the shared-memory probe is
bounded at 24576 pages rather than reserving the game's 1.5 GiB twice. Missing
capabilities produce plain-language user-facing messages, not silent fallbacks.

### What this audit does *not* cover

Be explicit about the gaps, because they are where risk would hide:

1. **12 of the 18 modules were not line-audited** — `audio-worklet.js`, `canvas.js`,
   `dxs.js`, `engine-download-worker.js`, `engine.js`, `horde.js`, `input.js`,
   `landing.js`, `opfs-icase.js`, `opus-worker.js`, `perf-overlay.js`, `play.js`.
   Proxy retrieval costs a round trip per chunk through a context window, so the
   modules that touch the network, storage, telemetry and capability detection were
   prioritised. `play.js` was partially read: its imports are all same-origin
   relatives and the section reviewed contains no dynamic code or HTML sink.
2. **The HTML entry documents could not be retrieved as source** — the proxy renders
   them to Markdown. So the page-level `<script>` list and any **inline** script are
   unverified from here. Indirect evidence is reassuring (all reconstructed modules use
   relative same-origin imports; the independent 3,656-file capture index contains no
   third-party-hosted resource; the rendered landing page referenced only `vel.gg`
   images and links), but indirect is not verified. `tools/mirror-site.py` closes this:
   it parses each mirrored document, counts inline `<script>` blocks, and flags every
   origin that is not `vel.gg`.
3. **Server-side behaviour is invisible.** The Cloudflare Worker that serves packs and
   the `/telemetry` collector were reviewed only through their client-side contracts.
   What the operator does with telemetry after it lands is not knowable from here.

### Largest residual unknown

`artifacts/KisakBlack-web.wasm` — the engine. It is a compiled binary, it is where any
real payload would live if one existed, and it cannot be audited as source in this
environment (nor meaningfully reviewed as a >100 MB WASM blob by reading). The closest
public source is the GPLv3
[`riicchhaarrd/KisakBlack` `web-port`](https://github.com/riicchhaarrd/KisakBlack/tree/web-port)
branch, which the preservation project explicitly notes is a *comparison* reference:
"a matching complete deployed source/build was not recovered."

So the honest statement is: **the delivered JavaScript is clean; the delivered engine
binary is unverified.** That is normal for any compiled game port and is not a finding
against this one — but it is the limit of what this audit proves.

## VinceGuyMan/vel-gg-bo1z-preservation

98 files, 1.3 MB. Created and last pushed 2026-10-09, one day after the capture it
archives; 1 star, 3 forks; no licence. Its `CREDITS.md` states the work was done "with
Codex ('Vox') assistance", and the code reads like it: extremely dense, and paranoid in
a way that suggests deliberate threat modelling rather than habit.

### Checks performed and results

| Check | Result |
| --- | --- |
| Downloads anything from the internet? | **No.** No `Invoke-WebRequest`, `wget`, `DownloadFile`, `curl \| sh`, `urlopen` to a remote host, or package install anywhere. The only `curl` use (`free_host.py:370-404`) invokes the OS's own `/usr/bin/curl` or `curl.exe` as a 3-second readiness probe against *your own* tunnel URL, with `--proto =https` |
| `eval` / `exec` / `compile` | **One**, `overlay/portable_replay.py:30`. It execs `serve.py` from the user-supplied archive *only after* its SHA-256 equals a hard-coded constant — and that constant, `fd10d2aa113172e1dfef3310dec53a5293e24369879ffb6c6a4db2c698056c30`, matches the `serve.py` entry in the project's own published capture index. It then asserts the loaded module's `ROOT` equals the requested directory. An edited archive file refuses to run |
| CI / GitHub Actions | **None.** `.github/` holds three issue-template files only — no workflows, so nothing executes on clone, fork or pull request |
| Archive extraction safety | `tools/restore_research_archive.py` rejects `..`, absolute and reserved Windows names, control characters, over-long names; refuses symlinks and Windows reparse points (`O_NOFOLLOW`, `lstat`); re-checks dev/ino after opening; never overwrites an existing output; caps manifest size, part count and entry count |
| `subprocess` use | Python/Node/browser/cloudflared discovery and `--version` probes, all with timeouts and captured output; browser launch via `webbrowser.open` with a fallback to known executable paths |
| Obfuscation | None. Base64 appears only for PNG lobby icons (validated against `^data:image/png;base64,…$` with a 24 KB cap) and for WebSocket handshake / HMAC credential encoding |
| Credentials or sensitive paths | No reads of `.ssh`, keychains, wallets, cookies or browser profiles. Secret material (`BO1Z_TURN_SECRET`, exported profiles) is written `0o600`, and directories `0o700` |
| Network binding | Loopback-restricted origin checks in `serve_coop.py` and `lan_discovery.py`; relay endpoints validate epochs and membership identities against strict patterns before use |

### The real risk here is exposure, not malware

`overlay/free_host.py` + `Launch Free Internet Host.cmd` will publish your game to the
internet through a Cloudflare quick tunnel. The implementation is careful about *what
it runs* — you must pass `--cloudflared PATH` yourself; nothing is bundled or
downloaded; the binary must match an exact per-platform SHA-256, byte size, version
string and PE/Mach-O architecture; an existing `~/.cloudflared/config.yml` makes it
refuse to start; and `TUNNEL_*`, `CLOUDFLARE_*`, `CF_*` and `BO1Z_TURN_SECRET` are
stripped from the child environment. But the *effect* is a public
`https://…trycloudflare.com` address pointing at a server on your machine. That is the
feature working as designed. Do not enable it on a network or machine you would not
expose.

Also worth knowing: the README's own capability table is candid that co-op is
unfinished ("This is not a finished online co-op release"), and the 5.8 GB research
release is copyrighted Activision material with, in the project's words, no established
redistribution permission.

## MisaDev4/bo1-zombies-decompiled

The engine decompile that the Reddit thread points at. 2,200+ source files (910 `.h`,
767 `.cpp`, 521 `.c`, 35 `.gsc`), created and pushed 2026-10-04, 189 stars, 72 forks,
no licence. **No malicious code found.** The concern is what it ships prebuilt.

### Binaries in the tree

| File | Size | Signature |
| --- | --- | --- |
| `src/steam/redistributable_bin/steamclient.dll` | 4,515,624 B | **Signed** — VeriSign chain, Thawte timestamping |
| `src/steam/redistributable_bin/Steam.dll` | 2,930,000 B | **Signed** — VeriSign/Thawte |
| `src/steam/redistributable_bin/vstdlib_s.dll` | 386,856 B | **Signed** — VeriSign/Thawte |
| `src/steam/redistributable_bin/tier0_s.dll` | 284,456 B | **Signed** — VeriSign/Thawte |
| `src/steam/redistributable_bin/steam_api.dll` | 274,584 B | **Signed** — DigiCert, timestamped 2025 |
| `src/libs/libvpx-1.5.0/vpx.dll` | 1,765,376 B | **Unsigned** — "WebM Project VP8/VP9 v1.5.0" |
| `src/binklib/binkw32.dll` | 176,128 B | **Unsigned** — RAD Bink (`C:\devel\projects\bink\build\binkw32.pdb`) |
| `libsteam_api.so` × 3 (linux64 / linuxarm64 / androidarm64) | 383–524 KB | ELF, unsigned |
| `nvapi.lib`, `nvapi64.lib`, `libvpx.lib`, `*.lib` | — | link-time libraries |

The five Valve DLLs carry valid Authenticode signatures with timestamp countersigners,
which is consistent with genuine Steamworks redistributables. `binkw32.dll` and
`vpx.dll` are unsigned: normal for RAD Bink and for a from-source libvpx build, but it
means nothing vouches for them. **libvpx 1.5.0 is a 2016 release**, many years behind
upstream; a video codec of that vintage has a well-known CVE history. Here it is a build
dependency for the game's own video rather than a parser for untrusted input, which
bounds the exposure — but if you build and run this, you are running a decade-old codec.

### Scripts

- `setup.ps1` — `robocopy`s your own ~11 GB Steam install into `build\Release`,
  explicitly excluding `BlackOps.exe`, `BlackOpsMP.exe` and your `players\` profile
  directory; copies the engine's own Bink and Steam DLLs over the install's; extracts
  `d3dx9_43.dll` and `xinput1_3.dll` from the game's own `Redist\DirectX` cabinets with
  `expand.exe`; optionally copies the VC++ 2015-2022 runtime. Reads your game install,
  writes only inside the repo's build directory, changes nothing system-wide. Requires
  that you already own the game.
- `Play.bat` — launches `build\Release\BO1Zombies.exe` with `+set` console flags and
  `net_ip 127.0.0.1`. No network, no download.
- `tools/mod-launcher.hta` — 10,784 B. Uses `Scripting.FileSystemObject` and
  `WScript.Shell`: copies the freshly built exe/pdb/DLLs from `Release` to `Play`, then
  `sh.Run("\"…\\BO1Zombies.exe\" " + args())`. I checked the injection surface, since an
  HTA interpolating form values into a command line is exactly where you would expect a
  problem: numeric fields go through `parseInt` with `isNaN` fallbacks and
  `Math.max/Math.min` clamping in `tools/horde_flags.js` (`n` clamped to 24–1024), map
  names come from a fixed catalog `<select>`, and the one `innerHTML` write (line 91)
  assigns only string literals. No network access at all. The residual concern is the
  platform, not the code: an HTA runs under `mshta.exe` with full user trust and no
  browser sandbox.

No script in the repository downloads anything — a grep for `Invoke-WebRequest`, `curl`,
`wget`, `Start-BitsTransfer`, `DownloadFile`, `urlopen` and `requests.get` across every
`.ps1`, `.bat`, `.sh`, `.hta`, `.py`, `.mjs` and `.pl` returns zero hits.

## Indicator sweep

Across all three targets, the classic markers of a malicious drop:

| Indicator | Found |
| --- | --- |
| `eval` / `new Function` / `import()` of a remote URL | none in site code; one hash-pinned `exec` in the preservation overlay (above) |
| `innerHTML` / `document.write` / `insertAdjacentHTML` | none in the audited site modules |
| Obfuscated or minified-with-intent blobs, `fromCharCode` chains, hex-escape runs | none. Long lines exist but are readable dense code, not packing |
| Base64 payload decoded then executed | none. Base64 is PNG icons and protocol encoding |
| Crypto-miner strings (coinhive, coinimp, cryptoloot, nanopool, minero) | none |
| Third-party analytics / ad / tracker origin | none |
| Credential, cookie, wallet, keychain or browser-profile access | none |
| Persistence: service worker, startup entry, registry, cron, LaunchAgent, scheduled task | none |
| Encoded PowerShell (`-enc`, `-EncodedCommand`) in any launcher | none. The `.cmd`/`.command` launchers only check the Python version and exec a local `.py` |
| Zip-slip / symlink escape in extractors | guarded against, explicitly |
| CI workflows that run on clone/fork/PR | none exist |

## Recommendations

1. **Close the gaps properly:** run `python3 tools/mirror-site.py --output ~/bo1z-src`
   on a machine with normal internet access. It fetches all 60 code files byte-exact,
   verifies each against the 2026-10-08 index, and reports any non-`vel.gg` origin in
   the HTML — which resolves the inline-script question, the 12 unaudited modules, and
   the `/[\:]/` ambiguity in one pass.
2. **If you play the site,** append `?telemetry=0`.
3. **Do not vendor** the 5.8–6.35 GB research capture or the WASM engine binary into a
   repository. Copyright, and size.
4. **Treat the preservation project's "free internet host" as what it is** — a public
   tunnel to a server on your machine. Its binary pinning is excellent; its purpose is
   still exposure.
5. **If you build the MisaDev4 decompile,** prefer building libvpx from a current
   upstream rather than using the bundled 1.5.0, and understand that the unsigned
   `binkw32.dll` is a proprietary RAD binary you are trusting on faith.
6. **Keep this folder off the public remote** unless you have thought about the
   copyright position — see `PROVENANCE.md`. The audit, inventory and tools stand on
   their own without the reconstructed source.
