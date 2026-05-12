import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { createLogger } from '@/shared/logging/logger'
import {
  getMigrationErrors,
  migrateFromLegacyIDB,
  type MigrationReport,
} from '@/infrastructure/storage/legacy-idb'

const logger = createLogger('LegacyMigrationErrors')

type StoreError = MigrationReport['errors'][number]

interface Props {
  onRetried?: () => Promise<void> | void
}

type State =
  | { kind: 'checking' }
  | { kind: 'idle' }
  | { kind: 'show'; errors: StoreError[] }
  | { kind: 'running' }
  | { kind: 'dismissed' }

function groupByStore(errors: StoreError[]): Array<{ store: string; count: number }> {
  const counts = new Map<string, number>()
  for (const e of errors) {
    counts.set(e.store, (counts.get(e.store) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([store, count]) => ({ store, count }))
    .sort((a, b) => b.count - a.count)
}

export function LegacyMigrationErrors({ onRetried }: Props) {
  const [state, setState] = useState<State>({ kind: 'checking' })
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const errors = await getMigrationErrors()
        if (cancelled) return
        setState(errors.length > 0 ? { kind: 'show', errors } : { kind: 'idle' })
      } catch (error) {
        logger.warn('getMigrationErrors failed', error)
        if (!cancelled) setState({ kind: 'idle' })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const handleRetry = useCallback(async () => {
    setState({ kind: 'running' })
    try {
      const report = await migrateFromLegacyIDB()
      if (report.errors.length === 0) {
        toast.success('重试成功，所有条目均已迁移。')
        setState({ kind: 'idle' })
      } else {
        toast.warning(`重试后仍有 ${report.errors.length} 条记录失败。`)
        setState({ kind: 'show', errors: report.errors })
      }
      await onRetried?.()
    } catch (error) {
      logger.error('retry migration failed', error)
      toast.error('重试失败', {
        description: error instanceof Error ? error.message : '未知错误',
      })
      const errors = await getMigrationErrors()
      setState(errors.length > 0 ? { kind: 'show', errors } : { kind: 'idle' })
    }
  }, [onRetried])

  const grouped = useMemo(() => (state.kind === 'show' ? groupByStore(state.errors) : []), [state])

  if (state.kind === 'checking' || state.kind === 'idle' || state.kind === 'dismissed') {
    return null
  }

  if (state.kind === 'running') {
    return (
      <div className="panel-bg border border-border rounded-lg p-4 flex items-center gap-3 text-sm">
        <RefreshCw className="h-4 w-4 animate-spin" />
        <span>正在重试迁移...</span>
      </div>
    )
  }

  const total = state.errors.length

  return (
    <div className="panel-bg border border-yellow-500/40 rounded-lg p-4 text-sm">
      <div className="flex items-start gap-3">
        <AlertTriangle className="h-4 w-4 mt-0.5 text-yellow-500 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="font-medium">仍有 {total} 条数据迁移失败</div>
          <div className="text-muted-foreground text-xs mt-1">
            {grouped.map(({ store, count }) => `${store}: ${count}`).join('，')}
            。请重试迁移以补齐缺失数据。
          </div>

          {expanded && (
            <ul className="mt-3 space-y-1 text-xs font-mono text-muted-foreground max-h-48 overflow-y-auto">
              {state.errors.map((e, i) => (
                <li key={`${e.store}-${e.id}-${i}`} className="truncate">
                  <span className="text-foreground">{e.store}</span>
                  <span className="mx-1">·</span>
                  <span>{e.id}</span>
                  <span className="mx-1">·</span>
                  <span>{e.error}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <Button size="sm" onClick={() => void handleRetry()} className="gap-2">
          <RefreshCw className="h-3 w-3" /> 重试
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setExpanded((v) => !v)}>
          {expanded ? '收起详情' : '查看详情'}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setState({ kind: 'dismissed' })}>
          关闭
        </Button>
      </div>
    </div>
  )
}
