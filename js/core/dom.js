// core/dom.js — безопасные хелперы работы с DOM/полями. Один источник.

export const $ = (id) => document.getElementById(id);

export function getNum(id, def) {
  const el = $(id);
  if (!el) return def;
  const v = parseFloat(el.value);
  return isNaN(v) ? def : v;
}

export function getStr(id, def) {
  const el = $(id);
  return el ? el.value : def;
}

export function setVal(id, val) {
  const el = $(id);
  if (el && val !== undefined && val !== null) el.value = val;
}

export function setText(id, text) {
  const el = $(id);
  if (el) el.textContent = text;
}

export function on(id, event, handler) {
  const el = $(id);
  if (el) el.addEventListener(event, handler);
  return el;
}

// Форматирование числа (ru)
export function fmt(n) {
  return Math.round(n).toLocaleString('ru-RU');
}
