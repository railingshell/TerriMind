// domain/regulations/resolveConflicts.js — центр разрешения конфликтов правил.
// Никогда не выбирает значение «случайно». При равном приоритете — требует подтверждения.

import { sourcePriority, CONFIRM_STATUS } from './ruleSchema.js';

export const CONFLICT_STATUS = Object.freeze({
  RESOLVED_AUTO: 'resolved_auto',       // разрешён по приоритету
  NEEDS_CONFIRM: 'needs_confirm',       // требует подтверждения (равный приоритет)
  RESOLVED_USER: 'resolved_user',       // разрешён пользователем
  EXCLUDED: 'excluded',                 // исключён
  INSUFFICIENT: 'insufficient'          // недостаточно данных
});

/**
 * Группирует правила по категории (для одной применимой области) и находит конфликты.
 * @param {Rule[]} rules — уже отфильтрованные по применимости правила
 * @returns {{ category, candidates: Rule[], status, chosen: Rule|null, explanation }[]}
 */
export function detectConflicts(rules) {
  const byCat = new Map();
  for (const r of rules) {
    if (r.confirmStatus === CONFIRM_STATUS.REJECTED) continue;
    if (!byCat.has(r.category)) byCat.set(r.category, []);
    byCat.get(r.category).push(r);
  }

  const results = [];
  for (const [category, candidates] of byCat) {
    results.push(resolveCategory(category, candidates));
  }
  return results;
}

/** Разрешение одной категории. */
export function resolveCategory(category, candidates) {
  const active = candidates.filter((c) => c.confirmStatus !== CONFIRM_STATUS.REJECTED);
  if (active.length === 0) {
    return { category, candidates, status: CONFLICT_STATUS.INSUFFICIENT, chosen: null, explanation: 'Нет активных правил.' };
  }
  if (active.length === 1) {
    return { category, candidates: active, status: CONFLICT_STATUS.RESOLVED_AUTO, chosen: active[0], explanation: 'Единственное правило.' };
  }

  // Пользователь уже разрешил (есть закреплённое/manualOverride)
  const userChoice = active.find((c) => c.locked || c.manualOverride);
  if (userChoice) {
    return { category, candidates: active, status: CONFLICT_STATUS.RESOLVED_USER, chosen: userChoice, explanation: 'Выбор закреплён пользователем.' };
  }

  // Проверяем: различаются ли значения вообще?
  const distinct = new Set(active.map((c) => JSON.stringify([c.minValue, c.maxValue, c.recommendedValue])));
  if (distinct.size === 1) {
    // одинаковые значения — не конфликт, берём высший приоритет
    const chosen = pickByPriority(active);
    return { category, candidates: active, status: CONFLICT_STATUS.RESOLVED_AUTO, chosen, explanation: 'Значения совпадают.' };
  }

  // Реальный конфликт: сортируем по приоритету
  const sorted = active.slice().sort((a, b) => priorityOf(a) - priorityOf(b));
  const top = sorted[0];
  const second = sorted[1];

  if (priorityOf(top) < priorityOf(second)) {
    return {
      category, candidates: sorted, status: CONFLICT_STATUS.RESOLVED_AUTO, chosen: top,
      explanation: `Выбран источник с высшим приоритетом (${top.source}) над (${second.source}).`
    };
  }

  // Равный приоритет — не выбираем сами
  // Подсказка: свежий документ (по дате) как предложение, но статус NEEDS_CONFIRM
  const suggestion = sorted.slice().sort(byDateDesc)[0];
  return {
    category, candidates: sorted, status: CONFLICT_STATUS.NEEDS_CONFIRM, chosen: null,
    suggested: suggestion,
    explanation: 'Равный приоритет источников — требуется подтверждение пользователя. Предложен более свежий документ.'
  };
}

function priorityOf(rule) {
  return Number.isFinite(rule.priority) ? rule.priority : sourcePriority(rule.source);
}

export function pickByPriority(rules) {
  return rules.slice().sort((a, b) => priorityOf(a) - priorityOf(b))[0] || null;
}

function byDateDesc(a, b) {
  const da = Date.parse(a.documentDate || '') || 0;
  const db = Date.parse(b.documentDate || '') || 0;
  return db - da;
}
