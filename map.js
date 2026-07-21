// Этап 1: инициализация карты Leaflet + тайлы OpenStreetMap
const map = L.map('map').setView([55.7558, 37.6173], 12);
// UI-redesign: доступ к карте из inline-скрипта index.html (invalidateSize при ресайзе панелей)
window.map = map;

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);

// Этап 2: рисование участка (полигон)

// Слой, куда попадают нарисованные фигуры
const drawnItems = new L.FeatureGroup();
map.addLayer(drawnItems);

// Здесь храним текущий полигон участка
let currentParcelPolygon = null;

// Панели с явным z-index: дороги под кварталами, кварталы под участком
map.createPane('roadsPane');
map.getPane('roadsPane').style.zIndex = 410;
map.createPane('blocksPane');
map.getPane('blocksPane').style.zIndex = 420;

// Слой дорог (v3 Этап 3)
const roadsLayer = new L.FeatureGroup();
map.addLayer(roadsLayer);
let currentRoads = null; // GeoJSON Feature (Polygon/MultiPolygon) или null — все дороги (совместимость)
let currentRoadsMain = null;  // магистрали (периметр)
let currentRoadsLocal = null; // улицы (внутренние)
// v4 Часть 2: осевая модель — линии-оси дорог (источник истины для сети)
// Каждая: Feature<LineString> с properties.roadType ('main'|'local'|'manual') + properties.width (м)
let currentRoadAxes = [];

// Слой кварталов (Этап 3) + массив их GeoJSON-геометрий
const blocksLayer = new L.FeatureGroup();
map.addLayer(blocksLayer);
let currentBlocks = [];

// v4 Часть 5: внутриквартальные дорожки/тротуары (профили по зонам)
map.createPane('innerPane');
map.getPane('innerPane').style.zIndex = 425;
const innerLayer = new L.FeatureGroup();
map.addLayer(innerLayer);
let currentInnerRoads = []; // Feature[]: properties.role='inner', zone, kind='path'|'sidewalk'

// Слой подписей кварталов (v3 Этап 2 — нумерация)
map.createPane('labelsPane');
map.getPane('labelsPane').style.zIndex = 430;
map.getPane('labelsPane').style.pointerEvents = 'none';
const labelsLayer = new L.FeatureGroup();
map.addLayer(labelsLayer);
let showLabels = true; // показывать номера кварталов

// v4: флаг несохранённых изменений + индикатор в заголовке (единый источник title)
let hasUnsavedChanges = false;

// Обновить индикатор несохранённых изменений в заголовке окна.
// Title — единственный источник правды (main выставляет базовый 'TerriMind',
// дальше им управляет только renderer). Этап 6.
function updateDirtyIndicator() {
  const base = 'TerriMind';
  try { document.title = (hasUnsavedChanges ? '● ' : '') + base; } catch (e) { /* ok */ }
}

// Сообщить main о смене dirty-состояния (для перехвата закрытия окна). Этап 2.
function notifyMainDirty() {
  try {
    if (window.terrimind && window.terrimind.notifyDirty) {
      window.terrimind.notifyDirty(hasUnsavedChanges);
    }
  } catch (e) { /* ok */ }
}

function markDirty() { hasUnsavedChanges = true; updateDirtyIndicator(); notifyMainDirty(); }
function markSaved() { hasUnsavedChanges = false; updateDirtyIndicator(); notifyMainDirty(); }

// Этап 3: main просит сохранить проект перед закрытием.
// Запускаем реальный saveProject, результат отдаём обратно в main.
if (window.terrimind && window.terrimind.onRequestSaveBeforeClose) {
  window.terrimind.onRequestSaveBeforeClose(async function () {
    let ok = false;
    try {
      ok = await saveProject(); // true при успехе, false при отмене/ошибке
    } catch (e) {
      ok = false;
    }
    try { window.terrimind.sendCloseSaveResult(ok); } catch (e) { /* ok */ }
  });
}

// Панель рисования: разрешаем только полигон
const drawControl = new L.Control.Draw({
  draw: {
    polygon: {
      allowIntersection: false,
      showArea: true,
      shapeOptions: { color: '#e67e22' }
    },
    // остальные инструменты отключаем
    polyline: false,
    rectangle: false,
    circle: false,
    marker: false,
    circlemarker: false
  },
  edit: {
    featureGroup: drawnItems,
    remove: true
  }
});
map.addControl(drawControl);

// Кнопка "Нарисовать участок" — запускает режим рисования полигона
const drawBtn = document.getElementById('drawBtn');
const clearBtn = document.getElementById('clearBtn');

drawBtn.addEventListener('click', function () {
  new L.Draw.Polygon(map, drawControl.options.draw.polygon).enable();
});

// Кнопка "Очистить" — убирает участок и кварталы, сбрасывает ТЭП
clearBtn.addEventListener('click', function () {
  drawnItems.clearLayers();
  currentParcelPolygon = null;
  clearBlocks();
  updateParcelArea();
  generateBtn.disabled = true;
  saveBtn.disabled = true;
  clearBtn.disabled = true;
  updateRoadToolButtons();
});

// Площадь полигона в м² (геодезическая, из Leaflet.draw)
function calcArea(layer) {
  const latlngs = layer.getLatLngs()[0];
  return L.GeometryUtil.geodesicArea(latlngs);
}

// Показать площадь в панели
function updateParcelArea() {
  const el = document.getElementById('parcelArea');
  if (!currentParcelPolygon) {
    el.textContent = '—';
    return;
  }
  const area = calcArea(currentParcelPolygon);
  el.textContent = Math.round(area).toLocaleString('ru-RU') + ' м²';
}

// Кнопка генерации кварталов
const generateBtn = document.getElementById('generateBtn');

// Убрать нарисованные кварталы
function clearBlocks() {
  blocksLayer.clearLayers();
  roadsLayer.clearLayers();
  labelsLayer.clearLayers();
  innerLayer.clearLayers();
  currentBlocks = [];
  currentRoads = null;
  currentRoadsMain = null;
  currentRoadsLocal = null;
  currentRoadAxes = [];
  currentInnerRoads = [];
  updateStats();
}

// Этап 4: расчёт ТЭП
function fmt(n) {
  return Math.round(n).toLocaleString('ru-RU');
}

function updateStats() {
  const elCount = document.getElementById('blockCount');
  const elArea = document.getElementById('blockArea');
  const elPop = document.getElementById('population');
  const elDens = document.getElementById('density');

  if (!currentBlocks.length) {
    elCount.textContent = '—';
    elArea.textContent = '—';
    elPop.textContent = '—';
    elDens.textContent = '—';
    return;
  }

  // Суммарная площадь + население с учётом зон
  let blocksArea = 0;
  const zoneArea = { residential: 0, public: 0, green: 0 };
  const buildCoef = parseFloat(document.getElementById('buildCoef').value) || 0;
  const floors = parseFloat(document.getElementById('floors').value) || 0;
  const residShare = parseFloat(document.getElementById('residShare').value) || 0;
  const areaPerPerson = parseFloat(document.getElementById('areaPerPerson').value) || 1;
  let population = 0;

  for (const b of currentBlocks) {
    const a = turf.area(b);
    blocksArea += a;
    const zone = (b.properties && b.properties.zone) || 'residential';
    if (zoneArea[zone] === undefined) zoneArea[zone] = 0;
    zoneArea[zone] += a;
    const zc = ZONE_POP_COEF[zone] !== undefined ? ZONE_POP_COEF[zone] : 1;
    const floorArea = a * buildCoef * floors;
    const livingArea = floorArea * residShare * zc;
    population += areaPerPerson > 0 ? livingArea / areaPerPerson : 0;
  }

  // Плотность: чел на гектар площади участка (1 га = 10 000 м²)
  const parcelArea = calcArea(currentParcelPolygon); // м²
  const parcelHa = parcelArea / 10000;
  const density = parcelHa > 0 ? population / parcelHa : 0;

  elCount.textContent = currentBlocks.length;
  elArea.textContent = fmt(blocksArea) + ' м²';
  elPop.textContent = fmt(population) + ' чел';
  elDens.textContent = fmt(density) + ' чел/га';

  // Разбивка по зонам
  const elZones = document.getElementById('zoneBreakdown');
  if (elZones) {
    elZones.innerHTML = '';
    for (const z of ['residential', 'public', 'green']) {
      if (!zoneArea[z]) continue;
      const zs = ZONE_STYLES[z];
      const row = document.createElement('div');
      row.className = 'row';
      row.innerHTML =
        '<span class="label"><span class="swatch" style="background:' + zs.fillColor +
        ';display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:6px"></span>' +
        zs.label + '</span>' +
        '<span class="value">' + fmt(zoneArea[z]) + ' м²</span>';
      elZones.appendChild(row);
    }

    // v4 Часть 5: внутриквартальные дорожки/тротуары
    let pathArea = 0, sidewalkArea = 0;
    for (const f of currentInnerRoads) {
      let a = 0;
      try { a = turf.area(f); } catch (e) { a = 0; }
      if (f.properties && f.properties.kind === 'sidewalk') sidewalkArea += a;
      else pathArea += a;
    }
    const innerRows = [
      { on: pathArea > 0, color: INNER_STYLES.path.fillColor, label: 'Дорожки', val: pathArea },
      { on: sidewalkArea > 0, color: INNER_STYLES.sidewalk.fillColor, label: 'Тротуары', val: sidewalkArea }
    ];
    for (const ir of innerRows) {
      if (!ir.on) continue;
      const row = document.createElement('div');
      row.className = 'row';
      row.innerHTML =
        '<span class="label"><span class="swatch" style="background:' + ir.color +
        ';display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:6px"></span>' +
        ir.label + '</span>' +
        '<span class="value">' + fmt(ir.val) + ' м²</span>';
      elZones.appendChild(row);
    }
  }
}

