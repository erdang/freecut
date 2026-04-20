import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  ChevronLeft,
  ChevronRight,
  Zap,
  Camera,
  Loader2,
} from 'lucide-react';
import { usePlaybackStore } from '@/shared/state/playback';
import { usePreviewBridgeStore } from '@/shared/state/preview-bridge';
import { EDITOR_LAYOUT_CSS_VALUES } from '@/app/editor-layout';
import { useMediaLibraryStore, mediaLibraryService } from '@/features/preview/deps/media-library-contract';
import { formatTimecode } from '@/shared/utils/time-utils';
import { toast } from 'sonner';
import { MonitorVolumeControl } from './monitor-volume-control';

interface PlaybackControlsProps {
  totalFrames: number;
  fps: number;
}

async function canvasToBlob(
  canvas: OffscreenCanvas | HTMLCanvasElement,
  type: string
): Promise<Blob> {
  if ('convertToBlob' in canvas) {
    return canvas.convertToBlob({ type });
  }

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
        return;
      }
      reject(new Error('帧转换为 Blob 失败'));
    }, type);
  });
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const response = await fetch(dataUrl);
  return response.blob();
}

function scheduleBlobUrlRevoke(url: string): void {
  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    window.requestIdleCallback(() => URL.revokeObjectURL(url));
    return;
  }

  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  scheduleBlobUrlRevoke(url);
}

function buildFrameFileName(frame: number, fps: number, totalFrames: number): string {
  const safeFrame = Math.max(0, Math.round(frame));
  const safeFps = Number.isFinite(fps) && fps > 0 ? fps : 30;
  const frameDigits = Math.max(String(Math.max(0, totalFrames - 1)).length, 1);
  const paddedFrame = String(safeFrame).padStart(frameDigits, '0');
  const safeTimecode = formatTimecode(safeFrame, safeFps).replaceAll(':', '-');
  return `frame-${paddedFrame}-${safeTimecode}.png`;
}

/**
 * Playback Controls Component
 *
 * Transport controls with:
 * - Play/Pause toggle
 * - Frame navigation (previous/next)
 * - Skip to start/end
 * - Frame capture
 * - Volume control
 */
const btnSize = { width: EDITOR_LAYOUT_CSS_VALUES.toolbarButtonSize, height: EDITOR_LAYOUT_CSS_VALUES.toolbarButtonSize } as const;

