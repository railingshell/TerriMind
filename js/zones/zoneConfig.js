// zones/zoneConfig.js — единый реестр зон застройки.
// 7 типов. Каждая зона: цвета, подпись, коэф. населения, нормативы застройки.
// Источник истины для рендера, ТЭП, легенды, циклического переключения.

export const ZONES = {
  residential: {
    label: 'Жилая',
    fillColor: '#3498db', color: '#2980b9',
    popCoef: 1.0,          // множитель населения
    buildCoef: 0.28, floors: 9, residShare: 0.75
  },
  public: {
    label: 'Общественная',
    fillColor: '#e67e22', color: '#d35400',
    popCoef: 0.1,
    buildCoef: 0.35, floors: 5, residShare: 0.1
  },
  commercial: {
    label: 'Коммерческая',
    fillColor: '#9b59b6', color: '#8e44ad',
    popCoef: 0.05,
    buildCoef: 0.45, floors: 6, residShare: 0.05
  },
  industrial: {
    label: 'Промышленная',
    fillColor: '#7f8c8d', color: '#636e72',
    popCoef: 0.0,
    buildCoef: 0.5, floors: 2, residShare: 0.0
  },
  recreation: {
    label: 'Рекреационная',
    fillColor: '#27ae60', color: '#1e8449',
    popCoef: 0.0,
    buildCoef: 0.03, floors: 1, residShare: 0.0
  },
  mixed: {
    label: 'Смешанная',
    fillColor: '#e84393', color: '#c0398a',
    popCoef: 0.6,
    buildCoef: 0.35, floors: 8, residShare: 0.55
  },
  special: {
    label: 'Специальная',
    fillColor: '#f1c40f', color: '#d4ac0d',
    popCoef: 0.0,
    buildCoef: 0.2, floors: 3, residShare: 0.0
  }
};

// Порядок циклического переключения по клику
export const ZONE_ORDER = [
  'residential', 'public', 'commercial', 'industrial', 'recreation', 'mixed', 'special'
];

export function zoneOf(feature) {
  return (feature && feature.properties && feature.properties.zone) || 'residential';
}
export function zoneStyle(zone) {
  return ZONES[zone] || ZONES.residential;
}
export function nextZone(zone) {
  const i = ZONE_ORDER.indexOf(zone);
  return ZONE_ORDER[(i + 1) % ZONE_ORDER.length];
}

// Профили внутриквартальных дорожек по зоне (метры)
export const ZONE_PROFILES = {
  residential: { pathWidth: 4, sidewalkWidth: 1.5, step: 40, sidewalk: true },
  public:      { pathWidth: 6, sidewalkWidth: 0,   step: 60, sidewalk: false },
  commercial:  { pathWidth: 6, sidewalkWidth: 2,   step: 50, sidewalk: true },
  industrial:  { pathWidth: 8, sidewalkWidth: 0,   step: 80, sidewalk: false },
  recreation:  { pathWidth: 2, sidewalkWidth: 0,   step: 0,  sidewalk: false },
  mixed:       { pathWidth: 5, sidewalkWidth: 1.5, step: 45, sidewalk: true },
  special:     { pathWidth: 5, sidewalkWidth: 0,   step: 60, sidewalk: false }
};

export const INNER_STYLES = {
  path:     { color: '#9a958c', weight: 0, fillColor: '#cfcbc3', fillOpacity: 1, label: 'Дорожки' },
  sidewalk: { color: '#cbb28a', weight: 0, fillColor: '#e6dcc6', fillOpacity: 1, label: 'Тротуары' }
};

// Стили дорог по типу (единый источник, убирает дублирование)
export const ROAD_STYLES = {
  main:    { color: '#2b303b', weight: 1.5, fillColor: '#3d4451', fillOpacity: 1 },
  local:   { color: '#b4afa6', weight: 1,   fillColor: '#d6d3cd', fillOpacity: 1 },
  service: { color: '#9a958c', weight: 0.8, fillColor: '#c9c5bd', fillOpacity: 1 },
  generic: { color: '#8d8880', weight: 1,   fillColor: '#c9c5bd', fillOpacity: 1 }
};