// Новый полигон нарисован
map.on(L.Draw.Event.CREATED, function (e) {
  // v4 Часть 3: режим ручной трассировки дороги — линия, не участок
  if (tracingRoad && e.layerType === 'polyline') {
    tracingRoad = false;
    addManualRoad(e.layer);
    return;
  }

  // для MVP работаем с одним участком: старый убираем
  drawnItems.clearLayers();
  clearBlocks();
  currentParcelPolygon = e.layer;
  drawnItems.addLayer(currentParcelPolygon);
  updateParcelArea();
  generateBtn.disabled = false;
  clearBtn.disabled = false;
  updateRoadToolButtons();
  markDirty();
});

// Полигон отредактирован (передвинули вершины)
map.on(L.Draw.Event.EDITED, function () {
  clearBlocks();
  updateParcelArea();
  saveBtn.disabled = true;
  markDirty();
});

// Полигон удалён
map.on(L.Draw.Event.DELETED, function () {
  currentParcelPolygon = null;
  clearBlocks();
  updateParcelArea();
  generateBtn.disabled = true;
  saveBtn.disabled = true;
  clearBtn.disabled = true;
  updateRoadToolButtons();
});

// Этап 3: генерация сетки кварталов внутри участка

// Leaflet-полигон -> GeoJSON-полигон для Turf
function parcelToTurf(layer) {
  return layer.toGeoJSON(); // Feature<Polygon>
}

// Генерируем сетку квадратов и обрезаем по границе участка
function generateBlocks() {
  if (!currentParcelPolygon) return;

  const baseBlock = parseFloat(document.getElementById('blockSize').value);
  const baseStreet = parseFloat(document.getElementById('streetWidth').value);

  if (!(baseBlock > 0)) {
    alert('Размер квартала должен быть больше 0');
    return;
  }

  // Сценарий генерации: множители к размеру квартала и ширине улицы
  const scenario = document.getElementById('scenario').value;
  const SCENARIOS = {
    dense:    { block: 0.7, street: 0.5 }, // больше кварталов, плотнее
    balanced: { block: 1.0, street: 1.0 }, // базовая логика
    free:     { block: 1.0, street: 2.0 }  // больше отступы, свободнее
  };
  const mult = SCENARIOS[scenario] || SCENARIOS.balanced;

  const blockSize = baseBlock * mult.block;
  const streetWidth = baseStreet * mult.street;

  clearBlocks();

  const parcel = parcelToTurf(currentParcelPolygon);

  // Габаритный прямоугольник участка: [minX, minY, maxX, maxY] в градусах
  const bbox = turf.bbox(parcel);
  const [minX, minY, maxX, maxY] = bbox;

  // Шаг сетки = квартал + улица (в метрах), переводим в километры для Turf
  const stepM = blockSize + streetWidth;
  const stepKm = stepM / 1000;
  const blockKm = blockSize / 1000;

  // Угол поворота сетки (Этап 2)
  const angle = parseFloat(document.getElementById('gridAngle').value) || 0;
  // Pivot — центр bbox участка, вокруг него вращаем каждую ячейку
  const pivot = [(minX + maxX) / 2, (minY + maxY) / 2];

  // Ограничим число итераций, чтобы случайно не подвесить приложение
  const maxCells = 5000;
  let count = 0;

  // Реальные размеры bbox в км
  const widthKm = turf.distance([minX, minY], [maxX, minY], { units: 'kilometers' });
  const heightKm = turf.distance([minX, minY], [minX, maxY], { units: 'kilometers' });

  // Запас нарезки: при повороте сетка должна накрыть весь участок.
  // Берём диагональ bbox с обеих сторон от старта.
  const marginKm = angle > 0 ? Math.sqrt(widthKm * widthKm + heightKm * heightKm) : 0;
  const start = turf.destination(
    turf.destination(turf.point([minX, minY]), marginKm, 180, { units: 'kilometers' }),
    marginKm, 270, { units: 'kilometers' }
  );

  for (let dy = 0; dy < heightKm + 2 * marginKm; dy += stepKm) {
    for (let dx = 0; dx < widthKm + 2 * marginKm; dx += stepKm) {
      if (count++ > maxCells) {
        console.warn('Достигнут лимит ячеек, генерация остановлена');
        break;
      }

      // Нижний левый угол ячейки: сместились от start на dx восток, dy север
      const sw = turf.destination(turf.destination(start, dy, 0, { units: 'kilometers' }), dx, 90, { units: 'kilometers' });
      const swCoord = sw.geometry.coordinates;

      // Строим квадрат стороной blockKm от этого угла
      const se = turf.destination(sw, blockKm, 90, { units: 'kilometers' }).geometry.coordinates;
      const ne = turf.destination(turf.destination(sw, blockKm, 90, { units: 'kilometers' }), blockKm, 0, { units: 'kilometers' }).geometry.coordinates;
      const nw = turf.destination(sw, blockKm, 0, { units: 'kilometers' }).geometry.coordinates;

      let cell = turf.polygon([[swCoord, se, ne, nw, swCoord]]);

      // Поворот ячейки вокруг центра участка
      if (angle > 0) {
        cell = turf.transformRotate(cell, angle, { pivot });
      }

      // Быстрый отсев: если ячейка далеко от участка — пропускаем
      // Пересекаем ячейку с участком
      let piece = null;
      try {
        piece = turf.intersect(cell, parcel);
      } catch (err) {
        piece = null;
      }
      if (!piece) continue;

      // Свойства квартала: номер + зона (этапы 2, 3)
      piece.properties = Object.assign({}, piece.properties, {
        index: currentBlocks.length + 1,
        zone: 'residential'
      });

      currentBlocks.push(piece);
      drawBlock(piece);
    }
  }

  // v4 Часть 2: осевые линии сетки (центры улиц-зазоров между рядами ячеек).
  // Строим в той же системе координат, что и ячейки (start + поворот вокруг pivot),
  // затем обрезаем по участку. Оси — источник истины дорожной сети.
  buildRoadAxes({
    parcel, start, angle, pivot,
    stepKm, blockKm, streetKm: streetWidth / 1000,
    widthKm, heightKm, marginKm
  });

  // Дороги: полигоны = буфер осей (фолбэк — негатив кварталов)
  buildRoads(parcel);

  // Подписи-номера кварталов
  renderLabels();

  console.log('Сгенерировано кварталов:', currentBlocks.length);
  updateStats();
  saveBtn.disabled = currentBlocks.length === 0;
  updateRoadToolButtons();
  markDirty();
}

// Цвета зон застройки (v3 Этап 3)
const ZONE_STYLES = {
  residential: { fillColor: '#3498db', color: '#2980b9', label: 'Жилая' },
  public:      { fillColor: '#e67e22', color: '#d35400', label: 'Общественная' },
  green:       { fillColor: '#27ae60', color: '#1e8449', label: 'Озеленение' }
};

