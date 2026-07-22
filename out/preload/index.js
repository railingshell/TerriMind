"use strict";
const electron = require("electron");
const api = {
  project: {
    save: (json) => electron.ipcRenderer.invoke("project:save", json),
    open: () => electron.ipcRenderer.invoke("project:open")
  },
  import: {
    file: (opts) => electron.ipcRenderer.invoke("import:file", opts)
  },
  terrain: {
    readFile: (path) => electron.ipcRenderer.invoke("terrain:readFile", path)
  },
  export: {
    file: (name, content) => electron.ipcRenderer.invoke("export:file", name, content)
  },
  app: {
    version: () => electron.ipcRenderer.invoke("app:version"),
    getPath: (name) => electron.ipcRenderer.invoke("app:getPath", name)
  }
};
if (process.contextIsolated) {
  try {
    electron.contextBridge.exposeInMainWorld("api", api);
  } catch (e) {
    console.error(e);
  }
} else {
  window.api = api;
}
