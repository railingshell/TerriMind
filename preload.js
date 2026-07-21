const { contextBridge, ipcRenderer } = require('electron');

// Безопасный мост: страница может вызвать только эту функцию,
// а не весь Node/Electron.
contextBridge.exposeInMainWorld('terrimind', {
  saveGeoJSON: (geojsonString) => ipcRenderer.invoke('save-geojson', geojsonString),
  openGeoJSON: () => ipcRenderer.invoke('open-geojson'),
  saveProject: (projectString) => ipcRenderer.invoke('save-project', projectString),
  openProject: () => ipcRenderer.invoke('open-project'),
  savePNG: (rect) => ipcRenderer.invoke('save-png', rect),
  captureMap: (rect) => ipcRenderer.invoke('capture-map', rect),
  savePDF: (payload) => ipcRenderer.invoke('save-pdf', payload),

  // Close-flow (v4): dirty-состояние и сохранение перед выходом
  notifyDirty: (dirty) => ipcRenderer.send('notify-dirty', dirty),
  onRequestSaveBeforeClose: (callback) => {
    ipcRenderer.on('request-save-before-close', () => callback());
  },
  sendCloseSaveResult: (ok) => ipcRenderer.send('close-save-result', ok)
});

// ЭТАП 3: Нормативная база (PDF) — безопасный локальный API
contextBridge.exposeInMainWorld('terrireg', {
  importPdfs: () => ipcRenderer.invoke('reg-import-pdfs'),
  addPdfBuffers: (files) => ipcRenderer.invoke('reg-add-pdf-buffers', files),
  analyze: (id) => ipcRenderer.invoke('reg-analyze', id),
  cancelAnalyze: (id) => ipcRenderer.invoke('reg-cancel-analyze', id),
  list: () => ipcRenderer.invoke('reg-list'),
  get: (id) => ipcRenderer.invoke('reg-get', id),
  updateMeta: (id, patch) => ipcRenderer.invoke('reg-update-meta', id, patch),
  remove: (id) => ipcRenderer.invoke('reg-remove', id),
  activeRules: () => ipcRenderer.invoke('reg-active-rules'),
  integrity: () => ipcRenderer.invoke('reg-integrity'),
  cleanup: () => ipcRenderer.invoke('reg-cleanup'),
  onProgress: (callback) => {
    ipcRenderer.on('pdf-progress', (e, data) => callback(data));
  }
});

// Лицензирование/активация (v5): минимальный безопасный API
contextBridge.exposeInMainWorld('terrilicense', {
  // Экран активации
  activate: (token) => ipcRenderer.invoke('license-activate', token),
  finish: () => ipcRenderer.invoke('license-finish'),
  // Главное приложение (Этап 5: сброс активации)
  status: () => ipcRenderer.invoke('license-status'),
  deactivate: () => ipcRenderer.invoke('license-deactivate')
});
