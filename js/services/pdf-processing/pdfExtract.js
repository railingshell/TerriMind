// services/pdf-processing/pdfExtract.js — локальное извлечение текста из PDF через pdfjs-dist.
// Выполняется в Node (main/worker), НЕ в renderer. Сохраняет привязку к страницам/разделам.
// Запрещает выполнение встроенного JS (pdfjs по умолчанию не исполняет скрипты PDF).

import { PDF_LIMITS } from './pdfSecurity.js';

let _pdfjs = null;
async function getPdfjs() {
  if (_pdfjs) return _pdfjs;
  // legacy build работает в Node без DOM
  _pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  return _pdfjs;
}

/**
 * Извлекает текст постранично.
 * @param {Uint8Array|Buffer} data — байты PDF
 * @param {object} opts — { maxPages, onProgress(page,total), signal }
 * @returns {Promise<{ pages: {page, text, headings[]}[], pageCount, hasTextLayer }>}
 */
export async function extractText(data, opts = {}) {
  if (opts.signal && opts.signal.aborted) throw new Error('Анализ отменён');
  const pdfjs = await getPdfjs();
  // pdfjs v4 требует «чистый» Uint8Array (не Node Buffer). Копируем в новый массив.
  const bytes = new Uint8Array(data.byteLength !== undefined ? data.byteLength : data.length);
  bytes.set(data);

  const loadingTask = pdfjs.getDocument({
    data: bytes,
    isEvalSupported: false,     // не исполнять встроенный JS/выражения
    disableFontFace: true,
    useSystemFonts: false
  });

  const doc = await loadingTask.promise;
  try {
    const pageCount = doc.numPages;
    if (pageCount > PDF_LIMITS.MAX_PAGES) {
      throw new Error('Документ превышает лимит страниц (' + PDF_LIMITS.MAX_PAGES + ')');
    }
    const maxPages = Math.min(pageCount, opts.maxPages || PDF_LIMITS.MAX_PAGES);
    const pages = [];
    let anyText = false;

    for (let p = 1; p <= maxPages; p++) {
      if (opts.signal && opts.signal.aborted) throw new Error('Анализ отменён');
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      const { text, headings } = assembleText(content);
      if (text.trim()) anyText = true;
      pages.push({ page: p, text, headings });
      page.cleanup();
      if (typeof opts.onProgress === 'function') opts.onProgress(p, maxPages);
    }

    return { pages, pageCount, hasTextLayer: anyText };
  } finally {
    await doc.destroy();
  }
}

/**
 * Собирает текст из items pdfjs, восстанавливая строки по Y-координате.
 * Заголовки эвристически: короткие строки с крупным шрифтом / без завершающей точки.
 */
function assembleText(content) {
  const items = content.items || [];
  const lines = [];
  let current = null;
  let lastY = null;

  for (const it of items) {
    const str = it.str || '';
    const y = it.transform ? it.transform[5] : 0;
    const h = it.height || (it.transform ? Math.abs(it.transform[3]) : 0);
    if (lastY === null || Math.abs(y - lastY) > (h || 6) * 0.6) {
      if (current) lines.push(current);
      current = { text: str, y, maxH: h };
      lastY = y;
    } else {
      current.text += (it.hasEOL ? '\n' : '') + str;
      current.maxH = Math.max(current.maxH, h);
    }
  }
  if (current) lines.push(current);

  const heights = lines.map((l) => l.maxH).filter((x) => x > 0);
  const medianH = heights.length ? heights.slice().sort((a, b) => a - b)[Math.floor(heights.length / 2)] : 0;

  const headings = [];
  const textParts = [];
  for (const l of lines) {
    const t = l.text.trim();
    if (!t) continue;
    textParts.push(t);
    const isHeading = medianH > 0 && l.maxH > medianH * 1.25 && t.length < 120 && !/[.;]$/.test(t);
    if (isHeading) headings.push(t);
  }

  return { text: textParts.join('\n'), headings };
}

/**
 * Строит индексируемые фрагменты из результата extractText.
 * @returns {chunk[]} — { documentId, documentName, page, section, text }
 */
export function buildChunks(extraction, meta = {}) {
  const chunks = [];
  for (const pg of extraction.pages || []) {
    chunks.push({
      documentId: meta.documentId || null,
      documentName: meta.documentName || null,
      page: pg.page,
      section: (pg.headings && pg.headings[0]) || null,
      text: pg.text,
      documentDate: meta.documentDate || null,
      documentRevision: meta.documentRevision || null
    });
  }
  return chunks;
}
