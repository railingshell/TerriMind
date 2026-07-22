import React, { useState, useMemo } from 'react'
import { Grid3x3, Play, AlertCircle, CheckCircle, RefreshCw } from 'lucide-react'
import { store, addParcelsCommand } from '../../store/projectStore'
import { generateParcelsForBlock } from '../../services/parcel-generation/parcelGenerator'
import { calcBlockAreaBalance } from '../../domain/parcels/parcelModel'
import type { LandParcel } from '@shared/types/parcels'
import { taskQueue, TASK_IDS } from '../../workers/taskQueue'

type SortKey = 'number' | 'designation' | 'area' | 'bcr' | 'far' | 'population'

const DESIGNATION_LABELS: Record<string, string> = {
  'residential': 'Жилая',
  'mixed-use': 'Смешанная',
  'commercial-business': 'Деловая',
  'commercial-retail': 'Торговая',
  'education': 'Образование',
  'preschool': 'Дошкольное',
  'healthcare': 'Здравоохранение',
  'sport': 'Спорт',
  'culture': 'Культура',
  'recreation': 'Рекреация',
  'parking': 'Парковка',
  'public-open-space': 'Территория ОП',
  'green-public': 'Озеленение ОП',
  'green-restricted': 'Озеленение ОО',
  'reserve': 'Резерв',
  'custom': 'Пользовательский'
}

