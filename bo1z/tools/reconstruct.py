#!/usr/bin/env python3
"""Reconstruct readable JS from the verbatim page-fetch captures in ../raw-capture.

The sandbox this was captured in cannot open a TCP connection to vel.gg (egress is
allowlisted), so the files were retrieved through a text-extraction proxy. That
proxy returns a Markdown-flavoured rendition of the response body, which damages
source text in three specific, mechanical ways:

  1. Markdown escaping   - punctuation is backslash-escaped ("[" -> "\\[",
                           "_" -> "\\_", "|" -> "\\|", "`" -> "\\`") and literal
                           backslashes are doubled ("\\" -> "\\\\").
  2. Hard-break markers  - a stray "\\" is appended to many line ends.
  3. Indentation collapse- every indented line is reduced to exactly one leading
                           space, so all nesting information is lost.

HTML-shaped text inside comments is additionally dropped by the proxy's tag
stripper, which is NOT recoverable (see PROVENANCE.md). Code is unaffected: the
proxy only eats "<word ...>" shapes, and every reconstructed file is
syntax-validated with node afterwards.

Steps 1-3 are reversed here deterministically, then a formatter restores
indentation. Because indentation had to be re-derived, the output is
semantically equivalent but NOT byte-identical to what vel.gg serves. Two
integrity checks run on every file:

  * node --check          - the result must parse as an ES module.
  * whitespace-free match - the character sequence with all whitespace removed
                            must be identical before and after formatting, which
                            proves the formatter only moved whitespace and did
                            not rewrite a single token or string.

Usage: python3 tools/reconstruct.py
"""
from __future__ import annotations

import pathlib
import re
import subprocess

ROOT = pathlib.Path(__file__).resolve().parent.parent
RAW = ROOT / "raw-capture"
OUT = ROOT / "site"

PUNCTUATION = set("!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~")


def unescape(text: str) -> str:
    """Reverse the proxy's Markdown escaping, left to right, one pass."""
    out: list[str] = []
    i, n = 0, len(text)
    while i < n:
        char = text[i]
        if char != "\\":
            out.append(char)
            i += 1
            continue
        nxt = text[i + 1] if i + 1 < n else ""
        if nxt == "\\":          # doubled literal backslash
            out.append("\\")
            i += 2
        elif nxt == "\n":        # hard-break marker: keep the newline, drop the "\"
            out.append("\n")
            i += 2
        elif nxt in PUNCTUATION:  # escaped punctuation
            out.append(nxt)
            i += 2
        else:                    # a backslash that was not an escape
            out.append("\\")
            i += 1
    return "".join(out)


def de_indent(text: str) -> str:
    """Remove the single leading space the proxy left on every indented line."""
    return "\n".join(line[1:] if line.startswith(" ") else line for line in text.split("\n"))


def squish(text: str) -> str:
    return re.sub(r"\s+", "", text)


def beautify(source: str) -> str:
    import jsbeautifier

    options = jsbeautifier.default_options()
    options.indent_size = 2
    options.indent_char = " "
    options.preserve_newlines = True
    options.max_preserve_newlines = 2
    options.end_with_newline = True
    options.break_chained_methods = False
    options.space_in_empty_paren = False
    options.jslint_happy = False
    return jsbeautifier.beautify(source, options)


def node_check(path: pathlib.Path) -> tuple[bool, str]:
    """Parse as an ES module. node --check honours .mjs for module syntax."""
    probe = path.with_suffix(".mjs")
    probe.write_text(path.read_text(encoding="utf-8"), encoding="utf-8")
    try:
        run = subprocess.run(["node", "--check", str(probe)],
                             capture_output=True, text=True, timeout=60)
        return run.returncode == 0, (run.stderr or "").strip()[:600]
    finally:
        probe.unlink(missing_ok=True)


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    failures: list[str] = []
    print(f"{'file':26s} {'raw':>7s} {'out':>7s}  tokens-identical  node --check")
    for raw in sorted(RAW.glob("*.js")):
        captured = raw.read_text(encoding="utf-8")
        flat = de_indent(unescape(captured))
        pretty = beautify(flat)
        target = OUT / raw.name
        target.write_text(pretty, encoding="utf-8")

        same = squish(flat) == squish(pretty)
        ok, err = node_check(target)
        print(f"{raw.name:26s} {len(captured):7d} {len(pretty):7d}  "
              f"{'yes' if same else 'NO':>16s}  {'PASS' if ok else 'FAIL: ' + err}")
        if not same or not ok:
            failures.append(raw.name)

    print()
    if failures:
        print("FAILED:", ", ".join(failures))
        return 1
    print("All files reconstructed, token-identical after formatting, and parse as ES modules.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
