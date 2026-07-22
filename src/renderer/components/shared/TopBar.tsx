import React from 'react'
import { Save, FolderOpen, Plus, Undo2, Redo2, Settings } from 'lucide-react'
import { store } from '../../store/projectStore'

export function TopBar() {
  const project = store.getProject()

  const handleSave = async () => {
    const json = JSON.stringify(project, null, 2)
    const result = await window.api.project.save(json)
    if (result.error) console.error('Save error:', result.error)
  }

  const handleOpen = async () => {
    const result = await window.api.project.open()
    if (!result.success || !result.data) return
    // Migration handled in store
    try {
      const { migrateProject, validateProjectJson } = await import('@shared/utils/migration')
      const validation = validateProjectJson(result.data)
      if (!validation.valid) {
        console.error('Invalid project:', validation.errors)
        return
      }
      const { project: migrated } = migrateProject(result.data as Record<string, unknown>)
      store.loadProject(migrated)
    } catch (e) {
      console.error('Failed to open project:', e)
    }
  }

  const handleNew = () => {
    store.newProject('Новый проект')
  }

  return (
    <header className="flex items-center gap-2 px-4 h-10 bg-tm-surface border-b border-tm-border select-none shrink-0">
      <span className="font-semibold text-tm-accent text-sm mr-2">TerriMind</span>
      <span className="text-tm-muted text-xs mr-4">{project.name}</span>

      <div className="flex items-center gap-1">
        <button onClick={handleNew} title="Новый проект" className="toolbar-btn">
          <Plus size={14} />
        </button>
        <button onClick={handleOpen} title="Открыть" className="toolbar-btn">
          <FolderOpen size={14} />
        </button>
        <button onClick={handleSave} title="Сохранить" className="toolbar-btn">
          <Save size={14} />
        </button>
      </div>

      <div className="w-px h-5 bg-tm-border mx-1" />

      <div className="flex items-center gap-1">
        <button
          onClick={() => store.undo()}
          disabled={!store.canUndo()}
          title="Отмена"
          className="toolbar-btn disabled:opacity-30"
        >
          <Undo2 size={14} />
        </button>
        <button
          onClick={() => store.redo()}
          disabled={!store.canRedo()}
          title="Повтор"
          className="toolbar-btn disabled:opacity-30"
        >
          <Redo2 size={14} />
        </button>
      </div>

      <div className="ml-auto text-xs text-tm-muted">v{project.version}</div>
    </header>
  )
}
