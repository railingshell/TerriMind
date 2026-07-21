// workers/pdf-worker.js — фоновый анализ PDF (utilityProcess). Изолирует тяжёлую обработку
// от main и renderer. Получает { id, path, meta }, извлекает текст, строит chunks + rules,
// шлёт прогресс, возвращает результат. Тайм-аут и отмена поддерживаются.
'use strict';

const fs = require('fs');
const { PDF_LIMITS } = { PDF_LIMITS: { ANALYZE_TIMEOUT_MS: 60000 } };

// ESM-сервисы грузим динамически (worker — CommonJS)
async function services() {
  const extract = await import('../services/pdf-processing/pdfExtract.js');
  const rules = await import('../services/rule-extraction/extractRules.js');
  return { extract, rules };
}

const active = new Map(); // id -> AbortController

function send(msg) { if (process.parentPort) process.parentPort.postMessage(msg); }

async function analyze(job) {
  const { id, path: pdfPath, meta } = job;
  const controller = new AbortController();
  active.set(id, controller);

  const timeout = setTimeout(() => controller.abort(), (meta && meta.timeoutMs) || 60000);

  try {
    const buf = fs.readFileSync(pdfPath);
    const bytes = new Uint8Array(buf.length);
    bytes.set(buf);

    const { extract, rules } = await services();

    const extraction = await extract.extractText(bytes, {
      signal: controller.signal,
      onProgress: (page, total) => send({ type: 'progress', id, page, total })
    });

    if (!extraction.hasTextLayer) {
      // Честно сообщаем: нет текстового слоя (OCR не реализован)
      send({
        type: 'done', id,
        result: { pageCount: extraction.pageCount, hasTextLayer: false, chunks: [], rules: [], note: 'no_text_layer' }
      });
      return;
    }

    const chunks = extract.buildChunks(extraction, {
      documentId: id,
      documentName: (meta && meta.documentName) || null,
      documentDate: (meta && meta.documentDate) || null,
      documentRevision: (meta && meta.documentRevision) || null
    });
    const extracted = rules.extractRulesFromIndex(chunks);

    send({
      type: 'done', id,
      result: { pageCount: extraction.pageCount, hasTextLayer: true, chunks, rules: extracted }
    });
  } catch (err) {
    const aborted = controller.signal.aborted;
    send({ type: 'error', id, error: aborted ? 'Анализ отменён/тайм-аут' : String(err && err.message || err) });
  } finally {
    clearTimeout(timeout);
    active.delete(id);
  }
}

if (process.parentPort) {
  process.parentPort.on('message', (e) => {
    const msg = e.data || e;
    if (!msg || !msg.type) return;
    if (msg.type === 'analyze') analyze(msg.job);
    else if (msg.type === 'cancel') {
      const c = active.get(msg.id);
      if (c) c.abort();
    }
  });
}

module.exports = { analyze };
