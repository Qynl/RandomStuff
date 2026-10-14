import type { Rect, Vec2 } from "./types";

export const WORLD = { width: 960, height: 600 };
export const OBSTACLES: Rect[] = [
  { x: 218, y: 142, w: 74, h: 76 },
  { x: 668, y: 142, w: 74, h: 76 },
  { x: 218, y: 382, w: 74, h: 76 },
  { x: 668, y: 382, w: 74, h: 76 },
  { x: 430, y: 254, w: 100, h: 92 }
];


/** Minimum distance from a point to a finite line segment. Useful for swept collision checks. */
export function distanceToSegment(point: Vec2, start: Vec2, end: Vec2): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared < 0.000001) return Math.hypot(point.x - start.x, point.y - start.y);
  const projection = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
  const closestX = start.x + projection * dx;
  const closestY = start.y + projection * dy;
  return Math.hypot(point.x - closestX, point.y - closestY);
}

/** Returns whether a moving circle's center path passes within radius of a target point. */
export function segmentHitsCircle(start: Vec2, end: Vec2, center: Vec2, radius: number): boolean {
  return distanceToSegment(center, start, end) <= radius;
}

export function circleHitsRect(point: Vec2, radius: number, rect: Rect): boolean {
  const nearestX = Math.max(rect.x, Math.min(point.x, rect.x + rect.w));
  const nearestY = Math.max(rect.y, Math.min(point.y, rect.y + rect.h));
  const dx = point.x - nearestX;
  const dy = point.y - nearestY;
  return dx * dx + dy * dy < radius * radius;
}

export function moveWithCollisions(position: Vec2, movement: Vec2, radius: number): Vec2 {
  let next = { x: Math.max(radius, Math.min(WORLD.width - radius, position.x + movement.x)), y: Math.max(radius, Math.min(WORLD.height - radius, position.y + movement.y)) };
  if (OBSTACLES.some((obstacle) => circleHitsRect(next, radius, obstacle))) {
    const horizontal = { x: next.x, y: position.y };
    const vertical = { x: position.x, y: next.y };
    const canHorizontal = !OBSTACLES.some((obstacle) => circleHitsRect(horizontal, radius, obstacle));
    const canVertical = !OBSTACLES.some((obstacle) => circleHitsRect(vertical, radius, obstacle));
    if (canHorizontal && canVertical) next = Math.abs(movement.x) > Math.abs(movement.y) ? horizontal : vertical;
    else if (canHorizontal) next = horizontal;
    else if (canVertical) next = vertical;
    else next = { ...position };
  }
  return next;
}

export function segmentBlocked(from: Vec2, to: Vec2): boolean {
  const steps = Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / 8);
  for (let i = 1; i < steps; i += 1) {
    const t = i / steps;
    const point = { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
    if (OBSTACLES.some((obstacle) => circleHitsRect(point, 2, obstacle))) return true;
  }
  return false;
}