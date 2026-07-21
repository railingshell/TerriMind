// activation-store.js — безопасное локальное хранение активации (main process).
// Стратегия: Electron safeStorage (OS credential API, DPAPI на Windows) →
// шифруем JSON activation record → пишем base64 в файл userData/activation.dat.
// Причина выбора safeStorage вместо keytar: без native-модулей и electron-rebuild,
// не ломает npm run dist, встроен в Electron. Fallback (если шифрование недоступно):
// пишем помеченный незашифрованный JSON (лучше, чем потеря активации на редких ОС).

const { app, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');

const FILE_NAME = 'activation.dat';

function storePath() {
  return path.join(app.getPath('userData'), FILE_NAME);
}

// Записать activation record (объект) в защищённое хранилище
function writeActivation(record) {
  try {
    const json = JSON.stringify(record);
    let payload;
    if (safeStorage.isEncryptionAvailable()) {
      const enc = safeStorage.encryptString(json);
      payload = JSON.stringify({ enc: true, data: enc.toString('base64') });
    } else {
      // Fallback: незашифрованный, но помеченный
      payload = JSON.stringify({ enc: false, data: json });
    }
    fs.writeFileSync(storePath(), payload, 'utf-8');
    return true;
  } catch (e) {
    return false;
  }
}

// Прочитать activation record; null если нет/повреждён
function readActivation() {
  try {
    const p = storePath();
    if (!fs.existsSync(p)) return null;
    const raw = fs.readFileSync(p, 'utf-8');
    const wrapper = JSON.parse(raw);
    if (wrapper.enc) {
      if (!safeStorage.isEncryptionAvailable()) return null;
      const buf = Buffer.from(wrapper.data, 'base64');
      const json = safeStorage.decryptString(buf);
      return JSON.parse(json);
    }
    return JSON.parse(wrapper.data);
  } catch (e) {
    return null;
  }
}

// Есть ли валидная (по структуре) локальная активация
function hasActivation() {
  const rec = readActivation();
  return !!(rec && rec.token && rec.activation && rec.activation.machineId);
}

// Удалить активацию (Этап 5)
function clearActivation() {
  try {
    const p = storePath();
    if (fs.existsSync(p)) fs.unlinkSync(p);
    return true;
  } catch (e) {
    return false;
  }
}

module.exports = { writeActivation, readActivation, hasActivation, clearActivation };
