import { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import type { MediaMetadata } from '@/types/storage'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
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
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Input } from '@/components/ui/input'
import {
  RotateCcw,
  Trash2,
  Loader2,
  Check,
  ImagePlus,
  Film,
  TriangleAlert,
  Settings2,
  Rows3,
  HardDrive,
  Sparkles,
} from 'lucide-react'
import {
  LocalInferenceUnloadControl,
  LocalModelCacheControl,
  useSettingsStore,
  CAPTIONING_INTERVAL_BOUNDS,
  DEFAULT_CAPTIONING_INTERVAL_SECONDS,
  resolveCaptioningIntervalSec,
  type CaptioningIntervalUnit,
} from '@/features/editor/deps/settings'
import {
  useMediaLibraryStore,
  getSharedProxyKey,
  importProxyService,
  importMediaLibraryService,
  importThumbnailGenerator,
} from '@/features/editor/deps/media-library'
import {
  importGifFrameCache,
  importFilmstripCache,
  importWaveformCache,
} from '@/features/editor/deps/timeline-cache'
import { clearPreviewAudioCache } from '@/features/editor/deps/composition-runtime'
import { CAPTION_STYLE_PRESETS } from '@/shared/typography/caption-style-presets'
import { createLogger } from '@/shared/logging/logger'
import { cn } from '@/shared/ui/cn'
import { EDITOR_DENSITY_OPTIONS } from '@/app/editor-layout'

const log = createLogger('SettingsDialog')

const SETTINGS_SECTIONS = [
  { id: 'general', label: '通用', icon: Settings2 },
  { id: 'timeline', label: '时间线', icon: Rows3 },
  { id: 'ai', label: 'AI', icon: Sparkles },
  { id: 'storage', label: '存储', icon: HardDrive },
] as const

const ESTIMATE_REFERENCE_DURATION_SEC = 60
const ESTIMATE_REFERENCE_FPS = 30

function formatCaptionEstimate(unit: CaptioningIntervalUnit, value: number): string {
  const intervalSec = resolveCaptioningIntervalSec(unit, value, ESTIMATE_REFERENCE_FPS)
  if (intervalSec <= 0) {
    return '请输入大于 0 的间隔值。'
  }
  const sceneCount = Math.max(1, Math.round(ESTIMATE_REFERENCE_DURATION_SEC / intervalSec))
  return `按 ${ESTIMATE_REFERENCE_FPS}fps 计算，1 分钟片段约 ${sceneCount} 个场景`
}

type SettingsSectionId = (typeof SETTINGS_SECTIONS)[number]['id']

interface SettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface BatchActionResult {
  total: number
  succeeded: number
  failed: number
  failedItems: string[]
}

interface ActionFeedback {
  tone: 'success' | 'error'
  message: string
}

function formatCount(count: number, noun: string): string {
  return `${count} 个${noun}`
}

function formatFailedItems(items: string[]): string {
  if (items.length === 0) return ''
  if (items.length <= 2) return items.join(', ')
  return `${items.slice(0, 2).join(', ')} 等 ${items.length} 项`
}

function createBatchResult(total: number, failedItems: string[]): BatchActionResult {
  return {
    total,
    succeeded: Math.max(0, total - failedItems.length),
    failed: failedItems.length,
    failedItems,
  }
}

function getBatchOutcomeFeedback(actionLabel: string, result: BatchActionResult): ActionFeedback {
  if (result.total === 0) {
    return {
      tone: 'success',
      message: `当前项目没有可执行“${actionLabel}”的媒体。`,
    }
  }

  if (result.failed === 0) {
    return {
      tone: 'success',
      message: `${actionLabel}已完成：${formatCount(result.succeeded, '项')}。`,
    }
  }

  const failedLabel = formatFailedItems(result.failedItems)

  if (result.succeeded === 0) {
    return {
      tone: 'error',
      message: `未能完成“${actionLabel}”：${formatCount(result.failed, '项')}${failedLabel ? `（${failedLabel}）` : ''}。`,
    }
  }

  return {
    tone: 'error',
    message: `${actionLabel}部分完成：${result.succeeded}/${result.total} 项，需处理：${failedLabel}。`,
  }
}