// Коэффициенты жителей на 1000 м² по зонам
const ZONE_POP_COEF = {
  residential: 1.0,  // множитель населения к жилой зоне
  public:      0.1,  // мало жителей
  green:       0.0   // нет жителей
};

// Отрисовать один квартал с учётом зоны, кликом переключаем зону
function drawBlock(piece) {
  const zone = (piece.properties && piece.properties.zone) || 'residential';
  const zs = ZONE_STYLES[zone] || ZONE_STYLES.residential;
  const layer = L.geoJSON(piece, {
    pane: 'blocksPane',
    style: { color: zs.color, weight: 1, fillColor: zs.fillColor, fillOpacity: 0.45 }
  });
  layer.on('click', function () {
    cycleZone(piece);
  });
  layer.addTo(blocksLayer);
}

// Переключение зоны квартала по клику: residential → public → green → ...
function cycleZone(piece) {
  const order = ['residential', 'public', 'green'];
  const cur = (piece.properties && piece.properties.zone) || 'residential';
  const next = order[(order.indexOf(cur) + 1) % order.length];
  piece.properties.zone = next;
  redrawAll();
  markDirty();
}

// Перерисовать кварталы + подписи после смены зон
function redrawAll() {
  blocksLayer.clearLayers();
  labelsLayer.clearLayers();
  currentBlocks.forEach(drawBlock);
  renderLabels();
  updateStats();
}

// Нумерация кварталов: подпись по центроиду (v3 Этап 2)
function renderLabels() {
  labelsLayer.clearLayers();
  if (!showLabels) return;
  currentBlocks.forEach((b) => {
    let center;
    try {
      center = turf.centerOfMass(b).geometry.coordinates; // [lng, lat]
    } catch (e) {
      try { center = turf.centroid(b).geometry.coordinates; } catch (e2) { return; }
    }
    const idx = (b.properties && b.properties.index) || '';
    const icon = L.divIcon({
      className: 'block-label',
      html: '<span>' + idx + '</span>',
      iconSize: null
    });
    L.marker([center[1], center[0]], { icon, pane: 'labelsPane', interactive: false })
      .addTo(labelsLayer);
  });
}

// v4 Часть 2: построение осевых линий дорожной сетки.
// Оси — центры улиц-зазоров между рядами ячеек. Обрезаются по границе участка.
// Результат → currentRoadAxes[] (Feature<LineString>, properties.roadType/width).
function buildRoadAxes(cfg) {
  currentRoadAxes = [];
  const { parcel, start, angle, pivot, stepKm, blockKm, streetKm,
          widthKm, heightKm, marginKm } = cfg;

  const streetW = streetKm * 1000; // ширина улицы в метрах для width
  const totalW = widthKm + 2 * marginKm;
  const totalH = heightKm + 2 * marginKm;

  // Смещение точки от start на (east км, north км), с поворотом вокруг pivot
  function pt(east, north) {
    let p = turf.destination(
      turf.destination(start, north, 0, { units: 'kilometers' }),
      east, 90, { units: 'kilometers' }
    );
    if (angle > 0) p = turf.transformRotate(p, angle, { pivot });
    return p.geometry.coordinates;
  }

  // Обрезать длинную линию по участку: делим по границе, берём сегменты внутри
  const parcelLine = turf.polygonToLine(parcel);
  function clipToParcel(line, roadType) {
    let pieces;
    try {
      pieces = turf.lineSplit(line, parcelLine).features;
    } catch (e) {
      pieces = [line];
    }
    if (!pieces || !pieces.length) pieces = [line];
    for (const seg of pieces) {
      // Центр сегмента внутри участка? — тогда это дорога внутри границы
      let mid;
      try { mid = turf.midpoint(
        turf.point(seg.geometry.coordinates[0]),
        turf.point(seg.geometry.coordinates[seg.geometry.coordinates.length - 1])
      ); } catch (e) { continue; }
      let inside = false;
      try { inside = turf.booleanPointInPolygon(mid, parcel); } catch (e) { inside = false; }
      if (!inside) continue;
      seg.properties = Object.assign({}, seg.properties, {
        roadType, width: streetW
      });
      currentRoadAxes.push(seg);
    }
  }

  // Горизонтальные оси: north = k*step + block + street/2 (середина зазора)
  for (let north = blockKm + streetKm / 2; north < totalH; north += stepKm) {
    const line = turf.lineString([pt(0, north), pt(totalW, north)]);
    clipToParcel(line, 'local');
  }
  // Вертикальные оси: east = k*step + block + street/2
  for (let east = blockKm + streetKm / 2; east < totalW; east += stepKm) {
    const line = turf.lineString([pt(east, 0), pt(east, totalH)]);
    clipToParcel(line, 'local');
  }

  console.log('Осевые линии дорог:', currentRoadAxes.length);
}

// Отрисовать полигоны дорог по слоям (общий рендер)
function renderRoadPolygons(localRoads, mainRoads) {
  // Улицы (внутренние) — тёплый светло-серый, тонкий контур
  if (localRoads) {
    L.geoJSON(localRoads, {
      pane: 'roadsPane',
      style: { color: '#b4afa6', weight: 1, fillColor: '#d6d3cd', fillOpacity: 1 }
    }).addTo(roadsLayer);
  }
  // Магистрали (периметр) — тёмный графит, поверх улиц
  if (mainRoads) {
    L.geoJSON(mainRoads, {
      pane: 'roadsPane',
      style: { color: '#2b303b', weight: 1.5, fillColor: '#3d4451', fillOpacity: 1 }
    }).addTo(roadsLayer);
  }
}

// Объединить массив полигонов в один Feature (union по цепочке)
function unionAll(features) {
  const list = features.filter(Boolean);
  if (!list.length) return null;
  let acc = list[0];
  for (let i = 1; i < list.length; i++) {
    try {
      const u = turf.union(acc, list[i]);
      if (u) acc = u;
    } catch (e) { /* пропускаем проблемный кусок */ }
  }
  return acc;
}

