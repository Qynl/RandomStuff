/* Per-room light identity.
 *
 * The rooms share one set of fixtures — sconces, bulbs, tubes, candles — and
 * for a long time they also shared one colour, so every room in the building
 * was lit like the same waiting room. Colour is the cheapest way to make two
 * boxes feel like two places: a cold room should be lit cold, a boiler room
 * should be lit by its fire, and the nursery should be the wrong green.
 *
 * Fixtures read the palette from context and only fall back to their own
 * defaults when a room deliberately overrides them.
 */
import { createContext, useContext } from 'react';
import * as THREE from 'three';

export const PALETTES = {
  amber: {
    light: '#ffc482',
    bulb: '#ffbe78',
    glass: '#e2c69b',
    emissive: '#c1854a',
    cone: '#ffcf94',
    tube: '#eadfc4',
    tubeEmissive: '#d3ab72',
    fill: '#8ea6b8',
  },
  sodium: {
    // streetlamp orange, the colour of a stairwell at 3am
    light: '#ff9f4a',
    bulb: '#ffa85c',
    glass: '#e0b184',
    emissive: '#b26a25',
    cone: '#ffb066',
    tube: '#e8c39a',
    tubeEmissive: '#c48d4f',
    fill: '#6f8a9e',
  },
  moon: {
    // nothing in here is warm; everything is lit from somewhere else
    light: '#a9c4d8',
    bulb: '#c6dcee',
    glass: '#b3c4d1',
    emissive: '#6c8ba4',
    cone: '#b8cfe0',
    tube: '#dcebf7',
    tubeEmissive: '#8fb6d6',
    fill: '#7f9bb2',
  },
  sick: {
    // fluorescent green, the colour of a corridor nobody has cleaned
    light: '#b6d8a0',
    bulb: '#cbe4b4',
    glass: '#bcc9a8',
    emissive: '#7c9a5e',
    cone: '#c2ddab',
    tube: '#e2f2d2',
    tubeEmissive: '#9cc078',
    fill: '#8a9c86',
  },
  ice: {
    // the cold room, and anywhere with tiles
    light: '#a6e0ea',
    bulb: '#c3edf4',
    glass: '#b6d5d9',
    emissive: '#6ba2ad',
    cone: '#b7e6ee',
    tube: '#e0f6fa',
    tubeEmissive: '#8ccbd8',
    fill: '#7e9ba3',
  },
  rot: {
    // a nursery lamp left on for years
    light: '#e9a9a0',
    bulb: '#f0b6ab',
    glass: '#d8b3a9',
    emissive: '#a5645c',
    cone: '#eec0b4',
    tube: '#e8d8cf',
    tubeEmissive: '#c3988c',
    fill: '#8b7f8e',
  },
  ember: {
    // fire under a boiler: red, and only from below
    light: '#ff7a3f',
    bulb: '#ff8f4d',
    glass: '#d9a072',
    emissive: '#a83a16',
    cone: '#ff9a5e',
    tube: '#e2b48a',
    tubeEmissive: '#bb5f2e',
    fill: '#6d6a72',
  },
  candle: {
    // gold, low, and moving
    light: '#ffcf86',
    bulb: '#ffd699',
    glass: '#e3c698',
    emissive: '#bd7c33',
    cone: '#ffdca4',
    tube: '#e8d6b2',
    tubeEmissive: '#c99a55',
    fill: '#7c8a94',
  },
};

const TINTS = {
  waiting: 'amber',
  hall: 'moon',
  nursery: 'rot',
  chapel: 'candle',
  store: 'sodium',
  washroom: 'sick',
  office: 'sick',
  flooded: 'moon',
  gallery: 'amber',
  boiler: 'ember',
  nowhere: 'moon',
  bedroom: 'amber',
  kitchen: 'sick',
  library: 'amber',
  classroom: 'sick',
  stairwell: 'sodium',
  mirrorhall: 'moon',
  morgue: 'ice',
  laundry: 'ice',
  clockroom: 'candle',
  closet: 'amber',
  void: 'moon',
  exit: 'amber',
};

/* What the room does to its own surfaces. Light colour alone still leaves a
 * grey box: the walls have to take the tint too, or cold rooms read as warm
 * rooms with the saturation switched off. */
const SURFACES = {
  amber: { wall: '#e2d2b6', floor: '#cfc0a8', ceiling: '#c0b49c' },
  sodium: { wall: '#e6c49a', floor: '#d0b48c', ceiling: '#b8a184' },
  moon: { wall: '#b8cddd', floor: '#aebecd', ceiling: '#9fb2c4' },
  sick: { wall: '#cbdcb8', floor: '#c0d0ac', ceiling: '#a8b89a' },
  ice: { wall: '#c2dde3', floor: '#b6d0d6', ceiling: '#9cb6bc' },
  rot: { wall: '#e6c2bc', floor: '#d4b6ae', ceiling: '#bca49e' },
  ember: { wall: '#e0b492', floor: '#cba486', ceiling: '#b08c74' },
  candle: { wall: '#e4d0aa', floor: '#d2bc96', ceiling: '#bcaa88' },
};

export function paletteFor(key) {
  const palette = PALETTES[TINTS[key] || 'amber'];
  return { ...palette, surfaces: SURFACES[TINTS[key] || 'amber'] }; 
}

/** Multiply an sRGB hex colour by one of the palette's surface tints. */
export function tintColor(hex, tint) {
  if (!tint) return hex;
  const color = new THREE.Color(hex);
  const wash = new THREE.Color(tint);
  color.setRGB(
    Math.min(1, color.r * wash.r),
    Math.min(1, color.g * wash.g),
    Math.min(1, color.b * wash.b),
  );
  return `#${color.getHexString()}`;
}

export const PaletteContext = createContext(PALETTES.amber);

export function usePalette() {
  return useContext(PaletteContext);
}
