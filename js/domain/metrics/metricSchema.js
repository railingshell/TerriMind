// domain/metrics/metricSchema.js — схема метрики ТЭП. Единая структура для каждого показателя.
// Чистые фабрики. Каждый показатель самодостаточен и доказуем.

export const METRIC_CATEGORY = Object.freeze({
  TERRITORY:    'territory',
  BUILDING:     'building',
  POPULATION:   'population',
  COEFFICIENT:  'coefficient',
  BALANCE:      'balance',
  APARTMENTS:   'apartments'   // Квартирография (Промпт 1.4)
});

export const VALIDITY = Object.freeze({
  VALID: 'valid',
  NO_DATA: 'no_data',
  INVALID_GEOMETRY: 'invalid_geometry',
  DIVISION_BY_ZERO: 'division_by_zero'
});

export const COMPLIANCE = Object.freeze({
  COMPLIANT: 'compliant',
  NEAR_LIMIT: 'near_limit',
  NON_COMPLIANT: 'non_compliant',
  EXCEEDS: 'exceeds',
  BELOW_MIN: 'below_min',
  NO_DATA: 'no_data',
  DISABLED: 'disabled',
  CONFLICT: 'conflict',
  PENDING: 'pending'
});

/**
 * Создаёт объект метрики со всеми обязательными полями (см. ТЗ, «Структура каждой метрики»).
 * @param {object} spec
 */
export function makeMetric(spec) {
  const {
    id, label, category, unit,
    raw = null, digits = 0, displayFormat = null,
    formula = null, numerator = null, denominator = null,
    calcSource = 'geometry', regulationSource = null,
    dependencies = [], explanation = '',
    validity = VALIDITY.VALID, compliance = COMPLIANCE.NO_DATA
  } = spec;

  const isValid = raw !== null && Number.isFinite(raw) && raw >= 0;
  const rounded = isValid ? Math.round((raw + Number.EPSILON) * Math.pow(10, digits)) / Math.pow(10, digits) : null;

  return {
    id,
    label,
    category,
    unit,
    raw: isValid ? raw : null,
    rounded,
    displayFormat: displayFormat || `{value} ${unit}`.trim(),
    formula,
    numerator,
    denominator,
    calcSource,
    regulationSource,
    dependencies,
    validity: isValid ? validity : (validity === VALIDITY.VALID ? VALIDITY.NO_DATA : validity),
    compliance,
    explanation,
    updatedAt: spec.updatedAt || new Date().toISOString()
  };
}

/** Формат отображения значения метрики для UI. */
export function formatMetric(metric) {
  if (metric.rounded === null) return '—';
  const v = metric.rounded.toLocaleString('ru-RU');
  return metric.displayFormat.replace('{value}', v);
}
