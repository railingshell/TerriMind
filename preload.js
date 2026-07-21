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

// Лицензирование/активация (v5): минимальный безопасный API
contextBridge.exposeInMainWorld('terrilicense', {
  // Экран активации
  activate: (token) => ipcRenderer.invoke('license-activate', token),
  finish: () => ipcRenderer.invoke('license-finish'),
  // Главное приложение (Этап 5: сброс активации)
  status: () => ipcRenderer.invoke('license-status'),
  deactivate: () => ipcRenderer.invoke('license-deactivate')
});
