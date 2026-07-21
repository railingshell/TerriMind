// geometry/innerProfiles.js — внутриквартальные дорожки/тротуары по зонам.

import { safeIntersect, safeDifference, safeBuffer, unionAll } from './turfSafe.js';
import { ZONE_PROFILES } from '../zones/zoneConfig.js';

const KM = { units: 'kilometers' };

function innerAxesForBlock(block, profile) {
  const axes = [];
  const bbox = turf.bbox(block);
  const [minX, minY, maxX, maxY] = bbox;
  const widthKm = turf.distance([minX, minY], [maxX, minY], KM);
  const heightKm = turf.distance([minX, minY], [minX, maxY], KM);
  const sw = turf.point([minX, minY]);
  const blockLine = turf.polygonToLine(block);

  const pt = (eKm, nKm) => turf.destination(turf.destination(sw, nKm, 0, KM), eKm, 90, KM).geometry.coordinates;
  const clip = (line) => {
    let pieces;
    try { pieces = turf.lineSplit(line, blockLine).features; } catch (e) { pieces = [line]; }
    if (!pieces || !pieces.length) pieces = [line];
    for (const seg of pieces) {
      const cs = seg.geometry.coordinates;
      let mid;
      try { mid = turf.midpoint(turf.point(cs[0]), turf.point(cs[cs.length - 1])); } catch (e) { continue; }
      let inside = false;
      try { inside = turf.booleanPointInPolygon(mid, block); } catch (e) { inside = false; }
      if (inside) axes.push(seg);
    }
  };

  if (profile.step > 0) {
    const stepKm = profile.step / 1000;
    for (let n = stepKm; n < heightKm; n += stepKm) clip(turf.lineString([pt(0, n), pt(widthKm, n)]));
    for (let e = stepKm; e < widthKm; e += stepKm) clip(turf.lineString([pt(e, 0), pt(e, heightKm)]));
  } else {
    clip(turf.lineString([pt(0, 0), pt(widthKm, heightKm)]));
  }
  return axes;
}

// Построить внутренние дорожки/тротуары для набора кварталов.
// Возвращает Feature[] (kind: 'path'|'sidewalk').
export function buildInnerProfiles(blocks) {
  const out = [];
  for (const block of blocks) {
    const zone = (block.properties && block.properties.zone) || 'residential';
    const profile = ZONE_PROFILES[zone];
    if (!profile) continue;

    const axes = innerAxesForBlock(block, profile);
    if (!axes.length) continue;

    const pathBufs = [];
    for (const ax of axes) {
      const b = safeBuffer(ax, (profile.pathWidth / 2) / 1000);
      if (b) pathBufs.push(b);
    }
    let paths = unionAll(pathBufs);
    if (paths) { const c = safeIntersect(paths, block); if (c) paths = c; }
    if (!paths) continue;

    let sidewalks = null;
    if (profile.sidewalk && profile.sidewalkWidth > 0) {
      const wideBufs = [];
      for (const ax of axes) {
        const b = safeBuffer(ax, (profile.pathWidth / 2 + profile.sidewalkWidth) / 1000);
        if (b) wideBufs.push(b);
      }
      let wide = unionAll(wideBufs);
      if (wide) {
        const c = safeIntersect(wide, block); if (c) wide = c;
        sidewalks = safeDifference(wide, paths);
      }
    }

    if (sidewalks) {
      sidewalks.properties = { role: 'inner', zone, kind: 'sidewalk' };
      out.push(sidewalks);
    }
    paths.properties = { role: 'inner', zone, kind: 'path' };
    out.push(paths);
  }
  return out;
}
