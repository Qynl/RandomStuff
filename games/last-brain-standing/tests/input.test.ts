import { describe, expect, it } from "vitest";
import {
  applyDeadzone,
  dashChargeFraction,
  isEditableTarget,
  keyboardMoveVector,
  mergeMoveInputs,
  screenToWorld,
  isMobileUserAgent,
  shouldShowTouchControls,
  stickVectorFromPointer
} from "../src/input";

describe("analog stick input", () => {
  it("ignores thumb drift inside the deadzone", () => {
    expect(applyDeadzone({ x: 0.05, y: 0.05 })).toEqual({ x: 0, y: 0 });
    expect(applyDeadzone({ x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
  });

  it("rescales past the deadzone so the full range still reaches one", () => {
    const full = applyDeadzone({ x: 1, y: 0 });
    expect(Math.hypot(full.x, full.y)).toBeCloseTo(1, 5);
    const mid = applyDeadzone({ x: 0.58, y: 0 });
    expect(mid.x).toBeGreaterThan(0.1);
    expect(mid.x).toBeLessThan(1);
  });

  it("maps a pointer inside a stick pad to a clamped vector", () => {
    const centre = { x: 100, y: 100 };
    expect(stickVectorFromPointer(centre, { x: 100, y: 100 }, 66)).toEqual({ x: 0, y: 0 });
    const right = stickVectorFromPointer(centre, { x: 166, y: 100 }, 66);
    expect(right.x).toBeCloseTo(1, 4);
    expect(right.y).toBeCloseTo(0, 4);
    const beyond = stickVectorFromPointer(centre, { x: 400, y: 100 }, 66);
    expect(beyond.x).toBeCloseTo(1, 4);
    expect(Math.hypot(beyond.x, beyond.y)).toBeLessThanOrEqual(1.0001);
  });

  it("merges keyboard and stick input without exceeding a unit vector", () => {
    const diagonal = mergeMoveInputs({ x: 1, y: 0 }, { x: 0, y: 1 });
    expect(diagonal.x).toBeCloseTo(Math.SQRT1_2, 5);
    expect(diagonal.y).toBeCloseTo(Math.SQRT1_2, 5);
    const merged = mergeMoveInputs({ x: 1, y: 0 }, { x: 1, y: 0 });
    expect(merged.x).toBeCloseTo(1, 5);
    expect(Math.hypot(merged.x, merged.y)).toBeCloseTo(1, 5);
    // A soft stick push plus a key press stays a legal unit-ish vector.
    const mixed = mergeMoveInputs({ x: 0, y: -1 }, { x: 0.2, y: 0 });
    expect(Math.hypot(mixed.x, mixed.y)).toBeLessThanOrEqual(1.0001);
  });

  it("treats arrows and WASD as the same movement keys", () => {
    expect(keyboardMoveVector(new Set(["w"]))).toEqual(keyboardMoveVector(new Set(["arrowup"])));
    const downRight = keyboardMoveVector(new Set(["d", "s"]));
    expect(downRight.x).toBeCloseTo(Math.SQRT1_2, 6);
    expect(downRight.y).toBeCloseTo(Math.SQRT1_2, 6);
    expect(keyboardMoveVector(new Set(["a", "d"]))).toEqual({ x: 0, y: 0 });
    expect(keyboardMoveVector(new Set())).toEqual({ x: 0, y: 0 });
  });

  it("maps pointer coordinates onto world space", () => {
    const mapped = screenToWorld(50, 25, { x: 0, y: 0, w: 100, h: 50 }, { width: 960, height: 600 });
    expect(mapped).toEqual({ x: 480, y: 300 });
    const offset = screenToWorld(10, 10, { x: 10, y: 10, w: 20, h: 20 }, { width: 100, height: 100 });
    expect(offset).toEqual({ x: 0, y: 0 });
  });

  it("degrades safely when the canvas has no measurable size", () => {
    const mapped = screenToWorld(10, 10, { x: 0, y: 0, w: 0, h: 0 }, { width: 960, height: 600 });
    expect(mapped).toEqual({ x: 480, y: 300 });
  });
});

describe("dash button state", () => {
  it("reports full charge when ready and zero while fully recharging", () => {
    expect(dashChargeFraction(0, 2)).toBe(1);
    expect(dashChargeFraction(2, 2)).toBe(0);
    expect(dashChargeFraction(1, 2)).toBeCloseTo(0.5, 5);
    expect(dashChargeFraction(0, 0)).toBe(1);
  });
});

describe("touch control visibility", () => {
  it("shows touch controls on coarse pointers and touch devices", () => {
    // A phone: coarse pointer and a mobile user agent.
    expect(shouldShowTouchControls({ coarsePointer: true, mobileUserAgent: true, touchEvents: true, userOverride: null })).toBe(true);
    // A touchscreen laptop: coarse is also true there, but it has a mouse, a
    // keyboard and a desktop user agent, so the sticks stay out of the way.
    expect(
      shouldShowTouchControls({ coarsePointer: true, finePointer: true, mobileUserAgent: false, viewportWidth: 1440, touchEvents: true, userOverride: null })
    ).toBe(false);
    // A desktop browser that merely reports touch support gets nothing either.
    expect(shouldShowTouchControls({ coarsePointer: false, finePointer: true, mobileUserAgent: false, viewportWidth: 1280, touchEvents: true, userOverride: null })).toBe(false);
    // An iPad in desktop mode: no fine pointer, small screen, fingers only.
    expect(shouldShowTouchControls({ coarsePointer: true, finePointer: false, mobileUserAgent: false, viewportWidth: 834, touchEvents: true, userOverride: null })).toBe(true);
    // Fingers but no mobile signature and a wide screen: a tablet-ish laptop.
    expect(shouldShowTouchControls({ coarsePointer: true, finePointer: false, mobileUserAgent: false, viewportWidth: 1600, touchEvents: true, userOverride: null })).toBe(false);
  });

  it("lets the player override detection in both directions", () => {
    expect(shouldShowTouchControls({ coarsePointer: false, touchEvents: false, userOverride: true })).toBe(true);
    expect(shouldShowTouchControls({ coarsePointer: true, mobileUserAgent: true, touchEvents: true, userOverride: false })).toBe(false);
    // The manual toggle can also force them on for a desktop player who wants them.
    expect(shouldShowTouchControls({ coarsePointer: false, finePointer: true, mobileUserAgent: false, viewportWidth: 1440, touchEvents: false, userOverride: true })).toBe(true);
  });

  it("recognises phone and tablet user agents, and nothing else", () => {
    expect(isMobileUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)")).toBe(true);
    expect(isMobileUserAgent("Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36")).toBe(true);
    expect(isMobileUserAgent("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)")).toBe(true);
    expect(isMobileUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120")).toBe(false);
    expect(isMobileUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605")).toBe(false);
    expect(isMobileUserAgent("")).toBe(false);
  });
});

describe("editable targets", () => {
  const make = (tagName: string, extra: Record<string, unknown> = {}) => Object.assign({ tagName, isContentEditable: false }, extra);

  it("treats form controls and editable elements as typing targets", () => {
    expect(isEditableTarget(make("INPUT"))).toBe(true);
    expect(isEditableTarget(make("TEXTAREA"))).toBe(true);
    expect(isEditableTarget(make("SELECT"))).toBe(true);
    expect(isEditableTarget(make("DIV", { isContentEditable: true }))).toBe(true);
  });

  it("leaves the arena and its buttons as game input", () => {
    expect(isEditableTarget(make("CANVAS"))).toBe(false);
    expect(isEditableTarget(make("BUTTON"))).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
    expect(isEditableTarget(globalThis)).toBe(false);
  });
});
