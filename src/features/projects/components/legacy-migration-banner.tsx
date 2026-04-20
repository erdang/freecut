import { useCallback, useEffect, useRef, useState } from 'react';
import { Database, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { createLogger } from '@/shared/logging/logger';
import {
  deleteLegacyIDB,
  getMigrationStatus,
  hasLegacyData,
  migrateFromLegacyIDB,
  type MigrationProgress,
  type MigrationReport,
} from '@/infrastructure/storage/legacy-idb';

const logger = createLogger('LegacyMigrationBanner');

interface Props {
  onMigrated?: () => Promise<void> | void;
}

type State =
  | { kind: 'checking' }
  | { kind: 'idle' }
  | { kind: 'prompt' }
  | { kind: 'running'; progress: MigrationProgress | null }
  | { kind: 'done'; report: MigrationReport }
  | { kind: 'dismissed' };

/**
 * Clamp to [0, 100] for the progress bar. A `total` of 0 (no work) maps to
 * full progress so the bar doesn't appear stuck at 0 while the finalizing
 * step runs against an empty legacy DB.
 */
function computePercent(progress: MigrationProgress | null): number {
  if (!progress) return 0;
  if (progress.total === 0) return 100;
  const pct = (progress.processed / progress.total) * 100;
  return Math.max(0, Math.min(100, pct));
}

export function LegacyMigrationBanner({ onMigrated }: Props) {
  const [state, setState] = useState<State>({ kind: 'checking' });
  const [confirmDelete, setConfirmDelete] = useState(false);
  // The progress callback fires rapidly (once per write). We keep a ref
  // so React batches updates via a single setState per tick without
  // stale-closure hazards.
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const status = await getMigrationStatus();
        if (status.migrated) {
          if (!cancelled) setState({ kind: 'idle' });
          return;
        }
        const has = await hasLegacyData();
        if (cancelled) return;
        setState({ kind: has ? 'prompt' : 'idle' });
      } catch (error) {
        logger.warn('detect legacy data failed', error);
        if (!cancelled) setState({ kind: 'idle' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleMigrate = useCallback(async () => {
    setState({ kind: 'running', progress: null });
    try {
      const report = await migrateFromLegacyIDB({
        onProgress: (progress) => {
          // Only update while the banner is in the running state. If the
          // user has navigated away (component unmounts) the state setter
          // is a no-op; the ref guard avoids a needless state flip if a
          // late progress event arrives after the run resolved.
          if (stateRef.current.kind !== 'running') return;
          setState({ kind: 'running', progress });
        },
      });
      setState({ kind: 'done', report });
      toast.success(
        `已迁移 ${report.projects} 个项目和 ${report.media} 个媒体文件`,
      );
      await onMigrated?.();
    } catch (error) {
      logger.error('Migration failed', error);
      toast.error('迁移失败', {
        description: error instanceof Error ? error.message : '未知错误',
      });
      setState({ kind: 'prompt' });
    }
  }, [onMigrated]);

  const handleDeleteLegacy = useCallback(async () => {
    try {
      await deleteLegacyIDB();
      toast.success('已清除旧版浏览器存储');
      setState({ kind: 'dismissed' });
    } catch (error) {
      logger.error('Failed to delete legacy IDB', error);
      toast.error('清除旧版存储失败', {
        description: error instanceof Error ? error.message : '未知错误',
      });
    } finally {
      setConfirmDelete(false);
    }
  }, []);

  if (state.kind === 'checking' || state.kind === 'idle' || state.kind === 'dismissed') {
    return null;
  }

  if (state.kind === 'running') {
    const { progress } = state;
    const percent = computePercent(progress);
    // Show label from progress if available; fall back to a generic line
    // during the brief gap before the first tick arrives.
    const label = progress?.phaseLabel ?? '正在准备迁移…';
    const countsLine = progress
      ? `${progress.processed} of ${progress.total}`
      : null;

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
              如果媒体库较大，这一步可能需要一些时间。请不要关闭当前标签页。
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
          <div className="text-xs text-muted-foreground font-mono tabular-nums">
            {countsLine}
          </div>
        )}
      </div>
    );
  }

  if (state.kind === 'done') {
    const { report } = state;
    return (
      <>
        <div className="panel-bg border border-border rounded-lg p-4 text-sm space-y-2">
          <div className="flex items-start gap-3">
            <Database className="h-4 w-4 mt-0.5" />
            <div className="flex-1">
              <div className="font-medium">迁移完成</div>
              <div className="text-muted-foreground text-xs mt-1">
                {report.projects} 个项目、{report.media} 个媒体、{report.thumbnails} 张缩略图、{report.transcripts} 条转录
                {report.errors.length > 0 && ` · 记录了 ${report.errors.length} 个错误`}
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
                这会从当前浏览器中永久删除旧的 IndexedDB 数据库
                （<span className="font-mono">video-editor-db</span>）。
                你的工作区文件夹不会受影响。请在确认迁移成功后再执行此操作。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>取消</AlertDialogCancel>
              <AlertDialogAction onClick={() => void handleDeleteLegacy()}>
                删除
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    );
  }

  // prompt
  return (
    <div className="panel-bg border border-border rounded-lg p-4 text-sm">
      <div className="flex items-start gap-3">
        <Database className="h-4 w-4 mt-0.5 text-muted-foreground" />
        <div className="flex-1">
          <div className="font-medium">发现旧版项目数据</div>
          <div className="text-muted-foreground text-xs mt-1">
            在工作区迁移之前创建的旧项目仍保存在当前浏览器的 IndexedDB 中。
            迁移到工作区后，你就能和新项目一起统一查看它们。
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
  );
}
