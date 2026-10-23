# THE DOOR — Visual Prototype

First milestone: a single atmospheric 3D horror room. This prototype focuses on visual direction and interaction foundations rather than a full game loop.

## Stack
- React + Vite
- Three.js via React Three Fiber
- Drei helpers and postprocessing effects
- Procedurally generated material textures, no external 3D assets required

## Run locally
```bash
npm install
npm run dev
```

## Current scene
- A moody waiting room with a detailed paneled wooden door, brass hardware, sconces, framed wall art, a side table, rug, and aged wall/floor materials
- Dynamic practical lights, subtle flicker, floating dust, fog, film grain, bloom, vignette, and restrained chromatic aberration
- Minimal title screen and in-game HUD
- Pointer-lock first-person look controls and door interaction (click the door or press E)
- Toggleable low-frequency ambient drone generated with Web Audio

## Controls
- Click **ENTER ROOM** to enter the scene
- Mouse to look around
- WASD movement is planned for the next visual-interaction pass; this first pass establishes the room, camera, and interaction surfaces
- Click the door or press E to open/close it

## Scope
Only the new application files and this project note are added on the `the-door/visual-prototype` branch. Existing repository content is preserved.
