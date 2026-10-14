import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Colour contrast guard for the panel palette.
 *
 * The HUD is dense, small and dark, which is exactly where low-contrast greys
 * creep in. This walks every explicit colour used for text in `src/style.css`
 * and requires WCAG AA (4.5:1) against the lightest panel surface it can sit on.
 * A future tweak to the palette has to keep clearing the bar.
 */

const CSS = readFileSync(fileURLToPath(new URL("../src/style.css", import.meta.url)), "utf8");

/** Reads a custom property out of the `:root` block of the stylesheet. */
function rootVariable(name: string): string {
  const match = CSS.match(new RegExp(`--${name}\\s*:\\s*(#[0-9a-fA-F]{3,6})`));
  if (!match) throw new Error(`--${name} is not defined in src/style.css`);
  return match[1].toLowerCase();
}

/**
 * Panel surfaces, darkest to lightest; text has to work on all of them. They are
 * read from the stylesheet's own variables so repainting the panel cannot leave
 * this test checking a palette that no longer exists.
 */
const SURFACES = [rootVariable("panel"), rootVariable("panel-deep"), "#1f2228"];

/**
 * Ink that sits on a light fill instead of on the panel. The primary button
 * prints dark ink on the brass accent, so it is exempt from the dark-surface
 * rule and checked against its own fill below.
 */
const ON_LIGHT_FILL: Record<string, string> = { "#07121a": rootVariable("brass") };

/**
 * Light card stock, and the ink allowed on it.
 *
 * The arena and the side panel are dark surfaces, so their text is checked
 * against the panel above. The lobby is a bright screen of its own - cards and
 * tiles, dark ink on light stock - so it gets the opposite check, keyed by the
 * stock it is actually printed on. A light surface that is not declared here
 * fails the test below, which is what stops a new card stock from arriving
 * without an ink that can be read on it.
 */
const LIGHT_STOCK: Record<string, string[]> = {
  // card stock and the gold "selected" tile
  "#fbf7ee": ["#2c3138", "#3f4854", "#5b6472", "#7d5f28"],
  "#ffffff": ["#2c3138", "#3f4854", "#5b6472", "#7d5f28"],
  "#ffe9b8": ["#2c3138", "#5b6472", "#7d5f28"],
  "#fff6e0": ["#2c3138", "#5b6472", "#7d5f28"],
  "#e8f3e6": ["#2c3138"],
  "#eef3f8": ["#2c3138"],
  "#eef6fd": ["#2c3138"],
  "#eaf4fd": ["#2c3138"],
  "#d4e7f6": ["#2c3138"],
  "#c2dcf0": ["#2c3138"],
  "#bcdaf0": ["#2c3138"],
  "#adcfe8": ["#2c3138"],
  "#8fbbda": ["#2c3138"],
  "#e6c37a": ["#2c3138"],
  "#f4dd9e": ["#2c3138"],
  "#e0bd6c": ["#2c3138"],
  // Arena-sheet obstacles: a shape, not a surface, so an empty list is right.
  "#aab6c4": []
};

/** Every ink the lobby prints, whichever stock it lands on. */
const LOBBY_INK = new Set(Object.values(LIGHT_STOCK).flat());

function luminance(color: string): number {
  const hex = color.replace("#", "");
  const full = hex.length === 3 ? hex.split("").map((char) => char + char).join("") : hex;
  const [r, g, b] = [0, 2, 4].map((offset) => parseInt(full.slice(offset, offset + 2), 16) / 255);
  const channel = (value: number) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(a: string, b: string): number {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}

function textColors(): string[] {
  const matches = CSS.matchAll(/color:\s*(#[0-9a-fA-F]{3,6})\b/g);
  return [...new Set([...matches].map((match) => match[1].toLowerCase()))];
}

describe("panel contrast", () => {
  it("uses only text colours that clear WCAG AA on the panel surfaces", () => {
    const failures: string[] = [];
    for (const color of textColors()) {
      if (color in ON_LIGHT_FILL || LOBBY_INK.has(color)) continue;
      const worst = Math.min(...SURFACES.map((surface) => contrast(color, surface)));
      if (worst < 4.5) failures.push(`${color} is ${worst.toFixed(2)}:1 (needs 4.5:1)`);
    }
    expect(failures).toEqual([]);
  });

  it("keeps the ink on the light buttons dark enough to read", () => {
    const failures: string[] = [];
    for (const [ink, fill] of Object.entries(ON_LIGHT_FILL)) {
      const ratio = contrast(ink, fill);
      if (ratio < 4.5) failures.push(`${ink} on ${fill} is ${ratio.toFixed(2)}:1`);
    }
    expect(failures).toEqual([]);
    // Sanity check the helper itself against a known pair.
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 1);
  });

  it("keeps every light card stock paired with ink that can be read on it", () => {
    // Any light surface in the stylesheet has to be declared, so a new card
    // stock cannot arrive without the ink that goes on it being checked.
    const lightBackgrounds = [...CSS.matchAll(/background:\s*(#[0-9a-fA-F]{6})\b/g)]
      .map((match) => match[1].toLowerCase())
      .filter((color) => luminance(color) > 0.35);
    const undeclared = [...new Set(lightBackgrounds)].filter((color) => !(color in LIGHT_STOCK));
    expect(undeclared).toEqual([]);

    const failures: string[] = [];
    for (const [fill, inks] of Object.entries(LIGHT_STOCK)) {
      // An empty list means the colour is a shape rather than a surface; there
      // is no text to check on it.
      for (const ink of inks) {
        const ratio = contrast(ink, fill);
        if (ratio < 4.5) failures.push(`${ink} on ${fill} is ${ratio.toFixed(2)}:1 (needs 4.5:1)`);
      }
    }
    expect(failures).toEqual([]);
  });
});
