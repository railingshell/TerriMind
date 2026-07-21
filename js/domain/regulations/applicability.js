// domain/regulations/applicability.js — определение применимости правила к контексту проекта.
// Чистая функция. Контекст: { territory, municipality, zone, permittedUse, projectType,
//   functionalZone, purpose, parcelAreaM2, specialConditions[] }.

/**
 * @returns {boolean} применимо ли правило к данному контексту
 */
export function isApplicable(rule, context) {
  const ctx = context || {};

  // Территория действия
  if (rule.territory && ctx.territory && rule.territory !== ctx.territory) {
    // допускаем совпадение по муниципалитету
    if (!ctx.municipality || rule.territory !== ctx.municipality) return false;
  }

  // Область применения (scope) — зональные правила применимы, если задана зона
  if (rule.scope === 'zone' && rule.condition && rule.condition.field === 'zone') {
    if (ctx.zone && rule.condition.value && ctx.zone !== rule.condition.value) return false;
  }

  // Условие применения { field, op, value }
  if (rule.condition && rule.condition.field && rule.condition.field !== 'zone') {
    const actual = ctx[rule.condition.field];
    if (actual === undefined) return true; // нет данных — не отсекаем (не выдумываем несоответствие)
    if (!evalCondition(actual, rule.condition.op, rule.condition.value)) return false;
  }

  return true;
}

function evalCondition(actual, op, expected) {
  switch (op) {
    case '=': case '==': return actual === expected;
    case '!=': return actual !== expected;
    case '>': return actual > expected;
    case '>=': return actual >= expected;
    case '<': return actual < expected;
    case '<=': return actual <= expected;
    case 'in': return Array.isArray(expected) && expected.includes(actual);
    default: return true;
  }
}