function showBatchOutcomeToast(
  successTitle: string,
  partialTitle: string,
  failureTitle: string,
  result: BatchActionResult,
): void {
  if (result.total === 0) {
    toast.success(successTitle, {
      description: '当前项目没有需要处理的媒体。',
    })
    return
  }

  if (result.failed === 0) {
    toast.success(successTitle, {
      description: `已处理 ${formatCount(result.succeeded, '项')}。`,
    })
    return
  }

  const description =
    result.succeeded === 0
      ? formatFailedItems(result.failedItems)
      : `已处理 ${formatCount(result.succeeded, '项')}；失败：${formatFailedItems(result.failedItems)}`

  toast.error(result.succeeded === 0 ? failureTitle : partialTitle, {
    description,
  })
}

/**
 * Clear regenerable cache data for the current project's media only.
 * Clears filmstrips, waveforms, GIF frames, and decoded audio
 * scoped to the given media IDs.
 *
 * Does NOT clear thumbnails (not auto-regenerated) or proxies (separate action).
 */
async function clearProjectCaches(
  mediaItems: Array<Pick<MediaMetadata, 'id' | 'fileName'>>,
): Promise<BatchActionResult> {
  if (mediaItems.length === 0) return createBatchResult(0, [])

  const [
    { deleteWaveform, deleteGifFrames, deleteDecodedPreviewAudio },
    { deletePreviewAudioConform },
    { gifFrameCache },
    { filmstripCache },
    { waveformCache },
  ] = await Promise.all([
    import('@/infrastructure/storage'),
    import('@/features/editor/deps/composition-runtime'),
    importGifFrameCache(),
    importFilmstripCache(),
    importWaveformCache(),
  ])

  // Clear in-memory preview audio cache (not keyed per-media, so clear all)
  clearPreviewAudioCache()

  const failedItems: string[] = []

  await Promise.all(
    mediaItems.map(async ({ id, fileName }) => {
      const results = await Promise.allSettled([
        deleteWaveform(id),
        deleteGifFrames(id),
        deleteDecodedPreviewAudio(id),
        deletePreviewAudioConform(id, { clearMetadata: true }),
        gifFrameCache.clearMedia(id),
        filmstripCache.clearMedia(id),
        waveformCache.clearMedia(id),
      ])

      const failures = results.filter((result) => result.status === 'rejected')
      if (failures.length > 0) {
        log.warn('Failed to fully clear project cache for media item', {
          mediaId: id,
          fileName,
          failures: failures.map((result) => String(result.reason)),
        })
        failedItems.push(fileName)
      }
    }),
  )

  const result = createBatchResult(mediaItems.length, failedItems)
  log.info(`Cleared caches for ${result.succeeded}/${result.total} media items`)
  return result
}

/** Delete all proxy videos for the given media items and clear their store status. */
async function clearProjectProxies(mediaItems: MediaMetadata[]): Promise<BatchActionResult> {
  if (mediaItems.length === 0) return createBatchResult(0, [])

  const { proxyService } = await importProxyService()
  const failedItems: string[] = []

  await Promise.all(
    mediaItems.map(async (media) => {
      try {
        await proxyService.deleteProxy(media.id, getSharedProxyKey(media))
        useMediaLibraryStore.getState().clearProxyStatus(media.id)
        proxyService.clearProxyKey(media.id)
      } catch (error) {
        log.warn('Failed to clear proxy for media item', {
          mediaId: media.id,
          fileName: media.fileName,
          error,
        })
        failedItems.push(media.fileName)
      }
    }),
  )

  const result = createBatchResult(mediaItems.length, failedItems)
  log.info(`Cleared proxies for ${result.succeeded}/${result.total} media items`)
  return result
}

/**
 * Regenerate thumbnails for all media in the current project.
 * Fetches each media file, generates a new thumbnail, and saves it to workspace storage.
 */
