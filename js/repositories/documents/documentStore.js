// repositories/documents/documentStore.js — локальное хранилище PDF-документов и их индекса.
// Работает в main-процессе (Node CommonJS). PDF-файлы и индекс лежат в userData/regulations/,
// НЕ в localStorage. Контроль целостности, миграции, очистка, проверка отсутствующих файлов.

'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const INDEX_VERSION = 1;

class DocumentStore {
  constructor(baseDir) {
    this.baseDir = baseDir;                              // userData/regulations
    this.pdfDir = path.join(baseDir, 'pdfs');
    this.indexPath = path.join(baseDir, 'documents.json');
    this._ensureDirs();
  }

  _ensureDirs() {
    fs.mkdirSync(this.pdfDir, { recursive: true });
  }

  _readIndex() {
    try {
      const raw = fs.readFileSync(this.indexPath, 'utf-8');
      const idx = JSON.parse(raw);
      return this._migrate(idx);
    } catch (e) {
      return { version: INDEX_VERSION, documents: [] };
    }
  }

  _migrate(idx) {
    if (!idx || typeof idx !== 'object') return { version: INDEX_VERSION, documents: [] };
    if (!Array.isArray(idx.documents)) idx.documents = [];
    if (!idx.version) idx.version = INDEX_VERSION;
    return idx;
  }

