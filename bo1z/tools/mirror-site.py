#!/usr/bin/env python3
"""Fetch vel.gg/bo1z's own code files byte-exactly and verify them.

WHY THIS EXISTS
---------------
The files in ../site/ were reconstructed through a text-extraction proxy (see
PROVENANCE.md): semantically equivalent, syntax-validated, but not byte-identical,
and only 6 of the deployment's 18 JS modules. This script is how you get the real
thing. It has to run on a machine with unrestricted internet access - the sandbox
this repository was prepared in can only reach a fixed allowlist of hosts, and
vel.gg is not on it.

WHAT IT DOES
------------
Downloads every code file listed in ../inventory/SHA256SUMS.capture.txt from the
live site, checks each one against that index, and writes them to --output
(default: ./mirror, which is git-ignored). It also prints every absolute URL in
the downloaded HTML/JS that does not belong to vel.gg, which is the check that
could not be done from inside the sandbox: it proves whether the entry documents
pull in any third-party script, font, beacon or ad network.

It only performs HTTP GETs of static files. It executes nothing, installs nothing,
and never touches your browser profile.

The reference index is from an independent capture taken 2026-10-08. If the site
has been redeployed since, some files will legitimately differ - a mismatch is
reported, not silently accepted, and the fetched bytes are still saved so you can
diff them yourself.

Usage:
    python3 tools/mirror-site.py                      # into ./mirror
    python3 tools/mirror-site.py --output ~/bo1z-src  # elsewhere
    python3 tools/mirror-site.py --only js            # just the JS modules
    python3 tools/mirror-site.py --base https://vel.gg/bo1z/
"""
from __future__ import annotations

import argparse
import collections
import concurrent.futures
import hashlib
import html.parser
import pathlib
import re
import sys
import time
import urllib.error
import urllib.request

DEFAULT_BASE = "https://vel.gg/"
OWN_HOSTS = {"vel.gg", "cdn.vel.gg", "www.vel.gg"}
TIMEOUT = 60
RETRIES = 3
KINDS = {
    "js": re.compile(r"\.(js|mjs|cjs)$"),
    "html": re.compile(r"\.html?$"),
    "css": re.compile(r"\.css$"),
    "py": re.compile(r"\.py$"),
    "json": re.compile(r"\.json$"),
}
URL_IN_TEXT = re.compile(r"""['"`(]((?:https?:)?//[A-Za-z0-9._-]+[^'"`\s)]*)""")


class ScriptFinder(html.parser.HTMLParser):
    """Collect external <script>/<link>/<img>/<iframe> targets from a document."""

    ATTRS = {"script": "src", "link": "href", "iframe": "src", "img": "src"}

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.external: list[str] = []
        self.inline_scripts = 0

    def handle_starttag(self, tag: str, attrs) -> None:
        values = dict(attrs)
        attribute = self.ATTRS.get(tag)
        if tag == "script" and not values.get("src"):
            self.inline_scripts += 1
        if attribute and values.get(attribute):
            target = values[attribute]
            if target.startswith("//") or re.match(r"https?://", target):
                host = re.sub(r"^https?:", "", target).split("/")[2]
                if host not in OWN_HOSTS:
                    self.external.append(f"<{tag}> {target}")


def load_index(path: pathlib.Path) -> dict[str, str]:
    entries = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        digest, _, captured_path = line.partition("  ")
        if len(digest) != 64:
            raise SystemExit(f"malformed index line: {line!r}")
        entries[captured_path] = digest
    return entries


def select(entries: dict[str, str], kinds: set[str]) -> list[str]:
    chosen = []
    for captured_path in entries:
        is_code = any(pattern.search(captured_path) for pattern in KINDS.values())
        if not is_code:
            continue
        if kinds and not any(KINDS[k].search(captured_path) for k in kinds):
            continue
        # serve.py / verify.py belong to the capture tooling, not to the website.
        if not captured_path.startswith("site/"):
            continue
        chosen.append(captured_path)
    return sorted(chosen)


def url_for(base: str, captured_path: str) -> str:
    """site/bo1z/play.js is served as https://vel.gg/bo1z/play.js."""
    relative = captured_path.removeprefix("site/")
    return base.rstrip("/") + "/" + relative


