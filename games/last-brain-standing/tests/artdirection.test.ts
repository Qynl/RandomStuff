import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Art-direction guard.
 *
 * The brief is a grounded industrial look with no neon, so this walks every
 * source file and rejects the two things that would break it: colours that are
 * both very saturated and very bright (the definition of a neon glow) and any
 * reintroduction of canvas shadow bloom. If a change genuinely needs a bright
 * colour it should be added to the allow-list here on purpose, with a reason.
 */

const SRC = fileURLToPath(new URL("../src", import.meta.url));

function sourceFiles(): string[] {
  return readdirSync(SRC)
    .filter((name) => /\.(ts|tsx|css)$/.test(name))
    .map((name) => join(SRC, name));
}

/** #rgb / #rrggbb -> [h, s, v] with h in turns, s and v in 0..1. */
function hsv(hex: string): [number, number, number] {
  const full = hex.length === 4 ? hex.slice(1).split("").map((c) => c + c).join("") : hex.slice(1);
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let hue = 0;
  if (delta > 0) {
    if (max === r) hue = ((g - b) / delta) % 6;
    else if (max === g) hue = (b - r) / delta + 2;
    else hue = (r - g) / delta + 4;
  }
  return [((hue / 6) + 1) % 1, max === 0 ? 0 : delta / max, max];
}

/**
 * Deliberately bright inks. These are all near-white or near-black: high value
 * with effectively no chroma, or low value with chroma that reads as a dark
 * accent. None of them can glow.
 */
const ALLOWED = new Set([
  "#ffffff",
  "#f2ede2",
  "#fbf6ea",
  "#f0c8b8",
  "#e9e3d6",
  "#e8dcc0",
  "#efe6d2",
  "#e0cba4",
  "#dfe6ec",
  "#d8e4ef",
  "#dbe9f7",
  "#e0d3b4",
  "#e7e2d6",
  "#f0e6d2",
  "#eaf5ff",
  "#f0e0c0",
  "#dfe8f0",
  "#ffd9e0"
]);

const isNeon = (hex: string): boolean => {
  if (ALLOWED.has(hex.toLowerCase())) return false;
  const [, saturation, value] = hsv(hex);
  // Neon = vivid and bright at the same time. Either one alone is fine.
  return saturation > 0.62 && value > 0.82;
};

const HEX = /#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g;

describe("art direction", () => {
  it("contains no neon colours in any source file", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles()) {
      const text = readFileSync(file, "utf8");
      for (const match of text.matchAll(HEX)) {
        const hex = match[0];
        if (isNeon(hex)) {
          const [, saturation, value] = hsv(hex);
          offenders.push(`${file.split("/").pop()}: ${hex} (saturation ${saturation.toFixed(2)}, value ${value.toFixed(2)})`);
        }
      }
    }
    expect([...new Set(offenders)]).toEqual([]);
  });

  it("does not draw canvas bloom anywhere", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles()) {
      const text = readFileSync(file, "utf8");
      for (const match of text.matchAll(/shadowBlur\s*[:=]\s*([^;\n]+)/g)) {
        const value = match[1].trim();
        // `0` (or a variable that is explicitly zeroed) is fine; anything that
        // paints a glow is not.
        if (!/^0\b/.test(value)) offenders.push(`${file.split("/").pop()}: shadowBlur = ${value}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("keeps the neon detector honest", () => {
    // Sanity-check the classifier itself, so a broken detector cannot make the
    // guard above pass by accident.
    expect(isNeon("#55e7ff")).toBe(true); // the old cyan
    expect(isNeon("#ff5c76")).toBe(true); // the old hot red
    expect(isNeon("#9d4dff")).toBe(true); // vivid violet
    // A pastel violet is bright but not saturated, so the rule lets it through;
    // the palette moved it to clay grey anyway, on style rather than threshold.
    expect(isNeon("#b58cff")).toBe(false);
    expect(isNeon("#cfa25f")).toBe(false);
    expect(isNeon("#c9695a")).toBe(false);
    expect(isNeon("#8fb48c")).toBe(false);
    expect(isNeon("#ffffff")).toBe(false);
  });
});
