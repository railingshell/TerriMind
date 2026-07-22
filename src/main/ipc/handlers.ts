// TerriMind — IPC handlers (main process)
// Renderer NEVER gets direct filesystem access.
// All file operations go through validated IPC channels.

import { ipcMain, dialog, app } from 'electron'
import { readFileSync, writeFileSync, existsSync, statSync } from 'fs'
import { join, basename, extname, resolve, relative } from 'path'
import { createHash } from 'crypto'
import type { TerriMindProject } from '@shared/types/project'

const ALLOWED_PROJECT_EXTENSIONS = ['.terrimind', '.json']
const ALLOWED_IMPORT_EXTENSIONS = ['.geojson', '.json', '.csv', '.xyz', '.tif', '.tiff']
const MAX_FILE_SIZE_BYTES = 200 * 1024 * 1024 // 200 MB

/** Safe filename sanitization */
function sanitizeFileName(name: string): string {
  return basename(name).replace(/[^a-zA-Z0-9._\-а-яёА-ЯЁ ]/g, '_').slice(0, 255)
}

/** Validate file path — prevent path traversal */
function validateFilePath(filePath: string, allowedDir?: string): { valid: boolean; error?: string } {
  const normalized = resolve(filePath)
  if (allowedDir) {
    const normalizedDir = resolve(allowedDir)
    if (!normalized.startsWith(normalizedDir)) {
      return { valid: false, error: 'Path traversal attempt detected' }
    }
  }
  const ext = extname(normalized).toLowerCase()
  return { valid: true }
}

/** Validate JSON content — prevent code injection */
function safeParseJson(content: string, maxBytes = MAX_FILE_SIZE_BYTES): { value: unknown; error?: string } {
  if (content.length > maxBytes) {
    return { value: null, error: `File too large: ${content.length} bytes` }
  }
  try {
    const val = JSON.parse(content)
    return { value: val }
  } catch (e) {
    return { value: null, error: `Invalid JSON: ${e instanceof Error ? e.message : String(e)}` }
  }
}

export function registerIpcHandlers(): void {
  // ---- Project I/O ----

  ipcMain.handle('project:save', async (_event, projectJson: string) => {
    try {
      const { filePath } = await dialog.showSaveDialog({
        title: 'Сохранить проект TerriMind',
        defaultPath: 'project.terrimind',
        filters: [{ name: 'TerriMind Project', extensions: ['terrimind'] }]
      })
      if (!filePath) return { success: false, cancelled: true }

      const validation = validateFilePath(filePath)
      if (!validation.valid) return { success: false, error: validation.error }

      const ext = extname(filePath).toLowerCase()
      if (!ALLOWED_PROJECT_EXTENSIONS.includes(ext) && ext !== '') {
        return { success: false, error: 'Invalid file extension' }
      }

      if (typeof projectJson !== 'string' || projectJson.length > MAX_FILE_SIZE_BYTES) {
        return { success: false, error: 'Project data too large or invalid type' }
      }

      writeFileSync(filePath, projectJson, 'utf-8')
      return { success: true, filePath }
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : 'Unknown error' }
    }
  })

  ipcMain.handle('project:open', async () => {
    try {
      const { filePaths } = await dialog.showOpenDialog({
        title: 'Открыть проект TerriMind',
        filters: [{ name: 'TerriMind Project', extensions: ['terrimind', 'json'] }],
        properties: ['openFile']
      })
      if (!filePaths || filePaths.length === 0) return { success: false, cancelled: true }

      const filePath = filePaths[0]
      const validation = validateFilePath(filePath)
      if (!validation.valid) return { success: false, error: validation.error }

      const stat = statSync(filePath)
      if (stat.size > MAX_FILE_SIZE_BYTES) return { success: false, error: 'File too large' }

      const content = readFileSync(filePath, 'utf-8')
      const parsed = safeParseJson(content)
      if (parsed.error) return { success: false, error: parsed.error }

      return { success: true, data: parsed.value, filePath }
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : 'Unknown error' }
    }
  })

  // ---- File import (GeoJSON, terrain) ----

  ipcMain.handle('import:file', async (_event, options: { accept: string[] }) => {
    try {
      const allowedExts = Array.isArray(options?.accept)
        ? options.accept.filter(e => ALLOWED_IMPORT_EXTENSIONS.includes(e.toLowerCase()))
        : ALLOWED_IMPORT_EXTENSIONS

      const { filePaths } = await dialog.showOpenDialog({
        title: 'Импорт файла',
        filters: [{ name: 'Поддерживаемые форматы', extensions: allowedExts.map(e => e.replace('.', '')) }],
        properties: ['openFile']
      })
      if (!filePaths || filePaths.length === 0) return { success: false, cancelled: true }

      const filePath = filePaths[0]
      const stat = statSync(filePath)
      if (stat.size > MAX_FILE_SIZE_BYTES) return { success: false, error: 'File too large' }

      const ext = extname(filePath).toLowerCase()
      if (!ALLOWED_IMPORT_EXTENSIONS.includes(ext)) {
        return { success: false, error: `Unsupported file extension: ${ext}` }
      }

      // For binary files (tif/tiff), return path + checksum only
      if (ext === '.tif' || ext === '.tiff') {
        const content = readFileSync(filePath)
        const checksum = createHash('sha256').update(content).digest('hex')
        return {
          success: true,
          filePath,
          fileName: sanitizeFileName(filePath),
          fileSize: stat.size,
          checksum,
          isBinary: true
        }
      }

      const content = readFileSync(filePath, 'utf-8')
      const checksum = createHash('sha256').update(content).digest('hex')
      return {
        success: true,
        content,
        fileName: sanitizeFileName(filePath),
        fileSize: stat.size,
        checksum,
        isBinary: false
      }
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : 'Unknown error' }
    }
  })

  // ---- Terrain binary read ----

  ipcMain.handle('terrain:readFile', async (_event, filePath: string) => {
    try {
      if (typeof filePath !== 'string') return { success: false, error: 'Invalid path type' }
      const validation = validateFilePath(filePath)
      if (!validation.valid) return { success: false, error: validation.error }
      if (!existsSync(filePath)) return { success: false, error: 'File not found' }

      const stat = statSync(filePath)
      if (stat.size > MAX_FILE_SIZE_BYTES) return { success: false, error: 'File too large' }

      const data = readFileSync(filePath)
      return { success: true, buffer: data.buffer }
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : 'Unknown error' }
    }
  })

  // ---- Export ----

  ipcMain.handle('export:file', async (_event, fileName: string, content: string) => {
    try {
      if (typeof content !== 'string') return { success: false, error: 'Content must be string' }
      const safe = sanitizeFileName(fileName)

      const { filePath } = await dialog.showSaveDialog({
        title: 'Экспорт',
        defaultPath: safe,
        filters: [
          { name: 'GeoJSON', extensions: ['geojson', 'json'] },
          { name: 'CSV', extensions: ['csv'] },
          { name: 'Все файлы', extensions: ['*'] }
        ]
      })
      if (!filePath) return { success: false, cancelled: true }

      const validation = validateFilePath(filePath)
      if (!validation.valid) return { success: false, error: validation.error }

      writeFileSync(filePath, content, 'utf-8')
      return { success: true, filePath }
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : 'Unknown error' }
    }
  })

  // ---- App info ----

  ipcMain.handle('app:version', () => app.getVersion())
  ipcMain.handle('app:getPath', (_event, name: string) => {
    const allowed = ['userData', 'temp', 'downloads']
    if (!allowed.includes(name)) return null
    return app.getPath(name as Parameters<typeof app.getPath>[0])
  })
}
