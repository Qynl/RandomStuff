export const MAX_WAVES = 5;

/** Returns null after the final wave has been cleared. */
export function getNextWave(currentWave: number): number | null {
  return currentWave >= MAX_WAVES ? null : Math.max(1, currentWave + 1);
}

/** Enemy count rises across the early waves and then caps at six. */
export function getWaveSpawnCount(wave: number): number {
  return Math.max(0, Math.min(3 + wave - 1, 6));
}
