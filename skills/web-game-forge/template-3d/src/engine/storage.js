// Tiny persistence helpers. Storage can throw (private mode, disabled cookies),
// so every access is guarded and falls back to a default.

export function getNumber(key, fallback = 0) {
  try {
    const v = Number(localStorage.getItem(key));
    return Number.isFinite(v) && localStorage.getItem(key) !== null ? v : fallback;
  } catch {
    return fallback;
  }
}

export function setNumber(key, value) {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    /* ignore: persistence is a nice-to-have */
  }
}
