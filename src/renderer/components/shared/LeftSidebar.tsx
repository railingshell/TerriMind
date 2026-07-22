import React from 'react'
import {
  Map, Grid3x3, Building2, Car, Route, Shield, Mountain, Wrench, AlertTriangle
} from 'lucide-react'
import type { ActivePanel } from '../../App'

interface Props {
  activePanel: ActivePanel
  onPanelChange(p: ActivePanel): void
}

const NAV_ITEMS: Array<{ id: ActivePanel; icon: React.ReactNode; label: string }> = [
  { id: 'map', icon: <Map size={16} />, label: 'Карта' },
  { id: 'parcels', icon: <Grid3x3 size={16} />, label: 'Участки' },
  { id: 'infrastructure', icon: <Building2 size={16} />, label: 'Инфраструктура' },
  { id: 'accessibility', icon: <Route size={16} />, label: 'Доступность' },
  { id: 'parking', icon: <Car size={16} />, label: 'Парковки' },
  { id: 'constraints', icon: <Shield size={16} />, label: 'Ограничения' },
  { id: 'terrain', icon: <Mountain size={16} />, label: 'Рельеф' },
  { id: 'utilities', icon: <Wrench size={16} />, label: 'Сети' },
  { id: 'violations', icon: <AlertTriangle size={16} />, label: 'Нарушения' }
]

export function LeftSidebar({ activePanel, onPanelChange }: Props) {
  return (
    <nav className="flex flex-col w-12 bg-tm-surface border-r border-tm-border shrink-0">
      {NAV_ITEMS.map(item => (
        <button
          key={item.id}
          onClick={() => onPanelChange(item.id)}
          title={item.label}
          className={[
            'flex flex-col items-center justify-center py-3 gap-1 text-xs transition-colors',
            activePanel === item.id
              ? 'text-tm-accent bg-tm-panel border-l-2 border-tm-accent'
              : 'text-tm-muted hover:text-tm-text hover:bg-tm-panel border-l-2 border-transparent'
          ].join(' ')}
        >
          {item.icon}
        </button>
      ))}
    </nav>
  )
}
