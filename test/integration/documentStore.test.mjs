import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { DocumentStore } = require('../../js/repositories/documents/documentStore.js');

function tmpStore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tmstore-'));
  return new DocumentStore(dir);
}
const PDF = Buffer.from('%PDF-1.4\nhello\n%%EOF', 'latin1');

test('add + list document, stored locally', () => {
  const s = tmpStore();
  const rec = s.addDocument(PDF, { originalName: 'ПЗЗ.pdf', title: 'ПЗЗ' });
  assert.ok(rec.id);
  assert.ok(fs.existsSync(s.getPdfPath(rec.id)), 'pdf written to disk');
  const list = s.listDocuments();
  assert.equal(list.length, 1);
  assert.equal(list[0].missing, false);
});

test('safe stored name blocks traversal chars', () => {
  const s = tmpStore();
  const rec = s.addDocument(PDF, { originalName: '../../evil.pdf' });
  assert.ok(!rec.storedName.includes('..'));
  assert.ok(!rec.storedName.includes('/'));
});

test('checksum + integrity verify', () => {
  const s = tmpStore();
  const rec = s.addDocument(PDF, { originalName: 'a.pdf' });
  const report = s.verifyIntegrity();
  assert.equal(report[0].status, 'ok');
  // corrupt file
  fs.writeFileSync(s.getPdfPath(rec.id), Buffer.from('%PDF-corrupt'));
  assert.equal(s.verifyIntegrity()[0].status, 'checksum_mismatch');
});

test('setAnalysis stores chunks + rules; allActiveRules', () => {
  const s = tmpStore();
  const rec = s.addDocument(PDF, { originalName: 'a.pdf' });
  s.setAnalysis(rec.id, {
    chunks: [{ page: 1, text: 'x' }],
    rules: [{ id: 'r1', category: 'floors', maxValue: 12 }],
    pageCount: 1, hasTextLayer: true
  });
  const doc = s.getDocument(rec.id);
  assert.equal(doc.processStatus, 'done');
  assert.equal(doc.rules.length, 1);
  assert.equal(s.allActiveRules().length, 1);
});

test('disabled document excluded from active rules', () => {
  const s = tmpStore();
  const rec = s.addDocument(PDF, { originalName: 'a.pdf' });
  s.setAnalysis(rec.id, { chunks: [], rules: [{ id: 'r1', category: 'floors' }], pageCount: 1, hasTextLayer: true });
  s.updateMeta(rec.id, { enabled: false });
  assert.equal(s.allActiveRules().length, 0);
});

test('setAnalysis error path', () => {
  const s = tmpStore();
  const rec = s.addDocument(PDF, { originalName: 'a.pdf' });
  s.setAnalysis(rec.id, { error: 'No text layer' });
  const doc = s.getDocument(rec.id);
  assert.equal(doc.processStatus, 'error');
  assert.match(doc.processError, /No text layer/);
});

test('remove document deletes file + record', () => {
  const s = tmpStore();
  const rec = s.addDocument(PDF, { originalName: 'a.pdf' });
  const p = s.getPdfPath(rec.id);
  assert.equal(s.removeDocument(rec.id), true);
  assert.equal(fs.existsSync(p), false);
  assert.equal(s.listDocuments().length, 0);
});

test('missing file flagged', () => {
  const s = tmpStore();
  const rec = s.addDocument(PDF, { originalName: 'a.pdf' });
  fs.unlinkSync(s.getPdfPath(rec.id));
  assert.equal(s.listDocuments()[0].missing, true);
  assert.equal(s.verifyIntegrity()[0].status, 'missing');
});

test('cleanup orphans', () => {
  const s = tmpStore();
  s.addDocument(PDF, { originalName: 'a.pdf' });
  fs.writeFileSync(path.join(s.pdfDir, 'orphan.pdf'), PDF);
  const removed = s.cleanupOrphans();
  assert.equal(removed, 1);
});

test('index persists across store instances', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tmstore-'));
  const s1 = new DocumentStore(dir);
  const rec = s1.addDocument(PDF, { originalName: 'a.pdf' });
  const s2 = new DocumentStore(dir);
  assert.equal(s2.getDocument(rec.id).id, rec.id);
});
