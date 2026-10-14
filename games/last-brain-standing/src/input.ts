import type { Rect, Vec2 } from "./types";
import { normalize } from "./ai";

export const STICK_DEADZONE = 0.16;

/**
 * Radial deadzone with rescaled output, so small thumb drift does nothing but
 * the full remaining range still reaches 1.0. Pure and unit tested.
 */
export function applyDeadzone(raw: Vec2, deadzone = STICK_DEADZONE): Vec2 {
  const magnitude = Math.hypot(raw.x, raw.y);
  if (magnitude <= deadzone) return { x: 0, y: 0 };
  const scaled = Math.min(1, (magnitude - deadzone) / (1 - deadzone));
  const direction = normalize(raw);
  return { x: direction.x * scaled, y: direction.y * scaled };
}

/** Offset from the centre of a control, clamped to its radius and deadzoned. */
export function stickVectorFromPointer(centre: Vec2, pointer: Vec2, radius: number, deadzone = STICK_DEADZONE): Vec2 {
  if (radius <= 0) return { x: 0, y: 0 };
  const raw = { x: (pointer.x - centre.x) / radius, y: (pointer.y - centre.y) / radius };
  const magnitude = Math.hypot(raw.x, raw.y);
  const clamped = magnitude > 1 ? { x: raw.x / magnitude, y: raw.y / magnitude } : raw;
  return applyDeadzone(clamped, deadzone);
}

/** Maps a pointer position inside a canvas element onto world coordinates. */
export function screenToWorld(clientX: number, clientY: number, bounds: Rect, world: { width: number; height: number }): Vec2 {
  if (bounds.w <= 0 || bounds.h <= 0) return { x: world.width / 2, y: world.height / 2 };
  return {
    x: ((clientX - bounds.x) / bounds.w) * world.width,
    y: ((clientY - bounds.y) / bounds.h) * world.height
  };
}

/** Keyboard and touch can both drive movement; the larger intent wins per axis. */
export function mergeMoveInputs(keyboard: Vec2, stick: Vec2): Vec2 {
  const combined = { x: keyboard.x + stick.x, y: keyboard.y + stick.y };
  const magnitude = Math.hypot(combined.x, combined.y);
  if (magnitude <= 1) return combined;
  return { x: combined.x / magnitude, y: combined.y / magnitude };
}

/**
 * Turns a discrete key set into a movement vector. Arrow keys and WASD are
 * equivalent inputs (previously only dash checked for WASD).
 */
export function keyboardMoveVector(keys: ReadonlySet<string>): Vec2 {
  let x = 0;
  let y = 0;
  if (keys.has("w") || keys.has("arrowup")) y -= 1;
  if (keys.has("s") || keys.has("arrowdown")) y += 1;
  if (keys.has("a") || keys.has("arrowleft")) x -= 1;
  if (keys.has("d") || keys.has("arrowright")) x += 1;
  return normalize({ x, y });
}

/** 0..1 readiness fraction for the dash button ring. 1 means ready. */
export function dashChargeFraction(cooldown: number, total: number): number {
  if (total <= 0) return 1;
  return Math.max(0, Math.min(1, 1 - cooldown / total));
}

export interface TouchControlContext {
  /** `(pointer: coarse)` - the primary input is a finger or stylus. */
  coarsePointer: boolean;
  /** `(pointer: fine)` - a mouse or trackpad is also available. */
  finePointer?: boolean;
  /** The user agent names a phone or tablet. */
  mobileUserAgent?: boolean;
  /** Viewport width in CSS pixels, or 0 when it cannot be measured. */
  viewportWidth?: number;
  /** Any touch support at all, which is *not* the same as being a phone. */
  touchEvents: boolean;
  /** Explicit choice from the settings toggle, or null to decide automatically. */
  userOverride: boolean | null;
}

const MOBILE_USER_AGENT = /android|iphone|ipad|ipod|iemobile|windows phone|mobile|silk|kindle/i;

/** True when a user agent string looks like a phone or tablet. */
export function isMobileUserAgent(userAgent: string): boolean {
  return MOBILE_USER_AGENT.test(userAgent);
}

/**
 * Decides whether the on-screen sticks should be shown.
 *
 * Touch *capability* is not the same as being on a phone: plenty of laptops have
 * a touchscreen and still have a keyboard and a mouse, and `ontouchstart` is
 * even defined in some desktop browsers. The sticks are for phones and tablets,
 * so the automatic answer requires a coarse pointer from a device that either
 * identifies as mobile or has no fine pointer at all on a small screen. Either
 * way the settings toggle overrides the guess.
 */
export function shouldShowTouchControls(options: TouchControlContext): boolean {
  if (options.userOverride !== null) return options.userOverride;
  if (!options.coarsePointer) return false;
  if (options.mobileUserAgent) return true;
  const finePointer = options.finePointer ?? false;
  const width = options.viewportWidth ?? 0;
  const smallScreen = width > 0 && width <= 900;
  return !finePointer && smallScreen;
}

/** Tags that swallow keyboard input. Game hotkeys must never steal their keys. */
const EDITABLE_TAGS = new Set(["input", "textarea", "select", "option"]);

/**
 * True when a key event belongs to a form control or editable element.
 *
 * The runtime used to listen on `window` and act on every key press, so typing
 * a seed containing "m" muted the game and arrow keys never moved the caret.
 * Hotkeys now defer to anything the player is typing into.
 */
/** Any object that can describe itself as an element: a real event target or a stub. */
export type KeyTarget = { tagName?: unknown; isContentEditable?: unknown } | EventTarget | null;

export function isEditableTarget(target: KeyTarget): boolean {
  if (!target || typeof target !== "object") return false;
  const element = target as { tagName?: unknown; isContentEditable?: unknown };
  if (element.isContentEditable === true) return true;
  if (typeof element.tagName !== "string") return false;
  return EDITABLE_TAGS.has(element.tagName.toLowerCase());
}
