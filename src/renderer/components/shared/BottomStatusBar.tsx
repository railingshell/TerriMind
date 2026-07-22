import React, { useState, useEffect } from 'react'
import { store } from '../../store/projectStore'

export function BottomStatusBar() {
  const [version, setVersion] = useState('')

  useEffect(() => {
    window.api.app.version().then(setVersion).catch(() => setVersion(''))
  }, [])

  const canUndo = store.canUndo()
  const canRedo = store.canRedo()
  const graphStale = store.isGraphStaleGet()

  return (
    <footer className="flex items-center gap-4 px-4 h-6 bg-tm-surface border-t border-tm-border text-xs text-tm-muted shrink-0">
      <span>TerriMind {version}</span>
      <span className="w-px h-3 bg-tm-border" />
      {canUndo && <span className="text-tm-dim">Undo доступен</span>}
      {graphStale && <span className="text-amber-500">Граф устарел</span>}
      <span className="ml-auto text-xs text-amber-600 font-medium">
        ПРЕДПРОЕКТНАЯ ОЦЕНКА — не является официальной документацией
      </span>
    </footer>
  )
}
