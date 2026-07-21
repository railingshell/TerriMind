// services/pdf-processing/pdfSecurity.js — валидация недоверенных PDF. Чистые функции (кроме fs-стата,
// который передаётся снаружи). Проверки: MIME/расширение/размер/имя/path-traversal/магия PDF.

import path from 'node:path';

export const PDF_LIMITS = Object.freeze({
  MAX_BYTES: 100 * 1024 * 1024,   // 100 МБ
  MAX_PAGES: 2000,
  ANALYZE_TIMEOUT_MS: 60000
});

const PDF_MAGIC = Buffer.from('%PDF-');

/** Проверка сигнатуры PDF (первые байты). */
export function hasPdfMagic(buffer) {
  if (!buffer || buffer.length < 5) return false;
  return buffer.subarray(0, 5).equals(PDF_MAGIC);
}

/** Проверка расширения. */
export function hasValidExtension(filename) {
  return typeof filename === 'string' && path.extname(filename).toLowerCase() === '.pdf';
}

/** Безопасное имя файла для локального хранения (без path traversal). */
export function safeStoredName(originalName, id) {
  const base = (originalName || 'document')
    .replace(/[^\p{L}\p{N}._-]+/gu, '_')   // только буквы/цифры/._-
    .replace(/\.+/g, '.')                   // схлопнуть точки
    .replace(/^\.+/, '')                    // убрать ведущие точки
    .slice(0, 80);
  const safeBase = base.replace(/\.pdf$/i, '') || 'document';
  return `${id}__${safeBase}.pdf`;
}

/** Защита от path traversal: результирующий путь обязан быть внутри baseDir. */
export function isPathInside(baseDir, targetPath) {
  const rel = path.relative(path.resolve(baseDir), path.resolve(targetPath));
  return !!rel && !rel.startsWith('..') && !path.isAbsolute(rel);
}

/**
 * Полная проверка входного PDF.
 * @param {object} file — { name, size, buffer }
 * @returns {{ ok: boolean, reason?: string }}
 */
export function validatePdfInput(file) {
  if (!file) return { ok: false, reason: 'Нет файла' };
  if (!hasValidExtension(file.name)) return { ok: false, reason: 'Расширение не .pdf' };
  if (typeof file.size === 'number' && file.size > PDF_LIMITS.MAX_BYTES) {
    return { ok: false, reason: 'Файл превышает лимит ' + Math.round(PDF_LIMITS.MAX_BYTES / 1024 / 1024) + ' МБ' };
  }
  if (file.buffer && !hasPdfMagic(file.buffer)) {
    return { ok: false, reason: 'Файл не является PDF (нет сигнатуры %PDF-)' };
  }
  return { ok: true };
}