def fetch(url: str) -> bytes:
    request = urllib.request.Request(url, headers={
        "User-Agent": "bo1z-mirror/1.0 (personal source review; contact the operator to opt out)",
        "Accept": "*/*",
    })
    last: Exception | None = None
    for attempt in range(1, RETRIES + 1):
        try:
            with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
                return response.read()
        except (urllib.error.URLError, TimeoutError, OSError) as error:
            last = error
            time.sleep(1.5 * attempt)
    raise RuntimeError(f"{url}: {last}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--base", default=DEFAULT_BASE, help="site origin (default: %(default)s)")
    parser.add_argument("--index", type=pathlib.Path,
                        default=pathlib.Path(__file__).resolve().parent.parent
                        / "inventory" / "SHA256SUMS.capture.txt",
                        help="reference SHA-256 index")
    parser.add_argument("--output", type=pathlib.Path, default=pathlib.Path("mirror"),
                        help="where to write the files (default: %(default)s)")
    parser.add_argument("--only", choices=sorted(KINDS), action="append",
                        help="restrict to one kind of file (repeatable)")
    parser.add_argument("--workers", type=int, default=4, help="parallel downloads")
    parser.add_argument("--force", action="store_true", help="overwrite existing output files")
    args = parser.parse_args()

    index = load_index(args.index.resolve(strict=True))
    wanted = select(index, set(args.only or ()))
    print(f"{len(wanted)} code files indexed under site/; fetching from {args.base}\n")

    out = args.output.resolve()
    if out.exists() and any(out.iterdir()) and not args.force:
        raise SystemExit(f"{out} already exists and is not empty. Use --force or a new --output.")
    out.mkdir(parents=True, exist_ok=True)

    matched, mismatched, failed = [], [], []
    external: dict[str, list[str]] = collections.defaultdict(list)
    inline_scripts: dict[str, int] = {}

    def work(captured_path: str):
        url = url_for(args.base, captured_path)
        try:
            data = fetch(url)
        except RuntimeError as error:
            return captured_path, None, str(error)
        digest = hashlib.sha256(data).hexdigest()
        target = out / captured_path.removeprefix("site/")
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
        note = None
        if captured_path.endswith((".html", ".htm", ".js", ".mjs", ".css")):
            text = data.decode("utf-8", errors="replace")
            if captured_path.endswith((".html", ".htm")):
                finder = ScriptFinder()
                try:
                    finder.feed(text)
                    inline_scripts[captured_path] = finder.inline_scripts
                    for item in finder.external:
                        external[captured_path].append(item)
                except AssertionError:
                    pass
            for candidate in URL_IN_TEXT.findall(text):
                host = re.sub(r"^https?:", "", candidate).split("/")[0]
                if "." in host and host.split(":")[0] not in OWN_HOSTS:
                    external[captured_path].append(candidate)
        return captured_path, digest, note, data

    with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, args.workers)) as pool:
        for result in pool.map(work, wanted):
            captured_path, digest, note, *rest = result
            if digest is None:
                failed.append((captured_path, note))
                print(f"  FAIL  {captured_path:44s} {note}")
                continue
            expected = index[captured_path]
            size = len(rest[0]) if rest else 0
            if digest == expected:
                matched.append(captured_path)
                print(f"  ok    {captured_path:44s} {size:>9,} B  sha256 matches 2026-10-08 capture")
            else:
                mismatched.append((captured_path, expected, digest))
                print(f"  DIFF  {captured_path:44s} {size:>9,} B  site changed since the capture")
                print(f"          capture: {expected}")
                print(f"          live:    {digest}")

    print(f"\n== summary ==\nverified identical : {len(matched)}"
          f"\nchanged since capture: {len(mismatched)}\nfailed to fetch    : {len(failed)}"
          f"\nwritten to         : {out}")

    print("\n== third-party reference check ==")
    if not external:
        print("No absolute URL in any downloaded HTML/JS/CSS points outside vel.gg.")
    else:
        for path, items in sorted(external.items()):
            for item in sorted(set(items)):
                print(f"  {path}: {item}")
    if inline_scripts:
        total = sum(inline_scripts.values())
        print(f"\ninline <script> blocks found in HTML documents: {total}")
        print("  (inline scripts are the one thing a hash index cannot vouch for -")
        print("   read them in the mirrored HTML before trusting the page.)")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
