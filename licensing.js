// licensing.js — модуль лицензирования (main process).
// Централизует: генерацию machineId, локальную проверку токенов (MVP Local Mode),
// и заготовку под серверную проверку (verifyTokenRemotely).
// Токены НЕ разбросаны по коду — только здесь.

const os = require('os');
const crypto = require('crypto');

// ============================================================
// Local Mode: тестовые валидные токены (Этап 3)
// Заменить/расширить при выдаче клиентам. Единый источник правды.
// ============================================================
const VALID_TOKENS = new Set([
  'TERRA-MVP-2026-DEMO',
  'TERRA-CLIENT-0001',
  'FORMYBROTHER',
  'ADMINEDBYROGAART'
]);

const APP_NAME = 'TerriMind';

// ============================================================
// Этап 4: стабильный machineId для MVP.
// Основа: hostname + platform + arch + первый не-внутренний MAC.
// Не собираем PII, не агрессивно. sha256 → hex (укороченный).
// ============================================================
function getMachineId() {
  let macPart = '';
  try {
    const ifaces = os.networkInterfaces();
    for (const name of Object.keys(ifaces)) {
      for (const ni of ifaces[name] || []) {
        if (!ni.internal && ni.mac && ni.mac !== '00:00:00:00:00:00') {
          macPart = ni.mac;
          break;
        }
      }
      if (macPart) break;
    }
  } catch (e) { /* ok */ }

  const raw = [os.hostname(), os.platform(), os.arch(), macPart].join('|');
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 32);
}

// Нормализация ввода токена
function normalizeToken(token) {
  return (token || '').toString().trim().toUpperCase();
}

// ============================================================
// Локальная проверка токена (Этап 3).
// Возвращает единый формат результата, совместимый с будущим сервером.
// ============================================================
function verifyTokenLocal(token, machineId, appVersion) {
  const norm = normalizeToken(token);

  if (!norm) {
    return { valid: false, code: 'EMPTY', message: 'Введите токен активации.' };
  }
  if (!VALID_TOKENS.has(norm)) {
    return { valid: false, code: 'INVALID', message: 'Неверный токен активации.' };
  }

  // Успех — формируем license/activation по единому контракту (см. Этап 6)
  const now = new Date().toISOString();
  return {
    valid: true,
    code: 'OK',
    message: 'ok',
    license: {
      clientName: 'Local MVP',
      plan: 'mvp',
      expiresAt: null,        // бессрочно в local mode
      maxActivations: 1
    },
    activation: {
      activationId: crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex'),
      machineId: machineId || getMachineId(),
      activatedAt: now
    },
    token: norm
  };
}

// ============================================================
// Этап 6: заготовка серверной проверки.
// Тот же контракт результата, что и verifyTokenLocal.
// Пока STUB: при наличии backend раскомментировать fetch-блок.
// ============================================================
async function verifyTokenRemotely(token, machineId, appVersion, endpoint) {
  // Контракт запроса (см. документацию Этапа 6):
  // POST /api/verify-token
  // { token, machineId, appVersion, appName }
  //
  // Ожидаемый ответ:
  // { valid, message, license:{clientName,plan,expiresAt,maxActivations},
  //   activation:{activationId,machineId,activatedAt} }

  // --- STUB: пока сервера нет — падаем в локальную проверку ---
  // Когда появится backend, заменить на реальный запрос ниже.
  /*
  const res = await fetch(endpoint + '/api/verify-token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      token: normalizeToken(token),
      machineId: machineId || getMachineId(),
      appVersion,
      appName: APP_NAME
    })
  });
  if (!res.ok) {
    return { valid: false, code: 'SERVER', message: 'Сервер недоступен. Попробуйте позже.' };
  }
  return await res.json();
  */

  // Временный фолбэк на локальную проверку (single source of truth)
  return verifyTokenLocal(token, machineId, appVersion);
}

module.exports = {
  APP_NAME,
  getMachineId,
  normalizeToken,
  verifyTokenLocal,
  verifyTokenRemotely
};
