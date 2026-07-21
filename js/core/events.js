// core/events.js — минимальная шина событий (pub/sub).
// Разрывает жёсткие связи между модулями: геометрия эмитит, UI слушает.

const listeners = new Map();

export function on(event, handler) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(handler);
  return () => off(event, handler);
}

export function off(event, handler) {
  const set = listeners.get(event);
  if (set) set.delete(handler);
}

export function emit(event, payload) {
  const set = listeners.get(event);
  if (!set) return;
  for (const h of set) {
    try { h(payload); } catch (e) { console.error('event handler error', event, e); }
  }
}
