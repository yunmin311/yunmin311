/**
 * Formatting helpers shared by panels.
 *
 * These live apart from the data layer on purpose: a panel should be able to
 * draw without knowing where its numbers came from, which is what makes the
 * panels liftable into another project at all.
 */

/** Compact elapsed time: 40M, 6H, 3D, 2W, 5MO. Uppercase, because it is a label. */
export function ago(ms, now = Date.now()) {
  const s = Math.max(0, now - ms) / 1000
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}M`
  if (s < 86400) return `${Math.floor(s / 3600)}H`
  if (s < 86400 * 14) return `${Math.floor(s / 86400)}D`
  if (s < 86400 * 60) return `${Math.floor(s / (86400 * 7))}W`
  return `${Math.floor(s / (86400 * 30))}MO`
}

/** 1.2k / 340 — for line counts and similar. */
export const compact = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n))

/** 3.4 MB / 512 KB. */
export const bytes = (n) =>
  n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`
