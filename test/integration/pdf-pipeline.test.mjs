import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { extractText, buildChunks } from '../../js/services/pdf-processing/pdfExtract.js';
import { validatePdfInput, hasPdfMagic, safeStoredName, isPathInside, hasValidExtension } from '../../js/services/pdf-processing/pdfSecurity.js';
import { extractRulesFromIndex } from '../../js/services/rule-extraction/extractRules.js';
import { RULE_CATEGORY } from '../../js/domain/regulations/ruleSchema.js';

const dir = path.dirname(url.fileURLToPath(import.meta.url));
const fixtures = path.join(dir, '..', 'fixtures');
const pzzBytes = fs.readFileSync(path.join(fixtures, 'pzz.pdf'));

test('security: valid PDF passes', () => {
  const r = validatePdfInput({ name: 'pzz.pdf', size: pzzBytes.length, buffer: pzzBytes });
  assert.equal(r.ok, true);
});

test('security: rejects wrong extension', () => {
  const r = validatePdfInput({ name: 'doc.txt', size: 100, buffer: Buffer.from('%PDF-') });
  assert.equal(r.ok, false);
});

test('security: rejects non-PDF content (bad magic)', () => {
  const r = validatePdfInput({ name: 'fake.pdf', size: 10, buffer: Buffer.from('HELLO WORLD') });
  assert.equal(r.ok, false);
});

test('security: rejects oversize', () => {
  const r = validatePdfInput({ name: 'big.pdf', size: 200 * 1024 * 1024, buffer: Buffer.from('%PDF-') });
  assert.equal(r.ok, false);
});

test('security: hasPdfMagic', () => {
  assert.equal(hasPdfMagic(Buffer.from('%PDF-1.4')), true);
  assert.equal(hasPdfMagic(Buffer.from('nope')), false);
});

test('security: safeStoredName strips traversal', () => {
  const name = safeStoredName('../../etc/passwd.pdf', 'doc123');
  assert.ok(!name.includes('..'));
  assert.ok(!name.includes('/'));
  assert.match(name, /^doc123__/);
});

test('security: isPathInside blocks traversal', () => {
  assert.equal(isPathInside('/data', '/data/sub/file.pdf'), true);
  assert.equal(isPathInside('/data', '/etc/passwd'), false);
});

test('security: hasValidExtension', () => {
  assert.equal(hasValidExtension('a.pdf'), true);
  assert.equal(hasValidExtension('a.PDF'), true);
  assert.equal(hasValidExtension('a.exe'), false);
});

test('extract text from multi-page PDF with page attribution', async () => {
  const res = await extractText(pzzBytes);
  assert.equal(res.pageCount, 2);
  assert.equal(res.hasTextLayer, true);
  assert.match(res.pages[0].text, /Building coverage/);
  assert.match(res.pages[1].text, /Greenery/i);
});

test('buildChunks preserves page numbers', async () => {
  const res = await extractText(pzzBytes);
  const chunks = buildChunks(res, { documentId: 'D1', documentName: 'ПЗЗ' });
  assert.equal(chunks.length, 2);
  assert.equal(chunks[0].page, 1);
  assert.equal(chunks[1].page, 2);
});

test('full pipeline: PDF -> chunks -> rules', async () => {
  const res = await extractText(pzzBytes);
  const chunks = buildChunks(res, { documentId: 'D1', documentName: 'ПЗЗ' });
  const rules = extractRulesFromIndex(chunks);

  const kz = rules.find((r) => r.category === RULE_CATEGORY.BUILD_COEFFICIENT);
  assert.ok(kz, 'build coefficient extracted from real PDF');
  assert.equal(kz.maxValue, 0.4);
  assert.equal(kz.page, 1);

  const kit = rules.find((r) => r.category === RULE_CATEGORY.FLOOR_AREA_RATIO);
  assert.ok(kit, 'FAR extracted');
  assert.equal(kit.maxValue, 2.5);
  assert.equal(kit.page, 2);

  const floors = rules.find((r) => r.category === RULE_CATEGORY.FLOORS);
  assert.ok(floors);
  assert.equal(floors.minValue, 5);
  assert.equal(floors.maxValue, 12);
});

test('cancel via signal aborts extraction', async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(() => extractText(pzzBytes, { signal: controller.signal }), /отмен/i);
});
