# Provenance, fidelity and rights

## Where these bytes came from

Retrieved 2026-10-12 from the live site `https://vel.gg/bo1z/` through a
text-extraction proxy — the only path available, because this sandbox's network
egress is allowlisted to `github.com`, `api.github.com`, `codeload.github.com`,
`registry.npmjs.org` and `pypi.org`. Direct fetches fail:

```
$ curl -sS -o /tmp/bo1z.html https://vel.gg/bo1z
curl: (35) OpenSSL SSL_connect: SSL_ERROR_SYSCALL in connection to vel.gg:443
```

The reference hash index in `inventory/SHA256SUMS.capture.txt` is **not** mine. It
comes from [`VinceGuyMan/vel-gg-bo1z-preservation`](https://github.com/VinceGuyMan/vel-gg-bo1z-preservation)
(`preservation/SHA256SUMS.capture.txt`), an independent capture of the same site
taken 2026-10-08 21:29–21:33 UTC from America/New_York, covering 3,656 files /
6,351,964,605 bytes, which that project states all passed SHA-256 verification.
It is used here as ground truth for *what exists* and *what it hashed to*, never as
a claim about my own reconstructed bytes.

Also checked and rejected as sources: the project's GitHub release assets
(`release-assets.githubusercontent.com` is off the allowlist, and the payload is
5.8 GB of copyrighted game material), and GitHub code search for a mirror of the
site's modules (distinctive identifiers `__kisakParity`, `opfs-icase` return zero
results anywhere on GitHub — nobody has mirrored this).

## What the proxy did to the text

Three deterministic transformations, all reversed by `tools/reconstruct.py`:

**1. Markdown escaping.** Punctuation is backslash-escaped and literal backslashes
are doubled. Observed in `capabilities.js`:

| live site | proxy output | after `reconstruct.py` |
| --- | --- | --- |
| `/\bEdg\//` | `/\\bEdg\\//` | `/\bEdg\//` ✓ |
| `new Uint32Array([0x6a09…])` | `new Uint32Array(\[0x6a09…\])` | `new Uint32Array([0x6a09…])` ✓ |
| `` `${name} ≥ ${minimum}` `` | `` \`${name} ≥ ${minimum}\` `` | `` `${name} ≥ ${minimum}` `` ✓ |
| `navigator.userAgentData` | `navigator.userAgentData` | unchanged |

**2. Hard-break markers.** A stray `\` is appended to many line ends. Kept the
newline, dropped the backslash. Getting this wrong is not theoretical: the first
version of the script consumed the newline too, which merged a two-line comment in
`sha256.js` with the `blocks()` method that followed it and commented out the code.
`node --check` caught it, which is exactly why that gate exists.

**3. Indentation collapse.** Every indented line was reduced to exactly one leading
space — verified across all six captures: 764 lines begin with one space, **zero**
begin with two or more. Nesting was therefore re-derived by `jsbeautifier` rather
than recovered.

## What is irrecoverable

The proxy strips anything shaped like an HTML tag. Inside **comments** that lost
text permanently. Real examples from `maps.js`, where `<slug>`/`<map>` placeholders
were eaten:

```
// as captured:  python tools/web/mksiteart.py --pack  --map  (loadscreen art);
// originally:    python tools/web/mksiteart.py --pack <slug> --map <zone> …
```

Code is unaffected in practice: the stripper only matches `<word …>` shapes, and
every operator use of `<` in these files (`p < end`, `read < offset`,
`value.length > end`) survived — then `node --check` confirms the whole file parses.

**One construct is genuinely ambiguous.** `download-worker.js` line 103 validates
manifest paths with a character class captured as `/\[\\\:\]/` and reconstructed to
`/[\:]/`. If the original was `/[\\:]/` (rejecting backslash *and* colon), one
backslash was lost in transit and the reconstructed class rejects only `:`. The surrounding checks are unaffected — the same expression independently
rejects empty segments, `.` and `..`, and absolute paths, so traversal is still
blocked either way. This is flagged rather than silently "fixed": guessing at a
security-relevant regex is worse than documenting the uncertainty. `mirror-site.py`
resolves it in one run.

## Verification actually performed

| Check | Result |
| --- | --- |
| `node --check` on every reconstructed file as an ES module | 6/6 pass |
| Whitespace-free equality, unescaped input vs formatted output | 6/6 identical — proves the formatter moved whitespace and rewrote no token or string |
| `sha256.js` executed against `node:crypto` (`tools/verify-sha256.mjs`) | 1510 known-answer checks pass: NIST vectors, every length 0–300 fed five different ways across the 55/56/63/64/65-byte padding boundaries, a 3 MiB input sliced at 1 MiB like the real downloader, and the 64-bit big-endian length split |
| Danger-pattern scan (`tools/audit-scan.py`) | 34 hits, every one explained in SECURITY-AUDIT.md; zero in the dynamic-code, dom-injection and persistence categories |
| Integrity of the reference index itself | `inventory/SHA256SUMS.capture.txt` hashes to `b370176be5786afa4e5fb2f69558a9940b288718303672b2196b4438ea020fe2`, which is precisely the `checksum_index_sha256` that the preservation project's own `evidence/preservation-inventory.json` claims for it. The copy used here is byte-identical to the index that project vouches for, so the 3,656 hashes did not drift in transit |
| Byte-for-byte match against the 2026-10-08 capture hashes | **Not possible** — reconstructions cannot match. This is the residual risk of everything in `site/`. |

The known-answer test is the strongest evidence here. `sha256.js` is 64 round
constants, 8 initial hash values and a wall of rotates, shifts and 32-bit adds; if
a single hex digit or `>>>` had been mangled by the round trip, digests would diverge
from `node:crypto` immediately. They do not, across 1510 inputs. That does not
transfer to the other five files, which have no equivalent oracle — for those the
guarantee stops at "parses, and every token survived reformatting".

## Rights

| Material | Status |
| --- | --- |
| *Call of Duty: Black Ops*, Zombies, all art/audio/cinematics | Treyarch / Activision. Copyrighted. Nothing of theirs is stored here. |
| vel.gg/bo1z front-end source (`site/`, `raw-capture/`) | The site operators'. **Unpublished and unlicensed** — no terms grant copying. Treated as a personal review copy. |
| KisakBlack engine the port is built on | [`riicchhaarrd/KisakBlack` `web-port`](https://github.com/riicchhaarrd/KisakBlack/tree/web-port), GPLv3. Not vendored here, so no GPL obligation is triggered by this folder. |
| Capture hash index (`inventory/`) | VinceGuyMan's preservation project. Facts about files, not game content; that repo carries no licence either and invites forks. |
| This review, the tools, and the writing | Mine, for this repository. |

**Consequence for a public repo:** redistributing scraped, unlicensed front-end
source is a copyright question that belongs to the site's operators, and the game
itself is Activision's. Keeping this on an unpushed working branch is the low-risk
posture. If it is pushed, push it knowing that — and consider making the repository
private, or reducing this folder to `SECURITY-AUDIT.md` + `inventory/` + `tools/`,
which document the review without redistributing the source.

Nothing here is an endorsement or a takedown claim. The site was serving normally at
the time of retrieval.
