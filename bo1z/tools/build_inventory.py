#!/usr/bin/env python3
"""Build inventory/site-code.json from the third-party capture index.

The hash index used here is preservation/SHA256SUMS.capture.txt from
github.com/VinceGuyMan/vel-gg-bo1z-preservation (an independent October 8, 2026
capture of vel.gg/bo1z; the index itself states all 3,656 listed files passed
SHA-256 verification). It is the only byte-level ground truth for the deployed
site that is publicly reachable, and it is what tools/mirror-site.py verifies a
fresh download against.

Pass the path to that index as argv[1]. Output is written to inventory/.
"""
from __future__ import annotations

import collections
import hashlib
import json
import pathlib
import re
import sys

CODE = re.compile(r"\.(js|mjs|cjs|html|css|py|wat|json)$")

ASSET_CLASS = [
    (re.compile(r"\.wasm$"), "wasm engine binary"),
    (re.compile(r"\.mjs$"), "emscripten glue module"),
    (re.compile(r"/pack/web/video/"), "cinematic video"),
    (re.compile(r"\.(webp|png|jpg|jpeg|avif)$"), "image art"),
    (re.compile(r"/pack/"), "game pack payload"),
    (re.compile(r"\.br$"), "brotli transport chunk"),
    (re.compile(r"\.(ogg|opus|wav|mp3|mp4|webm)$"), "audio/video"),
]


def classify(path: str) -> str:
    for pattern, label in ASSET_CLASS:
        if pattern.search(path):
            return label
    if CODE.search(path):
        return "code"
    return "other"


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__)
        return 2
    index = pathlib.Path(sys.argv[1]).resolve(strict=True)
    out_dir = pathlib.Path(__file__).resolve().parent.parent / "inventory"
    out_dir.mkdir(parents=True, exist_ok=True)

    entries = []
    for line in index.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        digest, _, path = line.partition("  ")
        if len(digest) != 64 or not path:
            raise SystemExit(f"unexpected index line: {line!r}")
        entries.append({"path": path, "sha256": digest, "kind": classify(path)})

    code = [e for e in entries if e["kind"] == "code"]
    site_js = [e for e in code if e["path"].startswith("site/bo1z/") and e["path"].endswith(".js")]

    reconstructed = sorted(p.name for p in
                           (out_dir.parent / "site").glob("*.js"))
    for entry in site_js:
        name = entry["path"].rsplit("/", 1)[-1]
        entry["reconstructed_here"] = name in reconstructed

    kinds = collections.Counter(e["kind"] for e in entries)

    index_bytes = index.read_bytes()
    payload = {
        "schema": "bo1z-site-inventory/v1",
        # Identify the index by content, not by local path, so this output is
        # reproducible no matter where the index was read from.
        "source_index_sha256": hashlib.sha256(index_bytes).hexdigest(),
        "source_index_bytes": len(index_bytes),
        "source_index_origin": "github.com/VinceGuyMan/vel-gg-bo1z-preservation "
                               "preservation/SHA256SUMS.capture.txt (capture of 2026-10-08)",
        "note": "Hashes are the reference capture's, not hashes of the files in "
                "../site/, which are proxy reconstructions and cannot match byte for byte.",
        "listed_file_count": len(entries),
        "by_kind": dict(sorted(kinds.items())),
        "code_file_count": len(code),
        "site_js_file_count": len(site_js),
        "site_code_files": code,
    }
    target = out_dir / "site-code.json"
    target.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    (out_dir / "SHA256SUMS.capture.txt").write_bytes(index.read_bytes())

    print(f"{len(entries)} indexed files, {len(code)} code files, {len(site_js)} site .js files")
    print(f"reconstructed locally: {', '.join(reconstructed)}")
    print("kinds:", dict(sorted(kinds.items())))
    print(f"wrote {target}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