// Строим слой дорог. Основной путь: буфер осевых линий (v4 Часть 2).
// Фолбэк: негатив кварталов (участок минус кварталы).
function buildRoads(parcel) {
  currentRoads = null;
  currentRoadsMain = null;
  currentRoadsLocal = null;

  const mainWidthM = parseFloat(document.getElementById('mainRoadWidth').value) || 0;

  // ── Основной путь: полигоны из буфера осей ──
  if (currentRoadAxes.length) {
    try {
      // Буферим каждую ось на полширины, объединяем в сеть внутренних улиц
      const buffered = [];
      for (const axis of currentRoadAxes) {
        const w = (axis.properties && axis.properties.width) || 0;
        if (!(w > 0)) continue;
        let b = null;
        try { b = turf.buffer(axis, (w / 2) / 1000, { units: 'kilometers' }); } catch (e) { b = null; }
        if (b) buffered.push(b);
      }
      let localNet = unionAll(buffered);
      // Ограничиваем сеть границей участка
      if (localNet) {
        try { const c = turf.intersect(localNet, parcel); if (c) localNet = c; } catch (e) { /* ok */ }
      }

      // Магистральное кольцо по периметру участка
      let mainRing = null;
      if (mainWidthM > 0) {
        try {
          const coreKm = mainWidthM / 1000;
          let core = turf.buffer(parcel, -coreKm, { units: 'kilometers' });
          if (core) {
            try { core = turf.cleanCoords(core); } catch (e) { /* ok */ }
            try { if (turf.area(core) <= 1) core = null; } catch (e) { core = null; }
          }
          if (core) {
            try { mainRing = turf.difference(parcel, core); } catch (e) { mainRing = null; }
          } else {
            mainRing = parcel; // участок уже ширины магистрали
          }
          if (mainRing) {
            try { mainRing = turf.cleanCoords(mainRing); } catch (e) { /* ok */ }
            try { if (turf.area(mainRing) <= 1) mainRing = null; } catch (e) { mainRing = null; }
          }
        } catch (e) { mainRing = null; }
      }

      // Улицы = сеть минус магистральное кольцо (без наложения)
      let localRoads = localNet;
      if (localNet && mainRing) {
        try { const d = turf.difference(localNet, mainRing); if (d) localRoads = d; } catch (e) { /* ok */ }
      }

      if (localRoads || mainRing) {
        currentRoadsLocal = localRoads;
        currentRoadsMain = mainRing;
        currentRoads = unionAll([localRoads, mainRing]);
        renderRoadPolygons(localRoads, mainRing);
        const la = localRoads ? Math.round(turf.area(localRoads)) : 0;
        const ma = mainRing ? Math.round(turf.area(mainRing)) : 0;
        console.log('Дороги (оси): улицы', la, 'м² | магистрали', ma, 'м²');
        return;
      }
    } catch (err) {
      console.warn('Ошибка построения дорог из осей, фолбэк на негатив:', err);
    }
  }

  // ── Фолбэк: негатив кварталов ──
  if (!currentBlocks.length) return;
  try {
    let roads = parcel;
    let subtracted = 0;
    for (const b of currentBlocks) {
      let diff = null;
      try { diff = turf.difference(roads, b); } catch (e) { diff = null; }
      if (diff) { roads = diff; subtracted++; }
    }

    const areaM2 = roads ? turf.area(roads) : 0;
    console.log('Дороги (негатив): вычтено', subtracted, 'из', currentBlocks.length, '| м²:', Math.round(areaM2));
    if (!roads || areaM2 <= 1) {
      console.warn('Дороги пустые: зазоров между кварталами нет');
      return;
    }
    currentRoads = roads;

    let mainRoads = null;
    let localRoads = roads;
    if (mainWidthM > 0) {
      try {
        const coreKm = mainWidthM / 1000;
        let core = turf.buffer(parcel, -coreKm, { units: 'kilometers' });
        if (core) {
          try { core = turf.cleanCoords(core); } catch (e) { /* ok */ }
          try { if (turf.area(core) <= 1) core = null; } catch (e) { core = null; }
        }
        let perimeterZone = null;
        if (core) {
          try { perimeterZone = turf.difference(parcel, core); } catch (e) { perimeterZone = null; }
          if (perimeterZone) { try { perimeterZone = turf.cleanCoords(perimeterZone); } catch (e) { /* ok */ } }
        } else {
          perimeterZone = parcel;
        }
        if (perimeterZone) {
          try { mainRoads = turf.intersect(roads, perimeterZone); } catch (e) { mainRoads = null; }
          if (mainRoads) {
            try { mainRoads = turf.cleanCoords(mainRoads); } catch (e) { /* ok */ }
            try { if (turf.area(mainRoads) <= 1) mainRoads = null; } catch (e) { /* ok */ }
          }
          if (mainRoads) {
            try { localRoads = turf.difference(roads, mainRoads); } catch (e) { localRoads = roads; }
          }
        }
      } catch (e) {
        console.warn('Не удалось выделить магистрали:', e);
        mainRoads = null;
        localRoads = roads;
      }
    }

    currentRoadsMain = mainRoads;
    currentRoadsLocal = localRoads;
    renderRoadPolygons(localRoads, mainRoads);
  } catch (err) {
    console.warn('Не удалось построить дороги:', err);
    currentRoads = null;
    currentRoadsMain = null;
    currentRoadsLocal = null;
  }
}

generateBtn.addEventListener('click', generateBlocks);

// Этап 5: экспорт в GeoJSON (участок + кварталы)
const saveBtn = document.getElementById('saveBtn');

function buildGeoJSON() {
  const features = [];

  // Участок
  if (currentParcelPolygon) {
    const f = currentParcelPolygon.toGeoJSON();
    f.properties = Object.assign({}, f.properties, { role: 'parcel' });
    features.push(f);
  }

  // Кварталы (с зоной и номером)
  currentBlocks.forEach((b, i) => {
    const f = JSON.parse(JSON.stringify(b)); // копия
    f.properties = Object.assign({}, f.properties, {
      role: 'block',
      index: (b.properties && b.properties.index) || i + 1,
      zone: (b.properties && b.properties.zone) || 'residential'
    });
    features.push(f);
  });

  // Дороги (v3) — магистрали и улицы раздельно, + общий для совместимости
  if (currentRoadsMain) {
    const f = JSON.parse(JSON.stringify(currentRoadsMain));
    f.properties = Object.assign({}, f.properties, { role: 'road', roadType: 'main' });
    features.push(f);
  }
  if (currentRoadsLocal) {
    const f = JSON.parse(JSON.stringify(currentRoadsLocal));
    f.properties = Object.assign({}, f.properties, { role: 'road', roadType: 'local' });
    features.push(f);
  }
  // Фолбэк: если иерархия не построилась, сохраняем общий полигон дорог
  if (!currentRoadsMain && !currentRoadsLocal && currentRoads) {
    const f = JSON.parse(JSON.stringify(currentRoads));
    f.properties = Object.assign({}, f.properties, { role: 'road' });
    features.push(f);
  }

  // v4 Часть 2: осевые линии дорожной сети (источник истины, LineString)
  currentRoadAxes.forEach((axis) => {
    const f = JSON.parse(JSON.stringify(axis));
    f.properties = Object.assign({}, f.properties, {
      role: 'road', geomType: 'axis',
      roadType: (axis.properties && axis.properties.roadType) || 'local',
      width: (axis.properties && axis.properties.width) || 0
    });
    features.push(f);
  });

  // v4 Часть 5: внутриквартальные дорожки/тротуары
  currentInnerRoads.forEach((ir) => {
    const f = JSON.parse(JSON.stringify(ir));
    f.properties = Object.assign({}, f.properties, {
      role: 'inner',
      zone: (ir.properties && ir.properties.zone) || 'residential',
      kind: (ir.properties && ir.properties.kind) || 'path'
    });
    features.push(f);
  });

  return {
    type: 'FeatureCollection',
    features: features
  };
}

async function saveGeoJSON() {
  if (!currentParcelPolygon) {
    alert('Сначала нарисуйте участок');
    return;
  }

  const geojson = buildGeoJSON();
  const text = JSON.stringify(geojson, null, 2);

  const result = await window.terrimind.saveGeoJSON(text);
  if (result.ok) {
    alert('Сохранено:\n' + result.filePath);
  } else if (result.canceled) {
    // пользователь закрыл диалог — молча
  } else {
    alert('Ошибка сохранения: ' + (result.error || 'неизвестно'));
  }
}

saveBtn.addEventListener('click', saveGeoJSON);

// ============================================================
// v4 Этап 1: Project file (.terrimind.json)
// Полное состояние проекта = параметры UI + геометрия (GeoJSON).
// Формат версионируется; GeoJSON внутри не ломается (совместимость).
// ============================================================
const PROJECT_FORMAT_VERSION = 1;

// Прочитать значение поля с фолбэком
function getNum(id, def) {
  const el = document.getElementById(id);
  if (!el) return def;
  const v = parseFloat(el.value);
  return isNaN(v) ? def : v;
}
function getStr(id, def) {
  const el = document.getElementById(id);
  return el ? el.value : def;
}

// Собрать текущие параметры UI
function collectParams() {
  return {
    scenario: getStr('scenario', 'balanced'),
    blockSize: getNum('blockSize', 80),
    streetWidth: getNum('streetWidth', 20),
    mainRoadWidth: getNum('mainRoadWidth', 30),
    gridAngle: getNum('gridAngle', 0),
    floors: getNum('floors', 9),
    buildCoef: getNum('buildCoef', 0.25),
    residShare: getNum('residShare', 0.7),
    areaPerPerson: getNum('areaPerPerson', 30),
    showLabels: showLabels
  };
}

// Дефолты параметров проекта (единый источник — Этап 2)
const PARAM_DEFAULTS = {
  scenario: 'balanced',
  blockSize: 80,
  streetWidth: 20,
  mainRoadWidth: 30,
  gridAngle: 0,
  floors: 9,           // средняя этажность
  buildCoef: 0.25,     // коэф. застроенности (доля пятна застройки)
  residShare: 0.7,     // жилая доля площадей
  areaPerPerson: 30,   // м² жилой площади на человека
  showLabels: true
};