  _writeIndex(idx) {
    const tmp = this.indexPath + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(idx, null, 2), 'utf-8');
    fs.renameSync(tmp, this.indexPath);
  }

  static sha256(buffer) {
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  static newId() {
    return 'doc_' + crypto.randomBytes(8).toString('hex');
  }

  /** Сохранить PDF-байты + метаданные. buffer уже проверен на безопасность вызывающим. */
  addDocument(buffer, meta) {
    const idx = this._readIndex();
    const id = meta.id || DocumentStore.newId();
    const checksum = DocumentStore.sha256(buffer);

    // safeStoredName встроен, чтобы не тянуть ESM в CommonJS
    const safeBase = (meta.originalName || 'document')
      .replace(/[^\w.\-]+/g, '_').replace(/\.+/g, '.').replace(/^\.+/, '').replace(/\.pdf$/i, '').slice(0, 80) || 'document';
    const storedName = `${id}__${safeBase}.pdf`;
    const storedPath = path.join(this.pdfDir, storedName);

    // Защита от traversal
    const rel = path.relative(this.pdfDir, storedPath);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      throw new Error('Небезопасный путь файла');
    }

    fs.writeFileSync(storedPath, buffer);

    const record = {
      id,
      title: meta.title || meta.originalName || storedName,
      originalName: meta.originalName || null,
      storedName,
      sizeBytes: buffer.length,
      checksum,
      pageCount: meta.pageCount ?? null,
      addedAt: new Date().toISOString(),
      docType: meta.docType || null,
      territory: meta.territory || null,
      documentDate: meta.documentDate || null,
      documentNumber: meta.documentNumber || null,
      documentRevision: meta.documentRevision || null,
      tags: Array.isArray(meta.tags) ? meta.tags : [],
      enabled: meta.enabled !== false,
      hasTextLayer: meta.hasTextLayer ?? null,
      processStatus: meta.processStatus || 'pending',
      processError: null,
      index: [],       // chunks
      rules: []        // extracted candidate rules
    };

    idx.documents = idx.documents.filter((d) => d.id !== id);
    idx.documents.push(record);
    this._writeIndex(idx);
    return record;
  }

  /** Сохранить результат анализа (chunks + rules + статус). */
  setAnalysis(id, { chunks, rules, pageCount, hasTextLayer, error }) {
    const idx = this._readIndex();
    const doc = idx.documents.find((d) => d.id === id);
    if (!doc) return null;
    if (error) {
      doc.processStatus = 'error';
      doc.processError = String(error);
    } else {
      doc.index = chunks || [];
      doc.rules = rules || [];
      doc.pageCount = pageCount ?? doc.pageCount;
      doc.hasTextLayer = hasTextLayer ?? doc.hasTextLayer;
      doc.processStatus = 'done';
      doc.processError = null;
    }
    this._writeIndex(idx);
    return doc;
  }

  updateMeta(id, patch) {
    const idx = this._readIndex();
    const doc = idx.documents.find((d) => d.id === id);
    if (!doc) return null;
    const allowed = ['title', 'docType', 'territory', 'documentDate', 'documentNumber', 'documentRevision', 'tags', 'enabled'];
    for (const k of allowed) if (k in patch) doc[k] = patch[k];
    this._writeIndex(idx);
    return doc;
  }

  removeDocument(id) {
    const idx = this._readIndex();
    const doc = idx.documents.find((d) => d.id === id);
    if (!doc) return false;
    try {
      const p = path.join(this.pdfDir, doc.storedName);
      if (fs.existsSync(p)) fs.unlinkSync(p);
    } catch (e) { /* ignore */ }
    idx.documents = idx.documents.filter((d) => d.id !== id);
    this._writeIndex(idx);
    return true;
  }

  getPdfPath(id) {
    const idx = this._readIndex();
    const doc = idx.documents.find((d) => d.id === id);
    if (!doc) return null;
    return path.join(this.pdfDir, doc.storedName);
  }

  readPdf(id) {
    const p = this.getPdfPath(id);
    if (!p || !fs.existsSync(p)) return null;
    return fs.readFileSync(p);
  }

  /** Список документов (без тяжёлых index/rules — по флагу). */
  listDocuments({ withIndex = false } = {}) {
    const idx = this._readIndex();
    return idx.documents.map((d) => {
      const missing = !fs.existsSync(path.join(this.pdfDir, d.storedName));
      const base = Object.assign({}, d, { missing });
      if (!withIndex) {
        delete base.index;  // chunks — могут быть очень большими
        delete base.rules;  // extracted rules — тоже тяжёлые, не нужны в списке
      }
      return base;
    });
  }

  getDocument(id, { withIndex = true } = {}) {
    const idx = this._readIndex();
    const d = idx.documents.find((x) => x.id === id);
    if (!d) return null;
    const missing = !fs.existsSync(path.join(this.pdfDir, d.storedName));
    const base = Object.assign({}, d, { missing });
    if (!withIndex) delete base.index;
    return base;
  }

  /** Все активные (enabled, done) правила из всех документов. */
  allActiveRules() {
    const idx = this._readIndex();
    const rules = [];
    for (const d of idx.documents) {
      if (!d.enabled || d.processStatus !== 'done') continue;
      for (const r of d.rules || []) rules.push(r);
    }
    return rules;
  }

  /** Проверка целостности хранилища: сверяет checksum и наличие файлов. */
  verifyIntegrity() {
    const idx = this._readIndex();
    const report = [];
    for (const d of idx.documents) {
      const p = path.join(this.pdfDir, d.storedName);
      if (!fs.existsSync(p)) { report.push({ id: d.id, status: 'missing' }); continue; }
      const buf = fs.readFileSync(p);
      const ok = DocumentStore.sha256(buf) === d.checksum;
      report.push({ id: d.id, status: ok ? 'ok' : 'checksum_mismatch' });
    }
    return report;
  }

  /** Очистка «сиротских» PDF-файлов (нет записи в индексе). */
  cleanupOrphans() {
    const idx = this._readIndex();
    const known = new Set(idx.documents.map((d) => d.storedName));
    let removed = 0;
    for (const f of fs.readdirSync(this.pdfDir)) {
      if (!known.has(f)) { try { fs.unlinkSync(path.join(this.pdfDir, f)); removed++; } catch (e) {} }
    }
    return removed;
  }
}

module.exports = { DocumentStore, INDEX_VERSION };
