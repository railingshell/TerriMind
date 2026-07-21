const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const licensing = require('./licensing');
const activationStore = require('./activation-store');

const APP_VERSION = app.getVersion();

// Ссылка на окно активации (v5)
let activationWindow = null;

// Ссылка на главное окно + состояние закрытия (Этап 1–5)
let mainWindow = null;
let isDirty = false;        // known dirty-состояние проекта (пушится из renderer, Этап 2)
let allowClose = false;     // разрешение на закрытие без диалога (анти-рекурсия, Этап 4)
let closeDialogOpen = false; // диалог уже показан — не открывать второй

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'TerriMind',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow = win;
  win.loadFile('index.html');

  // Этап 1: надёжный перехват закрытия окна (кнопка X / системный close)
  win.on('close', (event) => {
    // Уже подтверждено закрытие — пропускаем
    if (allowClose) return;
    // Чистый проект — закрываем без вопросов
    if (!isDirty) return;
    // Грязный проект — не даём закрыться и показываем диалог
    event.preventDefault();
    if (closeDialogOpen) return;
    handleCloseRequest(win);
  });

  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null;
  });
}

// Диалог подтверждения при закрытии грязного проекта (Этапы 1,3,4,5)
async function handleCloseRequest(win) {
  closeDialogOpen = true;
  let choice;
  try {
    const result = await dialog.showMessageBox(win, {
      type: 'warning',
      buttons: ['Сохранить и выйти', 'Выйти без сохранения', 'Отмена'],
      defaultId: 0,
      cancelId: 2,
      noLink: true,
      title: 'Несохранённые изменения',
      message: 'В проекте есть несохранённые изменения.',
      detail: 'Сохранить проект перед выходом?'
    });
    choice = result.response;
  } catch (err) {
    closeDialogOpen = false;
    return; // при ошибке диалога — не закрываем, чтобы не терять данные
  }
  closeDialogOpen = false;

  if (choice === 2) {
    // Отмена — остаёмся в окне (Этап 5)
    return;
  }

  if (choice === 1) {
    // Выйти без сохранения (Этап 4)
    allowClose = true;
    win.close();
    return;
  }

  if (choice === 0) {
    // Сохранить и выйти (Этап 3): просим renderer сохранить, ждём результат
    let saved = false;
    try {
      saved = await requestRendererSave(win);
    } catch (err) {
      saved = false;
    }
    if (saved) {
      allowClose = true;
      win.close();
    }
    // если не сохранено/отменено — окно остаётся открытым
  }
}

// Запросить у renderer сохранение проекта; вернуть true при успехе (Этап 3)
function requestRendererSave(win) {
  return new Promise((resolve) => {
    // одноразовый ответ от renderer
    ipcMain.once('close-save-result', (event, ok) => {
      resolve(!!ok);
    });
    win.webContents.send('request-save-before-close');
  });
}

// Этап 2: renderer сообщает main о dirty-состоянии проекта
ipcMain.on('notify-dirty', (event, dirty) => {
  isDirty = !!dirty;
});

// ============================================================
// v5: лицензирование/активация (Этапы 1–5)
// ============================================================

// Проверка токена + сохранение activation record при успехе
ipcMain.handle('license-activate', async (event, token) => {
  const machineId = licensing.getMachineId();
  // Local Mode (Этап 3). Позже переключить на verifyTokenRemotely.
  const result = licensing.verifyTokenLocal(token, machineId, APP_VERSION);

  if (result && result.valid) {
    // Сохраняем защищённый activation record (Этапы 2,4)
    const record = {
      token: result.token,
      license: result.license,
      activation: result.activation,
      appVersion: APP_VERSION,
      appName: licensing.APP_NAME
    };
    const saved = activationStore.writeActivation(record);
    if (!saved) {
      return { valid: false, code: 'SERVER', message: 'Не удалось сохранить активацию.' };
    }
  }
  return result;
});

// Завершить активацию: закрыть окно активации, открыть главное
ipcMain.handle('license-finish', async () => {
  if (activationStore.hasActivation()) {
    createWindow();
    if (activationWindow) {
      const w = activationWindow;
      activationWindow = null;
      w.close();
    }
    return { ok: true };
  }
  return { ok: false };
});