// Применить параметры к UI (недостающие поля → дефолты — Этап 2)
function applyParams(p) {
  const merged = Object.assign({}, PARAM_DEFAULTS, p || {});
  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el && val !== undefined && val !== null) el.value = val;
  };
  setVal('scenario', merged.scenario);
  setVal('blockSize', merged.blockSize);
  setVal('streetWidth', merged.streetWidth);
  setVal('mainRoadWidth', merged.mainRoadWidth);
  setVal('gridAngle', merged.gridAngle);
  setVal('floors', merged.floors);
  setVal('buildCoef', merged.buildCoef);
  setVal('residShare', merged.residShare);
  setVal('areaPerPerson', merged.areaPerPerson);

  showLabels = !!merged.showLabels;
  const cb = document.getElementById('toggleLabels');
  if (cb) cb.checked = showLabels;
}


// ============================================================
// v4 Этап 3: Пресеты нормативов/режимов
// Расширяемо: BUILTIN_PRESETS + пользовательские (localStorage).
// Пресет задаёт только параметры, геометрию не трогает.
// ============================================================
const BUILTIN_PRESETS = {
  compact: {
    label: 'Компактный жилой',
    params: { scenario: 'dense', blockSize: 60, streetWidth: 12, mainRoadWidth: 24,
              floors: 12, buildCoef: 0.32, residShare: 0.85, areaPerPerson: 28 }
  },
  balanced: {
    label: 'Сбалансированный',
    params: { scenario: 'balanced', blockSize: 80, streetWidth: 20, mainRoadWidth: 30,
              floors: 9, buildCoef: 0.25, residShare: 0.7, areaPerPerson: 30 }
  },
  free: {
    label: 'Свободный',
    params: { scenario: 'free', blockSize: 100, streetWidth: 30, mainRoadWidth: 40,
              floors: 5, buildCoef: 0.18, residShare: 0.6, areaPerPerson: 35 }
  },
  mixed: {
    label: 'Смешанный городской',
    params: { scenario: 'balanced', blockSize: 90, streetWidth: 22, mainRoadWidth: 34,
              floors: 8, buildCoef: 0.28, residShare: 0.55, areaPerPerson: 30 }
  }
};

// Реестр всех пресетов (встроенные + пользовательские из localStorage)
const USER_PRESETS_KEY = 'terrimind.userPresets';

function getUserPresets() {
  try {
    const raw = localStorage.getItem(USER_PRESETS_KEY);
    if (!raw) return {};
    const obj = JSON.parse(raw);
    return (obj && typeof obj === 'object') ? obj : {};
  } catch (e) { return {}; }
}

function saveUserPresets(presets) {
  try { localStorage.setItem(USER_PRESETS_KEY, JSON.stringify(presets)); } catch (e) { /* ok */ }
}

function getPresets() {
  // Пользовательские с префиксом ключа, чтобы не конфликтовать со встроенными
  const merged = Object.assign({}, BUILTIN_PRESETS);
  const user = getUserPresets();
  for (const key of Object.keys(user)) {
    merged['user:' + key] = { label: user[key].label, params: user[key].params, user: true };
  }
  return merged;
}

// Перерисовать выпадающий список пресетов
function renderPresetOptions(selectKey) {
  const sel = document.getElementById('preset');
  if (!sel) return;
  const presets = getPresets();
  sel.innerHTML = '<option value="">— выбрать —</option>';
  // встроенные
  for (const key of Object.keys(BUILTIN_PRESETS)) {
    const o = document.createElement('option');
    o.value = key; o.textContent = BUILTIN_PRESETS[key].label;
    sel.appendChild(o);
  }
  // пользовательские
  const user = getUserPresets();
  const userKeys = Object.keys(user);
  if (userKeys.length) {
    const grp = document.createElement('optgroup');
    grp.label = 'Мои пресеты';
    for (const key of userKeys) {
      const o = document.createElement('option');
      o.value = 'user:' + key; o.textContent = user[key].label;
      grp.appendChild(o);
    }
    sel.appendChild(grp);
  }
  if (selectKey !== undefined) sel.value = selectKey;
  updatePresetButtons();
}

// Доступность кнопки удаления: только для выбранного пользовательского пресета
function updatePresetButtons() {
  const sel = document.getElementById('preset');
  const del = document.getElementById('deletePresetBtn');
  if (!sel || !del) return;
  del.disabled = !(sel.value && sel.value.indexOf('user:') === 0);
}

// Применить пресет по ключу: подставить параметры, НЕ трогая геометрию
function applyPreset(key) {
  if (!key) { updatePresetButtons(); return; }
  const preset = getPresets()[key];
  if (!preset) return;
  const merged = Object.assign({}, collectParams(), preset.params);
  applyParams(merged);
  markDirty();
  updatePresetButtons();

  const hint = document.getElementById('presetHint');
  if (hint) {
    hint.textContent = 'Пресет «' + preset.label + '» применён. Нажмите «Сгенерировать кварталы».';
  }
}

const presetSelect = document.getElementById('preset');
if (presetSelect) {
  presetSelect.addEventListener('change', function (e) {
    applyPreset(e.target.value);
  });
}

// Сохранить текущие параметры как пользовательский пресет
const savePresetBtn = document.getElementById('savePresetBtn');
if (savePresetBtn) {
  savePresetBtn.addEventListener('click', function () {
    const name = prompt('Название пресета:');
    if (!name) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    const params = collectParams();
    // не храним showLabels в пресете — это параметр вида, не норматив
    delete params.showLabels;
    const user = getUserPresets();
    user[trimmed] = { label: trimmed, params: params };
    saveUserPresets(user);
    renderPresetOptions('user:' + trimmed);
    const hint = document.getElementById('presetHint');
    if (hint) hint.textContent = 'Пресет «' + trimmed + '» сохранён.';
  });
}

// Удалить выбранный пользовательский пресет
const deletePresetBtn = document.getElementById('deletePresetBtn');
if (deletePresetBtn) {
  deletePresetBtn.addEventListener('click', function () {
    const sel = document.getElementById('preset');
    if (!sel || sel.value.indexOf('user:') !== 0) return;
    const key = sel.value.slice('user:'.length);
    if (!confirm('Удалить пресет «' + key + '»?')) return;
    const user = getUserPresets();
    delete user[key];
    saveUserPresets(user);
    renderPresetOptions('');
    const hint = document.getElementById('presetHint');
    if (hint) hint.textContent = 'Пресет удалён.';
  });
}

// Первичное заполнение списка (подхватить сохранённые пользовательские)
renderPresetOptions('');
// Собрать объект проекта целиком
function buildProject() {
  return {
    format: 'terrimind-project',
    version: PROJECT_FORMAT_VERSION,
    savedAt: new Date().toISOString(),
    params: collectParams(),
    // последние показатели (для справки, не источник истины)
    stats: {
      parcelArea: document.getElementById('parcelArea').textContent,
      blockCount: document.getElementById('blockCount').textContent,
      blockArea: document.getElementById('blockArea').textContent,
      population: document.getElementById('population').textContent,
      density: document.getElementById('density').textContent
    },
    // геометрия — тот же GeoJSON, что и в экспорте (совместимость)
    geojson: buildGeoJSON()
  };
}

async function saveProject() {
  if (!currentParcelPolygon) {
    alert('Сначала нарисуйте участок');
    return false;
  }
  const project = buildProject();
  const text = JSON.stringify(project, null, 2);

  const result = await window.terrimind.saveProject(text);
  if (result.ok) {
    alert('Проект сохранён: ' + result.filePath);
    return true;
  } else if (result.canceled) {
    return false;
  } else {
    alert('Ошибка сохранения проекта: ' + (result.error || 'неизвестно'));
    return false;
  }
}

// Загрузка проекта: восстанавливаем параметры + геометрию
function loadProject(project) {
  if (!project || project.format !== 'terrimind-project') {
    alert('Неподдерживаемый формат: ожидается проект TerriMind');
    return false;
  }

  // 1) Параметры (с дефолтами)
  applyParams(project.params);

  // 2) Геометрия — переиспользуем существующий загрузчик GeoJSON
  if (project.geojson) {
    loadGeoJSON(project.geojson);
  }

  markSaved();
  return true;
}

// Универсальный детект формата: проект TerriMind vs чистый GeoJSON (Этап 2)
function detectFormat(obj) {
  if (obj && obj.format === 'terrimind-project') return 'project';
  if (obj && obj.type === 'FeatureCollection' && Array.isArray(obj.features)) return 'geojson';
  return 'unknown';
}

