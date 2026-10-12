#!/usr/bin/env python3
"""Static danger-pattern scan of the reconstructed site code.

This does not prove anything is safe on its own - it exists so the verdict in
SECURITY-AUDIT.md is reproducible: run it again after any change and diff the
output. Every hit is reported with a line number and is expected to have a
matching explanation in SECURITY-AUDIT.md.

Categories are ordered by how much they would matter if abused:

  dynamic-code   eval / new Function / import() of a remote URL - the only ways
                 a delivered script can invent new code at runtime.
  dom-injection  HTML sinks that turn data into markup.
  network        everything that can open a connection, plus every absolute URL
                 and host literal in the file, so the egress surface is explicit.
  storage        browser storage and anything credential-shaped.
  fingerprint    identifiers collected about the machine.
  obfuscation    encoded blobs, fromCharCode chains, suspicious literals.
  persistence    service workers, install prompts, notification permission.

Usage: python3 tools/audit-scan.py [dir ...]     (default: ../site)
"""
from __future__ import annotations

import json
import pathlib
import re
import sys

RULES: dict[str, list[tuple[str, re.Pattern[str]]]] = {
    "dynamic-code": [
        ("eval(", re.compile(r"\beval\s*\(")),
        ("new Function", re.compile(r"\bnew\s+Function\b")),
        ("Function(", re.compile(r"(?<![\w.])Function\s*\(")),
        ("setTimeout(string)", re.compile(r"setTimeout\s*\(\s*['\"`]")),
        ("setInterval(string)", re.compile(r"setInterval\s*\(\s*['\"`]")),
        ("import() of URL", re.compile(r"\bimport\s*\(\s*['\"`]https?:")),
        ("importScripts", re.compile(r"\bimportScripts\s*\(")),
        ("javascript: URL", re.compile(r"javascript:")),
        ("data: URL as code", re.compile(r"data:text/(javascript|html)")),
    ],
    "dom-injection": [
        ("innerHTML", re.compile(r"\.innerHTML\b")),
        ("outerHTML", re.compile(r"\.outerHTML\b")),
        ("insertAdjacentHTML", re.compile(r"\.insertAdjacentHTML\b")),
        ("document.write", re.compile(r"document\.write(ln)?\s*\(")),
        ("createContextualFragment", re.compile(r"createContextualFragment")),
    ],
    "network": [
        ("fetch(", re.compile(r"(?<![\w.])fetch\s*\(")),
        ("XMLHttpRequest", re.compile(r"\bXMLHttpRequest\b")),
        ("WebSocket", re.compile(r"\bnew\s+WebSocket\b|\bWebSocket\s*\(")),
        ("EventSource", re.compile(r"\bnew\s+EventSource\b")),
        ("sendBeacon", re.compile(r"sendBeacon")),
        ("absolute URL literal", re.compile(r"['\"`](https?|wss?)://[^'\"`\s]+['\"`]")),
        ("protocol-relative URL", re.compile(r"['\"`]//[a-z0-9.-]+/")),
    ],
    "storage": [
        ("localStorage", re.compile(r"\blocalStorage\b")),
        ("sessionStorage", re.compile(r"\bsessionStorage\b")),
        ("document.cookie", re.compile(r"document\.cookie")),
        ("indexedDB", re.compile(r"\bindexedDB\b")),
        ("navigator.credentials", re.compile(r"navigator\.credentials")),
        ("password field", re.compile(r"type=['\"]?password", re.I)),
        ("OPFS", re.compile(r"getDirectory\s*\(|createSyncAccessHandle")),
        ("cache API", re.compile(r"\bcaches\.(open|match|delete)")),
    ],
    "fingerprint": [
        ("userAgent", re.compile(r"navigator\.userAgent")),
        ("unmasked GPU renderer", re.compile(r"UNMASKED_(VENDOR|RENDERER)_WEBGL")),
        ("hardwareConcurrency", re.compile(r"hardwareConcurrency")),
        ("deviceMemory", re.compile(r"deviceMemory")),
        ("screen geometry", re.compile(r"screen\.(width|height|availWidth|colorDepth)")),
        ("timezone", re.compile(r"DateTimeFormat|timeZone")),
        ("installed-font probing", re.compile(r"measureText")),
    ],
    "obfuscation": [
        ("atob", re.compile(r"\batob\s*\(")),
        ("btoa", re.compile(r"\bbtoa\s*\(")),
        ("fromCharCode chain", re.compile(r"fromCharCode\s*\(.*fromCharCode")),
        ("hex escape run", re.compile(r"(\\x[0-9a-fA-F]{2}){4,}")),
        ("long base64-ish literal", re.compile(r"['\"`][A-Za-z0-9+/]{200,}={0,2}['\"`]")),
        ("crypto-miner names", re.compile(r"coinhive|cryptoloot|coin-?imp|minero|nanopool", re.I)),
    ],
    "persistence": [
        ("serviceWorker.register", re.compile(r"serviceWorker\.register")),
        ("beforeinstallprompt", re.compile(r"beforeinstallprompt")),
        ("Notification permission", re.compile(r"Notification\.(permission|requestPermission)")),
        ("storage.persist", re.compile(r"storage\.persist")),
    ],
}


def scan(path: pathlib.Path) -> dict:
    text = path.read_text(encoding="utf-8", errors="replace")
    lines = text.splitlines()
    hits: dict[str, list[dict]] = {}
    for category, rules in RULES.items():
        found: list[dict] = []
        for number, line in enumerate(lines, 1):
            for label, pattern in rules:
                if pattern.search(line):
                    found.append({"line": number, "pattern": label,
                                  "code": line.strip()[:160]})
        if found:
            hits[category] = found
    hosts = sorted({m.group(0).strip("'\"`") for m in
                    re.finditer(r"['\"`](https?|wss?)://[^'\"`\s]+['\"`]", text)})
    return {"file": path.name, "bytes": len(text.encode()), "lines": len(lines),
            "absolute_urls": hosts, "hits": hits}


def main() -> int:
    root = pathlib.Path(__file__).resolve().parent.parent
    dirs = [pathlib.Path(a).resolve() for a in sys.argv[1:]] or [root / "site"]
    reports = []
    for directory in dirs:
        for path in sorted(directory.glob("*.js")):
            reports.append(scan(path))

    out = root / "inventory" / "audit-scan.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps({"schema": "bo1z-audit-scan/v1", "files": reports},
                              indent=2) + "\n", encoding="utf-8")

    for report in reports:
        total = sum(len(v) for v in report["hits"].values())
        print(f"\n### {report['file']}  ({report['bytes']:,} B, {report['lines']} lines, {total} hits)")
        if report["absolute_urls"]:
            print("    absolute URLs:", ", ".join(report["absolute_urls"]))
        for category, found in report["hits"].items():
            labels = sorted({h["pattern"] for h in found})
            print(f"    {category:14s} {len(found):3d}  {', '.join(labels)}")
            for hit in found[:4]:
                print(f"        L{hit['line']}: {hit['code'][:110]}")
            if len(found) > 4:
                print(f"        ... {len(found) - 4} more (see inventory/audit-scan.json)")
    print(f"\nwrote {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