// Статус активации (для главного приложения — Этап 5)
ipcMain.handle('license-status', async () => {
  const rec = activationStore.readActivation();
  if (!rec) return { active: false };
  return {
    active: true,
    clientName: (rec.license && rec.license.clientName) || null,
    plan: (rec.license && rec.license.plan) || null,
    machineId: (rec.activation && rec.activation.machineId) || null,
    activatedAt: (rec.activation && rec.activation.activatedAt) || null
  };
});

// Сброс активации (Этап 5): удалить запись, вернуть на экран активации
ipcMain.handle('license-deactivate', async () => {
  const ok = activationStore.clearActivation();
  if (ok) {
    // Открываем экран активации и закрываем главное окно
    createActivationWindow();
    if (mainWindow) {
      allowClose = true; // не триггерить dirty-диалог при программном закрытии
      const w = mainWindow;
      mainWindow = null;
      w.close();
    }
  }
  return { ok };
});

// Этап 5: сохранение GeoJSON на диск через диалог "Сохранить как"
ipcMain.handle('save-geojson', async (event, geojsonString) => {
  const win = BrowserWindow.getFocusedWindow();
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: 'Сохранить GeoJSON',
    defaultPath: 'parcel_quarters.geojson',
    filters: [{ name: 'GeoJSON', extensions: ['geojson', 'json'] }]
  });

  if (canceled || !filePath) {
    return { ok: false, canceled: true };
  }

  try {
    fs.writeFileSync(filePath, geojsonString, 'utf-8');
    return { ok: true, filePath };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// Этап C: открытие GeoJSON через диалог "Открыть"
ipcMain.handle('open-geojson', async () => {
  const win = BrowserWindow.getFocusedWindow();
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    title: 'Импорт GeoJSON',
    properties: ['openFile'],
    filters: [{ name: 'GeoJSON', extensions: ['geojson', 'json'] }]
  });

  if (canceled || !filePaths || !filePaths.length) {
    return { ok: false, canceled: true };
  }

  try {
    const text = fs.readFileSync(filePaths[0], 'utf-8');
    return { ok: true, filePath: filePaths[0], data: text };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// v4 Этап 1: сохранение проекта в .terrimind.json
ipcMain.handle('save-project', async (event, projectString) => {
  const win = BrowserWindow.getFocusedWindow();
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: 'Сохранить проект',
    defaultPath: 'project.terrimind.json',
    filters: [
      { name: 'TerriMind Project', extensions: ['terrimind.json', 'json'] }
    ]
  });

  if (canceled || !filePath) {
    return { ok: false, canceled: true };
  }

  try {
    fs.writeFileSync(filePath, projectString, 'utf-8');
    return { ok: true, filePath };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// v4 Этап 1: открытие проекта .terrimind.json
ipcMain.handle('open-project', async () => {
  const win = BrowserWindow.getFocusedWindow();
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    title: 'Открыть проект',
    properties: ['openFile'],
    filters: [
      { name: 'TerriMind Project', extensions: ['terrimind.json', 'json'] }
    ]
  });

  if (canceled || !filePaths || !filePaths.length) {
    return { ok: false, canceled: true };
  }

  try {
    const text = fs.readFileSync(filePaths[0], 'utf-8');
    return { ok: true, filePath: filePaths[0], data: text };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// Этап E (v3): экспорт снимка карты в PNG
ipcMain.handle('save-png', async (event, rect) => {
  const win = BrowserWindow.getFocusedWindow();
  if (!win) return { ok: false, error: 'Нет активного окна' };

  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: 'Сохранить снимок карты',
    defaultPath: 'terrimind_plan.png',
    filters: [{ name: 'PNG', extensions: ['png'] }]
  });

  if (canceled || !filePath) {
    return { ok: false, canceled: true };
  }

  try {
    // rect (если передан) = { x, y, width, height } области #map
    const image = rect
      ? await win.webContents.capturePage(rect)
      : await win.webContents.capturePage();
    fs.writeFileSync(filePath, image.toPNG());
    return { ok: true, filePath };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// Снимок области карты как dataURL (для встраивания в PDF)
ipcMain.handle('capture-map', async (event, rect) => {
  const win = BrowserWindow.getFocusedWindow();
  if (!win) return { ok: false, error: 'Нет активного окна' };
  try {
    const image = rect
      ? await win.webContents.capturePage(rect)
      : await win.webContents.capturePage();
    return { ok: true, dataUrl: image.toDataURL() };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// Этап F (v3): экспорт отчёта в PDF (ТЭП + снимок карты)
ipcMain.handle('save-pdf', async (event, payload) => {
  const win = BrowserWindow.getFocusedWindow();
  if (!win) return { ok: false, error: 'Нет активного окна' };

  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: 'Сохранить отчёт PDF',
    defaultPath: 'terrimind_report.pdf',
    filters: [{ name: 'PDF', extensions: ['pdf'] }]
  });

  if (canceled || !filePath) {
    return { ok: false, canceled: true };
  }

  // Оффскрин-окно для рендера HTML-отчёта
  const reportWin = new BrowserWindow({
    show: false,
    webPreferences: { offscreen: true }
  });

  try {
    const html = buildReportHTML(payload);
    await reportWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    // небольшая пауза на отрисовку изображения
    await new Promise((r) => setTimeout(r, 300));

    const pdf = await reportWin.webContents.printToPDF({
      pageSize: 'A4',
      printBackground: true,
      margins: { top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 }
    });
    fs.writeFileSync(filePath, pdf);
    return { ok: true, filePath };
  } catch (err) {
    return { ok: false, error: err.message };
  } finally {
    reportWin.destroy();
  }
});

// Собираем HTML отчёта из данных ТЭП и картинки карты (dataURL)
function buildReportHTML(p) {
  const rows = (p.stats || [])
    .map((s) => `<tr><td>${s.label}</td><td class="v">${s.value}</td></tr>`)
    .join('');
  const zoneRows = (p.zones || [])
    .map((z) => `<tr><td><span class="sw" style="background:${z.color}"></span>${z.label}</td><td class="v">${z.value}</td></tr>`)
    .join('');
  const date = new Date().toLocaleString('ru-RU');

  return `<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8">
<style>
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #1f2933; margin: 0; padding: 24px; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  .sub { color: #6b7280; font-size: 12px; margin-bottom: 16px; }
  .map { width: 100%; border: 1px solid #e2e5ea; border-radius: 8px; margin-bottom: 20px; }
  h2 { font-size: 15px; margin: 18px 0 8px; color: #374151; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  td { padding: 7px 10px; border-bottom: 1px solid #eef0f3; }
  td.v { text-align: right; font-weight: 600; }
  .sw { display: inline-block; width: 11px; height: 11px; border-radius: 2px; margin-right: 7px; vertical-align: middle; }
  .foot { margin-top: 24px; color: #9ca3af; font-size: 11px; }
</style></head><body>
  <h1>TerriMind — Отчёт по участку</h1>
  <div class="sub">Сформировано: ${date}</div>
  ${p.mapImage ? `<img class="map" src="${p.mapImage}" />` : ''}
  <h2>Технико-экономические показатели</h2>
  <table>${rows}</table>
  ${zoneRows ? `<h2>Распределение по зонам</h2><table>${zoneRows}</table>` : ''}
  <div class="foot">TerriMind • градостроительный расчёт • офлайн-режим</div>
</body></html>`;
}

// v5: окно активации (Этап 1). Frameless, компактное, поверх — до главного окна.
function createActivationWindow() {
  const win = new BrowserWindow({
    width: 480,
    height: 560,
    resizable: false,
    fullscreenable: false,
    maximizable: false,
    title: 'Активация TerriMind',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  activationWindow = win;
  win.loadFile('activation.html');
  win.on('closed', () => {
    if (activationWindow === win) activationWindow = null;
  });
}

// v5: маршрутизация запуска — gate по активации (Этап 1)
function routeStartup() {
  if (activationStore.hasActivation()) {
    createWindow();
  } else {
    createActivationWindow();
  }
}

app.whenReady().then(() => {
  routeStartup();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) routeStartup();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
