import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRule, RULE_CATEGORY, RULE_SOURCE, checkCompliance, sourcePriority, CONFIRM_STATUS } from '../../js/domain/regulations/ruleSchema.js';
import { resolveCategory, CONFLICT_STATUS, pickByPriority } from '../../js/domain/regulations/resolveConflicts.js';
import { isApplicable } from '../../js/domain/regulations/applicability.js';
import { buildRuleset, flattenApplied } from '../../js/domain/regulations/ruleset.js';
import { BUILTIN_PROFILES, createProfile, cloneProfile, bumpVersion, revertToVersion, compareProfiles, mergeProfiles, migrateProfile } from '../../js/domain/regulations/profiles.js';

test('sourcePriority: manual pin highest', () => {
  assert.ok(sourcePriority(RULE_SOURCE.MANUAL_PIN) < sourcePriority(RULE_SOURCE.LOCAL_NORM));
  assert.ok(sourcePriority(RULE_SOURCE.LOCAL_NORM) < sourcePriority(RULE_SOURCE.GENERAL_NORM));
  assert.ok(sourcePriority(RULE_SOURCE.GENERAL_NORM) < sourcePriority(RULE_SOURCE.BUILTIN_DEMO));
});

test('checkCompliance: exceeds/below/compliant', () => {
  const r = makeRule({ category: RULE_CATEGORY.BUILD_COEFFICIENT, minValue: 0.1, maxValue: 0.4 });
  assert.equal(checkCompliance(r, 0.5), 'exceeds');
  assert.equal(checkCompliance(r, 0.05), 'below_min');
  assert.equal(checkCompliance(r, 0.25), 'compliant');
  assert.equal(checkCompliance(r, NaN), 'no_data');
});

test('checkCompliance: near_limit', () => {
  const r = makeRule({ category: RULE_CATEGORY.FLOOR_AREA_RATIO, minValue: 0, maxValue: 3 });
  assert.equal(checkCompliance(r, 2.9), 'near_limit');
});

test('conflict: higher priority wins automatically', () => {
  const local = makeRule({ category: RULE_CATEGORY.BUILD_COEFFICIENT, maxValue: 0.4, source: RULE_SOURCE.LOCAL_NORM, documentId: 'A' });
  const general = makeRule({ category: RULE_CATEGORY.BUILD_COEFFICIENT, maxValue: 0.3, source: RULE_SOURCE.GENERAL_NORM, documentId: 'B' });
  const res = resolveCategory(RULE_CATEGORY.BUILD_COEFFICIENT, [general, local]);
  assert.equal(res.status, CONFLICT_STATUS.RESOLVED_AUTO);
  assert.equal(res.chosen.source, RULE_SOURCE.LOCAL_NORM);
});

test('conflict: equal priority + different values -> needs confirm (no random)', () => {
  const a = makeRule({ category: RULE_CATEGORY.FLOORS, maxValue: 12, source: RULE_SOURCE.LOCAL_NORM, documentId: 'A', documentDate: '2020-01-01' });
  const b = makeRule({ category: RULE_CATEGORY.FLOORS, maxValue: 16, source: RULE_SOURCE.LOCAL_NORM, documentId: 'B', documentDate: '2023-01-01' });
  const res = resolveCategory(RULE_CATEGORY.FLOORS, [a, b]);
  assert.equal(res.status, CONFLICT_STATUS.NEEDS_CONFIRM);
  assert.equal(res.chosen, null, 'never auto-picks on tie');
  assert.equal(res.suggested.documentId, 'B', 'suggests newer doc');
});

test('conflict: identical values not a conflict', () => {
  const a = makeRule({ category: RULE_CATEGORY.FLOORS, maxValue: 12, source: RULE_SOURCE.LOCAL_NORM, documentId: 'A' });
  const b = makeRule({ category: RULE_CATEGORY.FLOORS, maxValue: 12, source: RULE_SOURCE.LOCAL_NORM, documentId: 'B' });
  const res = resolveCategory(RULE_CATEGORY.FLOORS, [a, b]);
  assert.equal(res.status, CONFLICT_STATUS.RESOLVED_AUTO);
});

test('conflict: user lock overrides priority', () => {
  const local = makeRule({ category: RULE_CATEGORY.BUILD_COEFFICIENT, maxValue: 0.4, source: RULE_SOURCE.LOCAL_NORM });
  const general = makeRule({ category: RULE_CATEGORY.BUILD_COEFFICIENT, maxValue: 0.3, source: RULE_SOURCE.GENERAL_NORM, locked: true });
  const res = resolveCategory(RULE_CATEGORY.BUILD_COEFFICIENT, [local, general]);
  assert.equal(res.status, CONFLICT_STATUS.RESOLVED_USER);
  assert.equal(res.chosen.maxValue, 0.3);
});

test('applicability: territory mismatch excludes', () => {
  const r = makeRule({ category: RULE_CATEGORY.FLOORS, territory: 'Москва' });
  assert.equal(isApplicable(r, { territory: 'Москва' }), true);
  assert.equal(isApplicable(r, { territory: 'Казань' }), false);
});

