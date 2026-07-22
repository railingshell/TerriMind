import React, { useState } from 'react'
import { Route, RefreshCw, AlertCircle, CheckCircle } from 'lucide-react'
import { store } from '../../store/projectStore'
import { buildMobilityGraph } from '../../services/routing/graphBuilder'
import { taskQueue, TASK_IDS } from '../../workers/taskQueue'

export function AccessibilityPanel() {
  const [isBuilding, setIsBuilding] = useState(false)
  const [log, setLog] = useState<string[]>([])
  const project = store.getProject()
  const graph = store.getMobilityGraph()
  const isStale = store.isGraphStaleGet()

  const handleBuildGraph = async () => {
    setIsBuilding(true)
    setLog([])

    await taskQueue.enqueue(
      TASK_IDS.BUILD_GRAPH,
      async (onProgress) => {
        onProgress({ taskId: TASK_IDS.BUILD_GRAPH, phase: 'Построение графа', percent: 10, message: 'Сбор данных...' })

        const g = buildMobilityGraph(
          project.id,
          project.roads,
          project.buildings,
          project.parcels
        )

        onProgress({ taskId: TASK_IDS.BUILD_GRAPH, phase: 'Построение графа', percent: 80, message: 'Сохранение...' })
        store.setMobilityGraph(g)

        const lines = [
          `Граф построен: ${g.nodes.length} узлов, ${g.edges.length} рёбер`,
          `Качество данных: ${g.quality}`
        ]
        setLog(lines)

        onProgress({ taskId: TASK_IDS.BUILD_GRAPH, phase: 'Построение графа', percent: 100, message: 'Готово' })
        return g
      }
    )
    setIsBuilding(false)
  }

  return (
    <div className="flex flex-col h-full bg-tm-bg overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-tm-border bg-tm-surface shrink-0">
        <Route size={16} className="text-tm-accent" />
        <span className="font-semibold text-sm">Транспортная доступность</span>
      </div>

      <div className="mx-4 mt-3 p-2 bg-blue-900/20 border border-blue-700/40 rounded text-xs text-blue-300 shrink-0">
        ℹ Предварительный анализ доступности — не является транспортным моделированием потоков.
        Расчёт основан на сети дорог и пешеходных связей проекта.
      </div>

      <div className="flex items-center gap-3 px-4 py-3 border-b border-tm-border shrink-0">
        <button
          onClick={handleBuildGraph}
          disabled={isBuilding || project.roads.length === 0}
          className="btn-primary flex items-center gap-2 text-xs"
        >
          {isBuilding ? <RefreshCw size={12} className="animate-spin" /> : <Route size={12} />}
          Построить граф связности
        </button>
        {graph && !isStale && (
          <span className="text-xs text-green-400 flex items-center gap-1">
            <CheckCircle size={12} />
            Граф актуален
          </span>
        )}
        {isStale && graph && (
          <span className="text-xs text-amber-500">Граф устарел</span>
        )}
      </div>

      <div className="flex-1 p-4 overflow-y-auto space-y-4">
        {!graph ? (
          <EmptyGraphState hasRoads={project.roads.length > 0} />
        ) : (
          <>
            <GraphStats graph={graph} />
            <AccessibilityStats />
          </>
        )}
      </div>

      {log.length > 0 && (
        <div className="border-t border-tm-border p-3 shrink-0">
          {log.map((l, i) => <p key={i} className="text-xs text-tm-muted font-mono">{l}</p>)}
        </div>
      )}
    </div>
  )
}

function GraphStats({ graph }: { graph: ReturnType<typeof store.getMobilityGraph> }) {
  if (!graph) return null
  const pedestrianEdges = graph.edges.filter(e => e.allowedModes.includes('pedestrian')).length
  const vehicleEdges = graph.edges.filter(e => e.allowedModes.includes('vehicle')).length
  return (
    <div className="bg-tm-surface rounded-lg border border-tm-border p-4">
      <h3 className="text-sm font-semibold mb-3">Граф перемещения</h3>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <Stat label="Узлов" value={graph.nodes.length} />
        <Stat label="Рёбер" value={graph.edges.length} />
        <Stat label="Пешеходных" value={pedestrianEdges} />
        <Stat label="Автомобильных" value={vehicleEdges} />
        <Stat label="Качество" value={graph.quality} />
        <Stat label="Актуальность" value={graph.isStale ? 'Устарел' : 'Актуален'} />
      </div>
    </div>
  )
}

function AccessibilityStats() {
  const project = store.getProject()
  const graph = store.getMobilityGraph()
  if (!graph) return null

  // Count isolated buildings (no entrance connected to graph)
  const connectedBuildingIds = new Set(
    graph.nodes.filter(n => n.refObjectId).map(n => n.refObjectId!)
  )
  const isolatedBuildings = project.buildings.filter(b => !connectedBuildingIds.has(b.id))

  return (
    <div className="bg-tm-surface rounded-lg border border-tm-border p-4">
      <h3 className="text-sm font-semibold mb-3">Результаты анализа</h3>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <Stat label="Зданий в графе" value={connectedBuildingIds.size} />
        <Stat
          label="Изолированных"
          value={isolatedBuildings.length}
          accent={isolatedBuildings.length > 0 ? 'error' : 'ok'}
        />
        <Stat label="Остановок ОТ" value={project.transitStops.length} />
        <Stat label="Дорог" value={project.roads.length} />
      </div>
      {isolatedBuildings.length > 0 && (
        <p className="text-xs text-red-400 mt-2">
          ⚠ {isolatedBuildings.length} зданий не имеют связи с сетью — проверьте входы
        </p>
      )}
    </div>
  )
}

function Stat({ label, value, accent }: { label: string; value: string | number; accent?: 'ok' | 'error' }) {
  const color = accent === 'error' ? 'text-red-400' : accent === 'ok' ? 'text-green-400' : 'text-tm-text'
  return (
    <>
      <span className="text-tm-muted">{label}</span>
      <span className={`font-mono ${color}`}>{value}</span>
    </>
  )
}

function EmptyGraphState({ hasRoads }: { hasRoads: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-tm-muted">
      <AlertCircle size={32} className="mb-3" />
      {!hasRoads ? (
        <>
          <p>Нет дорог в проекте</p>
          <p className="text-xs mt-1">Добавьте дороги для построения графа</p>
        </>
      ) : (
        <>
          <p>Граф не построен</p>
          <p className="text-xs mt-1">Нажмите «Построить граф связности»</p>
        </>
      )}
    </div>
  )
}
