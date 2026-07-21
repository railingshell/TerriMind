import test from 'node:test';
import assert from 'node:assert/strict';

// regModel uses localStorage only in load/save; stub it for Node.
globalThis.localStorage = {
  _d: {},
  getItem(k) { return this._d[k] ?? null; },
  setItem(k, v) { this._d[k] = String(v); },
  removeItem(k) { delete this._d[k]; }
};

const { getRegModel, MODE } = await import('../../js/renderer/features/regulations/regModel.js');
const { RULE_CATEGORY } = await import('../../js/domain/regulations/ruleSchema.js');

test('default mode is manual', () => {
  const m = getRegModel();
  assert.equal(m.getMode(), MODE.MANUAL);
});

test('manual values preserved across mode switch', () => {
  const m = getRegModel();
  m.setManual(RULE_CATEGORY.BUILD_COEFFICIENT, 0.3);
  assert.equal(m.getManual(RULE_CATEGORY.BUILD_COEFFICIENT), 0.3);
  m.setMode(MODE.AUTO);
  assert.equal(m.getManual(RULE_CATEGORY.BUILD_COEFFICIENT), 0.3, 'manual survives auto');
  m.setMode(MODE.MANUAL);
  assert.equal(m.getManual(RULE_CATEGORY.BUILD_COEFFICIENT), 0.3, 'manual survives back to manual');
});

test('manual applied as high-priority rule', () => {
  const m = getRegModel();
  m.setManual(RULE_CATEGORY.FLOORS, 12);
  const applied = m.appliedMap();
  assert.equal(applied[RULE_CATEGORY.FLOORS].value, 12);
  assert.equal(applied[RULE_CATEGORY.FLOORS].rule.source, 'manual_pin');
});

test('auto mode: PDF rules pending until confirmed', () => {
  const m = getRegModel();
  m.setManual(RULE_CATEGORY.FLOORS, null); // clear
  m.setMode(MODE.AUTO);
  m.setPdfRules([
    { id: 'pdf1', category: RULE_CATEGORY.GREENERY_MIN, minValue: 25, source: 'local_norm', documentId: 'D1', confirmStatus: 'pending', priority: 5 }
  ]);
  const rs = m.ruleset();
  assert.ok(rs.pending.some((r) => r.id === 'pdf1'), 'pending until confirmed');
  assert.ok(!rs.applied.some((r) => r.id === 'pdf1'));
});

test('confirm PDF rule -> applied', () => {
  const m = getRegModel();
  m.setPdfRules([
    { id: 'pdf2', category: RULE_CATEGORY.GREENERY_MIN, minValue: 25, source: 'local_norm', documentId: 'D1', confirmStatus: 'pending', priority: 5 }
  ]);
  m.confirmRule('pdf2', 'confirmed');
  const rs = m.ruleset();
  assert.ok(rs.applied.some((r) => r.id === 'pdf2'), 'confirmed applied');
});

test('reject PDF rule -> not applied, not pending', () => {
  const m = getRegModel();
  m.setPdfRules([
    { id: 'pdf3', category: RULE_CATEGORY.PARKING, minValue: 1, source: 'local_norm', documentId: 'D1', confirmStatus: 'pending', priority: 5 }
  ]);
  m.confirmRule('pdf3', 'rejected');
  const rs = m.ruleset();
  assert.ok(!rs.applied.some((r) => r.id === 'pdf3'));
});

test('serialize/deserialize round-trip keeps manual + mode', () => {
  const m = getRegModel();
  m.setMode(MODE.MANUAL);
  m.setManual(RULE_CATEGORY.MAX_HEIGHT, 75);
  const snap = m.serialize();
  m.setManual(RULE_CATEGORY.MAX_HEIGHT, null);
  m.deserialize(snap);
  assert.equal(m.getManual(RULE_CATEGORY.MAX_HEIGHT), 75);
  assert.equal(m.getMode(), MODE.MANUAL);
});

test('fart composition toggles', () => {
  const m = getRegModel();
  assert.equal(m.fartComposition().includeUnderground, false);
  m.setFart({ includeUnderground: true });
  assert.equal(m.fartComposition().includeUnderground, true);
});
