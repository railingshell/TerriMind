// domain/regulations/ruleSchema.js — структура нормативного правила и категории.
// Чистое ядро. Правило всегда доказуемо: несёт источник (документ/страница/фрагмент) либо
// помечено как ручное/встроенное демо. Значение без источника создать нельзя (кроме manual/builtin).

export const RULE_CATEGORY = Object.freeze({
  BUILD_COEFFICIENT: 'build_coefficient',
  FLOOR_AREA_RATIO: 'floor_area_ratio',
  BUILD_DENSITY: 'build_density',
  POPULATION_DENSITY: 'population_density',
  FLOORS: 'floors',
  MAX_HEIGHT: 'max_height',
  GREENERY_MIN: 'greenery_min',
  PARKING: 'parking',
  SOCIAL: 'social',
  STREET_WIDTH: 'street_width',
  DRIVEWAY_WIDTH: 'driveway_width',
  SETBACK: 'setback',
  MIN_DISTANCE: 'min_distance',
  SANITARY: 'sanitary',
  PROTECTED: 'protected',
  ALLOWED_FUNCTIONS: 'allowed_functions',
  PUBLIC_SHARE: 'public_share',
  LOAD: 'load',
  CUSTOM: 'custom'
});

export const VALUE_TYPE = Object.freeze({
  NUMBER: 'number',
  RANGE: 'range',
  PERCENT: 'percent',
  ENUM: 'enum',
  TEXT: 'text'
});

export const IMPORTANCE = Object.freeze({
  MANDATORY: 'mandatory',
  RECOMMENDED: 'recommended',
  INFORMATIONAL: 'informational'
});

// Источник правила (по возрастанию приоритета разрешения конфликтов)
export const RULE_SOURCE = Object.freeze({
  DEFAULT: 'default',                 // 8
  BUILTIN_DEMO: 'builtin_demo',       // 7 — демонстрационный ориентир
  GENERAL_NORM: 'general_norm',       // 6
  LOCAL_NORM: 'local_norm',           // 5
  SPECIAL_LIMIT: 'special_limit',     // 4
  ZONE_RULE: 'zone_rule',             // 3
  PROJECT_RULE: 'project_rule',       // 2
  MANUAL_PIN: 'manual_pin'            // 1 — явное ручное закрепление (высший)
});

export const CONFIRM_STATUS = Object.freeze({
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  REJECTED: 'rejected',
  AUTO: 'auto'
});

let __seq = 0;
/** Стабильный идентификатор правила (детерминированный при передаче seedId). */
export function ruleId(seed) {
  if (seed) return String(seed);
  __seq += 1;
  return 'rule_' + Date.now().toString(36) + '_' + __seq.toString(36);
}

/**
 * Фабрика правила со всеми полями (см. ТЗ «Структура правила»).
 */
export function makeRule(spec) {
  const now = new Date().toISOString();
  return {
    id: spec.id || ruleId(),
    name: spec.name || '',
    category: spec.category || RULE_CATEGORY.CUSTOM,
    minValue: spec.minValue ?? null,
    maxValue: spec.maxValue ?? null,
    recommendedValue: spec.recommendedValue ?? null,
    appliedValue: spec.appliedValue ?? spec.recommendedValue ?? null,
    unit: spec.unit || '',
    valueType: spec.valueType || VALUE_TYPE.NUMBER,
    importance: spec.importance || IMPORTANCE.RECOMMENDED,
    description: spec.description || '',
    scope: spec.scope || 'project',                 // project | zone | building | territory
    territory: spec.territory || null,
    condition: spec.condition || null,              // { field, op, value } — применимость
    // Доказуемость источника:
    source: spec.source || RULE_SOURCE.DEFAULT,
    documentId: spec.documentId || null,
    documentName: spec.documentName || null,
    page: spec.page ?? null,
    section: spec.section || null,
    snippet: spec.snippet || null,
    documentDate: spec.documentDate || null,
    documentRevision: spec.documentRevision || null,
    confidence: Number.isFinite(spec.confidence) ? spec.confidence : (spec.source === RULE_SOURCE.MANUAL_PIN ? 1 : 0.5),
    confirmStatus: spec.confirmStatus || (spec.source === RULE_SOURCE.MANUAL_PIN ? CONFIRM_STATUS.CONFIRMED : CONFIRM_STATUS.PENDING),
    priority: spec.priority ?? sourcePriority(spec.source || RULE_SOURCE.DEFAULT),
    manualOverride: !!spec.manualOverride,
    locked: !!spec.locked,
    createdAt: spec.createdAt || now,
    updatedAt: spec.updatedAt || now
  };
}

/** Базовый приоритет по источнику (меньше число = выше приоритет). */
export function sourcePriority(source) {
  const table = {
    [RULE_SOURCE.MANUAL_PIN]: 1,
    [RULE_SOURCE.PROJECT_RULE]: 2,
    [RULE_SOURCE.ZONE_RULE]: 3,
    [RULE_SOURCE.SPECIAL_LIMIT]: 4,
    [RULE_SOURCE.LOCAL_NORM]: 5,
    [RULE_SOURCE.GENERAL_NORM]: 6,
    [RULE_SOURCE.BUILTIN_DEMO]: 7,
    [RULE_SOURCE.DEFAULT]: 8
  };
  return table[source] ?? 8;
}

/**
 * Валидация правила против значения. Возвращает статус нормативного соответствия.
 * @returns {'compliant'|'near_limit'|'exceeds'|'below_min'|'no_data'}
 */
export function checkCompliance(rule, actualValue, nearFraction = 0.1) {
  if (!Number.isFinite(actualValue)) return 'no_data';
  const { minValue, maxValue } = rule;
  if (Number.isFinite(maxValue) && actualValue > maxValue) return 'exceeds';
  if (Number.isFinite(minValue) && actualValue < minValue) return 'below_min';
  // near limit?
  if (Number.isFinite(maxValue)) {
    const margin = (maxValue - (Number.isFinite(minValue) ? minValue : 0)) * nearFraction;
    if (actualValue >= maxValue - margin) return 'near_limit';
  }
  if (Number.isFinite(minValue)) {
    const span = (Number.isFinite(maxValue) ? maxValue : minValue * 2) - minValue;
    if (actualValue <= minValue + span * nearFraction) return 'near_limit';
  }
  return 'compliant';
}
