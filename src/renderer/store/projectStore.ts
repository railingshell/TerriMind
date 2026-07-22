// TerriMind — Project state store
// Single source of truth for all project data.
// All mutations go through commands (Undo/Redo compatible).

import type { TerriMindProject } from '@shared/types/project'
import type { LandParcel } from '@shared/types/parcels'
import type { InfrastructureObject, ExternalInfrastructureObject } from '@shared/types/infrastructure'
import type { ParkingFacility, ParkingDemandRule } from '@shared/types/parking'
import type { TerritorialConstraint, SpatialConflict } from '@shared/types/constraints'
import type { TerrainMetadata, ElevationPoint, DesignSurface } from '@shared/types/terrain'
import type { UtilityNetwork, UtilityConnectionPoint } from '@shared/types/utilities'
import type { TransitStop, MobilityGraph } from '@shared/types/accessibility'
import type { SuitabilitySettings } from '@shared/types/suitability'
import { generateId, nowISO } from '@shared/utils/id'
import { PROJECT_FORMAT_VERSION } from '@shared/types/project'

// ---- Command interface (Undo/Redo) ----

export interface Command {
  id: string
  type: string
  description: string
  execute(state: TerriMindProject): TerriMindProject
  undo(state: TerriMindProject): TerriMindProject
}

// ---- Store ----

export type Listener = () => void

class ProjectStore {
  private project: TerriMindProject = createEmptyProject()
  private history: Command[] = []
  private future: Command[] = []
  private maxHistory = 200
  private listeners: Set<Listener> = new Set()
  private mobilityGraph: MobilityGraph | null = null
  private isGraphStale = true

  // ---- Subscriptions ----

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  private notify() {
    for (const fn of this.listeners) fn()
  }

  // ---- Read ----

  getProject(): Readonly<TerriMindProject> { return this.project }
  getBlocks() { return this.project.blocks }
  getBuildings() { return this.project.buildings }
  getRoads() { return this.project.roads }
  getParcels() { return this.project.parcels }
  getInfrastructureObjects() { return this.project.infrastructureObjects }
  getExternalInfrastructure() { return this.project.externalInfrastructure }
  getParkingFacilities() { return this.project.parkingFacilities }
  getParkingRules() { return this.project.parkingRules }
  getConstraints() { return this.project.constraints }
  getSpatialConflicts() { return this.project.spatialConflicts }
  getUtilities() { return this.project.utilities }
  getUtilityConnectionPoints() { return this.project.utilityConnectionPoints }
  getTransitStops() { return this.project.transitStops }
  getDesignSurfaces() { return this.project.designSurfaces }
  getSuitabilitySettings() { return this.project.suitabilitySettings ?? null }
  getMobilityGraph() { return this.mobilityGraph }
  isGraphStaleGet() { return this.isGraphStale }

  // ---- Undo/Redo ----

  canUndo(): boolean { return this.history.length > 0 }
  canRedo(): boolean { return this.future.length > 0 }

  execute(command: Command): void {
    const next = command.execute(this.project)
    this.history.push(command)
    if (this.history.length > this.maxHistory) this.history.shift()
    this.future = []
    this.project = next
    this.isGraphStale = true
    this.notify()
  }

  undo(): void {
    const cmd = this.history.pop()
    if (!cmd) return
    const prev = cmd.undo(this.project)
    this.future.push(cmd)
    this.project = prev
    this.isGraphStale = true
    this.notify()
  }

  redo(): void {
    const cmd = this.future.pop()
    if (!cmd) return
    const next = cmd.execute(this.project)
    this.history.push(cmd)
    this.project = next
    this.isGraphStale = true
    this.notify()
  }

  getHistoryLength() { return this.history.length }

  // ---- Project lifecycle ----

  loadProject(p: TerriMindProject): void {
    this.project = p
    this.history = []
    this.future = []
    this.mobilityGraph = null
    this.isGraphStale = true
    this.notify()
  }

  newProject(name: string): void {
    const p = createEmptyProject()
    p.name = name
    this.loadProject(p)
  }

  // ---- Graph ----

  setMobilityGraph(graph: MobilityGraph): void {
    this.mobilityGraph = graph
    this.isGraphStale = false
    this.notify()
  }

  markGraphStale(): void {
    this.isGraphStale = true
    this.notify()
  }

  // ---- Direct mutations (for non-undoable operations) ----

  updateSpatialConflicts(conflicts: SpatialConflict[]): void {
    this.project = {
      ...this.project,
      spatialConflicts: conflicts,
      updatedAt: nowISO()
    }
    this.notify()
  }

  setSuitabilitySettings(settings: SuitabilitySettings): void {
    this.project = {
      ...this.project,
      suitabilitySettings: settings,
      updatedAt: nowISO()
    }
    this.notify()
  }
}

export const store = new ProjectStore()

// ---- Command factory helpers ----

export function addParcelCommand(parcel: LandParcel): Command {
  return {
    id: generateId(),
    type: 'ADD_PARCEL',
    description: `Добавить участок ${parcel.projectNumber}`,
    execute(state) {
      return { ...state, parcels: [...state.parcels, parcel], updatedAt: nowISO() }
    },
    undo(state) {
      return { ...state, parcels: state.parcels.filter(p => p.id !== parcel.id), updatedAt: nowISO() }
    }
  }
}

