// domain/units.js — централизованная нормализация единиц и округление.
// Чистые функции. Без DOM, без Electron, без побочных эффектов.
// Единая точка правды для перевода м²/га/%, контроля точности и защиты от NaN/Infinity.

/** Округление с контролируемой точностью (банковское исключено — обычное half-up). */
export function round(value, digits = 0) {
  if (!Number.isFinite(value)) return null;
  const f = Math.pow(10, digits);
  return Math.round((value + Number.EPSILON) * f) / f;
}

/** Безопасное деление: null при делении на 0 или нечисловых входах (никогда не Infinity/NaN). */
export function safeDivide(numerator, denominator) {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator)) return null;
  if (denominator === 0) return null;
  const r = numerator / denominator;
  return Number.isFinite(r) ? r : null;
}

/** Гарантирует неотрицательное конечное число; иначе null. */
export function nonNegative(value) {
  if (!Number.isFinite(value)) return null;
  return value < 0 ? null : value;
}

/** Клип значения в диапазон [min,max]. */
export function clamp(value, min, max) {
  if (!Number.isFinite(value)) return null;
  return Math.min(Math.max(value, min), max);
}

// ── Площадь ──
export const M2_PER_HA = 10000;
export function m2ToHa(m2) { return safeDivide(m2, M2_PER_HA); }
export function haToM2(ha) { return Number.isFinite(ha) ? ha * M2_PER_HA : null; }

// ── Доли / проценты ──
/** Нормализует значение в долю [0..1]. Принимает 0.7 или 70(%). */
export function toFraction(value, { isPercent = false } = {}) {
  if (!Number.isFinite(value)) return null;
  const v = isPercent ? value / 100 : value;
  return clamp(v, 0, 1);
}
/** Доля [0..1] → процент [0..100]. */
export function toPercent(fraction) {
  if (!Number.isFinite(fraction)) return null;
  return fraction * 100;
}

// ── Единицы измерения (канонизация строк из PDF) ──
const UNIT_ALIASES = {
  'м2': 'm2', 'м²': 'm2', 'кв.м': 'm2', 'кв. м': 'm2', 'm2': 'm2', 'sq.m': 'm2',
  'га': 'ha', 'гектар': 'ha', 'гектаров': 'ha', 'ha': 'ha',
  '%': 'percent', 'процент': 'percent', 'процентов': 'percent', 'percent': 'percent',
  'м': 'm', 'метр': 'm', 'метров': 'm', 'm': 'm',
  'эт': 'floors', 'этаж': 'floors', 'этажей': 'floors', 'этажа': 'floors', 'floors': 'floors',
  'чел/га': 'people_per_ha', 'чел./га': 'people_per_ha', 'people/ha': 'people_per_ha',
  'мест': 'spaces', 'машиномест': 'spaces', 'м/мест': 'spaces', 'spaces': 'spaces'
};

/** Каноническая единица или null, если не распознана. */
export function normalizeUnit(raw) {
  if (typeof raw !== 'string') return null;
  const key = raw.trim().toLowerCase().replace(/\s+/g, ' ');
  return UNIT_ALIASES[key] || null;
}

/** Разбор числа из строки (запятая как десятичный разделитель, пробелы-разряды). */
export function parseNumber(raw) {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== 'string') return null;
  const cleaned = raw
    .replace(/\u00a0/g, '')          // неразрывный пробел
    .replace(/(\d)\s+(\d)/g, '$1$2') // пробел-разделитель разрядов
    .replace(',', '.')
    .replace(/[^0-9.\-]/g, '');
  if (cleaned === '' || cleaned === '-' || cleaned === '.') return null;
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}
