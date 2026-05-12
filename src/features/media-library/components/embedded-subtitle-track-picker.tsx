import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/shared/ui/cn'
import type { EmbeddedSubtitleTrack } from '@/shared/utils/matroska-subtitles'
import type { MediaMetadata } from '@/types/storage'

import {
  chooseEmbeddedSubtitleTrackForMedia,
  getEmbeddedSubtitleTrackLabel,
  subtitleSidecarService,
} from '../services/subtitle-sidecar-service'

interface EmbeddedSubtitleTrackPickerProps {
  media: MediaMetadata | null
  blob: Blob | null
  onClose: () => void
  onTrackPicked: (track: EmbeddedSubtitleTrack) => void
  errorMessage?: string | null
}

type ScanState =
  | { status: 'idle' }
  | { status: 'scanning'; bytesRead: number; totalBytes: number }
  | {
      status: 'ready'
      tracks: readonly EmbeddedSubtitleTrack[]
      fromCache: boolean
      defaultTrackNumber: number | null
    }
  | { status: 'empty' }
  | { status: 'error'; message: string }

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

export function EmbeddedSubtitleTrackPicker({
  media,
  blob,
  onClose,
  onTrackPicked,
  errorMessage,
}: EmbeddedSubtitleTrackPickerProps) {
  const [state, setState] = useState<ScanState>({ status: 'idle' })
  const [selectedTrackNumber, setSelectedTrackNumber] = useState<number | null>(null)

  const isOpen = media !== null

  useEffect(() => {
    if (!media || !blob) {
      setState({ status: 'idle' })
      setSelectedTrackNumber(null)
      return
    }

    let cancelled = false
    const abortController = new AbortController()
    setState({ status: 'scanning', bytesRead: 0, totalBytes: blob.size })
    setSelectedTrackNumber(null)

    void subtitleSidecarService
      .scanEmbeddedSubtitleTracks(media, blob, {
        onProgress: ({ bytesRead, totalBytes }) => {
          if (cancelled) return
          setState((prev) =>
            prev.status === 'scanning' ? { ...prev, bytesRead, totalBytes } : prev,
          )
        },
        signal: abortController.signal,
      })
      .then((result) => {
        if (cancelled) return
        if (result.tracks.length === 0) {
          setState({ status: 'empty' })
          return
        }
        const defaultTrack = chooseEmbeddedSubtitleTrackForMedia(result.tracks)
        const defaultTrackNumber = defaultTrack?.trackNumber ?? null
        setState({
          status: 'ready',
          tracks: result.tracks,
          fromCache: result.fromCache,
          defaultTrackNumber,
        })
        setSelectedTrackNumber(defaultTrackNumber)
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setState({
          status: 'error',
          message: error instanceof Error ? error.message : '扫描内嵌字幕失败。',
        })
      })

    return () => {
      cancelled = true
      abortController.abort()
    }
  }, [media, blob])

  const selectedTrack =
    state.status === 'ready' && selectedTrackNumber !== null
      ? (state.tracks.find((track) => track.trackNumber === selectedTrackNumber) ?? null)
      : null

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>内嵌字幕</DialogTitle>
          <DialogDescription>
            {media
              ? `为 ${media.fileName} 选择一条字幕轨道并插入为字幕。`
              : '选择一条字幕轨道并插入为字幕。'}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-32 max-h-[55vh]">
          {state.status === 'scanning' && (
            <div className="flex flex-col gap-2 py-6">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">正在扫描字幕轨道...</span>
                <span className="tabular-nums text-xs text-muted-foreground">
                  {state.totalBytes > 0
                    ? `${Math.round((state.bytesRead / state.totalBytes) * 100)}%`
                    : ''}
                </span>
              </div>
              <Progress
                value={
                  state.totalBytes > 0
                    ? Math.min(100, (state.bytesRead / state.totalBytes) * 100)
                    : 0
                }
                className="h-2"
              />
              {state.totalBytes > 0 && (
                <p className="text-xs text-muted-foreground tabular-nums">
                  {formatBytes(state.bytesRead)} / {formatBytes(state.totalBytes)}
                </p>
              )}
            </div>
          )}

          {state.status === 'empty' && (
            <p className="py-6 text-sm text-muted-foreground">
              未在该文件中找到受支持的文本字幕轨道。当前暂不支持位图（图片式）字幕轨道。
            </p>
          )}

          {state.status === 'error' && (
            <p className="py-6 text-sm text-destructive">{state.message}</p>
          )}

          {state.status === 'ready' && (
            <ScrollArea className="h-full max-h-[55vh] pr-2">
              <ul className="flex flex-col gap-1.5">
                {state.tracks.map((track) => (
                  <TrackRow
                    key={track.trackNumber}
                    track={track}
                    selected={track.trackNumber === selectedTrackNumber}
                    isDefault={track.trackNumber === state.defaultTrackNumber}
                    onSelect={() => setSelectedTrackNumber(track.trackNumber)}
                  />
                ))}
              </ul>
              {state.fromCache && (
                <p className="pt-3 text-xs text-muted-foreground">已从缓存加载。</p>
              )}
            </ScrollArea>
          )}

          {errorMessage && <p className="pt-2 text-sm text-destructive">{errorMessage}</p>}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button
            disabled={!selectedTrack}
            onClick={() => {
              if (selectedTrack) onTrackPicked(selectedTrack)
            }}
          >
            插入 {selectedTrack ? `（${selectedTrack.cues.length} 条字幕）` : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

interface TrackRowProps {
  track: EmbeddedSubtitleTrack
  selected: boolean
  isDefault: boolean
  onSelect: () => void
}

function TrackRow({ track, selected, isDefault, onSelect }: TrackRowProps) {
  const label = getEmbeddedSubtitleTrackLabel(track)
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className={cn(
          'w-full flex items-center justify-between gap-3 rounded border px-3 py-2 text-left',
          'transition-colors',
          selected ? 'border-primary bg-primary/10' : 'border-border hover:bg-secondary/40',
        )}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium truncate">{label}</span>
            {track.forced && <Badge>强制</Badge>}
            {track.default && <Badge>默认</Badge>}
            {isDefault && !track.forced && !track.default && <Badge>自动选择</Badge>}
          </div>
          <div className="text-xs text-muted-foreground truncate">
            轨道 {track.trackNumber} · {track.codecId.replace('S_TEXT/', '')}
          </div>
        </div>
        <div className="text-xs text-muted-foreground tabular-nums shrink-0">
          {track.cues.length} 条
        </div>
      </button>
    </li>
  )
}

function Badge({ children }: { children: import('react').ReactNode }) {
  return (
    <span className="inline-flex items-center rounded bg-secondary px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-secondary-foreground">
      {children}
    </span>
  )
}
