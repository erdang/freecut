/**
 * Trash section on the Projects page.
 *
 * Shows a collapsible panel listing every trashed project (soft-deleted via
 * `softDeleteProject`). Each row offers Restore and Delete forever. A top
 * "Empty trash" action permanently deletes every entry in one go.
 *
 * Data flow:
 *   - Trashed projects live on disk as `projects/{id}/.freecut-trashed.json`
 *     markers; the authoritative list comes from `listTrashedProjects()`.
 *   - The live projects store doesn't track trashed items, so this
 *     component self-manages the list via `useState`.
 *   - Whenever the live projects array changes (soft-delete, restore,
 *     create, delete), we re-fetch the trash list. This covers the Undo
 *     toast path — it calls `restoreProject`, which mutates the live list,
 *     which triggers our refresh.
 *   - Permanent-delete and Empty trash do NOT touch the live list, so
 *     those handlers refresh manually.
 *
 * Auto-hide: when the trash is empty the section collapses to nothing —
 * zero visual noise for the common case. A count badge in the header makes
 * the feature discoverable when something's there.
 */

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ChevronRight, Trash2, RotateCcw, AlertTriangle } from 'lucide-react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
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
import {
  listTrashedProjects,
  type TrashedProjectEntry,
} from '@/infrastructure/storage';
import { createLogger } from '@/shared/logging/logger';
import { useProjectStore } from '../stores/project-store';
import {
  usePermanentlyDeleteProject,
  useRestoreProject,
} from '../hooks/use-project-actions';
import { formatRelativeTime } from '../utils/project-helpers';

const logger = createLogger('TrashSection');

type ConfirmTarget =
  | { kind: 'single'; id: string; name: string }
  | { kind: 'empty'; count: number }
  | null;

