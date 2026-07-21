// core/toast.js — тосты/уведомления вместо голых alert().
// Использует .toast из index.html. Плавно, неблокирующе.

let toastEl = null;
let hideTimer = null;

function ensureEl() {
  if (toastEl) return toastEl;
  toastEl = document.createElement('div');
  toastEl.className = 'toast';
  document.body.appendChild(toastEl);
  return toastEl;
}

export function toast(message, kind = 'info', ms = 2600) {
  const el = ensureEl();
  el.textContent = message;
  el.classList.remove('toast-ok', 'toast-error', 'toast-info');
  el.classList.add('toast-' + kind, 'show');
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => el.classList.remove('show'), ms);
}

export const notifyOk = (m) => toast(m, 'ok');
export const notifyError = (m) => toast(m, 'error', 4000);
export const notifyInfo = (m) => toast(m, 'info');
