import React, { useMemo, useState } from 'react'
import { Building2, AlertCircle, TrendingDown, TrendingUp, Minus } from 'lucide-react'
import { store } from '../../store/projectStore'
import {
  DEMO_NORMATIVE_STANDARDS,
  buildInfrastructureBalance,
  estimateAgeStructure
} from '../../services/infrastructure-demand/demandEngine'
import type { InfrastructureBalance } from '@shared/types/infrastructure'

export function InfrastructurePanel() {
  const [showDemo, setShowDemo] = useState(true)
  const project = store.getProject()

  const params = useMemo(() => {
    const population = project.buildings.reduce((s, b) => s + b.residents, 0)
    const apartments = project.buildings.reduce((s, b) => s + b.apartments, 0)
    return estimateAgeStructure(population, apartments)
  }, [project.buildings])

  const balances = useMemo((): InfrastructureBalance[] => {
    const standards = DEMO_NORMATIVE_STANDARDS
    const demandMap = new Map<string, number>()

    // Pre-calc demand for all types
    for (const std of standards) {
      let demand = 0
      switch (std.per) {
        case 'per-1000-persons': demand = (params.population / 1000) * std.ratePerUnit; break
        case 'per-child-0-3': demand = params.children03 * std.ratePerUnit; break
        case 'per-child-3-7': demand = params.children37 * std.ratePerUnit; break
        case 'per-child-7-18': demand = params.children718 * std.ratePerUnit; break
        case 'per-apartment': demand = params.apartments * std.ratePerUnit; break
      }
      demandMap.set(std.type, Math.ceil(demand))
    }

    return standards.map(std => buildInfrastructureBalance(
      std.type,
      std.typeName,
      std.capacityUnit,
      demandMap.get(std.type) ?? 0,
      std.source,
      project.infrastructureObjects,
      project.externalInfrastructure,
      params.population,
      std.isDemoValue
    ))
  }, [params, project.infrastructureObjects, project.externalInfrastructure])

  const totalDeficit = balances.filter(b => b.deficit > 0).length
  const hasDemoValues = balances.some(b => b.demandQuality === 'low')

  return (
    <div className="flex flex-col h-full bg-tm-bg overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-tm-border bg-tm-surface shrink-0">
        <Building2 size={16} className="text-tm-accent" />
        <span className="font-semibold text-sm">Инфраструктура</span>
        <span className="text-xs text-tm-muted ml-auto">{project.infrastructureObjects.length} объектов</span>
      </div>

      {/* Demo warning */}
      {hasDemoValues && (
        <div className="mx-4 mt-3 mb-2 p-2 bg-amber-900/20 border border-amber-700/40 rounded text-xs text-amber-400 shrink-0">
          ⚠ Используются демонстрационные нормативы. Они НЕ являются официальными нормативными требованиями.
          Подтвердите нормативы в профиле перед принятием проектных решений.
        </div>
      )}

      {/* Summary */}
      <div className="flex gap-4 px-4 py-2 border-b border-tm-border text-xs shrink-0">
        <span className="text-tm-muted">Население: <b className="text-tm-text">{params.population.toLocaleString('ru')}</b></span>
        <span className="text-tm-muted">Квартир: <b className="text-tm-text">{params.apartments}</b></span>
        <span className={`font-medium ${totalDeficit > 0 ? 'text-red-400' : 'text-green-400'}`}>
          {totalDeficit > 0 ? `${totalDeficit} дефицитов` : 'Дефицитов нет'}
        </span>
      </div>

      {/* Balance cards */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {params.population === 0 ? (
          <EmptyState />
        ) : (
          balances.map(balance => (
            <BalanceCard key={balance.type} balance={balance} />
          ))
        )}
      </div>
    </div>
  )
}

function BalanceCard({ balance }: { balance: InfrastructureBalance }) {
  const [expanded, setExpanded] = useState(false)
  const isDeficit = balance.deficit > 0
  const isSurplus = balance.surplus > 0 && !isDeficit

  return (
    <div className="bg-tm-surface border border-tm-border rounded-lg overflow-hidden">
      <button
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-tm-panel transition-colors text-left"
        onClick={() => setExpanded(e => !e)}
      >
        {isDeficit ? (
          <TrendingDown size={14} className="text-red-400 shrink-0" />
        ) : isSurplus ? (
          <TrendingUp size={14} className="text-green-400 shrink-0" />
        ) : (
          <Minus size={14} className="text-tm-muted shrink-0" />
        )}

        <span className="text-sm flex-1">{balance.typeName}</span>

        {/* Coverage bar */}
        <div className="w-24 h-1.5 bg-tm-border rounded-full overflow-hidden mx-2">
          <div
            className={`h-full rounded-full transition-all ${isDeficit ? 'bg-red-500' : 'bg-green-500'}`}
            style={{ width: `${Math.min(100, balance.coveragePercent)}%` }}
          />
        </div>

        <span className={`text-xs font-mono font-bold ${isDeficit ? 'text-red-400' : 'text-green-400'}`}>
          {balance.coveragePercent.toFixed(0)}%
        </span>

        {balance.demandQuality === 'low' && (
          <span className="text-xs text-amber-500 ml-1">демо</span>
        )}
      </button>

      {expanded && (
        <div className="px-4 pb-3 border-t border-tm-border text-xs space-y-2">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2">
            <Row label="Потребность" value={`${balance.normativeDemand} ${balance.capacityUnit}`} />
            <Row label="Проектируемая" value={`${balance.projectedCapacity} ${balance.capacityUnit}`} />
            <Row label="Существующая" value={`${balance.existingAvailableCapacity} ${balance.capacityUnit}`} />
            <Row label="Всего" value={`${balance.totalCapacity} ${balance.capacityUnit}`} />
            {isDeficit && (
              <Row label="Дефицит" value={`${balance.deficit} ${balance.capacityUnit}`} accent="error" />
            )}
            {isSurplus && (
              <Row label="Профицит" value={`${balance.surplus} ${balance.capacityUnit}`} accent="success" />
            )}
            <Row label="Нас. вне зоны" value={balance.populationOutsideZone.toLocaleString('ru')} />
          </div>

          <p className="text-tm-muted mt-2 leading-relaxed">{balance.explanation}</p>

          {balance.assumptions.map((a, i) => (
            <p key={i} className="text-amber-500">⚠ {a}</p>
          ))}
          {balance.limitations.map((l, i) => (
            <p key={i} className="text-tm-dim">ℹ {l}</p>
          ))}

          <p className="text-tm-muted">Источник нормативов: {balance.demandSource}</p>
        </div>
      )}
    </div>
  )
}

function Row({ label, value, accent }: { label: string; value: string; accent?: 'error' | 'success' }) {
  const color = accent === 'error' ? 'text-red-400' : accent === 'success' ? 'text-green-400' : 'text-tm-text'
  return (
    <>
      <span className="text-tm-muted">{label}</span>
      <span className={`font-mono ${color}`}>{value}</span>
    </>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-tm-muted">
      <AlertCircle size={32} className="mb-3" />
      <p>Нет данных о населении</p>
      <p className="text-xs mt-1">Добавьте здания с жителями для расчёта потребности</p>
    </div>
  )
}