export function PlaybackControls({ totalFrames, fps }: PlaybackControlsProps) {
  const [isSavingFrame, setIsSavingFrame] = useState(false);

  // Use granular selectors - Zustand v5 best practice
  // NOTE: Don't subscribe to currentFrame - only needed in click handlers
  // Read from store directly when needed to avoid re-renders every frame
  const isPlaying = usePlaybackStore((s) => s.isPlaying);
  const useProxy = usePlaybackStore((s) => s.useProxy);
  const togglePlayPause = usePlaybackStore((s) => s.togglePlayPause);
  const setCurrentFrame = usePlaybackStore((s) => s.setCurrentFrame);
  const setPreviewFrame = usePlaybackStore((s) => s.setPreviewFrame);
  const toggleUseProxy = usePlaybackStore((s) => s.toggleUseProxy);
  const setDisplayedFrame = usePreviewBridgeStore((s) => s.setDisplayedFrame);

  // Note: Automatic playback loop is now handled by Composition Player
  // The Player controls frame advancement via frameupdate events

  // Note: totalFrames is the count, so valid frame indices are [0, totalFrames - 1]
  const lastValidFrame = Math.max(0, totalFrames - 1);

  const commitTimelineSeek = (frame: number) => {
    // Transport seeks should exit hover-scrub state so Player rendering
    // follows the actual playhead immediately.
    setPreviewFrame(null);
    setDisplayedFrame(null);
    setCurrentFrame(frame);
  };

  const handleGoToStart = () => commitTimelineSeek(0);
  const handleGoToEnd = () => commitTimelineSeek(lastValidFrame);
  const handlePreviousFrame = () => {
    const currentFrame = usePlaybackStore.getState().currentFrame;
    commitTimelineSeek(Math.max(0, currentFrame - 1));
  };
  const handleNextFrame = () => {
    const currentFrame = usePlaybackStore.getState().currentFrame;
    commitTimelineSeek(Math.min(lastValidFrame, currentFrame + 1));
  };

  const handleSaveFrame = async () => {
    if (isSavingFrame) return;

    setIsSavingFrame(true);

    try {
      const playback = usePlaybackStore.getState();
      const previewBridge = usePreviewBridgeStore.getState();
      const currentFrame = playback.previewFrame ?? playback.currentFrame;
      const fileName = buildFrameFileName(currentFrame, fps, totalFrames);

      let frameBlob: Blob | null = null;
      let frameWidth: number | undefined;
      let frameHeight: number | undefined;

      if (previewBridge.captureCanvasSource) {
        const canvasSource = await previewBridge.captureCanvasSource();
        if (canvasSource) {
          frameBlob = await canvasToBlob(canvasSource, 'image/png');
          frameWidth = canvasSource.width;
          frameHeight = canvasSource.height;
        }
      }

      if (!frameBlob && previewBridge.captureFrame) {
        const dataUrl = await previewBridge.captureFrame({
          format: 'image/png',
          quality: 1,
          fullResolution: true,
        });

        if (dataUrl) {
          frameBlob = await dataUrlToBlob(dataUrl);
        }
      }

      if (!frameBlob) {
        toast.error('截取当前帧失败。');
        return;
      }

      downloadBlob(frameBlob, fileName);

      const currentProjectId = useMediaLibraryStore.getState().currentProjectId;
      if (!currentProjectId) {
        toast.error('已下载当前帧，但未选择项目，无法导入媒体库。');
        return;
      }

      const frameFile = new File([frameBlob], fileName, {
        type: 'image/png',
        lastModified: Date.now(),
      });

      const savedMedia = await mediaLibraryService.importGeneratedImage(frameFile, currentProjectId, {
        width: frameWidth,
        height: frameHeight,
        tags: ['frame-capture'],
        codec: 'png',
      });

      useMediaLibraryStore.setState((state) => ({
        mediaItems: [savedMedia, ...state.mediaItems],
      }));

      toast.success(`已将“${savedMedia.fileName}”保存到媒体库，并开始下载。`);
    } catch (error) {
      const message = error instanceof Error ? error.message : '保存帧失败。';
      toast.error(`已下载当前帧，但保存到媒体库失败。${message}`);
    } finally {
      setIsSavingFrame(false);
    }
  };

  return (
    <>
      {/* Transport Controls */}
      <div className="flex items-center gap-0.5 flex-shrink-0">
        <Button
          variant="ghost"
          size="icon"
          className="flex-shrink-0"
          style={btnSize}
          onClick={handleGoToStart}
          data-tooltip="跳到开头（Home）"
          aria-label="跳到开头"
        >
          <SkipBack className="w-3.5 h-3.5" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="flex-shrink-0"
          style={btnSize}
          onClick={handlePreviousFrame}
          data-tooltip="上一帧（左箭头）"
          aria-label="上一帧"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </Button>

        <Button
          size="icon"
          className="flex-shrink-0"
          style={btnSize}
          onClick={togglePlayPause}
          data-tooltip={isPlaying ? '暂停（空格）' : '播放（空格）'}
          aria-label={isPlaying ? '暂停' : '播放'}
        >
          {isPlaying ? (
            <Pause className="w-3.5 h-3.5" />
          ) : (
            <Play className="w-3.5 h-3.5 ml-0.5" />
          )}
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="flex-shrink-0"
          style={btnSize}
          onClick={handleNextFrame}
          data-tooltip="下一帧（右箭头）"
          aria-label="下一帧"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="flex-shrink-0"
          style={btnSize}
          onClick={handleGoToEnd}
          data-tooltip="跳到末尾（End）"
          aria-label="跳到末尾"
        >
          <SkipForward className="w-3.5 h-3.5" />
        </Button>

        <MonitorVolumeControl buttonStyle={btnSize} />
      </div>

      {/* Save frame — hidden at narrow widths */}
      <div className="hidden @min-[440px]:flex items-center gap-0.5 flex-shrink-0">
        <Separator orientation="vertical" className="h-4 flex-shrink-0" />

        <Button
          variant="ghost"
          size="icon"
          className="flex-shrink-0"
          style={btnSize}
          onClick={() => {
            void handleSaveFrame();
          }}
          disabled={isSavingFrame}
          data-tooltip={isSavingFrame ? '正在保存帧...' : '保存帧'}
          aria-label={isSavingFrame ? '正在保存帧' : '保存帧'}
        >
          {isSavingFrame ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Camera className="w-3.5 h-3.5" />
          )}
        </Button>
      </div>

      {/* Proxy toggle — hidden at narrow widths */}
      <div className="hidden @min-[440px]:flex items-center gap-0.5 flex-shrink-0">
        <Separator orientation="vertical" className="h-4 flex-shrink-0" />

        <Button
          variant="ghost"
          size="icon"
          style={btnSize}
          className={`flex-shrink-0 ${
            useProxy
              ? 'text-green-500 hover:text-green-400 hover:bg-green-500/10'
              : 'text-muted-foreground hover:text-foreground'
          }`}
          onClick={toggleUseProxy}
          data-tooltip={useProxy ? '代理播放：开' : '代理播放：关'}
          aria-label={useProxy ? '关闭代理播放' : '开启代理播放'}
        >
          <Zap className="w-3.5 h-3.5" />
        </Button>
      </div>
    </>
  );
}
