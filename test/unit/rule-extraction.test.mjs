import test from 'node:test';
import assert from 'node:assert/strict';
import { extractRulesFromChunk, extractRulesFromIndex, estimateConfidence } from '../../js/services/rule-extraction/extractRules.js';
import { RULE_CATEGORY, CONFIRM_STATUS } from '../../js/domain/regulations/ruleSchema.js';

function chunk(text, extra = {}) {
  return Object.assign({ documentId: 'D1', documentName: 'ПЗЗ', page: 5, text }, extra);
}

test('extract build coefficient (max)', () => {
  const rules = extractRulesFromChunk(chunk('Коэффициент застройки не более 0,4.'));
  const r = rules.find((x) => x.category === RULE_CATEGORY.BUILD_COEFFICIENT);
  assert.ok(r, 'found build coefficient');
  assert.equal(r.maxValue, 0.4);
  assert.equal(r.page, 5);
});

test('extract floor area ratio (КИТ)', () => {
  const rules = extractRulesFromChunk(chunk('Коэффициент использования территории не более 2,5.'));
  const r = rules.find((x) => x.category === RULE_CATEGORY.FLOOR_AREA_RATIO);
  assert.ok(r);
  assert.equal(r.maxValue, 2.5);
});

test('extract range: от 5 до 12 этажей', () => {
  const rules = extractRulesFromChunk(chunk('Этажность от 5 до 12 этажей.'));
  const r = rules.find((x) => x.category === RULE_CATEGORY.FLOORS);
  assert.ok(r);
  assert.equal(r.minValue, 5);
  assert.equal(r.maxValue, 12);
});

test('extract percent normalization (greenery)', () => {
  const rules = extractRulesFromChunk(chunk('Минимальная доля озеленения не менее 25%.'));
  const r = rules.find((x) => x.category === RULE_CATEGORY.GREENERY_MIN);
  assert.ok(r);
  assert.equal(r.minValue, 25);
});

test('preserves page and snippet', () => {
  const rules = extractRulesFromChunk(chunk('Коэффициент застройки не более 0,4.', { page: 12 }));
  const r = rules[0];
  assert.equal(r.page, 12);
  assert.match(r.snippet, /Коэффициент застройки/);
  assert.equal(r.documentId, 'D1');
});

test('pending confirm status for extracted rules', () => {
  const rules = extractRulesFromChunk(chunk('Коэффициент застройки не более 0,4.'));
  assert.equal(rules[0].confirmStatus, CONFIRM_STATUS.PENDING);
});

test('confidence higher with unit + norm phrasing', () => {
  const withUnit = extractRulesFromChunk(chunk('Плотность населения не более 300 чел/га.'))[0];
  assert.ok(withUnit.confidence >= 0.6, 'confidence ' + withUnit.confidence);
});

test('empty text yields no rules', () => {
  assert.equal(extractRulesFromChunk(chunk('   ')).length, 0);
  assert.equal(extractRulesFromChunk(chunk('Общие положения без чисел.')).length, 0);
});

test('extractRulesFromIndex aggregates multiple pages', () => {
  const idx = [
    chunk('Коэффициент застройки не более 0,4.', { page: 1 }),
    chunk('Этажность от 5 до 12 этажей.', { page: 2 })
  ];
  const rules = extractRulesFromIndex(idx);
  assert.ok(rules.length >= 2);
  assert.ok(rules.some((r) => r.page === 1));
  assert.ok(rules.some((r) => r.page === 2));
});

test('does not invent values when only term present', () => {
  const rules = extractRulesFromChunk(chunk('Устанавливается коэффициент застройки согласно регламенту.'));
  assert.equal(rules.length, 0, 'no number -> no rule (no invention)');
});
