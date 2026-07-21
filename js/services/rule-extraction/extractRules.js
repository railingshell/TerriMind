// services/rule-extraction/extractRules.js — распознавание потенциальных нормативных правил
// из извлечённого текста PDF. Чистая функция. КАЖДОЕ правило несёт документ/страницу/фрагмент.
// Никогда не выдумывает значения — только то, что реально найдено в тексте.

import { parseNumber, normalizeUnit, toFraction } from '../../domain/units.js';
import { makeRule, RULE_CATEGORY, RULE_SOURCE, VALUE_TYPE, CONFIRM_STATUS } from '../../domain/regulations/ruleSchema.js';

// Ключевые термины → категория правила. Список расширяемый.
const TERM_MAP = [
  { re: /коэффициент\s+застройки|к\.?\s?застр|building\s+coverage/i, category: RULE_CATEGORY.BUILD_COEFFICIENT, valueType: VALUE_TYPE.NUMBER },
  { re: /коэффициент\s+использования\s+территории|КИТ|floor\s+area\s+ratio|\bFAR\b/i, category: RULE_CATEGORY.FLOOR_AREA_RATIO, valueType: VALUE_TYPE.NUMBER },
  { re: /плотность\s+населения|людей\s+на\s+гектар|чел\.?\s*\/\s*га|population\s+density|people\s*\/\s*ha/i, category: RULE_CATEGORY.POPULATION_DENSITY, valueType: VALUE_TYPE.NUMBER },
  { re: /этажность|количество\s+этажей|число\s+этажей|\bfloors?\b/i, category: RULE_CATEGORY.FLOORS, valueType: VALUE_TYPE.RANGE },
  { re: /максимальная\s+высота|предельная\s+высота|высота\s+зданий|max(imum)?\s+height/i, category: RULE_CATEGORY.MAX_HEIGHT, valueType: VALUE_TYPE.NUMBER },
  { re: /озелен|зелен(ых|ые)\s+насажд|greenery/i, category: RULE_CATEGORY.GREENERY_MIN, valueType: VALUE_TYPE.PERCENT },
  { re: /парковк|машиномест|паркинг|parking/i, category: RULE_CATEGORY.PARKING, valueType: VALUE_TYPE.NUMBER },
  { re: /отступ|линия\s+застройки|setback/i, category: RULE_CATEGORY.SETBACK, valueType: VALUE_TYPE.NUMBER },
  { re: /ширина\s+улиц|ширина\s+проезжей|street\s+width/i, category: RULE_CATEGORY.STREET_WIDTH, valueType: VALUE_TYPE.NUMBER },
  { re: /ширина\s+проезд|driveway\s+width/i, category: RULE_CATEGORY.DRIVEWAY_WIDTH, valueType: VALUE_TYPE.NUMBER }
];

// Диапазон: «от X до Y», «X–Y», «X-Y», «from X to Y»
const RANGE_RE = /(?:от\s*|from\s*)?(\d+[.,]?\d*)\s*(?:до|to|–|—|-|\.\.)\s*(\d+[.,]?\d*)/i;
const MIN_RE = /(?:не\s+менее|минимум|не\s+ниже|not\s+less\s+than|min|at\s+least)\s*(\d+[.,]?\d*)/i;
const MAX_RE = /(?:не\s+более|максимум|не\s+выше|not\s+more\s+than|no\s+more\s+than|up\s+to|max|at\s+most)\s*(\d+[.,]?\d*)/i;
const SINGLE_RE = /(\d+[.,]?\d*)\s*(%|м2|м²|га|м|эт\.?|этаж[а-я]*|чел\.?\s*\/\s*га|people\s*\/\s*ha|мест)/i;

/**
 * Извлекает правила из одного текстового фрагмента страницы.
 * @param {object} chunk — { documentId, documentName, page, section, text, documentDate, documentRevision }
 * @returns {Rule[]}
 */
export function extractRulesFromChunk(chunk) {
  const rules = [];
  const text = (chunk && chunk.text) || '';
  if (!text.trim()) return rules;

  // Разбиваем на предложения — правило локализуется в пределах фразы
  const sentences = text.split(/(?<=[.;:\n])\s+/);

  for (const sentence of sentences) {
    for (const term of TERM_MAP) {
      if (!term.re.test(sentence)) continue;

      const parsed = parseValues(sentence, term);
      if (!parsed) continue;

      const confidence = estimateConfidence(sentence, parsed, term);
      rules.push(makeRule({
        name: term.category,
        category: term.category,
        valueType: parsed.valueType,
        minValue: parsed.minValue,
        maxValue: parsed.maxValue,
        recommendedValue: parsed.recommendedValue,
        unit: parsed.unit || '',
        source: RULE_SOURCE.LOCAL_NORM,
        documentId: chunk.documentId,
        documentName: chunk.documentName,
        page: chunk.page,
        section: chunk.section || null,
        snippet: sentence.trim().slice(0, 300),
        documentDate: chunk.documentDate || null,
        documentRevision: chunk.documentRevision || null,
        confidence,
        confirmStatus: CONFIRM_STATUS.PENDING,
        description: 'Извлечено из документа «' + (chunk.documentName || chunk.documentId) + '», стр. ' + chunk.page
      }));
    }
  }
  return dedupe(rules);
}

function parseValues(sentence, term) {
  const rangeM = sentence.match(RANGE_RE);
  const minM = sentence.match(MIN_RE);
  const maxM = sentence.match(MAX_RE);
  const singleM = sentence.match(SINGLE_RE);

  let minValue = null, maxValue = null, recommendedValue = null, unit = '';

  if (rangeM) {
    minValue = parseNumber(rangeM[1]);
    maxValue = parseNumber(rangeM[2]);
    recommendedValue = maxValue;
  } else if (minM || maxM) {
    if (minM) minValue = parseNumber(minM[1]);
    if (maxM) maxValue = parseNumber(maxM[1]);
    recommendedValue = maxValue ?? minValue;
  } else if (singleM) {
    recommendedValue = parseNumber(singleM[1]);
    unit = normalizeUnit(singleM[2]) || singleM[2];
  } else {
    return null;
  }

  if (singleM && !unit) unit = normalizeUnit(singleM[2]) || '';

  // Нормализация процентов для долевых коэффициентов
  if (term.category === RULE_CATEGORY.GREENERY_MIN && unit === 'percent') {
    // хранится как %, оставляем как есть
  }

  if (minValue === null && maxValue === null && recommendedValue === null) return null;
  return { minValue, maxValue, recommendedValue, unit, valueType: term.valueType };
}

/** Оценка уверенности [0..1]: наличие термина + числа + единицы + структуры. */
export function estimateConfidence(sentence, parsed, term) {
  let c = 0.4;                                   // базовая — термин найден
  if (parsed.recommendedValue !== null) c += 0.2; // есть число
  if (parsed.unit) c += 0.15;                     // есть единица
  if (parsed.minValue !== null && parsed.maxValue !== null) c += 0.15; // диапазон
  if (/\bне\s+(менее|более)\b|not\s+(less|more)\s+than|at\s+(least|most)/i.test(sentence)) c += 0.1; // нормативная формулировка
  return Math.min(c, 1);
}

function dedupe(rules) {
  const seen = new Set();
  const out = [];
  for (const r of rules) {
    const key = [r.category, r.minValue, r.maxValue, r.recommendedValue, r.page].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

/**
 * Извлекает правила из всего индекса документа (массив chunks).
 */
export function extractRulesFromIndex(chunks) {
  const all = [];
  for (const chunk of chunks || []) {
    all.push(...extractRulesFromChunk(chunk));
  }
  return all;
}
