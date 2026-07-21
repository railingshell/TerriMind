// domain/regulations/profiles.js — нормативные профили: встроенные демо-профили,
// версионирование, миграция, сравнение. Значения помечены как демонстрационные ориентиры.

import { makeRule, RULE_CATEGORY, RULE_SOURCE, VALUE_TYPE, IMPORTANCE, CONFIRM_STATUS } from './ruleSchema.js';

export const PROFILE_SCHEMA_VERSION = 1;

/** Демо-правило (встроенный ориентир, не из документа). */
function demo(category, spec) {
  return makeRule(Object.assign({
    category,
    source: RULE_SOURCE.BUILTIN_DEMO,
    confirmStatus: CONFIRM_STATUS.AUTO,
    confidence: 0.4,
    importance: IMPORTANCE.INFORMATIONAL,
    description: 'Демонстрационный ориентир (не подтверждён официальным документом).'
  }, spec));
}

/** Набор правил для встроенного профиля. */
function baseRules({ kz, kit, floorsMin, floorsMax, greenery, popDensity, parking }) {
  return [
    demo(RULE_CATEGORY.BUILD_COEFFICIENT, { name: 'Коэффициент застройки', maxValue: kz, recommendedValue: kz, valueType: VALUE_TYPE.NUMBER, unit: '' }),
    demo(RULE_CATEGORY.FLOOR_AREA_RATIO, { name: 'Коэффициент использования территории', maxValue: kit, recommendedValue: kit, valueType: VALUE_TYPE.NUMBER, unit: '' }),
    demo(RULE_CATEGORY.FLOORS, { name: 'Этажность', minValue: floorsMin, maxValue: floorsMax, recommendedValue: floorsMax, valueType: VALUE_TYPE.RANGE, unit: 'эт' }),
    demo(RULE_CATEGORY.GREENERY_MIN, { name: 'Мин. озеленение', minValue: greenery, recommendedValue: greenery, valueType: VALUE_TYPE.PERCENT, unit: '%' }),
    demo(RULE_CATEGORY.POPULATION_DENSITY, { name: 'Плотность населения', maxValue: popDensity, recommendedValue: popDensity, valueType: VALUE_TYPE.NUMBER, unit: 'чел./га' }),
    demo(RULE_CATEGORY.PARKING, { name: 'Обеспеченность парковками', minValue: parking, recommendedValue: parking, valueType: VALUE_TYPE.NUMBER, unit: 'мест/квартиру' })
  ];
}

export const BUILTIN_PROFILES = Object.freeze({
  compact: {
    id: 'builtin:compact', name: 'Компактная городская застройка', builtin: true,
    demo: true, rules: baseRules({ kz: 0.40, kit: 3.0, floorsMin: 9, floorsMax: 25, greenery: 15, popDensity: 450, parking: 1.0 })
  },
  balanced: {
    id: 'builtin:balanced', name: 'Сбалансированная застройка', builtin: true,
    demo: true, rules: baseRules({ kz: 0.30, kit: 1.8, floorsMin: 5, floorsMax: 12, greenery: 25, popDensity: 300, parking: 1.0 })
  },
  free: {
    id: 'builtin:free', name: 'Свободная малоэтажная застройка', builtin: true,
    demo: true, rules: baseRules({ kz: 0.20, kit: 0.8, floorsMin: 1, floorsMax: 4, greenery: 40, popDensity: 120, parking: 1.5 })
  },
  mixed: {
    id: 'builtin:mixed', name: 'Смешанная городская застройка', builtin: true,
    demo: true, rules: baseRules({ kz: 0.35, kit: 2.4, floorsMin: 4, floorsMax: 16, greenery: 20, popDensity: 350, parking: 1.0 })
  }
});

/** Создать пустой пользовательский профиль. */
export function createProfile(name, rules = []) {
  const now = new Date().toISOString();
  return {
    id: 'profile_' + Date.now().toString(36),
    name: name || 'Новый профиль',
    builtin: false,
    demo: false,
    schemaVersion: PROFILE_SCHEMA_VERSION,
    version: 1,
    createdAt: now,
    updatedAt: now,
    author: 'user',
    sources: [],
    description: '',
    history: [],
    rules: rules.slice()
  };
}

/** Клонировать профиль (в т.ч. встроенный) как пользовательский. */
export function cloneProfile(profile, newName) {
  const p = createProfile(newName || (profile.name + ' (копия)'), (profile.rules || []).map((r) => Object.assign({}, r)));
  p.description = profile.description || '';
  p.sources = (profile.sources || []).slice();
  return p;
}

/** Зафиксировать новую версию (снимок предыдущего состояния в history). */
export function bumpVersion(profile, changeNote) {
  const snapshot = {
    version: profile.version,
    at: profile.updatedAt,
    rules: (profile.rules || []).map((r) => Object.assign({}, r)),
    note: changeNote || null
  };
  const history = (profile.history || []).concat([snapshot]);
  return Object.assign({}, profile, {
    version: profile.version + 1,
    updatedAt: new Date().toISOString(),
    history
  });
}

/** Откат к предыдущей версии из истории. */
export function revertToVersion(profile, version) {
  const snap = (profile.history || []).find((h) => h.version === version);
  if (!snap) return profile;
  return Object.assign({}, profile, {
    rules: snap.rules.map((r) => Object.assign({}, r)),
    version: profile.version + 1,
    updatedAt: new Date().toISOString(),
    history: (profile.history || []).concat([{ version: profile.version, at: profile.updatedAt, rules: profile.rules, note: 'before revert to v' + version }])
  });
}

/** Сравнение двух профилей по категориям. */
export function compareProfiles(a, b) {
  const cats = new Set([...(a.rules || []).map((r) => r.category), ...(b.rules || []).map((r) => r.category)]);
  const diff = [];
  for (const cat of cats) {
    const ra = (a.rules || []).find((r) => r.category === cat);
    const rb = (b.rules || []).find((r) => r.category === cat);
    const va = ra ? (ra.appliedValue ?? ra.recommendedValue) : null;
    const vb = rb ? (rb.appliedValue ?? rb.recommendedValue) : null;
    if (va !== vb) diff.push({ category: cat, a: va, b: vb, unit: (ra || rb).unit });
  }
  return diff;
}

/** Объединение нескольких профилей: правила высшего приоритета перекрывают. */
export function mergeProfiles(profiles, name) {
  const merged = createProfile(name || 'Объединённый профиль');
  const byCat = new Map();
  for (const p of profiles) {
    for (const r of p.rules || []) {
      const cur = byCat.get(r.category);
      if (!cur || (r.priority ?? 8) < (cur.priority ?? 8)) byCat.set(r.category, r);
    }
    merged.sources.push(...(p.sources || []));
  }
  merged.rules = [...byCat.values()].map((r) => Object.assign({}, r));
  merged.sources = [...new Set(merged.sources)];
  return merged;
}

/** Миграция старого профиля к текущей схеме. */
export function migrateProfile(profile) {
  if (!profile) return null;
  const v = profile.schemaVersion || 0;
  let p = profile;
  if (v < 1) {
    p = Object.assign({}, profile, {
      schemaVersion: PROFILE_SCHEMA_VERSION,
      version: profile.version || 1,
      history: profile.history || [],
      rules: (profile.rules || []).map((r) => Object.assign({ manualOverride: false, locked: false }, r))
    });
  }
  return p;
}