async function regenerateProjectThumbnails(
  mediaItems: Array<{ id: string; fileName: string; mimeType: string }>,
  onProgress?: (done: number, total: number) => void,
): Promise<BatchActionResult> {
  if (mediaItems.length === 0) return createBatchResult(0, [])

  const [{ mediaLibraryService }, { generateThumbnail }, { saveThumbnail, updateMedia }] =
    await Promise.all([
      importMediaLibraryService(),
      importThumbnailGenerator(),
      import('@/infrastructure/storage'),
    ])

  let succeeded = 0
  const failedItems: string[] = []

  for (const media of mediaItems) {
    try {
      const blob = await mediaLibraryService.getMediaFile(media.id)
      if (!blob) continue

      // generateThumbnail expects a File (needs .name for extension-based mime detection)
      const file = new File([blob], media.fileName, { type: media.mimeType })
      const thumbnailBlob = await generateThumbnail(file)

      const thumbnailId = crypto.randomUUID()
      await saveThumbnail({
        id: thumbnailId,
        mediaId: media.id,
        blob: thumbnailBlob,
        timestamp: 1,
        width: 320,
        height: 180,
      })

      // Update the media record so the new thumbnailId propagates to the store
      await updateMedia(media.id, { thumbnailId })

      // Clear the in-memory blob URL cache so UI picks up the new thumbnail
      mediaLibraryService.clearThumbnailCache(media.id)
      succeeded++
    } catch (err) {
      log.warn(`Failed to regenerate thumbnail for ${media.fileName}:`, err)
      failedItems.push(media.fileName)
    }
    onProgress?.(succeeded + failedItems.length, mediaItems.length)
  }

  // Reload store so MediaCards see the updated thumbnailId and re-fetch
  await useMediaLibraryStore.getState().loadMediaItems()

  const result = createBatchResult(mediaItems.length, failedItems)
  log.info(`Regenerated ${result.succeeded}/${result.total} thumbnails`)
  return result
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const { t } = useTranslation()
  const snapEnabled = useSettingsStore((s) => s.snapEnabled)
  const editorDensity = useSettingsStore((s) => s.editorDensity)
  const showWaveforms = useSettingsStore((s) => s.showWaveforms)
  const showFilmstrips = useSettingsStore((s) => s.showFilmstrips)
  const enableFilmstripExtraction = useSettingsStore((s) => s.enableFilmstripExtraction)
  const autoSaveInterval = useSettingsStore((s) => s.autoSaveInterval)
  const maxUndoHistory = useSettingsStore((s) => s.maxUndoHistory)
  const captioningIntervalUnit = useSettingsStore((s) => s.captioningIntervalUnit)
  const captioningIntervalValue = useSettingsStore((s) => s.captioningIntervalValue)
  const defaultCaptionStylePresetId = useSettingsStore((s) => s.defaultCaptionStylePresetId)
  const setSetting = useSettingsStore((s) => s.setSetting)
  const resetToDefaults = useSettingsStore((s) => s.resetToDefaults)

  const intervalBounds = CAPTIONING_INTERVAL_BOUNDS[captioningIntervalUnit]
  const intervalInputStep = captioningIntervalUnit === 'seconds' ? 0.5 : 1
  const intervalUnitLabel = captioningIntervalUnit === 'seconds' ? '秒' : '帧'

  const mediaItems = useMediaLibraryStore((s) => s.mediaItems)
  const proxyStatus = useMediaLibraryStore((s) => s.proxyStatus)

  const [activeSection, setActiveSection] = useState<SettingsSectionId>('general')
  const [clearState, setClearState] = useState<'idle' | 'clearing' | 'done' | 'partial'>('idle')
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const [regenState, setRegenState] = useState<'idle' | 'working' | 'done' | 'partial'>('idle')
  const [regenProgress, setRegenProgress] = useState('')
  const [proxyState, setProxyState] = useState<'idle' | 'clearing' | 'done' | 'partial'>('idle')
  const [proxyGenerateState, setProxyGenerateState] = useState<'idle' | 'queueing' | 'done'>('idle')
  const [clearFeedback, setClearFeedback] = useState<ActionFeedback | null>(null)
  const [regenFeedback, setRegenFeedback] = useState<ActionFeedback | null>(null)
  const [proxyFeedback, setProxyFeedback] = useState<ActionFeedback | null>(null)

  const handleClearCache = useCallback(async () => {
    setClearState('clearing')
    try {
      const items = mediaItems.map((m) => ({ id: m.id, fileName: m.fileName }))
      const result = await clearProjectCaches(items)
      const feedback = getBatchOutcomeFeedback('清理缓存', result)
      setClearFeedback(feedback)
      setClearState(result.failed === 0 ? 'done' : 'partial')
      showBatchOutcomeToast('项目缓存已清理', '项目缓存部分清理完成', '项目缓存清理失败', result)
      setTimeout(() => setClearState('idle'), 2000)
    } catch (err) {
      log.error('Failed to clear caches', err)
      setClearFeedback({
        tone: 'error',
        message: '清理项目缓存失败。',
      })
      toast.error('清理项目缓存失败')
      setClearState('idle')
    }
  }, [mediaItems])

  const handleRegenThumbnails = useCallback(async () => {
    setRegenState('working')
    setRegenProgress('0/' + mediaItems.length)
    try {
      const items = mediaItems.map((m) => ({
        id: m.id,
        fileName: m.fileName,
        mimeType: m.mimeType,
      }))
      const result = await regenerateProjectThumbnails(items, (done, total) => {
        setRegenProgress(`${done}/${total}`)
      })
      const feedback = getBatchOutcomeFeedback('重建缩略图', result)
      setRegenFeedback(feedback)
      setRegenState(result.failed === 0 ? 'done' : 'partial')
      showBatchOutcomeToast('缩略图已重建', '缩略图部分重建完成', '缩略图重建失败', result)
      setTimeout(() => {
        setRegenState('idle')
        setRegenProgress('')
      }, 2000)
    } catch (err) {
      log.error('Failed to regenerate thumbnails', err)
      setRegenFeedback({
        tone: 'error',
        message: '重建缩略图失败。',
      })
      toast.error('重建缩略图失败')
      setRegenState('idle')
      setRegenProgress('')
    }
  }, [mediaItems])

  const handleClearProxies = useCallback(async () => {
    setProxyState('clearing')
    try {
      const result = await clearProjectProxies(mediaItems)
      const feedback = getBatchOutcomeFeedback('删除代理文件', result)
      setProxyFeedback(feedback)
      setProxyState(result.failed === 0 ? 'done' : 'partial')
      showBatchOutcomeToast('代理文件已删除', '代理文件部分删除完成', '代理文件删除失败', result)
      setTimeout(() => setProxyState('idle'), 2000)
    } catch (err) {
      log.error('Failed to clear proxies', err)
      setProxyFeedback({
        tone: 'error',
        message: '删除代理文件失败。',
      })
      toast.error('删除代理文件失败')
      setProxyState('idle')
    }
  }, [mediaItems])

  const handleGenerateMissingProxies = useCallback(async () => {
    setProxyGenerateState('queueing')

    try {
      const [{ proxyService }, { mediaLibraryService }] = await Promise.all([
        importProxyService(),
        importMediaLibraryService(),
      ])

      const queuedItems = mediaItems.filter((media) => {
        if (!proxyService.canGenerateProxy(media.mimeType)) {
          return false
        }

        const sharedProxyKey = getSharedProxyKey(media)
        if (proxyService.hasProxy(media.id, sharedProxyKey)) {
          return false
        }

        const status = useMediaLibraryStore.getState().proxyStatus.get(media.id)
        return status !== 'ready' && status !== 'generating'
      })

      queuedItems.forEach((media) => {
        const sharedProxyKey = getSharedProxyKey(media)
        proxyService.setProxyKey(media.id, sharedProxyKey)
        proxyService.generateProxy(
          media.id,
          media.storageType === 'opfs' && media.opfsPath
            ? { kind: 'opfs', path: media.opfsPath, mimeType: media.mimeType }
            : () => mediaLibraryService.getMediaFile(media.id),
          media.width,
          media.height,
          sharedProxyKey,
          { priority: 'background' },
        )
      })

      setProxyGenerateState('done')
      setTimeout(() => setProxyGenerateState('idle'), 2000)
    } catch (err) {
      log.error('Failed to queue missing proxies', err)
      setProxyGenerateState('idle')
    }
  }, [mediaItems])

  const missingProjectProxyCount = mediaItems.filter(
    (media) =>
      media.mimeType.startsWith('video/') &&
      proxyStatus.get(media.id) !== 'ready' &&
      proxyStatus.get(media.id) !== 'generating',
  ).length

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl gap-0 overflow-hidden p-0 sm:top-16 sm:max-h-[calc(100vh-4rem)] sm:translate-y-0 sm:origin-top">
        <DialogHeader className="flex flex-row items-center justify-between border-b px-6 py-4 pr-14">
          <DialogTitle>编辑器设置</DialogTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={resetToDefaults}
            className="h-8 shrink-0 gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            重置
          </Button>
        </DialogHeader>
        <div className="flex min-h-0">
          {/* Sidebar */}
          <nav className="flex w-44 shrink-0 flex-col gap-0.5 border-r border-white/6 p-2">
            {SETTINGS_SECTIONS.map((section) => {
              const Icon = section.icon
              return (
                <button
                  key={section.id}
                  type="button"
                  onClick={() => setActiveSection(section.id)}
                  className={cn(
                    'flex items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] transition-colors duration-150 ease-out motion-reduce:transition-none',
                    activeSection === section.id
                      ? 'bg-primary/15 text-primary'
                      : 'text-muted-foreground hover:bg-white/5 hover:text-foreground/80',
                  )}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  {section.label}
                </button>
              )
            })}
          </nav>

          {/* Content */}
          <ScrollArea className="max-h-[70vh] min-h-[360px] flex-1">
            <div className="space-y-3 px-6 py-5 pr-7">
              {activeSection === 'general' && (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-sm">编辑器密度</Label>
                    <Select
                      value={editorDensity}
                      onValueChange={(value) =>
                        setSetting('editorDensity', value as typeof editorDensity)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {EDITOR_DENSITY_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      紧凑模式可在 1080p 屏幕显示更多内容；默认模式提供更宽松布局。
                    </p>
                  </div>
                  <div className="flex items-center justify-between">
                    <Label className="text-sm">自动保存</Label>
                    <Switch
                      checked={autoSaveInterval > 0}
                      onCheckedChange={(v) => setSetting('autoSaveInterval', v ? 5 : 0)}
                    />
                  </div>
                  {autoSaveInterval > 0 && (
                    <div className="flex items-center justify-between">
                      <Label className="text-sm text-muted-foreground">间隔</Label>
                      <div className="w-32 flex items-center gap-2">
                        <Slider
                          value={[autoSaveInterval]}
                          onValueChange={([v]) => setSetting('autoSaveInterval', v || 5)}
                          min={5}
                          max={30}
                          step={5}
                        />
                        <span className="text-xs text-muted-foreground w-6">
                          {autoSaveInterval}m
                        </span>
                      </div>
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <Label className="text-sm">撤销历史深度</Label>
                    <div className="w-32 flex items-center gap-2">
                      <Slider
                        value={[maxUndoHistory]}
                        onValueChange={([v]) => setSetting('maxUndoHistory', v || 10)}
                        min={10}
                        max={200}
                        step={10}
                      />
                      <span className="text-xs text-muted-foreground w-6">{maxUndoHistory}</span>
                    </div>
                  </div>
                </div>
              )}

              {activeSection === 'ai' && (
                <div className="space-y-3">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label className="text-sm">字幕采样间隔</Label>
                        <p className="text-xs text-muted-foreground">
                          “AI 分析”进行字幕采样时抓取帧的频率。
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center rounded-md border border-border bg-secondary p-0.5">
                        {(['seconds', 'frames'] as const).map((unit) => (
                          <button
                            key={unit}
                            type="button"
                            onClick={() => setSetting('captioningIntervalUnit', unit)}
                            className={cn(
                              'rounded px-2.5 py-1 text-xs transition-colors',
                              captioningIntervalUnit === unit
                                ? 'bg-primary/15 text-primary'
                                : 'text-muted-foreground hover:text-foreground',
                            )}
                          >
                            {unit === 'seconds' ? '秒' : '帧'}
                          </button>
                        ))}
                      </div>
                      <Input
                        type="number"
                        inputMode="decimal"
                        className="h-8 w-24"
                        min={intervalBounds.min}
                        max={intervalBounds.max}
                        step={intervalInputStep}
                        value={captioningIntervalValue}
                        onChange={(event) => {
                          const parsed = Number(event.target.value)
                          if (Number.isFinite(parsed)) {
                            setSetting('captioningIntervalValue', parsed)
                          }
                        }}
                      />
                      <span className="text-xs text-muted-foreground">{intervalUnitLabel}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs text-muted-foreground"
                        onClick={() => {
                          setSetting('captioningIntervalUnit', 'seconds')
                          setSetting('captioningIntervalValue', DEFAULT_CAPTIONING_INTERVAL_SECONDS)
                        }}
                        disabled={
                          captioningIntervalUnit === 'seconds' &&
                          captioningIntervalValue === DEFAULT_CAPTIONING_INTERVAL_SECONDS
                        }
                      >
                        重置
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {formatCaptionEstimate(captioningIntervalUnit, captioningIntervalValue)}.
                      间隔越小，场景切分越密集，但生成耗时更长。
                    </p>
                  </div>

                  <div className="space-y-2">
                    <div className="space-y-0.5">
                      <Label className="text-sm">{t('settings.ai.defaultCaptionStyle')}</Label>
                      <p className="text-xs text-muted-foreground">
                        {t('settings.ai.defaultCaptionStyleDescription')}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {CAPTION_STYLE_PRESETS.map((preset) => (
                        <button
                          key={preset.id}
                          type="button"
                          title={t(preset.hintKey)}
                          onClick={() => setSetting('defaultCaptionStylePresetId', preset.id)}
                          className={cn(
                            'rounded-md border px-2.5 py-1 text-xs transition-colors',
                            defaultCaptionStylePresetId === preset.id
                              ? 'border-primary bg-primary/15 text-primary'
                              : 'border-border text-muted-foreground hover:text-foreground',
                          )}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {activeSection === 'timeline' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-sm">默认吸附</Label>
                      <p className="text-xs text-muted-foreground">
                        设置项目打开时的初始吸附状态。
                      </p>
                    </div>
                    <Switch
                      checked={snapEnabled}
                      onCheckedChange={(v) => setSetting('snapEnabled', v)}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label className="text-sm">显示波形</Label>
                    <Switch
                      checked={showWaveforms}
                      onCheckedChange={(v) => setSetting('showWaveforms', v)}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label className="text-sm">显示胶片条</Label>
                    <Switch
                      checked={showFilmstrips}
                      onCheckedChange={(v) => setSetting('showFilmstrips', v)}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-sm">
                        {t('settings.timeline.enableFilmstripExtraction')}
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        {t('settings.timeline.enableFilmstripExtractionDescription')}
                      </p>
                    </div>
                    <Switch
                      checked={enableFilmstripExtraction}
                      onCheckedChange={(v) => setSetting('enableFilmstripExtraction', v)}
                    />
                  </div>
                </div>
              )}

              {activeSection === 'storage' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-sm">生成缺失代理</Label>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        为当前项目中尚未生成代理的视频加入生成队列
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 w-28 gap-1.5"
                      onClick={handleGenerateMissingProxies}
                      disabled={proxyGenerateState !== 'idle' || missingProjectProxyCount === 0}
                    >
                      {proxyGenerateState === 'queueing' && (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      )}
                      {proxyGenerateState === 'done' && <Check className="w-3.5 h-3.5" />}
                      {proxyGenerateState === 'idle' && <Film className="w-3.5 h-3.5" />}
                      {proxyGenerateState === 'queueing'
                        ? '排队中...'
                        : proxyGenerateState === 'done'
                          ? '已加入队列'
                          : missingProjectProxyCount > 0
                            ? `生成（${missingProjectProxyCount}）`
                            : '已是最新'}
                    </Button>
                  </div>
                  <Separator className="bg-white/8" />
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-sm">清理项目缓存</Label>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        波形、胶片条、GIF 帧、解码音频
                      </p>
                      {clearFeedback && (
                        <p
                          className={cn(
                            'mt-1 text-xs',
                            clearFeedback.tone === 'error'
                              ? 'text-amber-400'
                              : 'text-muted-foreground',
                          )}
                        >
                          {clearFeedback.message}
                        </p>
                      )}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 w-28 gap-1.5"
                      onClick={() => setShowClearConfirm(true)}
                      disabled={clearState !== 'idle'}
                    >
                      {clearState === 'clearing' && (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      )}
                      {clearState === 'done' && <Check className="w-3.5 h-3.5" />}
                      {clearState === 'partial' && <TriangleAlert className="w-3.5 h-3.5" />}
                      {clearState === 'idle' && <Trash2 className="w-3.5 h-3.5" />}
                      {clearState === 'clearing'
                        ? '清理中...'
                        : clearState === 'done'
                          ? '已清理'
                          : clearState === 'partial'
                            ? '部分完成'
                            : '清理'}
                    </Button>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-sm">重建缩略图</Label>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        为当前项目重新生成媒体库缩略图
                      </p>
                      {regenFeedback && (
                        <p
                          className={cn(
                            'mt-1 text-xs',
                            regenFeedback.tone === 'error'
                              ? 'text-amber-400'
                              : 'text-muted-foreground',
                          )}
                        >
                          {regenFeedback.message}
                        </p>
                      )}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 w-28 gap-1.5"
                      onClick={handleRegenThumbnails}
                      disabled={regenState !== 'idle'}
                    >
                      {regenState === 'working' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      {regenState === 'done' && <Check className="w-3.5 h-3.5" />}
                      {regenState === 'partial' && <TriangleAlert className="w-3.5 h-3.5" />}
                      {regenState === 'idle' && <ImagePlus className="w-3.5 h-3.5" />}
                      {regenState === 'working'
                        ? regenProgress
                        : regenState === 'done'
                          ? '完成'
                          : regenState === 'partial'
                            ? '部分完成'
                            : '重建'}
                    </Button>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-sm">删除代理文件</Label>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        删除当前项目已生成的代理视频
                      </p>
                      {proxyFeedback && (
                        <p
                          className={cn(
                            'mt-1 text-xs',
                            proxyFeedback.tone === 'error'
                              ? 'text-amber-400'
                              : 'text-muted-foreground',
                          )}
                        >
                          {proxyFeedback.message}
                        </p>
                      )}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 w-28 gap-1.5"
                      onClick={handleClearProxies}
                      disabled={proxyState !== 'idle'}
                    >
                      {proxyState === 'clearing' && (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      )}
                      {proxyState === 'done' && <Check className="w-3.5 h-3.5" />}
                      {proxyState === 'partial' && <TriangleAlert className="w-3.5 h-3.5" />}
                      {proxyState === 'idle' && <Film className="w-3.5 h-3.5" />}
                      {proxyState === 'clearing'
                        ? '删除中...'
                        : proxyState === 'done'
                          ? '已删除'
                          : proxyState === 'partial'
                            ? '部分完成'
                            : '删除'}
                    </Button>
                  </div>
                  <Separator className="bg-white/8" />
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <Label className="text-sm">本地 AI</Label>
                      <p className="text-xs text-muted-foreground">
                        卸载常驻运行时或清理模型下载缓存。
                      </p>
                    </div>
                    <LocalInferenceUnloadControl />
                    <LocalModelCacheControl />
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
      </DialogContent>

      <AlertDialog open={showClearConfirm} onOpenChange={setShowClearConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认清理项目缓存？</AlertDialogTitle>
            <AlertDialogDescription>
              这将删除当前项目（共 {mediaItems.length} 个媒体）的波形、胶片条、GIF
              帧和解码音频缓存。
              这些缓存会在需要时自动重新生成。项目数据、媒体文件、缩略图和代理文件不会受影响。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                void handleClearCache()
              }}
            >
              清理缓存
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  )
}
