import test from 'node:test';
import assert from 'node:assert/strict';
import {
  round, safeDivide, nonNegative, clamp,
  m2ToHa, haToM2, toFraction, toPercent,
  normalizeUnit, parseNumber
} from '../../js/domain/units.js';

test('round: precision control', () => {
  assert.equal(round(3.14159, 2), 3.14);
  assert.equal(round(2.5, 0), 3);
  assert.equal(round(1234.567, 1), 1234.6);
  assert.equal(round(NaN), null);
  assert.equal(round(Infinity), null);
});

test('safeDivide: never NaN/Infinity', () => {
  assert.equal(safeDivide(10, 2), 5);
  assert.equal(safeDivide(10, 0), null, 'division by zero -> null');
  assert.equal(safeDivide(0, 0), null);
  assert.equal(safeDivide(NaN, 5), null);
  assert.equal(safeDivide(5, Infinity), null);
});

test('nonNegative: rejects negative areas', () => {
  assert.equal(nonNegative(100), 100);
  assert.equal(nonNegative(0), 0);
  assert.equal(nonNegative(-1), null, 'negative -> null');
  assert.equal(nonNegative(NaN), null);
});

test('clamp', () => {
  assert.equal(clamp(0.5, 0, 1), 0.5);
  assert.equal(clamp(1.5, 0, 1), 1);
  assert.equal(clamp(-0.5, 0, 1), 0);
});

test('area conversions m2<->ha', () => {
  assert.equal(m2ToHa(15000), 1.5);
  assert.equal(haToM2(2), 20000);
  assert.equal(m2ToHa(0), 0);
});

test('toFraction: accepts 0.7 and 70%', () => {
  assert.equal(toFraction(0.7), 0.7);
  assert.equal(toFraction(70, { isPercent: true }), 0.7);
  assert.equal(toFraction(150, { isPercent: true }), 1, 'clamped to 1');
  assert.equal(toFraction(-5), 0, 'clamped to 0');
});

test('toPercent', () => {
  assert.equal(toPercent(0.7), 70);
});

test('normalizeUnit: canonicalizes RU/EN unit strings', () => {
  assert.equal(normalizeUnit('м2'), 'm2');
  assert.equal(normalizeUnit('м²'), 'm2');
  assert.equal(normalizeUnit('га'), 'ha');
  assert.equal(normalizeUnit('%'), 'percent');
  assert.equal(normalizeUnit('этажей'), 'floors');
  assert.equal(normalizeUnit('чел/га'), 'people_per_ha');
  assert.equal(normalizeUnit('банан'), null);
});

test('parseNumber: RU decimal comma, thousands spaces', () => {
  assert.equal(parseNumber('0,7'), 0.7);
  assert.equal(parseNumber('1 234,5'), 1234.5);
  assert.equal(parseNumber('12000'), 12000);
  assert.equal(parseNumber('—'), null);
  assert.equal(parseNumber(''), null);
  assert.equal(parseNumber(42), 42);
});
