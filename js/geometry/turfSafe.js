// geometry/turfSafe.js — безопасные обёртки Turf (не бросают, кэш площадей).
// Единая точка отказоустойчивости геометрических операций.

export function safeIntersect(a, b) {
  try { return turf.intersect(a, b) || null; } catch (e) { return null; }
}
export function safeDifference(a, b) {
  try { return turf.difference(a, b) || null; } catch (e) { return null; }
}
export function safeUnion(a, b) {
  try { return turf.union(a, b) || null; } catch (e) { return null; }
}
export function safeBuffer(f, km, opts = { units: 'kilometers' }) {
  try { return turf.buffer(f, km, opts) || null; } catch (e) { return null; }
}
export function safeArea(f) {
  try { return turf.area(f); } catch (e) { return 0; }
}
export function safeClean(f) {
  try { return turf.cleanCoords(f) || f; } catch (e) { return f; }
}
export function safeIntersects(a, b) {
  try { return turf.booleanIntersects(a, b); } catch (e) { return false; }
}
export function safePointInPolygon(pt, poly) {
  try { return turf.booleanPointInPolygon(pt, poly); } catch (e) { return false; }
}

// Union списка полигонов по цепочке (пропуская проблемные)
export function unionAll(features) {
  const list = (features || []).filter(Boolean);
  if (!list.length) return null;
  let acc = list[0];
  for (let i = 1; i < list.length; i++) {
    const u = safeUnion(acc, list[i]);
    if (u) acc = u;
  }
  return acc;
}

// Центр масс с фолбэком
export function centerOf(f) {
  try { return turf.centerOfMass(f); } catch (e) {
    try { return turf.centroid(f); } catch (e2) { return null; }
  }
}
