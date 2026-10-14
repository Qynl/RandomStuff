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
      if (color in ON_LIGHT_FILL) continue;
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

  it("does not hide unreadable text behind a mid-tone surface", () => {
    // The panel gradients are the only surfaces besides the canvas, so make sure
    // the stylesheet has not quietly gained a light panel that the rule above
    // does not know about.
    const lightBackgrounds = [...CSS.matchAll(/background:\s*(#[0-9a-fA-F]{6})\b/g)]
      .map((match) => match[1].toLowerCase())
      .filter((color) => luminance(color) > 0.35);
    expect(lightBackgrounds).toEqual([]);
  });
});
