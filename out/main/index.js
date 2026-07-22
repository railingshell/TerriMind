"use strict";
const electron = require("electron");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const is = {
  dev: !electron.app.isPackaged
};
const platform = {
  isWindows: process.platform === "win32",
  isMacOS: process.platform === "darwin",
  isLinux: process.platform === "linux"
};
const electronApp = {
  setAppUserModelId(id) {
    if (platform.isWindows)
      electron.app.setAppUserModelId(is.dev ? process.execPath : id);
  },
  setAutoLaunch(auto) {
    if (platform.isLinux)
      return false;
    const isOpenAtLogin = () => {
      return electron.app.getLoginItemSettings().openAtLogin;
    };
    if (isOpenAtLogin() !== auto) {
      electron.app.setLoginItemSettings({ openAtLogin: auto });
      return isOpenAtLogin() === auto;
    } else {
      return true;
    }
  },
  skipProxy() {
    return electron.session.defaultSession.setProxy({ mode: "direct" });
  }
};
const optimizer = {
  watchWindowShortcuts(window, shortcutOptions) {
    if (!window)
      return;
    const { webContents } = window;
    const { escToCloseWindow = false, zoom = false } = shortcutOptions || {};
    webContents.on("before-input-event", (event, input) => {
      if (input.type === "keyDown") {
        if (!is.dev) {
          if (input.code === "KeyR" && (input.control || input.meta))
            event.preventDefault();
          if (input.code === "KeyI" && (input.alt && input.meta || input.control && input.shift)) {
            event.preventDefault();
          }
        } else {
          if (input.code === "F12") {
            if (webContents.isDevToolsOpened()) {
              webContents.closeDevTools();
            } else {
              webContents.openDevTools({ mode: "undocked" });
              console.log("Open dev tool...");
            }
          }
        }
        if (escToCloseWindow) {
          if (input.code === "Escape" && input.key !== "Process") {
            window.close();
            event.preventDefault();
          }
        }
        if (!zoom) {
          if (input.code === "Minus" && (input.control || input.meta))
            event.preventDefault();
          if (input.code === "Equal" && input.shift && (input.control || input.meta))
            event.preventDefault();
        }
      }
    });
  },
  registerFramelessWindowIpc() {
    electron.ipcMain.on("win:invoke", (event, action) => {
      const win = electron.BrowserWindow.fromWebContents(event.sender);
      if (win) {
        if (action === "show") {
          win.show();
        } else if (action === "showInactive") {
          win.showInactive();
        } else if (action === "min") {
          win.minimize();
        } else if (action === "max") {
          const isMaximized = win.isMaximized();
          if (isMaximized) {
            win.unmaximize();
          } else {
            win.maximize();
          }
        } else if (action === "close") {
          win.close();
        }
      }
    });
  }
};
const ALLOWED_PROJECT_EXTENSIONS = [".terrimind", ".json"];
const ALLOWED_IMPORT_EXTENSIONS = [".geojson", ".json", ".csv", ".xyz", ".tif", ".tiff"];
const MAX_FILE_SIZE_BYTES = 200 * 1024 * 1024;
function sanitizeFileName(name) {
  return path.basename(name).replace(/[^a-zA-Z0-9._\-а-яёА-ЯЁ ]/g, "_").slice(0, 255);
}
function validateFilePath(filePath, allowedDir) {
  const normalized = path.resolve(filePath);
  path.extname(normalized).toLowerCase();
  return { valid: true };
}
function safeParseJson(content, maxBytes = MAX_FILE_SIZE_BYTES) {
  if (content.length > maxBytes) {
    return { value: null, error: `File too large: ${content.length} bytes` };
  }
  try {
    const val = JSON.parse(content);
    return { value: val };
  } catch (e) {
    return { value: null, error: `Invalid JSON: ${e instanceof Error ? e.message : String(e)}` };
  }
}
function registerIpcHandlers() {
  electron.ipcMain.handle("project:save", async (_event, projectJson) => {
    try {
      const { filePath } = await electron.dialog.showSaveDialog({
        title: "Сохранить проект TerriMind",
        defaultPath: "project.terrimind",
        filters: [{ name: "TerriMind Project", extensions: ["terrimind"] }]
      });
      if (!filePath) return { success: false, cancelled: true };
      const validation = validateFilePath(filePath);
      if (!validation.valid) return { success: false, error: validation.error };
      const ext = path.extname(filePath).toLowerCase();
      if (!ALLOWED_PROJECT_EXTENSIONS.includes(ext) && ext !== "") {
        return { success: false, error: "Invalid file extension" };
      }
      if (typeof projectJson !== "string" || projectJson.length > MAX_FILE_SIZE_BYTES) {
        return { success: false, error: "Project data too large or invalid type" };
      }
      fs.writeFileSync(filePath, projectJson, "utf-8");
      return { success: true, filePath };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : "Unknown error" };
    }
  });
  electron.ipcMain.handle("project:open", async () => {
    try {
      const { filePaths } = await electron.dialog.showOpenDialog({
        title: "Открыть проект TerriMind",
        filters: [{ name: "TerriMind Project", extensions: ["terrimind", "json"] }],
        properties: ["openFile"]
      });
      if (!filePaths || filePaths.length === 0) return { success: false, cancelled: true };
      const filePath = filePaths[0];
      const validation = validateFilePath(filePath);
      if (!validation.valid) return { success: false, error: validation.error };
      const stat = fs.statSync(filePath);
      if (stat.size > MAX_FILE_SIZE_BYTES) return { success: false, error: "File too large" };
      const content = fs.readFileSync(filePath, "utf-8");
      const parsed = safeParseJson(content);
      if (parsed.error) return { success: false, error: parsed.error };
      return { success: true, data: parsed.value, filePath };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : "Unknown error" };
    }
  });
  electron.ipcMain.handle("import:file", async (_event, options) => {
    try {
      const allowedExts = Array.isArray(options?.accept) ? options.accept.filter((e) => ALLOWED_IMPORT_EXTENSIONS.includes(e.toLowerCase())) : ALLOWED_IMPORT_EXTENSIONS;
      const { filePaths } = await electron.dialog.showOpenDialog({
        title: "Импорт файла",
        filters: [{ name: "Поддерживаемые форматы", extensions: allowedExts.map((e) => e.replace(".", "")) }],
        properties: ["openFile"]
      });
      if (!filePaths || filePaths.length === 0) return { success: false, cancelled: true };
      const filePath = filePaths[0];
      const stat = fs.statSync(filePath);
      if (stat.size > MAX_FILE_SIZE_BYTES) return { success: false, error: "File too large" };
      const ext = path.extname(filePath).toLowerCase();
      if (!ALLOWED_IMPORT_EXTENSIONS.includes(ext)) {
        return { success: false, error: `Unsupported file extension: ${ext}` };
      }
      if (ext === ".tif" || ext === ".tiff") {
        const content2 = fs.readFileSync(filePath);
        const checksum2 = crypto.createHash("sha256").update(content2).digest("hex");
        return {
          success: true,
          filePath,
          fileName: sanitizeFileName(filePath),
          fileSize: stat.size,
          checksum: checksum2,
          isBinary: true
        };
      }
      const content = fs.readFileSync(filePath, "utf-8");
      const checksum = crypto.createHash("sha256").update(content).digest("hex");
      return {
        success: true,
        content,
        fileName: sanitizeFileName(filePath),
        fileSize: stat.size,
        checksum,
        isBinary: false
      };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : "Unknown error" };
    }
  });
  electron.ipcMain.handle("terrain:readFile", async (_event, filePath) => {
    try {
      if (typeof filePath !== "string") return { success: false, error: "Invalid path type" };
      const validation = validateFilePath(filePath);
      if (!validation.valid) return { success: false, error: validation.error };
      if (!fs.existsSync(filePath)) return { success: false, error: "File not found" };
      const stat = fs.statSync(filePath);
      if (stat.size > MAX_FILE_SIZE_BYTES) return { success: false, error: "File too large" };
      const data = fs.readFileSync(filePath);
      return { success: true, buffer: data.buffer };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : "Unknown error" };
    }
  });
  electron.ipcMain.handle("export:file", async (_event, fileName, content) => {
    try {
      if (typeof content !== "string") return { success: false, error: "Content must be string" };
      const safe = sanitizeFileName(fileName);
      const { filePath } = await electron.dialog.showSaveDialog({
        title: "Экспорт",
        defaultPath: safe,
        filters: [
          { name: "GeoJSON", extensions: ["geojson", "json"] },
          { name: "CSV", extensions: ["csv"] },
          { name: "Все файлы", extensions: ["*"] }
        ]
      });
      if (!filePath) return { success: false, cancelled: true };
      const validation = validateFilePath(filePath);
      if (!validation.valid) return { success: false, error: validation.error };
      fs.writeFileSync(filePath, content, "utf-8");
      return { success: true, filePath };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : "Unknown error" };
    }
  });
  electron.ipcMain.handle("app:version", () => electron.app.getVersion());
  electron.ipcMain.handle("app:getPath", (_event, name) => {
    const allowed = ["userData", "temp", "downloads"];
    if (!allowed.includes(name)) return null;
    return electron.app.getPath(name);
  });
}
let mainWindow = null;
function createWindow() {
  mainWindow = new electron.BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 600,
    show: false,
    title: "TerriMind",
    backgroundColor: "#0f1117",
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      sandbox: false,
      // Security settings
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true
    }
  });
  mainWindow.on("ready-to-show", () => mainWindow?.show());
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    electron.shell.openExternal(url);
    return { action: "deny" };
  });
  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
}
electron.app.whenReady().then(() => {
  electronApp.setAppUserModelId("com.terrimind.app");
  electron.app.on("browser-window-created", (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });
  registerIpcHandlers();
  createWindow();
  electron.app.on("activate", () => {
    if (electron.BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") electron.app.quit();
});
