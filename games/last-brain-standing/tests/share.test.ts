import { describe, expect, it } from "vitest";
import {
  buildRunCode,
  buildShareUrl,
  describeRunCode,
  describeShare,
  isDifficultyId,
  looksLikeRunCode,
  MAX_SEED_LENGTH,
  normalizeSeedText,
  parseRunCode,
  runCodeSeed,
  seedLabelFromHash
} from "../src/share";
import { formatSeed } from "../src/rng";

describe("run codes", () => {
  it("normalizes seed text the same way the seed input does", () => {
    expect(normalizeSeedText("1a2b-3c")).toBe("1A2B3C");
    expect(normalizeSeedText("  mirror  ")).toBe("MIRROR");
    expect(normalizeSeedText("!!!")).toBe("");
    expect(normalizeSeedText("x".repeat(40))).toHaveLength(MAX_SEED_LENGTH);
  });

  it("round-trips a run code", () => {
    const code = buildRunCode({ seed: "ab12cd", difficulty: "veteran" });
    expect(code).toBe("seed=AB12CD&level=veteran");
    expect(parseRunCode(`#${code}`)).toEqual({ seed: "AB12CD", difficulty: "veteran" });
  });

  it("accepts full URLs, bare queries and short aliases", () => {
    expect(parseRunCode("https://example.com/games/lbs#seed=FF00AA&level=recruit")).toEqual({ seed: "FF00AA", difficulty: "recruit" });
    expect(parseRunCode("seed=CAFE&level=standard")).toEqual({ seed: "CAFE", difficulty: "standard" });
    expect(parseRunCode("#s=BEEF&d=veteran")).toEqual({ seed: "BEEF", difficulty: "veteran" });
    expect(parseRunCode("#seed=BEEF")).toEqual({ seed: "BEEF", difficulty: "standard" });
    expect(parseRunCode("https://example.com/?utm=1#seed=123456&level=standard")).toEqual({ seed: "123456", difficulty: "standard" });
    expect(parseRunCode("#level=veteran")).toBeNull();
    expect(parseRunCode("")).toBeNull();
    expect(parseRunCode("#")).toBeNull();
  });

  it("falls back to standard for unknown difficulties instead of failing the link", () => {
    expect(parseRunCode("#seed=ABC123&level=impossible")).toEqual({ seed: "ABC123", difficulty: "standard" });
    expect(isDifficultyId("impossible")).toBe(false);
    expect(isDifficultyId("recruit")).toBe(true);
  });

  it("strips an existing hash before building a share URL", () => {
    expect(buildShareUrl("https://example.com/#seed=OLD&level=recruit", { seed: "NEW", difficulty: "veteran" })).toBe(
      "https://example.com/#seed=NEW&level=veteran"
    );
  });

  it("describes a run for the HUD and the copy confirmation", () => {
    expect(describeRunCode({ seed: "mirror", difficulty: "recruit" })).toBe("MIRROR · RECRUIT");
    expect(describeShare({ seed: "mirror", difficulty: "recruit" })).toContain("MIRROR · RECRUIT");
  });

  it("derives the same numeric seed from the same text", () => {
    expect(runCodeSeed({ seed: "1a2b3c", difficulty: "standard" })).toBe(runCodeSeed({ seed: "1A2B3C", difficulty: "veteran" }));
    expect(seedLabelFromHash("#seed=1a2b3c&level=standard")).toBe("1A2B3C");
    expect(seedLabelFromHash("#seed=mirror&level=standard")).toBe(formatSeed(runCodeSeed({ seed: "MIRROR", difficulty: "standard" })));
    expect(seedLabelFromHash("")).toBeNull();
  });
});

describe("recognising pasted run codes", () => {
  it("accepts hashes, query strings and full links", () => {
    expect(looksLikeRunCode("#seed=1A2B3C&level=veteran")).toBe(true);
    expect(looksLikeRunCode("seed=1A2B3C&level=veteran")).toBe(true);
    expect(looksLikeRunCode("https://example.com/game?seed=1A2B3C")).toBe(true);
    expect(looksLikeRunCode("https://example.com/game#level=recruit")).toBe(true);
  });

  it("leaves plain seeds alone", () => {
    expect(looksLikeRunCode("MIRROR")).toBe(false);
    expect(looksLikeRunCode("1a2b3c")).toBe(false);
    expect(looksLikeRunCode("")).toBe(false);
    expect(looksLikeRunCode("boss-rush")).toBe(false);
  });
});
