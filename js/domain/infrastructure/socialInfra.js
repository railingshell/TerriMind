// domain/infrastructure/socialInfra.js — расчёт потребности и обеспеченности
// социальной инфраструктурой. Промпт 2.1.
// Чистый модуль: нет DOM, нет Electron, нет Turf. Только арифметика.

import { state } from '../../core/state.js';
import { emit } from '../../core/events.js';
import { nonNegative } from '../units.js';

/** Эталонный список объектов соцнифраструктуры. */
export const INFRA_OBJECTS = Object.freeze([
  { id: 'kindergarten', name: 'ДОУ (детский сад)',      normPer1000: 61,  unitType: 'мест',        radiusM: 300  },
  { id: 'school',       name: 'Школа',                  normPer1000: 135, unitType: 'мест',        radiusM: 500  },
  { id: 'clinic',       name: 'Поликлиника (взрослая)',  normPer1000: 18,  unitType: 'пос/смену',   radiusM: 1000 },
  { id: 'clinic_child', name: 'Поликлиника (детская)',   normPer1000: 20,  unitType: 'пос/смену',   radiusM: 800  },
  { id: 'sport',        name: 'ФОК / спортзал',          normPer1000: 70,  unitType: 'м² зала',     radiusM: 1000 },
  { id: 'culture',      name: 'КДЦ',                    normPer1000: 50,  unitType: 'мест',        radiusM: 1500 },
  { id: 'police',       name: 'Полиция',                 normPer1000: 1,   unitType: 'объектов',    radiusM: 2000 },
  { id: 'fire',         name: 'Пожарная часть',          normPer1000: 0.5, unitType: 'объектов',    radiusM: 3000 }
]);

/** Иконки по типу объекта. */
export const INFRA_ICONS = Object.freeze({
  kindergarten: '🏛',
  school:       '🏫',
  clinic:       '🏥',
  clinic_child: '👶',
  sport:        '🏋️',
  culture:      '🎭',
  police:       '🚔',
  fire:         '🚒'
});

/** Цвета объектов по типу. */
export const INFRA_COLORS = Object.freeze({
  kindergarten: '#e67e22',
  school:       '#2980b9',
  clinic:       '#c0392b',
  clinic_child: '#e91e8c',
  sport:        '#27ae60',
  culture:      '#8e44ad',
  police:       '#2c3e50',
  fire:         '#e74c3c'
});

// ── Внутреннее состояние модуля ────────────────────────────────────────────
let _population = 0;
let _balance = null;

/** Устанавливает текущее расчётное население (вызывается из app.js при обновлении метрик). */
export function setPopulation(pop) {
  _population = nonNegative(pop) || 0;
}

/** Получить последний рассчитанный баланс. */
export function getBalance() { return _balance; }

/** Найти объект по ID. */
export function getInfraObject(id) {
  return INFRA_OBJECTS.find(o => o.id === id) || null;
}

// ── Вспомогательные функции ────────────────────────────────────────────────

/** Суммарная вместимость объектов заданного типа из массива. */
function sumCapacity(arr, type) {
  return (arr || []).reduce((s, o) => s + (o.type === type ? (nonNegative(o.capacity) || 0) : 0), 0);
}

/** Получить нормативное значение с учётом переопределений из activeProfile/regModel. */
function effectiveNorm(def, normOverrides) {
  const v = normOverrides && normOverrides[def.id];
  return Number.isFinite(v) ? v : def.normPer1000;
}

// ── Основной расчёт ────────────────────────────────────────────────────────

/**
 * Пересчитывает баланс потребности и обеспеченности для всех типов объектов.
 * @param {object} [normOverrides]  — { [infraId]: нормаПо1000чел } (от regModel)
 * @returns {SocialBalance}
 */
export function recalcSocialBalance(normOverrides = {}) {
  const population = _population;

  const items = INFRA_OBJECTS.map(def => {
    const norm           = effectiveNorm(def, normOverrides);
    const demand         = Math.round(population / 1000 * norm);
    const provided       = sumCapacity(state.socialObjects,  def.id);
    const existing       = sumCapacity(state.contextObjects, def.id);
    const total_available= provided + existing;
    const deficit        = Math.max(0, demand - total_available);
    const surplus        = Math.max(0, total_available - demand);
    const coverage_pct   = demand > 0
      ? Math.round(total_available / demand * 100)
      : (total_available > 0 ? 100 : 0);

    return {
      id: def.id, name: def.name,
      normPer1000: norm, unitType: def.unitType, radiusM: def.radiusM,
      demand, provided, existing, total_available,
      deficit, surplus, coverage_pct
    };
  });

  _balance = { population, items, timestamp: new Date().toISOString() };
  emit('SOCIAL_BALANCE_UPDATED', { balance: _balance });
  return _balance;
}
