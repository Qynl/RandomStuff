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

/** Decides whether touch controls should be shown based on pointer capability. */
export function shouldShowTouchControls(options: { coarsePointer: boolean; touchEvents: boolean; userOverride: boolean | null }): boolean {
  if (options.userOverride !== null) return options.userOverride;
  return options.coarsePointer || options.touchEvents;
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
