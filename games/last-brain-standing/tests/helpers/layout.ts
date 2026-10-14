import { ARENA_LAYOUTS, type ArenaLayoutId } from "../../src/arena";
import type { World } from "../../src/sim";

/**
 * Pins a world to a named layout.
 *
 * Layouts are chosen from the seed, so a test that hand-places entities at
 * fixed coordinates (a bullet 40 units from a hostile, a block between two
 * points) has to say which geometry it is written against. Mechanics tests pin
 * the `quadrant` layout, which is the one those coordinates were authored for;
 * layout variation itself is covered in `tests/layout.test.ts`.
 */
export function pinLayout(world: World, id: ArenaLayoutId = "quadrant"): World {
  world.obstacles = ARENA_LAYOUTS[id].obstacles;
  world.arenaName = ARENA_LAYOUTS[id].name;
  return world;
}
