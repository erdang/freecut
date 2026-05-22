import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react'
import {
  CheckCircle2,
  Download,
  FileAudio,
  ListPlus,
  Loader2,
  Pause,
  Play,
  Trash2,
  Upload,
  WandSparkles,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Textarea } from '@/components/ui/textarea'
import { SliderInput } from '@/shared/ui/property-controls'
import {
  importMediaLibraryService,
  useMediaLibraryStore,
} from '@/features/editor/deps/media-library'
import { useTimelineStore } from '@/features/editor/deps/timeline-store'
import {
  findCompatibleTrackForItemType,
  findNearestAvailableSpace,
} from '@/features/editor/deps/timeline-utils'
import { usePlaybackStore } from '@/shared/state/playback'
import { useSelectionStore } from '@/shared/state/selection'
import type { AudioItem } from '@/types/timeline'
import type { MediaMetadata } from '@/types/storage'
import {
  THIRD_PARTY_TTS_DEFAULT_EMOTION_VECTOR_VALUES,
  THIRD_PARTY_TTS_EMOTION_VECTOR_OPTIONS,
  THIRD_PARTY_TTS_EMO_CONTROL_METHOD_OPTIONS,
  THIRD_PARTY_TTS_VOICEPRINT_TYPE_OPTIONS,
  thirdPartyTtsService,
  type ThirdPartyTtsEmotionVectorKey,
  type ThirdPartyTtsEmotionVectorValues,
  type ThirdPartyTtsEmoControlMethod,
  type ThirdPartyTtsVoice,
  type ThirdPartyTtsVoiceOption,
  type ThirdPartyTtsVoiceprintType,
} from '../services/third-party-tts-service'

const DEFAULT_PROMPT = '欢迎使用本应用。此语音将由你配置的第三方 TTS API 生成。'

