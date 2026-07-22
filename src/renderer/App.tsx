import React, { useState, useCallback, useEffect } from 'react'
import { TopBar } from './components/shared/TopBar'
import { LeftSidebar } from './components/shared/LeftSidebar'
import { RightPanel } from './components/shared/RightPanel'
import { MapCanvas } from './components/map/MapCanvas'
import { BottomStatusBar } from './components/shared/BottomStatusBar'
import { ParcelsPanel } from './components/parcels/ParcelsPanel'
import { InfrastructurePanel } from './components/infrastructure/InfrastructurePanel'
import { AccessibilityPanel } from './components/accessibility/AccessibilityPanel'
import { ParkingPanel } from './components/parking/ParkingPanel'
import { ConstraintsPanel } from './components/constraints/ConstraintsPanel'
import { TerrainPanel } from './components/terrain/TerrainPanel'
import { UtilitiesPanel } from './components/utilities/UtilitiesPanel'
import { ViolationsCenter } from './components/shared/ViolationsCenter'
import { store } from './store/projectStore'

export type ActivePanel =
  | 'map'
  | 'parcels'
  | 'infrastructure'
  | 'accessibility'
  | 'parking'
  | 'constraints'
  | 'terrain'
  | 'utilities'
  | 'violations'

export default function App() {
  const [activePanel, setActivePanel] = useState<ActivePanel>('map')
  const [rightPanelOpen, setRightPanelOpen] = useState(true)
  const [, forceUpdate] = useState(0)

  useEffect(() => {
    return store.subscribe(() => forceUpdate(n => n + 1))
  }, [])

  const renderMainContent = () => {
    switch (activePanel) {
      case 'map': return <MapCanvas />
      case 'parcels': return <ParcelsPanel />
      case 'infrastructure': return <InfrastructurePanel />
      case 'accessibility': return <AccessibilityPanel />
      case 'parking': return <ParkingPanel />
      case 'constraints': return <ConstraintsPanel />
      case 'terrain': return <TerrainPanel />
      case 'utilities': return <UtilitiesPanel />
      case 'violations': return <ViolationsCenter />
      default: return <MapCanvas />
    }
  }

  return (
    <div className="flex flex-col h-full bg-tm-bg text-tm-text">
      <TopBar />
      <div className="flex flex-1 overflow-hidden">
        <LeftSidebar activePanel={activePanel} onPanelChange={setActivePanel} />
        <main className="flex-1 overflow-hidden">
          {renderMainContent()}
        </main>
        {rightPanelOpen && (
          <RightPanel onClose={() => setRightPanelOpen(false)} />
        )}
      </div>
      <BottomStatusBar />
    </div>
  )
}