export function TrashSection() {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<TrashedProjectEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [isEmptying, setIsEmptying] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmTarget>(null);

  const restoreProject = useRestoreProject();
  const permanentlyDeleteProject = usePermanentlyDeleteProject();

  // Subscribe to the live projects array so any soft-delete / restore /
  // create / delete (which mutate the live list) triggers a trash refresh.
  // Subscribing to the array reference is fine — Zustand returns a new
  // reference on every update we care about here.
  const projects = useProjectStore((s) => s.projects);

  const refresh = useCallback(async () => {
    try {
      const next = await listTrashedProjects();
      setEntries(next);
      setLoaded(true);
    } catch (error) {
      logger.warn('Failed to list trashed projects', error);
      setEntries([]);
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh, projects]);

  const handleRestore = useCallback(
    async (entry: TrashedProjectEntry) => {
      setBusyId(entry.id);
      const result = await restoreProject(entry.id);
      setBusyId(null);
      if (result.success) {
        toast.success(`已恢复“${entry.marker.originalName}”`);
        // `restoreProject` updates the live projects list which cascades
        // to our refresh via the useEffect on `projects`. No manual call
        // needed.
      } else {
        toast.error('恢复项目失败', { description: result.error });
      }
    },
    [restoreProject],
  );

  const handleDeleteForever = useCallback(
    async (entry: TrashedProjectEntry) => {
      setBusyId(entry.id);
      const result = await permanentlyDeleteProject(entry.id);
      setBusyId(null);
      if (result.success) {
        toast.success(`已永久删除“${entry.marker.originalName}”`);
        // Permanent delete doesn't touch the live projects list, so we
        // refresh the trash list by hand.
        await refresh();
      } else {
        toast.error('删除项目失败', { description: result.error });
      }
    },
    [permanentlyDeleteProject, refresh],
  );

  const handleEmptyTrash = useCallback(async () => {
    // Snapshot the current list so we don't race with refresh() mid-loop.
    const snapshot = entries;
    setIsEmptying(true);
    let succeeded = 0;
    const failures: string[] = [];
    for (const entry of snapshot) {
      const result = await permanentlyDeleteProject(entry.id);
      if (result.success) succeeded++;
      else failures.push(entry.marker.originalName);
    }
    setIsEmptying(false);
    await refresh();

    if (failures.length === 0) {
      toast.success(
        succeeded === 1
          ? '已清空回收站（删除 1 个项目）'
          : `已清空回收站（删除 ${succeeded} 个项目）`,
      );
    } else {
      toast.error(
        `清空回收站时有 ${failures.length} 项失败`,
        {
          description: `删除失败：${failures.slice(0, 3).join('、')}${failures.length > 3 ? '…' : ''}`,
        },
      );
    }
  }, [entries, permanentlyDeleteProject, refresh]);

  const confirmAction = useCallback(async () => {
    if (!confirm) return;
    if (confirm.kind === 'single') {
      const entry = entries.find((e) => e.id === confirm.id);
      setConfirm(null);
      if (entry) await handleDeleteForever(entry);
    } else {
      setConfirm(null);
      await handleEmptyTrash();
    }
  }, [confirm, entries, handleDeleteForever, handleEmptyTrash]);

  // Render nothing until we've finished the first read, and nothing when
  // trash is empty. Both cases save a row of visual noise on the Projects
  // page for the common "no trash" state.
  if (!loaded || entries.length === 0) {
    return null;
  }

  return (
    <div className="mt-12" data-testid="trash-section" data-no-marquee>
      <Collapsible open={open} onOpenChange={setOpen}>
        <div className="flex items-center justify-between gap-2 mb-3">
          <CollapsibleTrigger
            data-testid="trash-toggle"
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors group"
          >
            <ChevronRight
              className={`w-4 h-4 transition-transform ${open ? 'rotate-90' : ''}`}
            />
            <Trash2 className="w-4 h-4" />
            <span className="font-medium">回收站</span>
            <span className="text-xs font-mono tabular-nums px-1.5 py-0.5 rounded-full bg-muted text-foreground/70">
              {entries.length}
            </span>
            {!open && (
              <span className="text-xs text-muted-foreground/70 ml-1">
                30 天后自动清理
              </span>
            )}
          </CollapsibleTrigger>
          {open && (
            <Button
              data-testid="trash-empty-all"
              variant="outline"
              size="sm"
              className="text-destructive hover:text-destructive gap-2"
              disabled={isEmptying}
              onClick={() => setConfirm({ kind: 'empty', count: entries.length })}
            >
              <Trash2 className="w-3.5 h-3.5" />
              {isEmptying ? '清空中…' : '清空回收站'}
            </Button>
          )}
        </div>

        <CollapsibleContent>
          <div className="border border-border rounded-lg divide-y divide-border overflow-hidden">
            {entries.map((entry) => {
              const isBusy = busyId === entry.id;
              return (
                <div
                  key={entry.id}
                  className="flex items-center gap-3 p-3 panel-bg"
                  data-testid={`trash-row-${entry.id}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">
                      {entry.marker.originalName}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      删除于 {formatRelativeTime(entry.marker.deletedAt)}
                    </div>
                  </div>
                  <Button
                    data-testid={`trash-restore-${entry.id}`}
                    variant="ghost"
                    size="sm"
                    className="gap-2"
                    disabled={isBusy || isEmptying}
                    onClick={() => void handleRestore(entry)}
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    恢复
                  </Button>
                  <Button
                    data-testid={`trash-delete-${entry.id}`}
                    variant="ghost"
                    size="sm"
                    className="gap-2 text-destructive hover:text-destructive"
                    disabled={isBusy || isEmptying}
                    onClick={() =>
                      setConfirm({
                        kind: 'single',
                        id: entry.id,
                        name: entry.marker.originalName,
                      })
                    }
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    永久删除
                  </Button>
                </div>
              );
            })}
          </div>
        </CollapsibleContent>
      </Collapsible>

      <AlertDialog
        open={confirm !== null}
        onOpenChange={(next) => {
          if (!next) setConfirm(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              {confirm?.kind === 'empty'
                ? '清空回收站？'
                : '永久删除项目？'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.kind === 'empty'
                ? `这将永久删除 ${confirm.count} 个项目，以及仅被这些项目引用的媒体文件。此操作无法撤销。`
                : confirm?.kind === 'single'
                  ? `这将永久删除“${confirm.name}”以及仅被它引用的媒体文件。此操作无法撤销。`
                  : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              data-testid="trash-confirm-action"
              onClick={() => void confirmAction()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {confirm?.kind === 'empty' ? '清空回收站' : '永久删除'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
