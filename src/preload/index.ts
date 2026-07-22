// TerriMind — Preload / contextBridge
// Renderer never gets direct Node.js access.
// Only whitelisted methods are exposed.

import { contextBridge, ipcRenderer } from 'electron'
import type { ElectronAPI } from '@electron-toolkit/preload'

declare global {
  interface Window {
    api: TerriMindAPI
    electron: ElectronAPI
  }
}

export interface TerriMindAPI {
  project: {
    save(projectJson: string): Promise<{ success: boolean; filePath?: string; cancelled?: boolean; error?: string }>
    open(): Promise<{ success: boolean; data?: unknown; filePath?: string; cancelled?: boolean; error?: string }>
  }
  import: {
    file(options: { accept: string[] }): Promise<{
      success: boolean
      content?: string
      filePath?: string
      fileName?: string
      fileSize?: number
      checksum?: string
      isBinary?: boolean
      cancelled?: boolean
      error?: string
    }>
  }
  terrain: {
    readFile(filePath: string): Promise<{ success: boolean; buffer?: ArrayBuffer; error?: string }>
  }
  export: {
    file(fileName: string, content: string): Promise<{ success: boolean; filePath?: string; cancelled?: boolean; error?: string }>
  }
  app: {
    version(): Promise<string>
    getPath(name: string): Promise<string | null>
  }
}

const api: TerriMindAPI = {
  project: {
    save: (json) => ipcRenderer.invoke('project:save', json),
    open: () => ipcRenderer.invoke('project:open')
  },
  import: {
    file: (opts) => ipcRenderer.invoke('import:file', opts)
  },
  terrain: {
    readFile: (path) => ipcRenderer.invoke('terrain:readFile', path)
  },
  export: {
    file: (name, content) => ipcRenderer.invoke('export:file', name, content)
  },
  app: {
    version: () => ipcRenderer.invoke('app:version'),
    getPath: (name) => ipcRenderer.invoke('app:getPath', name)
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api)
  } catch (e) {
    console.error(e)
  }
} else {
  // @ts-ignore — fallback for non-isolated contexts (dev only)
  window.api = api
}