// Загрузить любой поддерживаемый формат
function loadAny(obj) {
  const kind = detectFormat(obj);
  if (kind === 'project') {
    return loadProject(obj);
  }
  if (kind === 'geojson') {
    loadGeoJSON(obj);
    markSaved();
    return true;
  }
  alert('Неподдерживаемый формат файла. Ожидается проект TerriMind или GeoJSON.');
  return false;
}

async function openProject() {
  if (hasUnsavedChanges && !confirm('Есть несохранённые изменения. Открыть другой проект?')) {
    return;
  }
  const result = await window.terrimind.openProject();
  if (result.canceled) return;
  if (!result.ok) {
    alert('Ошибка открытия проекта: ' + (result.error || 'неизвестно'));
    return;
  }

  let project;
  try {
    project = JSON.parse(result.data);
  } catch (e) {
    alert('Файл не является корректным JSON');
    return;
  }

  loadAny(project);
}

const saveProjectBtn = document.getElementById('saveProjectBtn');
const openProjectBtn = document.getElementById('openProjectBtn');
if (saveProjectBtn) saveProjectBtn.addEventListener('click', saveProject);
if (openProjectBtn) openProjectBtn.addEventListener('click', openProject);

// Этап C: импорт GeoJSON
const importBtn = document.getElementById('importBtn');

