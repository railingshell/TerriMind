import { describe, test, expect } from '@jest/globals'
import { migrateProject, validateProjectJson } from '../../src/shared/utils/migration'
import { PROJECT_FORMAT_VERSION } from '../../src/shared/types/project'

describe('validateProjectJson', () => {
  test('accepts valid project', () => {
    const raw = { id: 'abc', name: 'Test', version: '4.0.0' }
    const result = validateProjectJson(raw)
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  test('rejects non-object', () => {
    const result = validateProjectJson('string')
    expect(result.valid).toBe(false)
  })

  test('rejects missing id', () => {
    const result = validateProjectJson({ name: 'Test', version: '4.0.0' })
    expect(result.valid).toBe(false)
  })

  test('rejects future version', () => {
    const result = validateProjectJson({ id: 'x', name: 'Test', version: '99.0.0' })
    expect(result.valid).toBe(false)
  })
})

describe('migrateProject', () => {
  test('migrates v1 project without errors', () => {
    const raw = {
      id: 'abc', name: 'Old project', version: '1.0.0',
      blocks: [], buildings: [], roads: [], zones: []
    }
    const { project, result } = migrateProject(raw)
    expect(result.success).toBe(true)
    expect(project.version).toBe(PROJECT_FORMAT_VERSION)
  })

  test('preserves existing data fields', () => {
    const raw = {
      id: 'abc', name: 'My Project', version: '2.0.0',
      blocks: [{ id: 'block1' }],
      buildings: [{ id: 'bld1' }]
    }
    const { project } = migrateProject(raw)
    expect(project.blocks).toHaveLength(1)
    expect(project.buildings).toHaveLength(1)
  })

  test('adds Stage 5 arrays when missing', () => {
    const raw = {
      id: 'abc', name: 'Test', version: '3.0.0',
      blocks: [], buildings: [], roads: [], zones: []
    }
    const { project } = migrateProject(raw)
    expect(Array.isArray(project.parcels)).toBe(true)
    expect(Array.isArray(project.constraints)).toBe(true)
    expect(Array.isArray(project.utilities)).toBe(true)
    expect(Array.isArray(project.parkingFacilities)).toBe(true)
    expect(Array.isArray(project.infrastructureObjects)).toBe(true)
    expect(Array.isArray(project.designSurfaces)).toBe(true)
  })

  test('migration result tracks version path', () => {
    const raw = { id: 'x', name: 'Test', version: '2.0.0' }
    const { result } = migrateProject(raw)
    expect(result.fromVersion).toBe('2.0.0')
    expect(result.toVersion).toBe(PROJECT_FORMAT_VERSION)
  })

  test('no data lost for current version', () => {
    const raw = {
      id: 'abc', name: 'Test', version: PROJECT_FORMAT_VERSION,
      blocks: [{ id: 'b1' }], buildings: [], roads: [], zones: [],
      parcels: [{ id: 'p1' }],
      constraints: [], utilities: [], parkingFacilities: [],
      infrastructureObjects: [], designSurfaces: [], scenarios: []
    }
    const { project, result } = migrateProject(raw)
    expect(result.lostFields).toHaveLength(0)
    expect(project.parcels).toHaveLength(1)
  })
})
