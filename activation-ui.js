// activation-ui.js — логика экрана активации (renderer).
// Общается с main только через безопасный preload API (window.terrilicense).

const tokenInput = document.getElementById('token');
const btn = document.getElementById('activateBtn');
const statusEl = document.getElementById('status');

function setStatus(text, kind) {
  statusEl.textContent = text || '';
  statusEl.className = 'status ' + (kind || 'info');
}

// Понятные сообщения по кодам ошибок (Этап 7)
function messageForCode(code, fallback) {
  switch (code) {
    case 'EMPTY':      return 'Введите токен активации.';
    case 'INVALID':    return 'Неверный токен. Проверьте и попробуйте снова.';
    case 'ACTIVATED':  return 'Этот токен уже активирован на другом устройстве.';
    case 'EXPIRED':    return 'Срок действия токена истёк.';
    case 'OFFLINE':    return 'Нет подключения к интернету. Повторите позже.';
    case 'SERVER':     return 'Сервер лицензий недоступен. Попробуйте позже.';
    default:           return fallback || 'Не удалось активировать. Попробуйте снова.';
  }
}

async function activate() {
  const token = (tokenInput.value || '').trim();
  if (!token) {
    setStatus(messageForCode('EMPTY'), 'error');
    tokenInput.focus();
    return;
  }

  btn.disabled = true;
  setStatus('Проверяем токен…', 'info');

  let result;
  try {
    result = await window.terrilicense.activate(token);
  } catch (e) {
    result = { valid: false, code: 'SERVER' };
  }

  if (result && result.valid) {
    setStatus('Активация успешна. Запускаем…', 'ok');
    // main сам переключит окна после успешной активации
    try { await window.terrilicense.finish(); } catch (e) { /* ok */ }
    return;
  }

  btn.disabled = false;
  setStatus(messageForCode(result && result.code, result && result.message), 'error');
  tokenInput.focus();
  tokenInput.select();
}

btn.addEventListener('click', activate);
tokenInput.addEventListener('keydown', function (e) {
  if (e.key === 'Enter') activate();
});
tokenInput.focus();
