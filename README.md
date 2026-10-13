# RandomStuff

A home for small experiments and tools.

## Skills

### web-game-forge

An AI skill for building polished, high-feel browser games with no build step.

- `skills/web-game-forge/SKILL.md`: the playbook an agent follows (workflow, engine rules, scope)
- `skills/web-game-forge/references/quality-bar.md`: the game-feel checklist and starting numbers
- `skills/web-game-forge/references/engine-api.md`: the engine modules and how to use them
- `skills/web-game-forge/references/3d-tier.md`: how the 3D tier works and its limits
- `skills/web-game-forge/template-3d/`: a 3D action game with a rigged character, combat, enemy AI, and a boss (default)
- `skills/web-game-forge/template-2d/`: a 2D arcade starter (engine + sample game "Neon Drift")
- `skills/web-game-forge/scripts/scaffold.mjs`: create a new game from the template
- `skills/web-game-forge/scripts/check.mjs`: sanity-check a generated game

Quick start:

```sh
node skills/web-game-forge/scripts/scaffold.mjs ../my-game "My Game"   # 3D (default); add --2d for 2D
node skills/web-game-forge/scripts/check.mjs ../my-game
cd ../my-game && python3 -m http.server 8080 --bind 0.0.0.0   # open http://localhost:8080
```
