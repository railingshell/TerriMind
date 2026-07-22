// ui/buildingPanel.js — панель «Застройка» (Промпт 1.3).
// Морфотипы, квартирография, встроенные помещения, кнопка регенерации.

import { $, on } from '../core/dom.js';
import { state } from '../core/state.js';
import { emit } from '../core/events.js';
import { markDirty } from '../core/state.js';
import { getBuildingParams, setBuildingParams, saveBuildingParamsToStorage } from '../project/params.js';
import { updateStats } from '../project/stats.js';

const ZONE_LABELS = {
  residential: 'Жилая',
  commercial:  'Коммерческая',
  mixed:       'Смешанная',
  public:      'Общественная'
};

const MORPHOTYPE_LABELS = {
  perimeter:    'Периметральная',
  freestanding: 'Свободностоящий блок',
  tower:        'Башня',
  section:      'Секционный дом',
  courtyard:    'Замкнутый двор'
};

let _debounceTimer = null;

function debounceRegen() {
  clearTimeout(_debounceTimer);
  _debounceTimer = setTimeout(() => {
    if (state.blocks.length) emit('buildings:regenerate');
    if (state.blocks.length) updateStats();
  }, 500);
}

function syncField(key, path, converter) {
  const el = $(key);
  if (!el) return;
  // path: 'zones.residential.morphotype' или 'apartmentMix.studio.share'
  const keys = path.split('.');
  const patch = {};
  let cur = patch;
  for (let i = 0; i < keys.length - 1; i++) {
    cur[keys[i]] = {};
    cur = cur[keys[i]];
  }
  const last = keys[keys.length - 1];
  cur[last] = converter ? converter(el.value) : el.value;
  setBuildingParams(patch);
  saveBuildingParamsToStorage();
  markDirty();
  debounceRegen();
}

function validateShares(type) {
  // При изменении доли одного типа — корректируем авто
  const bp = getBuildingParams();
  const zones = bp.zones;
  // Нормализуем residShare + commShare <= 100
  const zone = zones[type];
  if (!zone) return;
  const total = (zone.residShare || 0) + (zone.commShare || 0);
  if (total > 100) {
    // Уменьшаем коммерческую
    const patch = { zones: { [type]: { commShare: Math.max(0, 100 - zone.residShare) } } };
    setBuildingParams(patch);
    const commEl = $(`bp_${type}_comm`);
    if (commEl) commEl.value = patch.zones[type].commShare;
  }
}

function validateApartmentShares() {
  const bp = getBuildingParams();
  const mix = bp.apartmentMix;
  const total = (mix.studio.share + mix.oneRoom.share + mix.twoRoom.share + mix.threeRoom.share) * 100;
  const sumEl = $('bp_apt_sum');
  if (sumEl) {
    sumEl.textContent = Math.round(total) + '%';
    sumEl.style.color = Math.abs(total - 100) < 1 ? 'var(--ok)' : 'var(--danger)';
  }
}

function buildZoneSection(zone) {
  const bp = getBuildingParams();
  const zp = (bp.zones && bp.zones[zone]) || {};
  const morphOptions = Object.entries(MORPHOTYPE_LABELS).map(([v, l]) =>
    `<option value="${v}"${zp.morphotype === v ? ' selected' : ''}>${l}</option>`
  ).join('');

  return `
<div class="card" data-section="building">
  <h3><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-4 0v2M8 7V5a2 2 0 0 0-4 0v2"/></svg>${ZONE_LABELS[zone]}</h3>
  <div class="field">
    <span class="label">Морфотип</span>
    <select id="bp_${zone}_morph">${morphOptions}</select>
  </div>
  <div class="row">
    <span class="label">Этажность</span>
    <input type="number" id="bp_${zone}_floors" value="${zp.floors ?? 9}" min="1" max="40" step="1" />
  </div>
  <div class="row">
    <span class="label">Жилая доля %</span>
    <input type="number" id="bp_${zone}_resid" value="${zp.residShare ?? 75}" min="0" max="100" step="5" />
  </div>
  <div class="row">
    <span class="label">Коммерческая %</span>
    <input type="number" id="bp_${zone}_comm" value="${zp.commShare ?? 10}" min="0" max="100" step="5" />
  </div>
  <div class="row">
    <span class="label">Передний отступ, м</span>
    <input type="number" id="bp_${zone}_front" value="${zp.frontSetback ?? 3}" min="0" max="10" step="0.5" />
  </div>
  <div class="row">
    <span class="label">Боковой отступ, м</span>
    <input type="number" id="bp_${zone}_side" value="${zp.sideSetback ?? 4}" min="1" max="10" step="0.5" />
  </div>
</div>`;
}

