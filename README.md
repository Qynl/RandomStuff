# RandomStuff

A home for small experiments and tools.

## Skills

### web-game-forge

An AI skill for building polished, high-feel browser games with no build step.

- `skills/web-game-forge/SKILL.md`: the playbook an agent follows (workflow, engine rules, scope)
- `skills/web-game-forge/references/quality-bar.md`: the game-feel checklist and starting numbers
- `skills/web-game-forge/references/engine-api.md`: the engine modules and how to use them
- `skills/web-game-forge/template/`: a complete, playable starter (engine + sample game "Neon Drift")
- `skills/web-game-forge/scripts/scaffold.mjs`: create a new game from the template
- `skills/web-game-forge/scripts/check.mjs`: sanity-check a generated game

Quick start:

```sh
node skills/web-game-forge/scripts/scaffold.mjs ../my-game "My Game"
node skills/web-game-forge/scripts/check.mjs ../my-game
cd ../my-game && python3 -m http.server 8080 --bind 0.0.0.0   # open http://localhost:8080
```
