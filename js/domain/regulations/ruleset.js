// domain/regulations/ruleset.js — формирование структурированного свода правил.
// Объединяет: встроенные пресеты, пользовательские, правила из PDF, ручные, проектные, зональные,
// исключения/переопределения. Прозрачно, редактируемо.

import { isApplicable } from './applicability.js';
import { detectConflicts, CONFLICT_STATUS, pickByPriority } from './resolveConflicts.js';
import { CONFIRM_STATUS } from './ruleSchema.js';

export const DATA_COMPLETENESS = Object.freeze({
  computeLevel(applied, categoriesNeeded) {
    if (!categoriesNeeded.length) return 0;
    return Math.round((applied / categoriesNeeded.length) * 100);
  }
});

/**
 * Строит свод правил для данного контекста.
 * @param {Rule[]} allRules — все правила из всех источников
 * @param {object} context — контекст применимости
 * @param {object} options — { autoApplyResolved, categoriesNeeded[] }
 * @returns {Ruleset}
 */
export function buildRuleset(allRules, context, options = {}) {
  const applicable = (allRules || []).filter((r) => isApplicable(r, context));
  const conflicts = detectConflicts(applicable);

  const applied = [];        // применённые (подтверждённые/авто)
  const rejected = [];       // отклонённые
  const pending = [];        // неподтверждённые
  const conflictReport = []; // конфликты, требующие внимания

  for (const c of conflicts) {
    if (c.status === CONFLICT_STATUS.NEEDS_CONFIRM) {
      conflictReport.push(c);
      if (c.suggested) pending.push(c.suggested);
      continue;
    }
    if (c.status === CONFLICT_STATUS.INSUFFICIENT) continue;
    const chosen = c.chosen;
    if (!chosen) continue;

    if (chosen.confirmStatus === CONFIRM_STATUS.REJECTED) { rejected.push(chosen); continue; }

    // Авто-разрешённые из PDF требуют подтверждения, кроме ручных/закреплённых
    const isProven = chosen.manualOverride || chosen.locked ||
      chosen.confirmStatus === CONFIRM_STATUS.CONFIRMED ||
      chosen.confirmStatus === CONFIRM_STATUS.AUTO;

    if (isProven || options.autoApplyResolved) {
      applied.push(chosen);
    } else {
      pending.push(chosen);
    }
  }

  const categoriesNeeded = options.categoriesNeeded || [...new Set(applicable.map((r) => r.category))];
  const appliedCats = new Set(applied.map((r) => r.category));
  const completeness = categoriesNeeded.length
    ? Math.round(([...appliedCats].filter((c) => categoriesNeeded.includes(c)).length / categoriesNeeded.length) * 100)
    : 0;

  const sources = [...new Set(applicable.map((r) => r.documentId).filter(Boolean))];

  return {
    name: options.name || 'Свод правил',
    createdAt: new Date().toISOString(),
    territory: context && context.territory || null,
    sources,
    applied,
    rejected,
    pending,
    conflicts: conflictReport,
    manualOverrides: applicable.filter((r) => r.manualOverride),
    completeness
  };
}

/**
 * Плоская карта применённых значений по категориям (для передачи в расчёт/UI).
 * @returns {{ [category]: { value, rule } }}
 */
export function flattenApplied(ruleset) {
  const map = {};
  for (const r of ruleset.applied) {
    map[r.category] = { value: r.appliedValue ?? r.recommendedValue, rule: r };
  }
  return map;
}