function loadGeoJSON(geojson) {
  if (!geojson || geojson.type !== 'FeatureCollection' || !Array.isArray(geojson.features)) {
    alert('Неподдерживаемый формат: ожидается FeatureCollection');
    return;
  }

  // Разбираем на участок, кварталы и дороги по свойству role
  let parcelFeature = null;
  const roadFeatures = []; // может быть несколько (main/local/общий)
  const blockFeatures = [];
  const innerFeatures = []; // v4 Часть 5: дорожки/тротуары

  for (const f of geojson.features) {
    if (!f || !f.geometry) continue;
    const role = f.properties && f.properties.role;
    if (role === 'parcel') {
      parcelFeature = f;
    } else if (role === 'block') {
      blockFeatures.push(f);
    } else if (role === 'road') {
      roadFeatures.push(f);
    } else if (role === 'inner') {
      innerFeatures.push(f);
    }
  }

  // Фолбэк: если ролей нет — первый полигон считаем участком, остальные кварталами
  if (!parcelFeature && blockFeatures.length === 0) {
    const polys = geojson.features.filter(
      f => f.geometry && (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon')
    );
    if (polys.length) {
      parcelFeature = polys[0];
      for (let i = 1; i < polys.length; i++) blockFeatures.push(polys[i]);
    }
  }

  if (!parcelFeature) {
    alert('В файле не найден участок (role: "parcel")');
    return;
  }

  // Полный сброс текущего состояния
  drawnItems.clearLayers();
  clearBlocks();
  currentParcelPolygon = null;

  // Отрисовываем участок как редактируемый слой
  const parcelLayer = L.geoJSON(parcelFeature, {
    style: { color: '#e67e22', weight: 2 }
  });
  // Берём первый слой полигона внутри геоджейсона
  parcelLayer.eachLayer((layer) => {
    currentParcelPolygon = layer;
    drawnItems.addLayer(layer);
  });

  // Отрисовываем дороги (если есть) — под кварталами, по типу
  currentRoads = null;
  currentRoadsMain = null;
  currentRoadsLocal = null;
  currentRoadAxes = [];
  roadFeatures.forEach((rf) => {
    // v4 Часть 2: осевые линии — восстанавливаем в currentRoadAxes, не рисуем
    const isAxis = (rf.properties && rf.properties.geomType === 'axis') ||
                   (rf.geometry && (rf.geometry.type === 'LineString' || rf.geometry.type === 'MultiLineString'));
    if (isAxis) {
      currentRoadAxes.push(rf);
      return;
    }
    const rt = rf.properties && rf.properties.roadType;
    let style;
    if (rt === 'main') {
      currentRoadsMain = rf;
      style = { color: '#2b303b', weight: 1.5, fillColor: '#3d4451', fillOpacity: 1 };
    } else if (rt === 'local') {
      currentRoadsLocal = rf;
      style = { color: '#b4afa6', weight: 1, fillColor: '#d6d3cd', fillOpacity: 1 };
    } else {
      currentRoads = rf;
      style = { color: '#8d8880', weight: 1, fillColor: '#c9c5bd', fillOpacity: 1 };
    }
    L.geoJSON(rf, { pane: 'roadsPane', style }).addTo(roadsLayer);
  });
  if (!currentRoads && (currentRoadsMain || currentRoadsLocal)) {
    // общий для совместимости export
    currentRoads = currentRoadsLocal || currentRoadsMain;
  }

  // Отрисовываем кварталы (с зонами и кликом)
  blockFeatures.forEach((f, i) => {
    if (!f.properties) f.properties = {};
    if (f.properties.index === undefined) f.properties.index = i + 1;
    if (f.properties.zone === undefined) f.properties.zone = 'residential';
    currentBlocks.push(f);
    drawBlock(f);
  });

  // v4 Часть 5: восстановить внутриквартальные дорожки/тротуары
  innerLayer.clearLayers();
  currentInnerRoads = [];
  // тротуары под дорожками
  innerFeatures.sort((a, b) => {
    const ak = (a.properties && a.properties.kind) === 'sidewalk' ? 0 : 1;
    const bk = (b.properties && b.properties.kind) === 'sidewalk' ? 0 : 1;
    return ak - bk;
  });
  innerFeatures.forEach((f) => {
    const kind = (f.properties && f.properties.kind) === 'sidewalk' ? 'sidewalk' : 'path';
    currentInnerRoads.push(f);
    L.geoJSON(f, { pane: 'innerPane', style: INNER_STYLES[kind] }).addTo(innerLayer);
  });

  // Подписи-номера
  renderLabels();

  // Пересчёт и подгонка вида
  updateParcelArea();
  updateStats();
  generateBtn.disabled = false;
  clearBtn.disabled = false;
  saveBtn.disabled = currentBlocks.length === 0;
  updateRoadToolButtons();

  try {
    map.fitBounds(drawnItems.getBounds(), { padding: [30, 30] });
  } catch (e) { /* игнор */ }
}

async function importGeoJSON() {
  const result = await window.terrimind.openGeoJSON();
  if (result.canceled) return;
  if (!result.ok) {
    alert('Ошибка открытия: ' + (result.error || 'неизвестно'));
    return;
  }

  let geojson;
  try {
    geojson = JSON.parse(result.data);
  } catch (e) {
    alert('Файл не является корректным JSON');
    return;
  }

  loadAny(geojson);
}

importBtn.addEventListener('click', importGeoJSON);

// Этап E: экспорт снимка карты в PNG
const exportPngBtn = document.getElementById('exportPngBtn');

async function exportPNG() {
  // Кроп только по области карты #map (без сайдбара)
  const mapEl = document.getElementById('map');
  const r = mapEl.getBoundingClientRect();
  const rect = {
    x: Math.round(r.left),
    y: Math.round(r.top),
    width: Math.round(r.width),
    height: Math.round(r.height)
  };

  const result = await window.terrimind.savePNG(rect);
  if (result.ok) {
    alert('Снимок сохранён:\n' + result.filePath);
  } else if (result.canceled) {
    // молча
  } else {
    alert('Ошибка экспорта PNG: ' + (result.error || 'неизвестно'));
  }
}

exportPngBtn.addEventListener('click', exportPNG);

// Этап F: экспорт отчёта PDF (ТЭП + карта)
const exportPdfBtn = document.getElementById('exportPdfBtn');

async function exportPDF() {
  if (!currentBlocks.length) {
    alert('Сначала сгенерируйте кварталы');
    return;
  }

  // Снимок карты как dataURL
  const mapEl = document.getElementById('map');
  const r = mapEl.getBoundingClientRect();
  const rect = {
    x: Math.round(r.left), y: Math.round(r.top),
    width: Math.round(r.width), height: Math.round(r.height)
  };
  const cap = await window.terrimind.captureMap(rect);
  const mapImage = cap.ok ? cap.dataUrl : null;

  // Собираем строки ТЭП из DOM
  const stats = [
    { label: 'Площадь участка', value: document.getElementById('parcelArea').textContent },
    { label: 'Кол-во кварталов', value: document.getElementById('blockCount').textContent },
    { label: 'Площадь кварталов', value: document.getElementById('blockArea').textContent },
    { label: 'Примерно жителей', value: document.getElementById('population').textContent },
    { label: 'Плотность', value: document.getElementById('density').textContent }
  ];

  // Зоны
  const zoneArea = { residential: 0, public: 0, green: 0 };
  for (const b of currentBlocks) {
    const z = (b.properties && b.properties.zone) || 'residential';
    if (zoneArea[z] === undefined) zoneArea[z] = 0;
    zoneArea[z] += turf.area(b);
  }
  const zones = [];
  for (const z of ['residential', 'public', 'green']) {
    if (!zoneArea[z]) continue;
    zones.push({ label: ZONE_STYLES[z].label, color: ZONE_STYLES[z].fillColor, value: fmt(zoneArea[z]) + ' м²' });
  }

  const result = await window.terrimind.savePDF({ stats, zones, mapImage });
  if (result.ok) {
    alert('Отчёт сохранён:\n' + result.filePath);
  } else if (result.canceled) {
    // молча
  } else {
    alert('Ошибка экспорта PDF: ' + (result.error || 'неизвестно'));
  }
}

exportPdfBtn.addEventListener('click', exportPDF);

// v4: мгновенный пересчёт ТЭП при смене любого параметра застройки
['floors', 'buildCoef', 'residShare', 'areaPerPerson'].forEach(function (id) {
  const el = document.getElementById(id);
  if (el) el.addEventListener('input', function () {
    if (currentBlocks.length) updateStats();
    markDirty();
  });
});

// v4: параметры генерации сетки — помечают проект как несохранённый
['scenario', 'blockSize', 'streetWidth', 'mainRoadWidth', 'gridAngle'].forEach(function (id) {
  const el = document.getElementById(id);
  if (!el) return;
  const evt = el.tagName === 'SELECT' ? 'change' : 'input';
  el.addEventListener(evt, markDirty);
});

// Этап 4 (v3): переключатели видимости слоёв
function bindLayerToggle(checkboxId, layer) {
  const cb = document.getElementById(checkboxId);
  cb.addEventListener('change', function () {
    if (cb.checked) {
      if (!map.hasLayer(layer)) map.addLayer(layer);
    } else {
      if (map.hasLayer(layer)) map.removeLayer(layer);
    }
  });
}

bindLayerToggle('toggleParcel', drawnItems);
bindLayerToggle('toggleBlocks', blocksLayer);
bindLayerToggle('toggleRoads', roadsLayer);
bindLayerToggle('toggleInner', innerLayer);

// Переключатель номеров кварталов
document.getElementById('toggleLabels').addEventListener('change', function (e) {
  showLabels = e.target.checked;
  renderLabels();
  markDirty();
});

// ============================================================
// v4 Часть 3: ручная трассировка дорог
// Пользователь проводит линию (polyline) → добавляем ось roadType:manual,
// перестраиваем полигоны дорог и вырезаем полосу из пересекаемых кварталов.
// ============================================================
let tracingRoad = false; // активен режим рисования ручной дороги

const traceRoadBtn = document.getElementById('traceRoadBtn');
const clearManualRoadsBtn = document.getElementById('clearManualRoadsBtn');
const autoConnectBtn = document.getElementById('autoConnectBtn');

// Есть ли хотя бы одна ручная ось
function hasManualRoads() {
  return currentRoadAxes.some(a => a.properties && (a.properties.origin === 'manual' || a.properties.origin === 'auto'));
}

// Обновить доступность кнопок трассировки
function updateRoadToolButtons() {
  if (traceRoadBtn) traceRoadBtn.disabled = !currentParcelPolygon;
  if (clearManualRoadsBtn) clearManualRoadsBtn.disabled = !hasManualRoads();
  if (autoConnectBtn) autoConnectBtn.disabled = !currentBlocks.length;
  var ip = document.getElementById('innerProfilesBtn');
  if (ip) ip.disabled = !currentBlocks.length;
}

// Включить режим рисования линии
if (traceRoadBtn) {
  traceRoadBtn.addEventListener('click', function () {
    if (!currentParcelPolygon) { alert('Сначала нарисуйте участок'); return; }
    tracingRoad = true;
    new L.Draw.Polyline(map, {
      shapeOptions: { color: '#2b303b', weight: 3 }
    }).enable();
  });
}

// Добавить нарисованную линию как ручную дорогу
function addManualRoad(layer) {
  let line;
  try {
    line = layer.toGeoJSON(); // Feature<LineString>
  } catch (e) {
    console.warn('Не удалось получить геометрию линии:', e);
    return;
  }
  if (!line || !line.geometry || line.geometry.type !== 'LineString') return;
  if (line.geometry.coordinates.length < 2) return;

  // Ширина из поля «Ширина улицы», тип local (по решению 1a)
  const width = getNum('streetWidth', 20);
  line.properties = Object.assign({}, line.properties, {
    roadType: 'manual', width: width, origin: 'manual'
  });
  currentRoadAxes.push(line);

  rebuildRoadsAndBlocks();
  markDirty();
  updateRoadToolButtons();
}

// Убрать все ручные дороги
if (clearManualRoadsBtn) {
  clearManualRoadsBtn.addEventListener('click', function () {
    if (!hasManualRoads()) return;
    currentRoadAxes = currentRoadAxes.filter(
      a => !(a.properties && (a.properties.origin === 'manual' || a.properties.origin === 'auto'))
    );
    rebuildRoadsAndBlocks();
    markDirty();
    updateRoadToolButtons();
  });
}

// Перестроить дороги из осей + вырезать ручные полосы из кварталов + перерисовать.
// Вызывается после ручной трассировки/очистки, без пересоздания сетки.
function rebuildRoadsAndBlocks() {
  if (!currentParcelPolygon) return;
  const parcel = parcelToTurf(currentParcelPolygon);

  // Вырезаем полосы добавленных дорог (ручных + авто-выходов) из кварталов (2a)
  const manualAxes = currentRoadAxes.filter(
    a => a.properties && (a.properties.origin === 'manual' || a.properties.origin === 'auto')
  );
  if (manualAxes.length && currentBlocks.length) {
    for (const axis of manualAxes) {
      const w = (axis.properties && axis.properties.width) || 0;
      if (!(w > 0)) continue;
      let strip = null;
      try { strip = turf.buffer(axis, (w / 2) / 1000, { units: 'kilometers' }); } catch (e) { strip = null; }
      if (!strip) continue;

      const nextBlocks = [];
      for (const b of currentBlocks) {
        let overlaps = false;
        try { overlaps = turf.booleanIntersects(b, strip); } catch (e) { overlaps = false; }
        if (!overlaps) { nextBlocks.push(b); continue; }
        let cut = null;
        try { cut = turf.difference(b, strip); } catch (e) { cut = null; }
        if (!cut) continue; // квартал полностью съеден дорогой
        // сохраняем свойства квартала
        cut.properties = Object.assign({}, b.properties);
        nextBlocks.push(cut);
      }
      currentBlocks = nextBlocks;
    }
    // перенумеровать
    currentBlocks.forEach((b, i) => {
      if (!b.properties) b.properties = {};
      b.properties.index = i + 1;
    });
  }

  // Перерисовать дороги
  roadsLayer.clearLayers();
  buildRoads(parcel);

  // Перерисовать кварталы + подписи + ТЭП
  redrawAll();
}

// ============================================================
// v4 Часть 4: авто-выходы кварталов к дорогам
// Для кварталов, не касающихся дорожной сети, строим короткий съезд:
// ось от центра квартала до ближайшей точки существующей сети.
// ============================================================

// Построить полигон дорожной сети (union буферов всех осей), обрезанный по участку
function buildRoadNetPolygon(parcel) {
  const bufs = [];
  for (const axis of currentRoadAxes) {
    const w = (axis.properties && axis.properties.width) || 0;
    if (!(w > 0)) continue;
    let b = null;
    try { b = turf.buffer(axis, (w / 2) / 1000, { units: 'kilometers' }); } catch (e) { b = null; }
    if (b) bufs.push(b);
  }
  let net = unionAll(bufs);
  if (net && parcel) {
    try { const c = turf.intersect(net, parcel); if (c) net = c; } catch (e) { /* ok */ }
  }
  return net;
}

// Центр квартала как точка
function blockCenter(b) {
  try { return turf.centerOfMass(b); } catch (e) {
    try { return turf.centroid(b); } catch (e2) { return null; }
  }
}

// Автоматически соединить кварталы без выхода к дороге
function autoConnectBlocks() {
  if (!currentParcelPolygon || !currentBlocks.length) return;
  const parcel = parcelToTurf(currentParcelPolygon);

  const width = getNum('streetWidth', 20);
  const net = buildRoadNetPolygon(parcel);

  // Оси, к которым можно примыкать (все текущие линии дорог)
  const targetAxes = currentRoadAxes.slice();
  if (!targetAxes.length) {
    alert('Нет дорожной сети для подключения. Сначала сгенерируйте кварталы.');
    return;
  }

  let added = 0;
  for (const b of currentBlocks) {
    // Уже касается сети? — пропускаем
    if (net) {
      let touches = false;
      try { touches = turf.booleanIntersects(b, net); } catch (e) { touches = false; }
      if (touches) continue;
    }

    const center = blockCenter(b);
    if (!center) continue;

    // Ближайшая точка среди всех осей
    let best = null;
    let bestDist = Infinity;
    for (const axis of targetAxes) {
      let snapped = null;
      try { snapped = turf.nearestPointOnLine(axis, center, { units: 'kilometers' }); } catch (e) { snapped = null; }
      if (!snapped) continue;
      const d = snapped.properties.dist;
      if (d < bestDist) { bestDist = d; best = snapped; }
    }
    if (!best) continue;

    // Съезд: линия центр → ближайшая точка сети
    const connector = turf.lineString([
      center.geometry.coordinates,
      best.geometry.coordinates
    ], { roadType: 'local', width: width, origin: 'auto' });
    currentRoadAxes.push(connector);
    added++;
  }

  if (added === 0) {
    alert('Все кварталы уже имеют выход к дорогам.');
    return;
  }

  rebuildRoadsAndBlocks();
  markDirty();
  updateRoadToolButtons();
  console.log('Авто-выходы добавлены:', added);
}

if (autoConnectBtn) {
  autoConnectBtn.addEventListener('click', autoConnectBlocks);
}

// ============================================================
// v4 Часть 5: внутриквартальные профили по зонам
// residential — сетка дорожек (деление на ЖК/ИЖС) + тротуары
// public — редкие проезды; green — пешеходная тропа
// ============================================================
const INNER_STYLES = {
  path:     { color: '#9a958c', weight: 0, fillColor: '#cfcbc3', fillOpacity: 1, label: 'Дорожки' },
  sidewalk: { color: '#cbb28a', weight: 0, fillColor: '#e6dcc6', fillOpacity: 1, label: 'Тротуары' }
};

// Профиль по зоне (метры)
const ZONE_PROFILES = {
  residential: { pathWidth: 4, sidewalkWidth: 1.5, step: 40, sidewalk: true },
  public:      { pathWidth: 6, sidewalkWidth: 0,   step: 60, sidewalk: false },
  green:       { pathWidth: 2, sidewalkWidth: 0,   step: 0,  sidewalk: false } // тропа по диагонали
};

// Построить осевые линии дорожек внутри квартала по его bbox с шагом step
function innerAxesForBlock(block, profile) {
  const axes = [];
  const bbox = turf.bbox(block);
  const [minX, minY, maxX, maxY] = bbox;
  const widthKm = turf.distance([minX, minY], [maxX, minY], { units: 'kilometers' });
  const heightKm = turf.distance([minX, minY], [minX, maxY], { units: 'kilometers' });
  const sw = turf.point([minX, minY]);
  const blockLine = turf.polygonToLine(block);

  function pt(eastKm, northKm) {
    return turf.destination(
      turf.destination(sw, northKm, 0, { units: 'kilometers' }),
      eastKm, 90, { units: 'kilometers' }
    ).geometry.coordinates;
  }
  function clip(line) {
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
  }

  if (profile.step > 0) {
    const stepKm = profile.step / 1000;
    // горизонтальные и вертикальные дорожки — сетка деления на под-участки (ЖК/ИЖС)
    for (let n = stepKm; n < heightKm; n += stepKm) clip(turf.lineString([pt(0, n), pt(widthKm, n)]));
    for (let e = stepKm; e < widthKm; e += stepKm) clip(turf.lineString([pt(e, 0), pt(e, heightKm)]));
  } else {
    // green: одна диагональная тропа
    clip(turf.lineString([pt(0, 0), pt(widthKm, heightKm)]));
  }
  return axes;
}

// Сгенерировать внутриквартальные профили для всех кварталов
function buildInnerProfiles() {
  if (!currentBlocks.length) { alert('Сначала сгенерируйте кварталы'); return; }

  currentInnerRoads = [];
  innerLayer.clearLayers();

  for (const block of currentBlocks) {
    const zone = (block.properties && block.properties.zone) || 'residential';
    const profile = ZONE_PROFILES[zone];
    if (!profile) continue;

    const axes = innerAxesForBlock(block, profile);
    if (!axes.length) continue;

    // Полоса дорожек = буфер осей ∩ квартал
    const pathBufs = [];
    for (const ax of axes) {
      let b = null;
      try { b = turf.buffer(ax, (profile.pathWidth / 2) / 1000, { units: 'kilometers' }); } catch (e) { b = null; }
      if (b) pathBufs.push(b);
    }
    let paths = unionAll(pathBufs);
    if (paths) { try { const c = turf.intersect(paths, block); if (c) paths = c; } catch (e) { /* ok */ } }
    if (!paths) continue;

    // Тротуары = (буфер осей на pathWidth/2+sidewalk) минус дорожки, ∩ квартал
    let sidewalks = null;
    if (profile.sidewalk && profile.sidewalkWidth > 0) {
      const wideBufs = [];
      for (const ax of axes) {
        let b = null;
        try { b = turf.buffer(ax, (profile.pathWidth / 2 + profile.sidewalkWidth) / 1000, { units: 'kilometers' }); } catch (e) { b = null; }
        if (b) wideBufs.push(b);
      }
      let wide = unionAll(wideBufs);
      if (wide) {
        try { const c = turf.intersect(wide, block); if (c) wide = c; } catch (e) { /* ok */ }
        try { sidewalks = turf.difference(wide, paths); } catch (e) { sidewalks = null; }
      }
    }

    // Тротуары рисуем первыми (под дорожками)
    if (sidewalks) {
      sidewalks.properties = { role: 'inner', zone: zone, kind: 'sidewalk' };
      currentInnerRoads.push(sidewalks);
      L.geoJSON(sidewalks, { pane: 'innerPane', style: INNER_STYLES.sidewalk }).addTo(innerLayer);
    }
    paths.properties = { role: 'inner', zone: zone, kind: 'path' };
    currentInnerRoads.push(paths);
    L.geoJSON(paths, { pane: 'innerPane', style: INNER_STYLES.path }).addTo(innerLayer);
  }

  updateStats();
  markDirty();
  console.log('Внутриквартальные профили:', currentInnerRoads.length, 'элементов');
}

const innerProfilesBtn = document.getElementById('innerProfilesBtn');
if (innerProfilesBtn) {
  innerProfilesBtn.addEventListener('click', buildInnerProfiles);
}

// Начальная синхронизация доступности кнопок трассировки
updateRoadToolButtons();

// ============================================================
// v5 Этап 5: сброс активации из главного окна
// ============================================================
(function initLicensePanel() {
  const info = document.getElementById('licenseInfo');
  const btn = document.getElementById('deactivateBtn');
  if (info && window.terrilicense && window.terrilicense.status) {
    window.terrilicense.status().then(function (s) {
      if (s && s.active) {
        const who = s.clientName ? (s.clientName + ' • ') : '';
        info.textContent = 'Активировано. ' + who + (s.plan ? ('план: ' + s.plan) : '');
      }
    }).catch(function () { /* ok */ });
  }
  if (btn && window.terrilicense && window.terrilicense.deactivate) {
    btn.addEventListener('click', function () {
      if (!confirm('Сбросить активацию? Приложение потребует токен при следующем запуске.')) return;
      window.terrilicense.deactivate();
    });
  }
})();