/** Инициализирует HTML и навешивает обработчики. */
export function initBuildingPanel() {
  // Вставляем HTML зональных карточек в контейнер
  const host = $('buildingZonesHost');
  if (host) {
    host.innerHTML = Object.keys(ZONE_LABELS).map(buildZoneSection).join('');
  }

  // Навешиваем обработчики на зональные поля
  for (const zone of Object.keys(ZONE_LABELS)) {
    on(`bp_${zone}_morph`,  'change', () => { syncField(`bp_${zone}_morph`,  `zones.${zone}.morphotype`, v => v); });
    on(`bp_${zone}_floors`, 'input',  () => { syncField(`bp_${zone}_floors`, `zones.${zone}.floors`, Number); });
    on(`bp_${zone}_resid`,  'input',  () => {
      syncField(`bp_${zone}_resid`, `zones.${zone}.residShare`, Number);
      validateShares(zone);
    });
    on(`bp_${zone}_comm`,   'input',  () => {
      syncField(`bp_${zone}_comm`,  `zones.${zone}.commShare`, Number);
      validateShares(zone);
    });
    on(`bp_${zone}_front`,  'input',  () => { syncField(`bp_${zone}_front`, `zones.${zone}.frontSetback`, Number); });
    on(`bp_${zone}_side`,   'input',  () => { syncField(`bp_${zone}_side`,  `zones.${zone}.sideSetback`,  Number); });
  }

  // Квартирография
  const aptTypes = [
    ['studio',   'Студия'],
    ['oneRoom',  '1-комнатная'],
    ['twoRoom',  '2-комнатная'],
    ['threeRoom','3-комнатная']
  ];
  for (const [key] of aptTypes) {
    on(`bp_apt_${key}_share`, 'input', () => {
      syncField(`bp_apt_${key}_share`, `apartmentMix.${key}.share`, v => Number(v) / 100);
      validateApartmentShares();
    });
    on(`bp_apt_${key}_area`, 'input', () => {
      syncField(`bp_apt_${key}_area`, `apartmentMix.${key}.avgArea`, Number);
    });
  }
  on('bp_apt_recalc', 'click', () => { if (state.blocks.length) { emit('buildings:regenerate'); updateStats(); } });
  validateApartmentShares();

  // Встроенные помещения
  const embTypes = ['retail', 'kindergarten', 'clinic'];
  for (const t of embTypes) {
    on(`bp_emb_${t}`, 'change', () => {
      const el = $(`bp_emb_${t}`);
      if (!el) return;
      setBuildingParams({ embedded: { [t]: { enabled: el.checked } } });
      saveBuildingParamsToStorage();
      markDirty();
      debounceRegen();
    });
    on(`bp_emb_${t}_area`, 'input', () => {
      const el = $(`bp_emb_${t}_area`);
      if (!el) return;
      setBuildingParams({ embedded: { [t]: { areaM2: Number(el.value) } } });
      saveBuildingParamsToStorage();
      markDirty();
      debounceRegen();
    });
  }

  // Кнопка регенерации
  on('bp_regenerate', 'click', () => emit('buildings:regenerate'));
}
