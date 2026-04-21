import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useMediaLibraryStore } from '@/features/editor/deps/media-library';
import { useProjectStore } from '@/features/editor/deps/projects';
import { useTimelineSettingsStore, useTimelineStore } from '@/features/editor/deps/timeline-store';
import { toast } from 'sonner';
import { useProjectMediaMatchDialogStore } from '@/app/state/project-media-match-dialog';
import {
  getProjectMediaMatchSuggestion,
  isProjectMatchableVideo,
} from '../utils/project-media-match';
import { commitProjectMetadataChange } from '../utils/project-metadata-history';

interface ProjectMediaMatchDialogProps {
  projectId: string;
}

export function ProjectMediaMatchDialog({ projectId }: ProjectMediaMatchDialogProps) {
  const mediaItems = useMediaLibraryStore((state) => state.mediaItems);
  const mediaLoading = useMediaLibraryStore((state) => state.isLoading);
  const currentProject = useProjectStore((state) => state.currentProject);
  const updateProject = useProjectStore((state) => state.updateProject);
  const markDirty = useTimelineStore((state) => state.markDirty);
  const setFps = useTimelineSettingsStore((state) => state.setFps);
  const open = useProjectMediaMatchDialogStore((state) => state.isOpen);
  const pendingProjectId = useProjectMediaMatchDialogStore((state) => state.projectId);
  const pendingCandidate = useProjectMediaMatchDialogStore((state) => state.candidate);
  const resolveProjectMediaMatch = useProjectMediaMatchDialogStore((state) => state.resolveProjectMediaMatch);
  const requestProjectMediaMatch = useProjectMediaMatchDialogStore((state) => state.requestProjectMediaMatch);
  const markProjectMediaMatchHandled = useProjectMediaMatchDialogStore((state) => state.markProjectMediaMatchHandled);
  const hasHandledProjectMediaMatch = useProjectMediaMatchDialogStore((state) => state.hasHandledProjectMediaMatch);

  const [isApplying, setIsApplying] = useState(false);
  const initializedRef = useRef(false);
  const seenVideoIdsRef = useRef<Set<string>>(new Set());
  const awaitingAutoPromptRef = useRef(false);

  useEffect(() => {
    initializedRef.current = false;
    awaitingAutoPromptRef.current = false;
    seenVideoIdsRef.current = new Set();
    setIsApplying(false);
  }, [projectId]);

  useEffect(() => {
    if (mediaLoading || !currentProject) {
      return;
    }

    const videoItems = mediaItems.filter(isProjectMatchableVideo);

    if (!initializedRef.current) {
      initializedRef.current = true;
      seenVideoIdsRef.current = new Set(videoItems.map((item) => item.id));
      if (videoItems.length > 0) {
        markProjectMediaMatchHandled(projectId);
      }
      return;
    }

    const newVideos = videoItems.filter((item) => !seenVideoIdsRef.current.has(item.id));

    for (const item of videoItems) {
      seenVideoIdsRef.current.add(item.id);
    }

    if (awaitingAutoPromptRef.current || hasHandledProjectMediaMatch(projectId)) {
      return;
    }

    if (newVideos.length === 0) {
      return;
    }

    const firstVideo = [...newVideos].sort((left, right) => left.createdAt - right.createdAt)[0];
    if (!firstVideo) {
      return;
    }

    awaitingAutoPromptRef.current = true;
    void requestProjectMediaMatch(projectId, {
      fileName: firstVideo.fileName,
      width: firstVideo.width,
      height: firstVideo.height,
      fps: firstVideo.fps,
    }).finally(() => {
      awaitingAutoPromptRef.current = false;
    });
  }, [
    currentProject,
    hasHandledProjectMediaMatch,
    markProjectMediaMatchHandled,
    mediaItems,
    mediaLoading,
    projectId,
    requestProjectMediaMatch,
  ]);

  const suggestion = useMemo(() => {
    if (!currentProject || !pendingCandidate || pendingProjectId !== projectId) {
      return null;
    }

    return getProjectMediaMatchSuggestion(currentProject.metadata, pendingCandidate);
  }, [currentProject, pendingCandidate, pendingProjectId, projectId]);

  useEffect(() => {
    if (!open || !currentProject || !pendingCandidate || pendingProjectId !== projectId || !suggestion) {
      return;
    }

    if (!suggestion.hasChanges) {
      resolveProjectMediaMatch('keep-current');
    }
  }, [
    currentProject,
    open,
    pendingCandidate,
    pendingProjectId,
    projectId,
    resolveProjectMediaMatch,
    suggestion,
  ]);

  const handleKeepCurrent = useCallback(() => {
    if (isApplying) {
      return;
    }

    resolveProjectMediaMatch('keep-current');
  }, [isApplying, resolveProjectMediaMatch]);

  const applyMatch = useCallback(async (
    choice: 'match-both' | 'fps-only' | 'size-only',
    options: { matchSize: boolean; matchFps: boolean }
  ) => {
    if (!currentProject || !pendingCandidate || !suggestion) {
      resolveProjectMediaMatch('keep-current');
      return;
    }

    const updates: {
      width?: number;
      height?: number;
      fps?: number;
    } = {};

    if (options.matchSize && suggestion.sizeDiffers) {
      updates.width = suggestion.width;
      updates.height = suggestion.height;
    }

    if (options.matchFps && suggestion.fpsDiffers) {
      updates.fps = suggestion.fps;
    }

    if (Object.keys(updates).length === 0) {
      resolveProjectMediaMatch('keep-current');
      return;
    }

    setIsApplying(true);

    try {
      await commitProjectMetadataChange({
        project: currentProject,
        updates,
        command: {
          type: 'UPDATE_PROJECT_METADATA',
          payload: {
            fields: Object.keys(updates),
            operation: choice,
          },
        },
        updateProject,
        markDirty,
        onApplied: (updatedProject) => {
          if (updates.fps !== undefined) {
            setFps(updatedProject.metadata.fps);
          }
        },
      });
      resolveProjectMediaMatch(choice);
    } catch (error) {
      toast.error('更新项目设置失败', {
        description: error instanceof Error ? error.message : '请重试。',
      });
    } finally {
      setIsApplying(false);
    }
  }, [
    currentProject,
    markDirty,
    pendingCandidate,
    resolveProjectMediaMatch,
    setFps,
    suggestion,
    updateProject,
  ]);

  return (
    <Dialog open={Boolean(open && pendingProjectId === projectId && suggestion?.hasChanges)} onOpenChange={(nextOpen) => { if (!nextOpen) handleKeepCurrent(); }}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>将项目参数匹配到首个视频？</DialogTitle>
          <DialogDescription>
            {pendingCandidate
              ? `“${pendingCandidate.fileName}”是本项目添加的第一个视频。`
              : '首个导入视频可用于设置项目尺寸和帧率。'}
          </DialogDescription>
        </DialogHeader>

        {currentProject && pendingCandidate && suggestion && (
          <div className="space-y-4">
            <div className="rounded-lg border border-border/80 bg-muted/30 p-4">
              <div className="grid grid-cols-[auto_1fr_1fr] gap-x-4 gap-y-2 text-sm">
                <div />
                <div className="font-medium text-foreground">当前</div>
                <div className="font-medium text-foreground">片段</div>
                <div className="text-muted-foreground">尺寸</div>
                <div className="text-muted-foreground">
                  {currentProject.metadata.width}x{currentProject.metadata.height}
                </div>
                <div className="text-muted-foreground">
                  {suggestion.width}x{suggestion.height}
                </div>
                <div className="text-muted-foreground">帧率</div>
                <div className="text-muted-foreground">
                  {currentProject.metadata.fps} fps
                </div>
                <div className="text-muted-foreground">
                  {suggestion.sourceFpsLabel} fps
                </div>
              </div>
            </div>

            {suggestion.fpsWasRounded && (
              <p className="text-xs text-muted-foreground">
                FreeCut 会将导入视频匹配到最接近且受支持的项目帧率。
                该片段将使用 {suggestion.matchedFpsLabel} fps。
              </p>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="ghost" onClick={handleKeepCurrent} disabled={isApplying}>
            保持当前设置
          </Button>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            {suggestion?.sizeDiffers && suggestion?.fpsDiffers && (
              <>
                <Button
                  variant="outline"
                  onClick={() => void applyMatch('fps-only', { matchSize: false, matchFps: true })}
                  disabled={isApplying}
                >
                  仅匹配帧率
                </Button>
                <Button
                  variant="outline"
                  onClick={() => void applyMatch('size-only', { matchSize: true, matchFps: false })}
                  disabled={isApplying}
                >
                  仅匹配尺寸
                </Button>
                <Button
                  onClick={() => void applyMatch('match-both', { matchSize: true, matchFps: true })}
                  disabled={isApplying}
                >
                  同时匹配
                </Button>
              </>
            )}
            {!suggestion?.sizeDiffers && suggestion?.fpsDiffers && (
              <Button
                onClick={() => void applyMatch('fps-only', { matchSize: false, matchFps: true })}
                disabled={isApplying}
              >
                匹配帧率
              </Button>
            )}
            {suggestion?.sizeDiffers && !suggestion?.fpsDiffers && (
              <Button
                onClick={() => void applyMatch('size-only', { matchSize: true, matchFps: false })}
                disabled={isApplying}
              >
                匹配尺寸
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
