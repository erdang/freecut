import { useCallback, useEffect, useRef, useState } from 'react'
import { Database, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { createLogger } from '@/shared/logging/logger'
import {
  deleteLegacyIDB,
  getMigrationStatus,
  hasLegacyData,
  migrateFromLegacyIDB,
  type MigrationProgress,
  type MigrationReport,
} from '@/infrastructure/storage/legacy-idb'

const logger = createLogger('LegacyMigrationBanner')

interface Props {
  onMigrated?: () => Promise<void> | void
}

type State =
  | { kind: 'checking' }
  | { kind: 'idle' }
  | { kind: 'prompt' }
  | { kind: 'running'; progress: MigrationProgress | null }
  | { kind: 'done'; report: MigrationReport }
  | { kind: 'dismissed' }

function computePercent(progress: MigrationProgress | null): number {
  if (!progress) return 0
  if (progress.total === 0) return 100
  const pct = (progress.processed / progress.total) * 100
  return Math.max(0, Math.min(100, pct))
}

export function LegacyMigrationBanner({ onMigrated }: Props) {
  const [state, setState] = useState<State>({ kind: 'checking' })
  const [confirmDelete, setConfirmDelete] = useState(false)
  const stateRef = useRef(state)
  stateRef.current = state

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const status = await getMigrationStatus()
        if (status.migrated) {
          if (!cancelled) setState({ kind: 'idle' })
          return
        }
        const has = await hasLegacyData()
        if (cancelled) return
        setState({ kind: has ? 'prompt' : 'idle' })
      } catch (error) {
        logger.warn('detect legacy data failed', error)
        if (!cancelled) setState({ kind: 'idle' })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const handleMigrate = useCallback(async () => {
    setState({ kind: 'running', progress: null })
    try {
      const report = await migrateFromLegacyIDB({
        onProgress: (progress) => {
          if (stateRef.current.kind !== 'running') return
          setState({ kind: 'running', progress })
        },
      })
      setState({ kind: 'done', report })
      toast.success(`已迁移 ${report.projects} 个项目和 ${report.media} 个媒体`)
      await onMigrated?.()
    } catch (error) {
      logger.error('Migration failed', error)
      toast.error('迁移失败', {
        description: error instanceof Error ? error.message : '未知错误',
      })
      setState({ kind: 'prompt' })
    }
  }, [onMigrated])

  const handleDeleteLegacy = useCallback(async () => {
    try {
      await deleteLegacyIDB()
      toast.success('已清理旧版浏览器存储')
      setState({ kind: 'dismissed' })
    } catch (error) {
      logger.error('Failed to delete legacy IDB', error)
      toast.error('清理旧版存储失败', {
        description: error instanceof Error ? error.message : '未知错误',
      })
    } finally {
      setConfirmDelete(false)
    }
  }, [])

  if (state.kind === 'checking' || state.kind === 'idle' || state.kind === 'dismissed') {
    return null
  }

  if (state.kind === 'running') {
    const { progress } = state
    const percent = computePercent(progress)
    const label = progress?.phaseLabel ?? '准备迁移中...'
    const countsLine = progress ? `${progress.processed} / ${progress.total}` : null

    return (
      <div
        className="panel-bg border border-border rounded-lg p-4 space-y-3 text-sm"
        role="status"
        aria-live="polite"
      >
        <div className="flex items-center gap-3">
          <Database className="h-4 w-4 animate-pulse shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="font-medium truncate">{label}</div>
            <div className="text-muted-foreground text-xs mt-0.5">
              媒体较多时可能需要一点时间，请不要关闭当前页面。
            </div>
          </div>
          <div className="text-xs font-mono tabular-nums text-muted-foreground shrink-0">
            {Math.round(percent)}%
          </div>
        </div>
        <Progress
          value={percent}
          className="h-2"
          aria-label={label}
          aria-valuenow={Math.round(percent)}
          aria-valuemin={0}
          aria-valuemax={100}
        />
        {countsLine && (
          <div className="text-xs text-muted-foreground font-mono tabular-nums">{countsLine}</div>
        )}
      </div>
    )
  }

  if (state.kind === 'done') {
    const { report } = state
    return (
      <>
        <div className="panel-bg border border-border rounded-lg p-4 text-sm space-y-2">
          <div className="flex items-start gap-3">
            <Database className="h-4 w-4 mt-0.5" />
            <div className="flex-1">
              <div className="font-medium">迁移完成</div>
              <div className="text-muted-foreground text-xs mt-1">
                {report.projects} 个项目，{report.media} 个媒体，{report.thumbnails} 个缩略图，
                {report.transcripts} 份转录
                {report.errors.length > 0 && `，并记录 ${report.errors.length} 条错误`}
              </div>
            </div>
            <Button
              variant="destructive"
              size="sm"
              className="gap-2"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 className="h-3 w-3" /> 删除旧版存储
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setState({ kind: 'dismissed' })}>
              关闭
            </Button>
          </div>
        </div>

        <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>删除旧版浏览器存储？</AlertDialogTitle>
              <AlertDialogDescription>
                该操作会永久删除当前浏览器中的旧 IndexedDB 数据库 （
                <span className="font-mono">video-editor-db</span>）。不会影响工作区文件夹中的数据。
                请在确认迁移成功后再执行。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>取消</AlertDialogCancel>
              <AlertDialogAction onClick={() => void handleDeleteLegacy()}>删除</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    )
  }

  return (
    <div className="panel-bg border border-border rounded-lg p-4 text-sm">
      <div className="flex items-start gap-3">
        <Database className="h-4 w-4 mt-0.5 text-muted-foreground" />
        <div className="flex-1">
          <div className="font-medium">发现旧版项目数据</div>
          <div className="text-muted-foreground text-xs mt-1">
            工作区迁移之前的项目仍保存在浏览器 IndexedDB
            中。可将其迁移到当前工作区，统一管理新旧项目。
          </div>
        </div>
        <Button size="sm" onClick={() => void handleMigrate()}>
          立即迁移
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setState({ kind: 'dismissed' })}>
          稍后
        </Button>
      </div>
    </div>
  )
}