interface AudioGeneration {
  id: string
  file: File
  objectUrl: string
  byteSize: number
  duration: number
  textSnippet: string
  voice: string
  voiceTag: string
  voiceprintType: ThirdPartyTtsVoiceprintType
  emoControlMethod: ThirdPartyTtsEmoControlMethod
  model: string
  details: string
  tags: string[]
  savedMediaId: string | null
  saving: boolean
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} 字节`
  const kb = bytes / 1024
  if (kb < 1024) return `${kb.toFixed(1)} KB`
  return `${(kb / 1024).toFixed(1)} MB`
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

const MiniAudioPlayer = memo(function MiniAudioPlayer({ src }: { src: string }) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [isSeeking, setIsSeeking] = useState(false)
  const isSeekingRef = useRef(false)
  isSeekingRef.current = isSeeking

  const handleSeek = useCallback(
    (values: number[]) => {
      const el = audioRef.current
      if (!el || !duration) return
      const time = ((values[0] ?? 0) / 100) * duration
      el.currentTime = time
      setCurrentTime(time)
    },
    [duration],
  )

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0

  return (
    <div className="flex items-center gap-1.5 rounded-lg border border-border bg-secondary/30 px-1.5 py-1">
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onTimeUpdate={() => {
          if (!isSeekingRef.current && audioRef.current) {
            setCurrentTime(audioRef.current.currentTime)
          }
        }}
        onLoadedMetadata={() => {
          if (audioRef.current) {
            setDuration(audioRef.current.duration)
          }
        }}
        onEnded={() => {
          setIsPlaying(false)
          setCurrentTime(0)
        }}
      />
      <button
        type="button"
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm glow-primary-sm transition-colors hover:bg-primary/90"
        onClick={() => {
          const el = audioRef.current
          if (!el) return
          if (el.paused) {
            void el.play()
          } else {
            el.pause()
          }
        }}
        aria-label={isPlaying ? '暂停' : '播放'}
      >
        {isPlaying ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3 ml-px" />}
      </button>
      <Slider
        value={[progressPercent]}
        onValueChange={(values) => {
          setIsSeeking(true)
          handleSeek(values)
        }}
        onValueCommit={() => setIsSeeking(false)}
        max={100}
        step={0.1}
        className="min-w-0 flex-1"
        aria-label="拖动进度"
      />
      <span className="shrink-0 select-none font-mono text-[10px] tabular-nums text-muted-foreground">
        {formatTime(currentTime)}
        <span className="text-muted-foreground/40"> / </span>
        {formatTime(duration)}
      </span>
    </div>
  )
})

function insertAudioItemAtPlayhead(media: MediaMetadata, blobUrl: string): boolean {
  const { tracks, items, fps, addItem } = useTimelineStore.getState()
  const { activeTrackId, selectItems } = useSelectionStore.getState()

  const targetTrack = findCompatibleTrackForItemType({
    tracks,
    items,
    itemType: 'audio',
    preferredTrackId: activeTrackId,
  })

  if (!targetTrack) return false

  const sourceFps = media.fps || fps
  const durationInFrames = Math.max(1, Math.round(media.duration * fps))
  const sourceDurationFrames = Math.round(media.duration * sourceFps)

  const proposedPosition = usePlaybackStore.getState().currentFrame
  const finalPosition =
    findNearestAvailableSpace(proposedPosition, durationInFrames, targetTrack.id, items) ??
    proposedPosition

  const audioItem: AudioItem = {
    id: crypto.randomUUID(),
    type: 'audio',
    trackId: targetTrack.id,
    from: finalPosition,
    durationInFrames,
    label: media.fileName,
    mediaId: media.id,
    originId: crypto.randomUUID(),
    src: blobUrl,
    sourceStart: 0,
    sourceEnd: sourceDurationFrames,
    sourceDuration: sourceDurationFrames,
    sourceFps,
    trimStart: 0,
    trimEnd: 0,
  }

  addItem(audioItem)
  const added = useTimelineStore.getState().items.some((i) => i.id === audioItem.id)
  if (added) {
    selectItems([audioItem.id])
  }
  return added
}

export const ThirdPartyTtsPanel = memo(function ThirdPartyTtsPanel() {
  const currentProjectId = useMediaLibraryStore((state) => state.currentProjectId)
  const loadMediaItems = useMediaLibraryStore((state) => state.loadMediaItems)
  const selectMedia = useMediaLibraryStore((state) => state.selectMedia)
  const showNotification = useMediaLibraryStore((state) => state.showNotification)

  const [text, setText] = useState(DEFAULT_PROMPT)
  const [voice, setVoice] = useState<ThirdPartyTtsVoice>('')
  const [voiceprintType, setVoiceprintType] = useState<ThirdPartyTtsVoiceprintType>('1')
  const [emoControlMethod, setEmoControlMethod] = useState<ThirdPartyTtsEmoControlMethod>('1')
  const [emoWeight, setEmoWeight] = useState(0.65)
  const [emotionVectorValues, setEmotionVectorValues] = useState<ThirdPartyTtsEmotionVectorValues>({
    ...THIRD_PARTY_TTS_DEFAULT_EMOTION_VECTOR_VALUES,
  })
  const [voiceprintFile, setVoiceprintFile] = useState<File | null>(null)
  const [emoRefFile, setEmoRefFile] = useState<File | null>(null)
  const [voiceOptions, setVoiceOptions] = useState<ThirdPartyTtsVoiceOption[]>([])
  const [isAddVoiceprintDialogOpen, setIsAddVoiceprintDialogOpen] = useState(false)
  const [isDeleteVoiceprintDialogOpen, setIsDeleteVoiceprintDialogOpen] = useState(false)
  const [newVoiceprintName, setNewVoiceprintName] = useState('')
  const [newVoiceprintFile, setNewVoiceprintFile] = useState<File | null>(null)
  const [voiceprintToDelete, setVoiceprintToDelete] = useState('')
  const [speed, setSpeed] = useState(1.25)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isLoadingVoiceOptions, setIsLoadingVoiceOptions] = useState(false)
  const [isAddingVoiceprint, setIsAddingVoiceprint] = useState(false)
  const [isDeletingVoiceprint, setIsDeletingVoiceprint] = useState(false)
  const [progress, setProgress] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [addVoiceprintError, setAddVoiceprintError] = useState<string | null>(null)
  const [deleteVoiceprintError, setDeleteVoiceprintError] = useState<string | null>(null)
  const [generations, setGenerations] = useState<AudioGeneration[]>([])

  const generationUrlsRef = useRef<Set<string>>(new Set())
  const voiceprintInputRef = useRef<HTMLInputElement | null>(null)
  const emoRefInputRef = useRef<HTMLInputElement | null>(null)
  const addVoiceprintInputRef = useRef<HTMLInputElement | null>(null)

  const trimmedText = text.trim()
  const isTtsSupported = thirdPartyTtsService.isSupported()

  const totalBytes = useMemo(
    () => generations.reduce((sum, generation) => sum + generation.byteSize, 0),
    [generations],
  )
  const anySaving = generations.some((generation) => generation.saving)

  const loadVoiceOptionsFromApi = useCallback(async () => {
    setIsLoadingVoiceOptions(true)
    try {
      const options = await thirdPartyTtsService.getReferenceVoiceprintOptions()
      setVoiceOptions(options)
    } finally {
      setIsLoadingVoiceOptions(false)
    }
  }, [])

  useEffect(() => {
    void loadVoiceOptionsFromApi()
  }, [loadVoiceOptionsFromApi])

  useEffect(() => {
    if (!voice.trim()) return
    if (voiceOptions.some((option) => option.value === voice)) return
    setVoice('')
  }, [voice, voiceOptions])

  const resetAddVoiceprintForm = useCallback(() => {
    setNewVoiceprintName('')
    setNewVoiceprintFile(null)
    setAddVoiceprintError(null)
    if (addVoiceprintInputRef.current) {
      addVoiceprintInputRef.current.value = ''
    }
  }, [])

  const resetDeleteVoiceprintForm = useCallback(() => {
    setVoiceprintToDelete('')
    setDeleteVoiceprintError(null)
  }, [])

  const handleAddVoiceprintSubmit = useCallback(async () => {
    const trimmedName = newVoiceprintName.trim()
    if (!trimmedName) {
      setAddVoiceprintError('请填写声纹名称。')
      return
    }
    if (!newVoiceprintFile) {
      setAddVoiceprintError('请上传声纹音频文件。')
      return
    }

    setAddVoiceprintError(null)
    setIsAddingVoiceprint(true)
    try {
      await thirdPartyTtsService.addReferenceVoiceprint({
        name: trimmedName,
        promptVoice: newVoiceprintFile,
      })
      await loadVoiceOptionsFromApi()
      setIsAddVoiceprintDialogOpen(false)
      resetAddVoiceprintForm()
      showNotification({
        type: 'success',
        message: `声纹“${trimmedName}”已添加。`,
      })
    } catch (addError) {
      setAddVoiceprintError(addError instanceof Error ? addError.message : '添加声纹失败。')
    } finally {
      setIsAddingVoiceprint(false)
    }
  }, [
    loadVoiceOptionsFromApi,
    newVoiceprintFile,
    newVoiceprintName,
    resetAddVoiceprintForm,
    showNotification,
  ])

  const handleDeleteVoiceprintSubmit = useCallback(async () => {
    const trimmed = voiceprintToDelete.trim()
    if (!trimmed) {
      setDeleteVoiceprintError('请选择要删除的声纹。')
      return
    }
    setDeleteVoiceprintError(null)
    setIsDeletingVoiceprint(true)
    try {
      await thirdPartyTtsService.deleteReferenceVoiceprint({ name: trimmed })
      await loadVoiceOptionsFromApi()
      if (voice === trimmed) {
        setVoice('')
      }
      setIsDeleteVoiceprintDialogOpen(false)
      resetDeleteVoiceprintForm()
      showNotification({
        type: 'success',
        message: `声纹“${trimmed}”已删除。`,
      })
    } catch (deleteError) {
      setDeleteVoiceprintError(
        deleteError instanceof Error ? deleteError.message : '删除声纹失败。',
      )
    } finally {
      setIsDeletingVoiceprint(false)
    }
  }, [
    loadVoiceOptionsFromApi,
    resetDeleteVoiceprintForm,
    showNotification,
    voice,
    voiceprintToDelete,
  ])

  const handleEmotionVectorValueChange = useCallback(
    (key: ThirdPartyTtsEmotionVectorKey, value: number) => {
      setEmotionVectorValues((prev) => ({
        ...prev,
        [key]: value,
      }))
    },
    [],
  )

  const handleGenerate = useCallback(async () => {
    if (!currentProjectId) {
      setError('请先打开项目再生成音频。')
      return
    }
    if (!trimmedText) {
      setError('请输入要合成的文本。')
      return
    }
    if (!isTtsSupported) {
      setError('当前环境不支持网络请求。')
      return
    }
    if (voiceprintType === '1' && voiceOptions.length === 0) {
      setError('没有可用的参考声纹选项。请先配置 thirdPartyTtsVoiceprintListUrl。')
      return
    }
    if (voiceprintType === '1' && !voice.trim()) {
      setError('请选择参考声纹。')
      return
    }
    if (voiceprintType === '2' && !voiceprintFile) {
      setError('请上传声纹文件。')
      return
    }
    if (emoControlMethod === '2' && !emoRefFile) {
      setError('请上传情感参考音频文件。')
      return
    }

    setError(null)
    setIsGenerating(true)
    setProgress('正在请求第三方 TTS 服务...')

    try {
      const { blob, file, duration } = await thirdPartyTtsService.generateSpeechFile({
        text: trimmedText,
        voice,
        voiceprintType,
        emoControlMethod,
        emoWeight,
        emotionVectorValues,
        voiceprintFile,
        emoRefFile,
        speed,
        onProgress: setProgress,
      })

      const objectUrl = URL.createObjectURL(blob)
      generationUrlsRef.current.add(objectUrl)

      const voiceLabel = voiceprintType === '1' ? voice : voiceprintFile?.name || '已上传声纹'
      const voiceTag =
        voiceprintType === '1' ? `tts-voice:${voice.toLowerCase()}` : 'tts-voice:uploaded'

      const generation: AudioGeneration = {
        id: crypto.randomUUID(),
        file,
        objectUrl,
        byteSize: blob.size,
        duration,
        textSnippet: trimmedText,
        voice: voiceLabel,
        voiceTag,
        voiceprintType,
        emoControlMethod,
        model: '第三方 API',
        details: `${voiceLabel} / 声纹类型:${voiceprintType} / 情感控制:${emoControlMethod} / 情感权重:${emoWeight.toFixed(2)} / 第三方 API / ${duration > 0 ? `${duration.toFixed(1)}s` : '-'} / ${formatBytes(blob.size)}`,
        tags: [
          'ai-generated',
          'third-party-tts',
          voiceTag,
          `tts-voiceprint-type:${voiceprintType}`,
          `tts-emo-control-method:${emoControlMethod}`,
          `tts-emo-weight:${emoWeight.toFixed(2)}`,
        ],
        savedMediaId: null,
        saving: false,
      }

      setGenerations((prev) => [generation, ...prev])
      setProgress(null)
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : '语音生成失败。')
      setProgress(null)
    } finally {
      setIsGenerating(false)
    }
  }, [
    currentProjectId,
    trimmedText,
    isTtsSupported,
    voice,
    voiceprintFile,
    voiceprintType,
    voiceOptions.length,
    emoControlMethod,
    emoWeight,
    emotionVectorValues,
    emoRefFile,
    speed,
  ])

  const updateGenerationInList = useCallback(
    (
      setList: Dispatch<SetStateAction<AudioGeneration[]>>,
      id: string,
      patch: Partial<AudioGeneration>,
    ) => {
      setList((prev) =>
        prev.map((generation) => (generation.id === id ? { ...generation, ...patch } : generation)),
      )
    },
    [],
  )

  const saveGeneration = useCallback(
    async (generation: AudioGeneration): Promise<MediaMetadata | null> => {
      if (!currentProjectId) return null
      updateGenerationInList(setGenerations, generation.id, { saving: true })

      try {
        const { mediaLibraryService } = await importMediaLibraryService()
        const media = await mediaLibraryService.importGeneratedAudio(
          generation.file,
          currentProjectId,
          {
            tags: generation.tags,
          },
        )

        await loadMediaItems()
        selectMedia([media.id])
        generationUrlsRef.current.delete(generation.objectUrl)
        updateGenerationInList(setGenerations, generation.id, {
          saving: false,
          savedMediaId: media.id,
        })
        return media
      } catch (saveError) {
        setError(saveError instanceof Error ? saveError.message : '保存音频到媒体库失败。')
        updateGenerationInList(setGenerations, generation.id, {
          saving: false,
        })
        return null
      }
    },
    [currentProjectId, loadMediaItems, selectMedia, updateGenerationInList],
  )

  const handleSave = useCallback(
    async (generation: AudioGeneration) => {
      const media = await saveGeneration(generation)
      if (media) {
        showNotification({
          type: 'success',
          message: `已将“${media.fileName}”保存到媒体库。`,
        })
      }
    },
    [saveGeneration, showNotification],
  )

  const handleSaveAndInsert = useCallback(
    async (generation: AudioGeneration) => {
      const media = await saveGeneration(generation)
      if (!media) return

      const inserted = insertAudioItemAtPlayhead(media, generation.objectUrl)
      showNotification({
        type: inserted ? 'success' : 'warning',
        message: inserted
          ? `已保存“${media.fileName}”并添加到时间线。`
          : `已保存“${media.fileName}”，但当前没有可用音轨。`,
      })
    },
    [saveGeneration, showNotification],
  )

  const handleRemoveGeneration = useCallback((id: string) => {
    setGenerations((prev) => {
      const generation = prev.find((entry) => entry.id === id)
      if (generation && !generation.savedMediaId) {
        URL.revokeObjectURL(generation.objectUrl)
        generationUrlsRef.current.delete(generation.objectUrl)
      }
      return prev.filter((entry) => entry.id !== id)
    })
  }, [])

  const handleClearAll = useCallback(() => {
    setGenerations((prev) => {
      for (const generation of prev) {
        if (!generation.savedMediaId) {
          URL.revokeObjectURL(generation.objectUrl)
          generationUrlsRef.current.delete(generation.objectUrl)
        }
      }
      return []
    })
  }, [])

  return (
    <>
      <div className="h-full overflow-y-auto p-3">
        <div className="space-y-4">
          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 gap-1.5"
              onClick={() => {
                setIsDeleteVoiceprintDialogOpen(true)
                setDeleteVoiceprintError(null)
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
              删除声纹
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 gap-1.5"
              onClick={() => {
                setIsAddVoiceprintDialogOpen(true)
                setAddVoiceprintError(null)
              }}
            >
              <ListPlus className="h-3.5 w-3.5" />
              添加声纹
            </Button>
          </div>
          {!isTtsSupported && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-100">
              当前环境不支持网络请求。
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="third-party-tts-text">文本</Label>
            <Textarea
              id="third-party-tts-text"
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="请输入你想听到的朗读文本..."
              className="min-h-24 resize-y bg-secondary/30 text-sm"
              disabled={isGenerating}
            />
          </div>

          {voiceprintType === '1' ? (
            <div className="space-y-1.5">
              <Label>参考声纹</Label>
              <Select
                value={voice}
                onValueChange={(value) => setVoice(value as ThirdPartyTtsVoice)}
                disabled={isGenerating || isLoadingVoiceOptions}
              >
                <SelectTrigger className="h-8 text-xs focus:ring-inset">
                  <SelectValue placeholder="选择参考声纹" />
                </SelectTrigger>
                <SelectContent>
                  {voiceOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value} className="text-xs">
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="third-party-tts-voiceprint-upload">上传声纹</Label>
              <Input
                ref={voiceprintInputRef}
                id="third-party-tts-voiceprint-upload"
                type="file"
                accept="audio/*,.wav,.mp3,.m4a,.ogg"
                className="sr-only"
                disabled={isGenerating}
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null
                  setVoiceprintFile(file)
                }}
              />
              <label
                htmlFor="third-party-tts-voiceprint-upload"
                className={`group flex cursor-pointer items-center gap-3 rounded-lg border border-dashed px-3 py-2.5 transition-colors ${
                  isGenerating
                    ? 'cursor-not-allowed opacity-60'
                    : 'hover:border-primary/50 hover:bg-secondary/40'
                }`}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-secondary/40">
                  <Upload className="h-4 w-4 text-muted-foreground group-hover:text-foreground" />
                </span>
                <span className="min-w-0">
                  <p className="truncate text-xs font-medium">
                    {voiceprintFile ? '替换已上传声纹' : '点击上传声纹'}
                  </p>
                  <p className="text-[11px] text-muted-foreground">支持格式：WAV、MP3、M4A、OGG</p>
                </span>
              </label>
              <div className="flex items-center justify-between rounded-md border border-border bg-secondary/20 px-2.5 py-2">
                <span className="min-w-0 flex items-center gap-2">
                  <FileAudio className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate text-xs text-foreground/90">
                    {voiceprintFile
                      ? `${voiceprintFile.name} (${formatBytes(voiceprintFile.size)})`
                      : '未选择文件'}
                  </span>
                </span>
                {voiceprintFile && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 gap-1 px-2 text-[11px]"
                    disabled={isGenerating}
                    onClick={() => {
                      setVoiceprintFile(null)
                      if (voiceprintInputRef.current) {
                        voiceprintInputRef.current.value = ''
                      }
                    }}
                  >
                    <X className="h-3 w-3" />
                    清除
                  </Button>
                )}
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>声纹来源</Label>
            <Select
              value={voiceprintType}
              onValueChange={(value) => {
                setVoiceprintType(value as ThirdPartyTtsVoiceprintType)
                setVoiceprintFile(null)
                if (voiceprintInputRef.current) {
                  voiceprintInputRef.current.value = ''
                }
              }}
              disabled={isGenerating}
            >
              <SelectTrigger className="h-8 text-xs focus:ring-inset">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {THIRD_PARTY_TTS_VOICEPRINT_TYPE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value} className="text-xs">
                    {option.label} ({option.value})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>情感控制方式</Label>
            <Select
              value={emoControlMethod}
              onValueChange={(value) => {
                setEmoControlMethod(value as ThirdPartyTtsEmoControlMethod)
                setEmoRefFile(null)
                if (emoRefInputRef.current) {
                  emoRefInputRef.current.value = ''
                }
              }}
              disabled={isGenerating}
            >
              <SelectTrigger className="h-8 text-xs focus:ring-inset">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {THIRD_PARTY_TTS_EMO_CONTROL_METHOD_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value} className="text-xs">
                    {option.value}: {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {emoControlMethod === '2' && (
            <div className="space-y-2">
              <Label htmlFor="third-party-tts-emo-ref-upload">上传情感参考音频</Label>
              <Input
                ref={emoRefInputRef}
                id="third-party-tts-emo-ref-upload"
                type="file"
                accept="audio/*,.wav,.mp3,.m4a,.ogg"
                className="sr-only"
                disabled={isGenerating}
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null
                  setEmoRefFile(file)
                }}
              />
              <label
                htmlFor="third-party-tts-emo-ref-upload"
                className={`group flex cursor-pointer items-center gap-3 rounded-lg border border-dashed px-3 py-2.5 transition-colors ${
                  isGenerating
                    ? 'cursor-not-allowed opacity-60'
                    : 'hover:border-primary/50 hover:bg-secondary/40'
                }`}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-secondary/40">
                  <Upload className="h-4 w-4 text-muted-foreground group-hover:text-foreground" />
                </span>
                <span className="min-w-0">
                  <p className="truncate text-xs font-medium">
                    {emoRefFile ? '替换情感参考音频' : '点击上传情感参考音频'}
                  </p>
                  <p className="text-[11px] text-muted-foreground">支持格式：WAV、MP3、M4A、OGG</p>
                </span>
              </label>
              <div className="flex items-center justify-between rounded-md border border-border bg-secondary/20 px-2.5 py-2">
                <span className="min-w-0 flex items-center gap-2">
                  <FileAudio className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate text-xs text-foreground/90">
                    {emoRefFile
                      ? `${emoRefFile.name} (${formatBytes(emoRefFile.size)})`
                      : '未选择文件'}
                  </span>
                </span>
                {emoRefFile && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 gap-1 px-2 text-[11px]"
                    disabled={isGenerating}
                    onClick={() => {
                      setEmoRefFile(null)
                      if (emoRefInputRef.current) {
                        emoRefInputRef.current.value = ''
                      }
                    }}
                  >
                    <X className="h-3 w-3" />
                    清除
                  </Button>
                )}
              </div>
            </div>
          )}

          {emoControlMethod === '3' && (
            <div className="space-y-2">
              <Label>情感向量</Label>
              <div className="space-y-2 rounded-lg border border-border bg-secondary/10 p-2">
                {THIRD_PARTY_TTS_EMOTION_VECTOR_OPTIONS.map((option) => (
                  <SliderInput
                    key={option.key}
                    label={option.label}
                    value={emotionVectorValues[option.key]}
                    onChange={(value) => handleEmotionVectorValueChange(option.key, value)}
                    min={0}
                    max={1}
                    step={0.01}
                    disabled={isGenerating}
                  />
                ))}
              </div>
            </div>
          )}

          <SliderInput
            label="语速"
            value={speed}
            onChange={setSpeed}
            min={0.5}
            max={2}
            step={0.05}
            unit="x"
            disabled={isGenerating}
          />

          <SliderInput
            label="情感权重"
            value={emoWeight}
            onChange={setEmoWeight}
            min={0}
            max={1}
            step={0.01}
            disabled={isGenerating}
          />

          <div className="flex items-center">
            <Button
              size="sm"
              onClick={() => {
                void handleGenerate()
              }}
              disabled={
                isGenerating ||
                !trimmedText ||
                !currentProjectId ||
                !isTtsSupported ||
                (voiceprintType === '1' && voiceOptions.length === 0) ||
                (voiceprintType === '1' && !voice.trim()) ||
                (voiceprintType === '2' && !voiceprintFile) ||
                (emoControlMethod === '2' && !emoRefFile)
              }
              className="h-7 shrink-0 gap-1.5"
            >
              {isGenerating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <WandSparkles className="h-3.5 w-3.5" />
              )}
              {isGenerating ? '生成中...' : '生成'}
            </Button>
          </div>

          {progress && (
            <div className="rounded-lg border border-border bg-secondary/20 p-3 text-xs text-muted-foreground">
              {progress}
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
              {error}
            </div>
          )}

          {generations.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">
                  历史记录（{generations.length}）- {formatBytes(totalBytes)}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 gap-1 px-2 text-[11px] text-muted-foreground"
                  onClick={handleClearAll}
                  disabled={anySaving}
                >
                  <Trash2 className="h-3 w-3" />
                  全部清除
                </Button>
              </div>

              <div className="space-y-2">
                {generations.map((generation) => (
                  <div
                    key={generation.id}
                    className={`rounded-lg border p-3 space-y-2 ${
                      generation.savedMediaId
                        ? 'border-emerald-500/25 bg-emerald-500/5'
                        : 'border-border bg-secondary/20'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 space-y-0.5">
                        <p
                          className="line-clamp-3 text-xs leading-relaxed"
                          title={generation.textSnippet}
                        >
                          {generation.textSnippet}
                        </p>
                        <p className="text-[11px] text-muted-foreground">{generation.details}</p>
                      </div>
                      {!generation.saving && (
                        <button
                          type="button"
                          className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
                          onClick={() => handleRemoveGeneration(generation.id)}
                          aria-label="移除"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>

                    <MiniAudioPlayer src={generation.objectUrl} />

                    <div className="flex flex-wrap items-center gap-1.5">
                      {generation.savedMediaId ? (
                        <span className="flex items-center gap-1 text-[11px] text-emerald-400">
                          <CheckCircle2 className="h-3 w-3" />
                          已保存
                        </span>
                      ) : (
                        <>
                          <Button
                            variant="secondary"
                            size="sm"
                            className="h-7 gap-1 px-2 text-[11px]"
                            onClick={() => {
                              void handleSaveAndInsert(generation)
                            }}
                            disabled={generation.saving}
                          >
                            {generation.saving ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <ListPlus className="h-3 w-3" />
                            )}
                            {generation.saving ? '保存中...' : '保存并插入'}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 gap-1 px-2 text-[11px]"
                            onClick={() => {
                              void handleSave(generation)
                            }}
                            disabled={generation.saving}
                          >
                            <Download className="h-3 w-3" />
                            保存到媒体库
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <Dialog
        open={isAddVoiceprintDialogOpen}
        onOpenChange={(next) => {
          setIsAddVoiceprintDialogOpen(next)
          if (!next) {
            resetAddVoiceprintForm()
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>添加声纹</DialogTitle>
            <DialogDescription>填写声纹名称并上传声纹音频文件。</DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="third-party-tts-add-voiceprint-name">声纹名称</Label>
              <Input
                id="third-party-tts-add-voiceprint-name"
                value={newVoiceprintName}
                onChange={(event) => setNewVoiceprintName(event.target.value)}
                placeholder="请输入声纹名称"
                disabled={isAddingVoiceprint}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="third-party-tts-add-voiceprint-file">声纹音频</Label>
              <Input
                ref={addVoiceprintInputRef}
                id="third-party-tts-add-voiceprint-file"
                type="file"
                accept="audio/*,.wav,.mp3,.m4a,.ogg"
                disabled={isAddingVoiceprint}
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null
                  setNewVoiceprintFile(file)
                }}
              />
              {newVoiceprintFile && (
                <p className="text-xs text-muted-foreground">
                  {newVoiceprintFile.name} ({formatBytes(newVoiceprintFile.size)})
                </p>
              )}
            </div>

            {addVoiceprintError && (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {addVoiceprintError}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsAddVoiceprintDialogOpen(false)}
              disabled={isAddingVoiceprint}
            >
              取消
            </Button>
            <Button
              type="button"
              onClick={() => void handleAddVoiceprintSubmit()}
              disabled={isAddingVoiceprint}
            >
              {isAddingVoiceprint ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              {isAddingVoiceprint ? '提交中...' : '提交'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isDeleteVoiceprintDialogOpen}
        onOpenChange={(next) => {
          setIsDeleteVoiceprintDialogOpen(next)
          if (!next) {
            resetDeleteVoiceprintForm()
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>删除声纹</DialogTitle>
            <DialogDescription>从当前声纹列表中选择一个声纹并删除。</DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>当前声纹列表</Label>
              <Select
                value={voiceprintToDelete}
                onValueChange={setVoiceprintToDelete}
                disabled={
                  isDeletingVoiceprint || isLoadingVoiceOptions || voiceOptions.length === 0
                }
              >
                <SelectTrigger className="h-8 text-xs focus:ring-inset">
                  <SelectValue placeholder="请选择要删除的声纹" />
                </SelectTrigger>
                <SelectContent>
                  {voiceOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value} className="text-xs">
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {voiceOptions.length === 0 && !isLoadingVoiceOptions && (
                <p className="text-xs text-muted-foreground">当前没有可删除的声纹。</p>
              )}
            </div>

            {deleteVoiceprintError && (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {deleteVoiceprintError}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsDeleteVoiceprintDialogOpen(false)}
              disabled={isDeletingVoiceprint}
            >
              取消
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void handleDeleteVoiceprintSubmit()}
              disabled={isDeletingVoiceprint || !voiceprintToDelete.trim()}
            >
              {isDeletingVoiceprint ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              {isDeletingVoiceprint ? '删除中...' : '删除'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
})
