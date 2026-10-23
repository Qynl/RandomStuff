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
- Pointer-lock first-person controls, a traversable corridor beyond the door, and a door interaction (click the door or press E)
- A two-beat uncanny sequence: after entering the corridor, look back toward the room and down the corridor to reveal a distant silhouette; focus on it, then look away and it relocates closer while unseen
- Corridor practical lights respond to the apparition with uneven flicker and brief near-blackouts; the silhouette subtly sways
- Sustained eye contact builds a two-step gaze pressure: corridor lights become more erratic, the silhouette's sway intensifies, and the opt-in ambient drone subtly detunes; looking away releases the pressure as the apparition relocates
- After relocating, the apparition vanishes when you turn away and only returns after you look back down the corridor; its return delay varies, so it does not snap back on a perfectly predictable beat
- Toggleable low-frequency ambient drone generated with Web Audio; when the apparition advances, the drone slowly detunes and gains a tiny amount of weight (only while sound is enabled)

## Controls
- Click **ENTER ROOM** to enter the scene
- Mouse to look around
- Pointer-lock first-person camera with WASD/arrow-key movement and room bounds
- Click the door or press E to open/close it
- When the door is open, walk through it into the corridor; the corridor is narrow, so stay centered
- Once inside, turn back toward the room, then look down the corridor again to trigger the first reveal
- Look directly at the silhouette, then look away; it shifts closer when it leaves your view

## Scope
Only the new application files and this project note are added on the `the-door/visual-prototype` branch. Existing repository content is preserved.
