// geometry/blockGenerator.js — новый генератор кварталов (Stage 2).
// Улучшения против старого:
//  • bbox-prefilter: ячейка пересекается с участком, только если их bbox пересекаются
//    → в разы меньше вызовов turf.intersect на больших/узких участках;
//  • корректная работа с отверстиями (holes) — intersect сохраняет дырки участка;
//  • обрезка по границе, отсев микро-осколков (< minAreaM2);
//  • интеллектуальный выбор размера/направления сетки (auto);
//  • детерминированная нумерация.

import { safeIntersect, safeArea, safeClean } from './turfSafe.js';

const KM = { units: 'kilometers' };

// Интеллектуальный выбор: размер квартала и угол сетки по форме участка.
// Возвращает { blockSize, angle } — если auto включён, иначе переданные значения.
export function inferGrid(parcel, opts) {
  const bbox = turf.bbox(parcel);
  const [minX, minY, maxX, maxY] = bbox;
  const widthKm = turf.distance([minX, minY], [maxX, minY], KM);
  const heightKm = turf.distance([minX, minY], [minX, maxY], KM);
  const areaHa = safeArea(parcel) / 10000;

  let blockSize = opts.blockSize;
  let angle = opts.angle;

  if (opts.autoSize) {
    // Крупнее участок — крупнее кварталы (эргономичная сетка).
    // 60 м для < 2 га, до 140 м для > 40 га.
    if (areaHa < 2) blockSize = 60;
    else if (areaHa < 8) blockSize = 80;
    else if (areaHa < 20) blockSize = 100;
    else if (areaHa < 40) blockSize = 120;
    else blockSize = 140;
  }

  if (opts.autoAngle) {
    // Ориентируем сетку вдоль длинной оси bbox (минимизирует обрезки).
    // Для прямоугольных участков ось ~ по стороне; берём наклон диагонали.
    angle = widthKm >= heightKm ? 0 : 90;
    // Тонкая подстройка: если сильно вытянут по диагонали — 45°
    const ratio = Math.max(widthKm, heightKm) / Math.max(1e-6, Math.min(widthKm, heightKm));
    if (ratio < 1.3) angle = 0; // почти квадрат — оставляем 0
  }

  return { blockSize, angle, widthKm, heightKm, areaHa };
}

// Основная генерация. Возвращает массив Feature<Polygon|MultiPolygon> (кварталы).
// opts: { blockSize, streetWidth, angle, autoSize, autoAngle, maxCells, minAreaM2 }
export function generateBlocks(parcel, opts) {
  const cfg = Object.assign(
    { maxCells: 8000, minAreaM2: 40 },
    opts,
    inferGrid(parcel, opts)
  );

  const bbox = turf.bbox(parcel);
  const [minX, minY, maxX, maxY] = bbox;

  const stepKm = (cfg.blockSize + cfg.streetWidth) / 1000;
  const blockKm = cfg.blockSize / 1000;
  const angle = cfg.angle || 0;
  const pivot = [(minX + maxX) / 2, (minY + maxY) / 2];

  const widthKm = cfg.widthKm;
  const heightKm = cfg.heightKm;

  // При повороте сетка должна накрыть весь bbox → запас = диагональ
  const marginKm = angle > 0 ? Math.hypot(widthKm, heightKm) : 0;
  const start = turf.destination(
    turf.destination(turf.point([minX, minY]), marginKm, 180, KM),
    marginKm, 270, KM
  );

  const parcelBBox = bbox; // для prefilter
  const blocks = [];
  let count = 0;

  for (let dy = 0; dy < heightKm + 2 * marginKm; dy += stepKm) {
    for (let dx = 0; dx < widthKm + 2 * marginKm; dx += stepKm) {
      if (count++ > cfg.maxCells) {
        console.warn('blockGenerator: достигнут лимит ячеек');
        break;
      }

      const sw = turf.destination(turf.destination(start, dy, 0, KM), dx, 90, KM);
      const swC = sw.geometry.coordinates;
      const se = turf.destination(sw, blockKm, 90, KM).geometry.coordinates;
      const ne = turf.destination(turf.destination(sw, blockKm, 90, KM), blockKm, 0, KM).geometry.coordinates;
      const nw = turf.destination(sw, blockKm, 0, KM).geometry.coordinates;

      let cell = turf.polygon([[swC, se, ne, nw, swC]]);
      if (angle > 0) cell = turf.transformRotate(cell, angle, { pivot });

      // bbox-prefilter: пересечение bbox ячейки и участка — дёшево, отсекает дальние ячейки
      if (!bboxOverlap(turf.bbox(cell), parcelBBox)) continue;

      const piece = safeIntersect(cell, parcel);
      if (!piece) continue;
      if (safeArea(piece) < cfg.minAreaM2) continue; // отсев осколков

      piece.properties = Object.assign({}, piece.properties, {
        index: blocks.length + 1,
        zone: 'residential'
      });
      blocks.push(safeClean(piece));
    }
  }

  return { blocks, grid: { start, angle, pivot, stepKm, blockKm, streetKm: cfg.streetWidth / 1000, widthKm, heightKm, marginKm } };
}

function bboxOverlap(a, b) {
  return !(a[2] < b[0] || a[0] > b[2] || a[3] < b[1] || a[1] > b[3]);
}

// Перенумеровать кварталы по порядку
export function renumber(blocks) {
  blocks.forEach((b, i) => {
    if (!b.properties) b.properties = {};
    b.properties.index = i + 1;
  });
  return blocks;
}