export function updateParcelCommand(updated: LandParcel): Command {
  return {
    id: generateId(),
    type: 'UPDATE_PARCEL',
    description: `Изменить участок ${updated.projectNumber}`,
    execute(state) {
      return {
        ...state,
        parcels: state.parcels.map(p => p.id === updated.id ? updated : p),
        updatedAt: nowISO()
      }
    },
    undo(state) {
      const original = state.parcels.find(p => p.id === updated.id)
      if (!original) return state
      return {
        ...state,
        parcels: state.parcels.map(p => p.id === updated.id ? original : p),
        updatedAt: nowISO()
      }
    }
  }
}

export function deleteParcelCommand(parcelId: string): Command {
  let deleted: LandParcel | undefined
  return {
    id: generateId(),
    type: 'DELETE_PARCEL',
    description: 'Удалить участок',
    execute(state) {
      deleted = state.parcels.find(p => p.id === parcelId)
      return { ...state, parcels: state.parcels.filter(p => p.id !== parcelId), updatedAt: nowISO() }
    },
    undo(state) {
      if (!deleted) return state
      return { ...state, parcels: [...state.parcels, deleted], updatedAt: nowISO() }
    }
  }
}

export function addParcelsCommand(parcels: LandParcel[], blockId: string): Command {
  const ids = parcels.map(p => p.id)
  return {
    id: generateId(),
    type: 'ADD_PARCELS_BATCH',
    description: `Межевание квартала (${parcels.length} участков)`,
    execute(state) {
      return {
        ...state,
        blocks: state.blocks.map(b =>
          b.id === blockId ? { ...b, parcelIds: [...b.parcelIds, ...ids] } : b
        ),
        parcels: [...state.parcels, ...parcels],
        updatedAt: nowISO()
      }
    },
    undo(state) {
      return {
        ...state,
        blocks: state.blocks.map(b =>
          b.id === blockId ? { ...b, parcelIds: b.parcelIds.filter(id => !ids.includes(id)) } : b
        ),
        parcels: state.parcels.filter(p => !ids.includes(p.id)),
        updatedAt: nowISO()
      }
    }
  }
}

export function addConstraintCommand(c: TerritorialConstraint): Command {
  return {
    id: generateId(),
    type: 'ADD_CONSTRAINT',
    description: `Добавить ограничение: ${c.name}`,
    execute(state) {
      return { ...state, constraints: [...state.constraints, c], updatedAt: nowISO() }
    },
    undo(state) {
      return { ...state, constraints: state.constraints.filter(x => x.id !== c.id), updatedAt: nowISO() }
    }
  }
}

export function addInfraObjectCommand(obj: InfrastructureObject): Command {
  return {
    id: generateId(),
    type: 'ADD_INFRA_OBJECT',
    description: `Добавить объект: ${obj.name}`,
    execute(state) {
      return { ...state, infrastructureObjects: [...state.infrastructureObjects, obj], updatedAt: nowISO() }
    },
    undo(state) {
      return { ...state, infrastructureObjects: state.infrastructureObjects.filter(x => x.id !== obj.id), updatedAt: nowISO() }
    }
  }
}

export function addParkingCommand(p: ParkingFacility): Command {
  return {
    id: generateId(),
    type: 'ADD_PARKING',
    description: `Добавить парковку`,
    execute(state) {
      return { ...state, parkingFacilities: [...state.parkingFacilities, p], updatedAt: nowISO() }
    },
    undo(state) {
      return { ...state, parkingFacilities: state.parkingFacilities.filter(x => x.id !== p.id), updatedAt: nowISO() }
    }
  }
}

export function addUtilityCommand(u: UtilityNetwork): Command {
  return {
    id: generateId(),
    type: 'ADD_UTILITY',
    description: `Добавить сеть: ${u.name}`,
    execute(state) {
      return { ...state, utilities: [...state.utilities, u], updatedAt: nowISO() }
    },
    undo(state) {
      return { ...state, utilities: state.utilities.filter(x => x.id !== u.id), updatedAt: nowISO() }
    }
  }
}

// ---- Empty project factory ----

function createEmptyProject(): TerriMindProject {
  const now = nowISO()
  return {
    version: PROJECT_FORMAT_VERSION,
    id: generateId(),
    name: 'Новый проект',
    description: '',
    createdAt: now,
    updatedAt: now,
    crs: { originLng: 0, originLat: 0, rotation: 0 },
    blocks: [],
    buildings: [],
    roads: [],
    zones: [],
    parcels: [],
    infrastructureObjects: [],
    externalInfrastructure: [],
    parkingFacilities: [],
    parkingRules: [],
    transitStops: [],
    mobilityGraphNodes: [],
    mobilityGraphEdges: [],
    constraints: [],
    spatialConflicts: [],
    userConflictResolutions: [],
    terrainFiles: [],
    elevationPoints: [],
    designSurfaces: [],
    utilities: [],
    utilityConnectionPoints: [],
    normativeProfiles: [],
    activeProfileId: '',
    scenarios: [{ id: generateId(), name: 'Базовый', description: 'Базовый сценарий', isBase: true, createdAt: now }],
    activeScenarioId: undefined,
    calculationModelVersions: { parcels: '5.0', infrastructure: '5.0', accessibility: '5.0', parking: '5.0', terrain: '5.0' },
    dataQualityLog: []
  }
}
