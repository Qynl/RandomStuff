# The 3D tier (template-3d)

Use this tier when the user asks for a 3D game, or for something that "looks like a modern game". The 2D template is still the right choice for arcade-style games.

## What the template gives you

- Renderer: ACES tone mapping, PCF soft shadows, multisampled HDR target, bloom, and a sky gradient with fog.
- Arena: procedural stone textures (no downloads), pillars, cover, lit torches with flicker, a directional sun with shadows.
- Character: a jointed humanoid built from primitives. The rig has a procedural locomotion layer (idle breathing, run cycle, footfall bob) and a keyframed clip layer (combo strikes, spin, dodge roll, hurt, death, slam). Joints ease toward targets every frame, so transitions blend instead of snapping.
- Combat: a three-hit combo with explicit damage windows, dodge with invulnerability frames, block with a stamina cost and guard break, poise-based staggers, and melee aim assist.
- AI: enemies are a readable state machine (spawn → chase → windup → strike → recover, plus stagger and death). Enemies never hit without a red ground telegraph first.
- Boss: four patterns (ground slam on a marked spot, charge that can stun on a pillar, three-hit combo, and a phase-2 shockwave), plus a phase-2 roar at half health.
- Feel: hit-stop, trauma shake, sparks on the GPU, procedural sound, a sprint FOV kick, an over-the-shoulder camera that pulls in around cover, and a DOM HUD.

## Rules for working in this tier

1. All tuning lives in `src/game/config.js`. Change numbers there, not in the logic.
2. Every new enemy or attack needs a telegraph and a recover window. If the player can't see it coming, it's unfair.
3. Animate through clips and holds in `rig.js`. Don't set joint rotations from gameplay code.
4. Keep simulation in `game.update` with the fixed step. Pass `simDt` (zero during hit-stop) to anything that should freeze.
5. Check the scene in a real headless browser before handing it over. Screenshots catch camera and lighting problems that code review misses.

## Honest limits, and how to go further

- The character is primitives. For real character art, add a CC0 or licensed glTF model and drive its skeleton with the same clip format (map joint names). Models are the single biggest visual upgrade available.
- Collision is custom (circles on the XZ plane). For multi-level or jumping games, add Rapier (`@dimforge/rapier3d-compat`) for physics and a navmesh for pathfinding.
- Shadows, bloom and sparks are tuned for a mid-range laptop GPU. Test on a real device before calling it done. Headless software rendering is much slower.
- Touch controls are not implemented in the 3D template. Add them before shipping to phones.
- Balance (enemy damage, boss HP, wave sizes) is a starting point. It needs playtesting by a human.
