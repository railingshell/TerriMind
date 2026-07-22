// TerriMind — common types shared across all modules

export type StableId = string // UUID v4

export type ISODateString = string // ISO 8601

export interface Timestamped {
  createdAt: ISODateString
  updatedAt: ISODateString
}

export interface UserEditable {
  isManuallyEdited: boolean
  isLocked: boolean
  userMetadata: Record<string, unknown>
}

export type DataQuality = 'high' | 'medium' | 'low' | 'unknown'

export type ConfidenceLevel = 'confirmed' | 'estimated' | 'assumed' | 'missing'

export type ObjectStatus = 'active' | 'inactive' | 'deleted' | 'draft'

export type SourceType =
  | 'manual'
  | 'auto-generated'
  | 'imported-geojson'
  | 'imported-csv'
  | 'imported-gis'
  | 'normative-profile'
  | 'calculated'
  | 'external'

export interface DataSource {
  type: SourceType
  label: string
  reference?: string
  importedAt?: ISODateString
}

export type Severity = 'critical' | 'error' | 'warning' | 'info'

export interface Violation {
  id: StableId
  code: string
  severity: Severity
  message: string
  ruleSource: string
  affectedObjectId?: StableId
  resolvedAt?: ISODateString
  resolutionComment?: string
}

export interface CalculationMeta {
  calculatedAt: ISODateString
  version: string
  quality: DataQuality
  assumptions: string[]
  limitations: string[]
  inputDataSources: DataSource[]
}

export type ScenarioId = StableId

export interface WithScenarios {
  scenarioId?: ScenarioId
}

export type Unit =
  | 'm2'   // square metres
  | 'm3'   // cubic metres
  | 'm'    // metres
  | 'km'   // kilometres
  | 'ha'   // hectares
  | 'unit' // count
  | 'person'
  | 'place'
  | 'apartment'
  | 'room'
  | 'floor'
  | 'spot' // parking spot
  | 'min'  // minutes
  | 'rub'  // rubles

export interface Quantity {
  value: number
  unit: Unit
}
