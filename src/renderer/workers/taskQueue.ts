// TerriMind — Computation task queue
// Heavy operations run in workers, never in the renderer thread.

export type TaskStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'

export interface TaskProgress {
  taskId: string
  phase: string
  percent: number    // 0..100
  message: string
}

export interface TaskResult<T> {
  taskId: string
  status: TaskStatus
  result?: T
  error?: string
}

type ProgressCallback = (p: TaskProgress) => void
type ResultCallback<T> = (r: TaskResult<T>) => void

class ComputationTaskQueue {
  private running = 0
  private maxConcurrent = 2
  private pendingTasks: Array<() => Promise<void>> = []
  private activeTaskIds = new Set<string>()

  /** 
   * Enqueue a computation task.
   * Returns a promise that resolves when the task completes.
   */
  enqueue<T>(
    taskId: string,
    fn: (onProgress: ProgressCallback) => Promise<T>,
    onProgress?: ProgressCallback
  ): Promise<TaskResult<T>> {
    if (this.activeTaskIds.has(taskId)) {
      return Promise.resolve({ taskId, status: 'failed', error: 'Task already running' })
    }

    return new Promise(resolve => {
      const task = async () => {
        this.running++
        this.activeTaskIds.add(taskId)

        const progress: ProgressCallback = onProgress ?? (() => undefined)
        progress({ taskId, phase: 'Инициализация', percent: 0, message: 'Запуск...' })

        try {
          const result = await fn(progress)
          this.activeTaskIds.delete(taskId)
          this.running--
          this.processNext()
          resolve({ taskId, status: 'succeeded', result })
        } catch (err) {
          this.activeTaskIds.delete(taskId)
          this.running--
          this.processNext()
          const msg = err instanceof Error ? err.message : String(err)
          console.error(`Task ${taskId} failed:`, msg)
          resolve({ taskId, status: 'failed', error: msg })
        }
      }

      if (this.running < this.maxConcurrent) {
        task()
      } else {
        this.pendingTasks.push(task)
      }
    })
  }

  cancel(taskId: string): void {
    // Mark as cancelled — the running task must check cancellation itself
    this.activeTaskIds.delete(taskId)
  }

  private processNext(): void {
    const next = this.pendingTasks.shift()
    if (next) next()
  }

  isRunning(taskId: string): boolean {
    return this.activeTaskIds.has(taskId)
  }
}

export const taskQueue = new ComputationTaskQueue()

// ---- Task IDs ----
export const TASK_IDS = {
  PARCEL_GENERATION: 'parcel-generation',
  BUILD_GRAPH: 'build-mobility-graph',
  COMPUTE_ISOCHRONES: 'compute-isochrones',
  CONSTRAINT_ANALYSIS: 'constraint-analysis',
  SUITABILITY_MAP: 'suitability-map',
  TERRAIN_IMPORT: 'terrain-import',
  EARTHWORKS: 'earthworks-estimate',
  DRAINAGE: 'drainage-analysis',
  SLOPE_ANALYSIS: 'slope-analysis',
  PARKING_CALCULATION: 'parking-calculation',
  INFRA_DEMAND: 'infra-demand'
} as const
