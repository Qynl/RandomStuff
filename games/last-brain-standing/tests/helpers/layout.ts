import { ARENA_LAYOUTS, type ArenaLayoutId } from "../../src/arena";
import type { World } from "../../src/sim";

/**
 * Pins a world to a named layout.
 *
 * Layouts are chosen from the seed, so a test that hand-places entities at
 * fixed coordinates (a bullet 40 units from a hostile, a block between two
 * points) has to say which geometry it is written against. Mechanics tests pin
 * the `proving` range, which is the sparse layout those coordinates were
 * authored for and the one the seed picker never picks;
 * layout variety itself is covered in `tests/layout.test.ts`.
 */
export function pinLayout(world: World, id: ArenaLayoutId = "proving"): World {
  const layout = ARENA_LAYOUTS[id];
  world.arena = id;
  // Copied, exactly as the sim copies them: a test is allowed to shoot a crate
  // apart, and must not be able to alter the layout every other test reads.
  world.obstacles = layout.obstacles.map((block) => ({ ...block }));
  world.bushes = layout.bushes;
  world.water = layout.water;
  world.arenaName = layout.name;
  return world;
}
