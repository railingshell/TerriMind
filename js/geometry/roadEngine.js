// geometry/roadEngine.js — дорожный движок (Stage 2).
// Осевая модель: LineString-оси = источник истины. Полигоны = буфер осей.
// Иерархия: main (магистрали, периметр) / local (улицы) / service (сервисные проезды/съезды).

import {
  safeIntersect, safeDifference, safeBuffer, safeArea, safeClean, unionAll, centerOf
} from './turfSafe.js';

const KM = { units: 'kilometers' };

// Построить осевые линии регулярной сетки (центры улиц-зазоров), обрезать по участку.
export function buildGridAxes(parcel, grid, streetWidthM) {
  const axes = [];
  const { start, angle, pivot, stepKm, blockKm, streetKm, widthKm, heightKm, marginKm } = grid;
  const totalW = widthKm + 2 * marginKm;
  const totalH = heightKm + 2 * marginKm;
  const parcelLine = turf.polygonToLine(parcel);

  const pt = (east, north) => {
    let p = turf.destination(turf.destination(start, north, 0, KM), east, 90, KM);
    if (angle > 0) p = turf.transformRotate(p, angle, { pivot });
    return p.geometry.coordinates;
  };

  const clip = (line, roadType) => {
    let pieces;
    try { pieces = turf.lineSplit(line, parcelLine).features; } catch (e) { pieces = [line]; }
    if (!pieces || !pieces.length) pieces = [line];
    for (const seg of pieces) {
      const cs = seg.geometry.coordinates;
      let mid;
      try { mid = turf.midpoint(turf.point(cs[0]), turf.point(cs[cs.length - 1])); } catch (e) { continue; }
      let inside = false;
      try { inside = turf.booleanPointInPolygon(mid, parcel); } catch (e) { inside = false; }
      if (!inside) continue;
      seg.properties = Object.assign({}, seg.properties, { roadType, width: streetWidthM, origin: 'grid' });
      axes.push(seg);
    }
  };

  for (let n = blockKm + streetKm / 2; n < totalH; n += stepKm) clip(turf.lineString([pt(0, n), pt(totalW, n)]), 'local');
  for (let e = blockKm + streetKm / 2; e < totalW; e += stepKm) clip(turf.lineString([pt(e, 0), pt(e, totalH)]), 'local');

  return axes;
}

// Полигон дорожной сети из осей (union буферов), обрезанный по участку.
export function netPolygon(axes, parcel) {
  const bufs = [];
  for (const ax of axes) {
    const w = (ax.properties && ax.properties.width) || 0;
    if (!(w > 0)) continue;
    const b = safeBuffer(ax, (w / 2) / 1000);
    if (b) bufs.push(b);
  }
  let net = unionAll(bufs);
  if (net && parcel) { const c = safeIntersect(net, parcel); if (c) net = c; }
  return net;
}

// Магистральное кольцо по периметру участка ширины mainWidthM.
export function mainRing(parcel, mainWidthM) {
  if (!(mainWidthM > 0)) return null;
  const coreKm = mainWidthM / 1000;
  let core = safeBuffer(parcel, -coreKm);
  if (core) {
    core = safeClean(core);
    if (safeArea(core) <= 1) core = null;
  }
  let ring = core ? safeDifference(parcel, core) : parcel;
  if (ring) {
    ring = safeClean(ring);
    if (safeArea(ring) <= 1) ring = null;
  }
  return ring;
}

// Построить полную дорожную структуру.
// Возвращает { main, local, service, all } (Feature|null).
export function buildRoads(parcel, axes, mainWidthM) {
  const result = { main: null, local: null, service: null, all: null };

  // Сеть из осей
  let net = netPolygon(axes, parcel);

  // Сервисные проезды: оси, помеченные origin manual/auto (съезды)
  const serviceAxes = axes.filter(a => a.properties && (a.properties.origin === 'manual' || a.properties.origin === 'auto'));
  if (serviceAxes.length) {
    const svc = netPolygon(serviceAxes, parcel);
    if (svc) result.service = svc;
  }

  // Магистральное кольцо
  const ring = mainRing(parcel, mainWidthM);
  result.main = ring;

  // Улицы = сеть минус магистраль (без наложения)
  let local = net;
  if (net && ring) { const d = safeDifference(net, ring); if (d) local = d; }
  result.local = local;

  result.all = unionAll([local, ring, result.service]);
  return result;
}

// Авто-соединения: для кварталов без выхода к сети строим короткий съезд (service).
// Возвращает массив новых осей (service).
export function autoConnect(parcel, blocks, axes, widthM) {
  const net = netPolygon(axes, parcel);
  const connectors = [];
  for (const b of blocks) {
    if (net) {
      let touches = false;
      try { touches = turf.booleanIntersects(b, net); } catch (e) { touches = false; }
      if (touches) continue;
    }
    const center = centerOf(b);
    if (!center) continue;

    let best = null, bestDist = Infinity;
    for (const ax of axes) {
      let snapped = null;
      try { snapped = turf.nearestPointOnLine(ax, center, KM); } catch (e) { snapped = null; }
      if (!snapped) continue;
      const d = snapped.properties.dist;
      if (d < bestDist) { bestDist = d; best = snapped; }
    }
    if (!best) continue;

    connectors.push(turf.lineString(
      [center.geometry.coordinates, best.geometry.coordinates],
      { roadType: 'service', width: widthM, origin: 'auto' }
    ));
  }
  return connectors;
}

// Вырезать полосы service-осей из кварталов (чтобы дорога не накрывала квартал).
export function carveRoadsFromBlocks(blocks, axes) {
  const carve = axes.filter(a => a.properties && (a.properties.origin === 'manual' || a.properties.origin === 'auto'));
  if (!carve.length) return blocks;

  let out = blocks;
  for (const ax of carve) {
    const w = (ax.properties && ax.properties.width) || 0;
    if (!(w > 0)) continue;
    const strip = safeBuffer(ax, (w / 2) / 1000);
    if (!strip) continue;

    const next = [];
    for (const b of out) {
      let overlaps = false;
      try { overlaps = turf.booleanIntersects(b, strip); } catch (e) { overlaps = false; }
      if (!overlaps) { next.push(b); continue; }
      const cut = safeDifference(b, strip);
      if (!cut) continue; // квартал полностью съеден
      cut.properties = Object.assign({}, b.properties);
      next.push(cut);
    }
    out = next;
  }
  return out;
}