test('applicability: condition on parcelAreaM2', () => {
  const r = makeRule({ category: RULE_CATEGORY.FLOORS, condition: { field: 'parcelAreaM2', op: '>', value: 10000 } });
  assert.equal(isApplicable(r, { parcelAreaM2: 20000 }), true);
  assert.equal(isApplicable(r, { parcelAreaM2: 5000 }), false);
});

test('buildRuleset: confirmed applied, pending PDF rules not applied', () => {
  const pdfRule = makeRule({ category: RULE_CATEGORY.BUILD_COEFFICIENT, maxValue: 0.35, source: RULE_SOURCE.LOCAL_NORM, documentId: 'D1', confirmStatus: CONFIRM_STATUS.PENDING });
  const manual = makeRule({ category: RULE_CATEGORY.FLOORS, maxValue: 12, source: RULE_SOURCE.MANUAL_PIN, confirmStatus: CONFIRM_STATUS.CONFIRMED });
  const rs = buildRuleset([pdfRule, manual], {});
  assert.ok(rs.applied.some((r) => r.category === RULE_CATEGORY.FLOORS), 'manual applied');
  assert.ok(rs.pending.some((r) => r.category === RULE_CATEGORY.BUILD_COEFFICIENT), 'pending PDF not applied');
  assert.ok(!rs.applied.some((r) => r.category === RULE_CATEGORY.BUILD_COEFFICIENT));
});

test('buildRuleset: autoApplyResolved applies pending', () => {
  const pdfRule = makeRule({ category: RULE_CATEGORY.BUILD_COEFFICIENT, maxValue: 0.35, source: RULE_SOURCE.LOCAL_NORM, documentId: 'D1', confirmStatus: CONFIRM_STATUS.PENDING });
  const rs = buildRuleset([pdfRule], {}, { autoApplyResolved: true });
  assert.ok(rs.applied.some((r) => r.category === RULE_CATEGORY.BUILD_COEFFICIENT));
});

test('flattenApplied: category->value map', () => {
  const manual = makeRule({ category: RULE_CATEGORY.FLOORS, appliedValue: 12, source: RULE_SOURCE.MANUAL_PIN, confirmStatus: CONFIRM_STATUS.CONFIRMED });
  const rs = buildRuleset([manual], {});
  const map = flattenApplied(rs);
  assert.equal(map[RULE_CATEGORY.FLOORS].value, 12);
});

test('builtin profiles: demo flagged', () => {
  assert.equal(BUILTIN_PROFILES.compact.demo, true);
  assert.ok(BUILTIN_PROFILES.compact.rules.length > 0);
  assert.equal(BUILTIN_PROFILES.balanced.rules[0].source, RULE_SOURCE.BUILTIN_DEMO);
});

test('profile versioning: bump + revert', () => {
  let p = createProfile('Test', [makeRule({ category: RULE_CATEGORY.FLOORS, maxValue: 9 })]);
  assert.equal(p.version, 1);
  p = bumpVersion(p, 'edit');
  assert.equal(p.version, 2);
  assert.equal(p.history.length, 1);
  assert.equal(p.history[0].version, 1);
});

test('profile revert restores rules', () => {
  let p = createProfile('T', [makeRule({ id: 'r1', category: RULE_CATEGORY.FLOORS, maxValue: 9 })]);
  p = bumpVersion(p, 'v1 snapshot');
  p.rules = [makeRule({ id: 'r1', category: RULE_CATEGORY.FLOORS, maxValue: 20 })];
  const reverted = revertToVersion(p, 1);
  assert.equal(reverted.rules[0].maxValue, 9);
});

test('compareProfiles: reports diffs', () => {
  const a = createProfile('A', [makeRule({ category: RULE_CATEGORY.FLOORS, recommendedValue: 9 })]);
  const b = createProfile('B', [makeRule({ category: RULE_CATEGORY.FLOORS, recommendedValue: 16 })]);
  const diff = compareProfiles(a, b);
  assert.equal(diff.length, 1);
  assert.equal(diff[0].a, 9);
  assert.equal(diff[0].b, 16);
});

test('mergeProfiles: higher priority overrides', () => {
  const a = createProfile('A', [makeRule({ category: RULE_CATEGORY.FLOORS, recommendedValue: 9, source: RULE_SOURCE.GENERAL_NORM })]);
  const b = createProfile('B', [makeRule({ category: RULE_CATEGORY.FLOORS, recommendedValue: 16, source: RULE_SOURCE.LOCAL_NORM })]);
  const merged = mergeProfiles([a, b], 'M');
  assert.equal(merged.rules.length, 1);
  assert.equal(merged.rules[0].recommendedValue, 16, 'local norm wins');
});

test('migrateProfile: adds schema fields', () => {
  const old = { name: 'Old', rules: [{ category: 'floors', maxValue: 9 }] };
  const m = migrateProfile(old);
  assert.equal(m.schemaVersion, 1);
  assert.equal(m.rules[0].manualOverride, false);
});
