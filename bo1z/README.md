# vel.gg/bo1z — source review

A safety review and partial source capture of **[vel.gg/bo1z](https://vel.gg/bo1z/)**,
the browser port of *Call of Duty: Black Ops* Zombies.

**Verdict: nothing malicious found in anything reviewed.** The site's code talks to
exactly two hosts (`vel.gg` and its own `cdn.vel.gg`), contains no `eval`, no HTML
injection sinks, no service worker, no third-party script, and SHA-256-verifies every
byte it downloads. One real privacy finding: it posts performance telemetry,
including your GPU model, to its own origin — opt out with `?telemetry=0`.
Details, and the gaps this review could not close, are in
[SECURITY-AUDIT.md](SECURITY-AUDIT.md).

> **Read this before publishing anything.** `Qynl/RandomStuff` is a **public**
> repository. The code here is scraped, unlicensed third-party source, and it drives
> a copyrighted Activision/Treyarch game. It is committed to the working branch for
> review; pushing it to a public remote is your call, not a default. See
> [PROVENANCE.md](PROVENANCE.md).

## What is in here

```
bo1z/
├── README.md                  this file
├── SECURITY-AUDIT.md          the actual review: findings, egress surface, verdicts
├── PROVENANCE.md              where the bytes came from, what is lossy, rights
├── SHA256SUMS.txt             hashes of every file in this folder
├── site/                      6 reconstructed JS modules from the live site
├── raw-capture/               the verbatim proxy output those were derived from
├── inventory/
│   ├── SHA256SUMS.capture.txt SHA-256 of all 3,656 files in an independent capture
│   ├── site-code.json         the 63 code files, with hashes + reconstruction status
│   └── audit-scan.json        machine-readable output of the danger-pattern scan
└── tools/
    ├── reconstruct.py         raw-capture/ → site/ (unescape, reformat, validate)
    ├── verify-sha256.mjs      runs reconstructed sha256.js against node:crypto
    ├── audit-scan.py          static danger-pattern scanner
    ├── build_inventory.py     regenerates inventory/ from the capture index
    └── mirror-site.py         ★ byte-exact download + verification (run this at home)
```

## The catch, stated plainly

The sandbox this was prepared in has **allowlisted network egress**: `github.com`,
`api.github.com`, `codeload.github.com`, `registry.npmjs.org`, `pypi.org` and
nothing else. A direct `curl https://vel.gg/bo1z/play.js` fails at the TLS handshake.

The one route that does reach the site is a text-extraction proxy, which returns a
Markdown rendition of the body. That is good enough to read and audit code, but it
destroys indentation, escapes punctuation, and drops `<angle-bracket>` text in
comments. So `site/` holds **reconstructions**: semantically equivalent,
syntax-validated, provably token-identical after reformatting — but *not*
byte-identical, and only 6 of the deployment's 18 JS modules.

**`tools/mirror-site.py` is the way to get the real files.** Run it on any normal
machine; it downloads all 60 code files, verifies each against the independent
capture index, and reports any third-party origin referenced by the pages — the
check that could not be run from inside the sandbox.

## Reproducing this

```sh
# 1. rebuild site/ from the raw captures, re-validating syntax and token identity
python3 tools/reconstruct.py            # needs: pip install jsbeautifier, node

# 2. prove the reconstructed SHA-256 implementation is bit-correct
node tools/verify-sha256.mjs            # 1510 known-answer checks vs node:crypto

# 3. re-run the static danger scan
python3 tools/audit-scan.py             # rewrites inventory/audit-scan.json

# 4. get byte-exact sources and verify them (not possible in the sandbox)
python3 tools/mirror-site.py --output ~/bo1z-src
```

## What is deliberately not here

| Missing | Why |
| --- | --- |
| Game packs, audio, cinematics, art | 6.35 GB of copyrighted Activision material. Not redistributable, and far past any sane repo size. |
| `artifacts/KisakBlack-web.wasm` / `.mjs` | Compiled engine binary + generated Emscripten glue. Cannot be fetched as text, and cannot be meaningfully audited as source anyway. |
| 12 of 18 site JS modules | Proxy retrieval costs one round trip per chunk through a context window; the security-relevant modules were prioritised. `mirror-site.py` gets all of them. |
| `index.html` and the map pages | The proxy renders HTML to Markdown, so the source is unrecoverable by that route. Same fix. |
| Vendored copies of the two GitHub repos | Both are one `git clone` away; both contain unlicensed game IP and (in one) proprietary signed binaries. They are audited and described in SECURITY-AUDIT.md instead. |

## Related repositories reviewed

- [`MisaDev4/bo1-zombies-decompiled`](https://github.com/MisaDev4/bo1-zombies-decompiled)
  — native BO1 Zombies engine decompile (C/C++, 17 MB, ships Steam + Bink DLLs).
- [`VinceGuyMan/vel-gg-bo1z-preservation`](https://github.com/VinceGuyMan/vel-gg-bo1z-preservation)
  — independent Oct 8 2026 capture of vel.gg/bo1z plus preservation tooling and an
  experimental LAN/co-op overlay. Source of the hash index in `inventory/`.
- [`riicchhaarrd/KisakBlack` `web-port`](https://github.com/riicchhaarrd/KisakBlack/tree/web-port)
  — GPLv3 engine research branch the port is compared against. Not fetched.

None of these is vel.gg's deployed source. The operators' build pipeline
(`tools/web/*`, `deploy/cloudflare/*`, referenced throughout the site's comments)
is not public.
