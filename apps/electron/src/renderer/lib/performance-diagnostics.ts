const LONG_TASK_THRESHOLD_MS = 80
const SLOW_HANDLER_THRESHOLD_MS = 16

type PerfEntryWithAttribution = PerformanceEntry & {
  attribution?: Array<{ name?: string; entryType?: string; startTime?: number; duration?: number }>
}

function nowMs(): number {
  return performance.now()
}

export function createPerfTrace(scope: string, meta?: Record<string, unknown>): (label: string, extra?: Record<string, unknown>) => void {
  const startedAt = nowMs()
  let lastAt = startedAt
  return (label, extra) => {
    const current = nowMs()
    const payload = {
      totalMs: Number((current - startedAt).toFixed(1)),
      deltaMs: Number((current - lastAt).toFixed(1)),
      ...meta,
      ...extra,
    }
    lastAt = current
    console.log(`[性能诊断][${scope}] ${label}`, payload)
  }
}

export function logIfSlow(scope: string, label: string, startedAt: number, meta?: Record<string, unknown>, thresholdMs = SLOW_HANDLER_THRESHOLD_MS): void {
  const durationMs = nowMs() - startedAt
  if (durationMs < thresholdMs) return
  console.warn(`[性能诊断][${scope}] ${label} 耗时偏高`, {
    durationMs: Number(durationMs.toFixed(1)),
    ...meta,
  })
}

export function installRendererLongTaskDiagnostics(): void {
  const PerformanceObserverCtor = window.PerformanceObserver
  if (!PerformanceObserverCtor) return

  try {
    const supported = PerformanceObserverCtor.supportedEntryTypes ?? []
    if (!supported.includes('longtask')) return

    const observer = new PerformanceObserverCtor((list) => {
      for (const entry of list.getEntries() as PerfEntryWithAttribution[]) {
        if (entry.duration < LONG_TASK_THRESHOLD_MS) continue
        console.warn('[性能诊断][renderer-longtask] 渲染线程长任务', {
          startTimeMs: Number(entry.startTime.toFixed(1)),
          durationMs: Number(entry.duration.toFixed(1)),
          name: entry.name,
          attribution: entry.attribution?.map((item) => ({
            name: item.name,
            entryType: item.entryType,
            startTimeMs: item.startTime != null ? Number(item.startTime.toFixed(1)) : undefined,
            durationMs: item.duration != null ? Number(item.duration.toFixed(1)) : undefined,
          })),
        })
      }
    })
    observer.observe({ entryTypes: ['longtask'] })
  } catch (error) {
    console.warn('[性能诊断][renderer-longtask] 长任务监听初始化失败:', error)
  }
}
