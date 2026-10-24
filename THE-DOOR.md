# THE DOOR — Visual Prototype

A run of twenty-one rooms, a door at the end of every one, and no way back the
way you came. Built as a visual-direction prototype: there are no 3D models,
textures or audio files — every surface is painted to a canvas at runtime and
every sound is synthesised.

## Stack

- React 19 + Vite 7
- Three.js via React Three Fiber, drei helpers, postprocessing effects
- Procedural colour + bump maps for every surface, generated at boot
- Seeded room generation (mulberry32), so a run is reproducible from one number
- The only runtime network request is the two Google fonts in `index.html`

## Run locally

```bash
npm ci
npm run dev
```

## Build and deploy

```bash
npm run build     # static output in dist/
npm run preview   # serve the production build
```

`dist/` is a plain static bundle — host it on any static host (Netlify, Vercel,
Cloudflare Pages, GitHub Pages, an object bucket). No environment variables, no
server, no API keys. If you host it under a sub-path, set `base` in
`vite.config.js`; the app itself only uses relative asset URLs.

Client requirements: WebGL 2 and a keyboard. Pointer lock is preferred but not
required: where a browser will not hold the cursor — iOS, a sandboxed frame, a
hybrid laptop with a coarse primary pointer — the rooms open anyway and the view
is turned by dragging the canvas.

## How the rooms work

Rooms are stacked along the −Z axis at a fixed pitch (14 m) and every room is
generated from `(runSeed, roomIndex)`:

- **Twenty-two archetypes** — waiting room, long hall, nursery, chapel, store
  room, washroom, office, flood, gallery, boiler room, nowhere, bedroom, kitchen,
  library, classroom, stairwell, mirror hall, cold room, laundry, clock room,
  closet, the room with no ceiling, and the exit.
- **A bag, not a die.** A run draws from a shuffled bag of every archetype, so
  twenty rooms really are twenty different rooms. A weighted roll kept serving
  the same dozen, which made the building feel small.
- **Per-room variation.** Dimensions, prop placement, portraits, light seeds and
  a handful of chance details (a false door, a puddle, rubble, a fan, a collapsed
  ceiling, a dark entry) are drawn from the room's seed, so two library rooms are
  not the same library.
- **Traversal is physical.** Rooms are genuinely adjacent, so walking through a
  door carries you into the next room. There is no loading screen and no
  teleport: the room behind you is unmounted only once you are well inside the
  next one, and the entry corridor covers the seam.
- **Corridors** — the leftover space between two rooms becomes a dark passage
  with its own bulb, so the door you open reveals a space before it reveals a
  room. Their length varies with the depth of the rooms on either side, which is
  how a closet can be reached down a six-metre corridor.
- **Nothing blocks the door.** Every room's back wall is composed around the
  doorway: dresser banks flank it, shelves turn away from it, and each room gets
  a sconce or a portrait on the wall beside it so the view you walk towards has a
  shape.

`src/lib/rooms.js` owns the layout, the walkable rectangles and the moods;
`src/components/Room.jsx` owns the shell and the dressing for each archetype;
`src/components/props.jsx` owns the furniture.

## Light, colour and surfaces

Every room used to be lit by the same warm bulbs, which made twenty different
floor plans read as one grey building. Rooms now have a light identity:

- **Eight palettes** in `src/lib/palette.js` — amber, sodium, moonlight, sick
  green, ice, nursery pink, ember and candlelight — assigned per archetype and
  provided by context, so sconces, bulbs, tubes, candles, haze cones and the
  ambient fill all take the room's colour without every call site passing it.
- **Surfaces take the tint too.** A cold light on grey-green plaster is still
  grey; the wall, floor and ceiling materials are multiplied by the palette's
  surface wash, so the cold room is blue in the light *and* in the paint.
- **Decay is decals.** Six procedural stain textures (damp, drips, mould) are
  scattered per room from its seed across the walls, the ceiling and the corners,
  because a lit box reads as a box until its surfaces have a history.
- **Ceiling joists** on most rooms give the overhead light something to cut
  across and stop the ceiling being a lid.
- **Foreground dressing.** One or two low objects (chair, crate, barrel, rubble)
  sit just inside each entrance, so the view you walk into has something at a
  different distance than the far wall.
- The fill lights were cut back: the practicals own the room, and the hemisphere
  and directional fills are tinted by the palette instead of flattening it.

## Dread

Events are scheduled while you are playing, and escalate with depth. No event
repeats immediately.

| From room | Events |
| --- | --- |
| 1 | light stutter, whispers, footsteps that are not yours, doors slamming, something crossing the room ahead of you |
| 2 | something appears beside the door and is gone before you are sure |
| 3 | three figures standing in a row, facing the wall; a blackout with breathing in it |
| 4 | it stands in the doorway you came through — most players never turn around |
| 4 | the weeping kind: hold it in view and it is gone, closer, at an angle you are not covering. Look four times and it is where your eyes already are |
| 5 | it stands in the open doorway ahead of you, backlit by nothing |
| 6+ | the stalker: it appears at the end of the room you are not standing in and walks. It does not stop. |

The stalker is slower than you are, so it is a pressure valve rather than a jump
scare: it makes you cross the room faster and open the door without checking
what is behind you. Footsteps track it while it is active. If it reaches you, the
run ends with the room you died in.

## Controls

- Click **OPEN THE FIRST DOOR** to begin; the pointer locks if the browser allows it
- Mouse to look (or drag the canvas when the pointer cannot be locked), WASD or
  arrow keys to move
- **E** to open/close the door you are standing in front of
- **M** to toggle sound (also on the title screen)
- **Esc** releases the pointer and pauses; the title screen shows how deep you are
  and offers **KEEP GOING**

## Notes

- Sound starts on the first click (browser autoplay rules). Room tone, tension
  drone and every cue are synthesised with Web Audio; there are no audio files.
  Rooms get their own ambience: dripping, ticking, a machine hum.
- The tension drone rises when something is active and falls when you leave it
  behind in the room you came from.
- Rendering: two rooms mounted at a time, one shadow-casting practical per room,
  device pixel ratio capped at 1.5. `?debug` exposes `window.__door` (position,
  room, door state, plus `warp()` and `look()`) and `window.__run` (rooms, skip,
  staging a figure, calm mode) for automated tests; nothing is written to the
  window without that flag, and calm mode only exists to make screenshots
  deterministic.

## Testing notes

Headless Chromium checks used during development live in `artifacts/` (excluded
from version control). They drive the real game: enter, photograph every room
kind, stage each scare, open a door, walk through it into the next room, reach
the exit, restart into a new building, and pause.

## Scope

Only the application files, `.gitignore` and this note are touched on the
`the-door/visual-prototype` branch. Existing repository content is preserved.