export function ParcelsPanel() {
  const [sortKey, setSortKey] = useState<SortKey>('number')
  const [filterDesignation, setFilterDesignation] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [generationLog, setGenerationLog] = useState<string[]>([])

  const project = store.getProject()
  const parcels = project.parcels

  const sorted = useMemo(() => {
    let list = [...parcels]
    if (filterDesignation !== 'all') list = list.filter(p => p.designation === filterDesignation)
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(p =>
        p.projectNumber.toLowerCase().includes(q) ||
        (p.userLabel?.toLowerCase() ?? '').includes(q)
      )
    }
    list.sort((a, b) => {
      switch (sortKey) {
        case 'number': return a.projectNumber.localeCompare(b.projectNumber)
        case 'designation': return a.designation.localeCompare(b.designation)
        case 'area': return b.area - a.area
        case 'bcr': return b.buildingCoverageRatio - a.buildingCoverageRatio
        case 'far': return b.floorAreaRatio - a.floorAreaRatio
        case 'population': return b.population - a.population
        default: return 0
      }
    })
    return list
  }, [parcels, sortKey, filterDesignation, search])

  const handleGenerateAllBlocks = async () => {
    setIsGenerating(true)
    setGenerationLog(['Запуск межевания...'])

    await taskQueue.enqueue(
      TASK_IDS.PARCEL_GENERATION,
      async (onProgress) => {
        const blocks = store.getBlocks()
        const buildings = store.getBuildings()
        const roads = store.getRoads()
        const log: string[] = []

        for (let i = 0; i < blocks.length; i++) {
          const block = blocks[i]
          onProgress({
            taskId: TASK_IDS.PARCEL_GENERATION,
            phase: 'Межевание кварталов',
            percent: Math.round((i / blocks.length) * 100),
            message: `Квартал ${block.name ?? block.id}`
          })

          // Remove existing parcels for this block first
          const existingForBlock = store.getParcels().filter(p => p.blockId === block.id)
          if (existingForBlock.length > 0) {
            log.push(`Квартал ${block.name}: заменено ${existingForBlock.length} существующих участков`)
          }

          const result = generateParcelsForBlock(block, buildings, roads)
          log.push(`Квартал ${block.name}: создано ${result.parcels.length} участков, ошибок: ${result.errors.length}`)
          result.errors.forEach(e => log.push(`  ⚠ ${e}`))
          result.warnings.forEach(w => log.push(`  ℹ ${w}`))

          store.execute(addParcelsCommand(result.parcels, block.id))
        }

        setGenerationLog(log)
        return log
      },
      (p) => setGenerationLog(prev => [...prev, p.message])
    )

    setIsGenerating(false)
  }

  const totalArea = parcels.reduce((s, p) => s + p.area, 0)
  const totalPopulation = parcels.reduce((s, p) => s + p.population, 0)

  return (
    <div className="flex flex-col h-full bg-tm-bg overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-tm-border bg-tm-surface shrink-0">
        <Grid3x3 size={16} className="text-tm-accent" />
        <span className="font-semibold text-sm">Земельные участки</span>
        <span className="text-xs text-tm-muted ml-auto">{parcels.length} участков</span>
      </div>

      {/* Disclaimer */}
      <div className="mx-4 mt-3 mb-2 p-2 bg-amber-900/20 border border-amber-700/40 rounded text-xs text-amber-400 shrink-0">
        ⚠ Предварительная схема межевания — не является официальной кадастровой документацией.
        Участки не имеют кадастровых номеров.
      </div>

      {/* Controls */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-tm-border shrink-0">
        <input
          type="text"
          placeholder="Поиск..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="input-sm flex-1"
        />
        <select
          value={filterDesignation}
          onChange={e => setFilterDesignation(e.target.value)}
          className="input-sm"
        >
          <option value="all">Все назначения</option>
          {Object.entries(DESIGNATION_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <select
          value={sortKey}
          onChange={e => setSortKey(e.target.value as SortKey)}
          className="input-sm"
        >
          <option value="number">По номеру</option>
          <option value="designation">По назначению</option>
          <option value="area">По площади</option>
          <option value="bcr">По КЗ</option>
          <option value="far">По КИТ</option>
          <option value="population">По населению</option>
        </select>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-tm-border shrink-0">
        <button
          onClick={handleGenerateAllBlocks}
          disabled={isGenerating || store.getBlocks().length === 0}
          className="btn-primary flex items-center gap-2 text-xs"
        >
          {isGenerating ? <RefreshCw size={12} className="animate-spin" /> : <Play size={12} />}
          Межевать все кварталы
        </button>
        <span className="text-xs text-tm-muted">
          {store.getBlocks().length} кварталов
        </span>
      </div>

      {/* Summary stats */}
      {parcels.length > 0 && (
        <div className="flex gap-4 px-4 py-2 border-b border-tm-border text-xs shrink-0">
          <span className="text-tm-muted">Площадь: <b className="text-tm-text">{(totalArea / 10000).toFixed(2)} га</b></span>
          <span className="text-tm-muted">Население: <b className="text-tm-text">{totalPopulation.toLocaleString('ru')}</b></span>
        </div>
      )}

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {sorted.length === 0 ? (
          <EmptyState isGenerating={isGenerating} hasBlocks={store.getBlocks().length > 0} />
        ) : (
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-tm-surface border-b border-tm-border">
              <tr>
                <th className="px-3 py-2 text-left text-tm-muted font-medium">№</th>
                <th className="px-3 py-2 text-left text-tm-muted font-medium">Квартал</th>
                <th className="px-3 py-2 text-left text-tm-muted font-medium">Назначение</th>
                <th className="px-3 py-2 text-right text-tm-muted font-medium">Площадь</th>
                <th className="px-3 py-2 text-right text-tm-muted font-medium">КЗ</th>
                <th className="px-3 py-2 text-right text-tm-muted font-medium">КИТ</th>
                <th className="px-3 py-2 text-right text-tm-muted font-medium">Жителей</th>
                <th className="px-3 py-2 text-right text-tm-muted font-medium">Нарушений</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(parcel => (
                <ParcelRow key={parcel.id} parcel={parcel} />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Generation log */}
      {generationLog.length > 0 && (
        <div className="border-t border-tm-border p-3 max-h-32 overflow-y-auto shrink-0">
          <p className="text-xs font-semibold text-tm-dim mb-1">Журнал межевания</p>
          {generationLog.map((line, i) => (
            <p key={i} className="text-xs text-tm-muted font-mono">{line}</p>
          ))}
        </div>
      )}
    </div>
  )
}

function ParcelRow({ parcel }: { parcel: LandParcel }) {
  const block = store.getBlocks().find(b => b.id === parcel.blockId)
  const hasCritical = parcel.violations.some(v => v.severity === 'critical')
  return (
    <tr className="border-b border-tm-border hover:bg-tm-panel transition-colors cursor-pointer">
      <td className="px-3 py-1.5 font-mono text-tm-dim">{parcel.projectNumber}</td>
      <td className="px-3 py-1.5 text-tm-muted">{block?.name ?? parcel.blockId.slice(0, 8)}</td>
      <td className="px-3 py-1.5">
        <span className="text-tm-text">{DESIGNATION_LABELS[parcel.designation] ?? parcel.designation}</span>
      </td>
      <td className="px-3 py-1.5 text-right font-mono">
        {parcel.area >= 10000
          ? `${(parcel.area / 10000).toFixed(3)} га`
          : `${Math.round(parcel.area)} м²`}
      </td>
      <td className="px-3 py-1.5 text-right font-mono">{(parcel.buildingCoverageRatio * 100).toFixed(1)}%</td>
      <td className="px-3 py-1.5 text-right font-mono">{parcel.floorAreaRatio.toFixed(2)}</td>
      <td className="px-3 py-1.5 text-right font-mono">{parcel.population}</td>
      <td className="px-3 py-1.5 text-right">
        {parcel.violations.length > 0 ? (
          <span className={hasCritical ? 'text-tm-error' : 'text-tm-warning'}>
            {parcel.violations.length}
          </span>
        ) : (
          <span className="text-tm-success">—</span>
        )}
      </td>
    </tr>
  )
}

function EmptyState({ isGenerating, hasBlocks }: { isGenerating: boolean; hasBlocks: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-tm-muted">
      {isGenerating ? (
        <>
          <RefreshCw size={32} className="animate-spin mb-3" />
          <p>Выполняется межевание...</p>
        </>
      ) : !hasBlocks ? (
        <>
          <AlertCircle size={32} className="mb-3" />
          <p>Нет кварталов для межевания</p>
          <p className="text-xs mt-1">Сначала добавьте кварталы в проект</p>
        </>
      ) : (
        <>
          <Grid3x3 size={32} className="mb-3" />
          <p>Участки не созданы</p>
          <p className="text-xs mt-1">Нажмите «Межевать все кварталы»</p>
        </>
      )}
    </div>
  )
}
