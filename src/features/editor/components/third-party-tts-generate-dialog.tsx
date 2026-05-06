import { memo, useCallback, useEffect, useRef, useState } from 'react'
import {
  CheckCircle2,
  FileAudio,
  Loader2,
  Pause,
  Play,
  Upload,
  WandSparkles,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
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
  linkItems,
} from '@/features/editor/deps/timeline-utils'
import { useThirdPartyTtsGenerateDialogStore } from '@/app/state/third-party-tts-generate-dialog'
import type { AudioItem } from '@/types/timeline'
import type { MediaMetadata } from '@/types/storage'
import {
  THIRD_PARTY_TTS_DEFAULT_EMOTION_VECTOR_VALUES,
  THIRD_PARTY_TTS_EMOTION_VECTOR_OPTIONS,
  THIRD_PARTY_TTS_EMO_CONTROL_METHOD_OPTIONS,
  THIRD_PARTY_TTS_VOICE_OPTIONS,
  THIRD_PARTY_TTS_VOICEPRINT_TYPE_OPTIONS,
  thirdPartyTtsService,
  type ThirdPartyTtsEmotionVectorKey,
  type ThirdPartyTtsEmotionVectorValues,
  type ThirdPartyTtsEmoControlMethod,
  type ThirdPartyTtsVoice,
  type ThirdPartyTtsVoiceprintType,
} from '@/features/editor/services/third-party-tts-service'

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${kb.toFixed(1)} KB`
  return `${(kb / 1024).toFixed(1)} MB`
}

function insertAndLinkAudioAtTextItem(
  media: MediaMetadata,
  blobUrl: string,
  sourceItemId: string,
): { inserted: boolean; audioItemId: string | null } {
  const { tracks, items, fps, addItem } = useTimelineStore.getState()
  const sourceItem = items.find((i) => i.id === sourceItemId)
  if (!sourceItem) return { inserted: false, audioItemId: null }

  const targetTrack = findCompatibleTrackForItemType({
    tracks,
    items,
    itemType: 'audio',
    preferredTrackId: null,
  })

  if (!targetTrack) return { inserted: false, audioItemId: null }

  const sourceFps = media.fps || fps
  const durationInFrames = Math.max(1, Math.round(media.duration * fps))
  const sourceDurationFrames = Math.round(media.duration * sourceFps)

  const finalPosition =
    findNearestAvailableSpace(sourceItem.from, durationInFrames, targetTrack.id, items) ??
    sourceItem.from

  const audioItemId = crypto.randomUUID()
  const audioItem: AudioItem = {
    id: audioItemId,
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

  const added = useTimelineStore.getState().items.some((i) => i.id === audioItemId)
  if (!added) return { inserted: false, audioItemId: null }

  linkItems([sourceItemId, audioItemId])
  return { inserted: true, audioItemId }
}

const MiniAudioPlayer = memo(function MiniAudioPlayer({ src }: { src: string }) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [isSeeking, setIsSeeking] = useState(false)
  const isSeekingRef = useRef(false)
  isSeekingRef.current = isSeeking

  useEffect(() => {
    const el = audioRef.current
    if (!el) return

    const onPlay = () => setIsPlaying(true)
    const onPause = () => setIsPlaying(false)
    const onTimeUpdate = () => {
      if (!isSeekingRef.current) setCurrentTime(el.currentTime)
    }
    const onLoaded = () => setDuration(el.duration)
    const onEnded = () => {
      setIsPlaying(false)
      setCurrentTime(0)
      el.currentTime = 0
    }

    el.addEventListener('play', onPlay)
    el.addEventListener('pause', onPause)
    el.addEventListener('timeupdate', onTimeUpdate)
    el.addEventListener('loadedmetadata', onLoaded)
    el.addEventListener('ended', onEnded)

    return () => {
      el.pause()
      el.removeEventListener('play', onPlay)
      el.removeEventListener('pause', onPause)
      el.removeEventListener('timeupdate', onTimeUpdate)
      el.removeEventListener('loadedmetadata', onLoaded)
      el.removeEventListener('ended', onEnded)
    }
  }, [])

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
      <audio ref={audioRef} src={src} preload="metadata" />
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
        aria-label={isPlaying ? 'Pause' : 'Play'}
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
        aria-label="Seek"
      />
      <span className="shrink-0 select-none font-mono text-[10px] tabular-nums text-muted-foreground">
        {formatTime(currentTime)}
        <span className="text-muted-foreground/40"> / </span>
        {formatTime(duration)}
      </span>
    </div>
  )
})

interface GenerationResult {
  file: File
  objectUrl: string
  duration: number
  voice: string
  voiceTag: string
  voiceprintType: ThirdPartyTtsVoiceprintType
  emoControlMethod: ThirdPartyTtsEmoControlMethod
  emoWeight: number
}

export const ThirdPartyTtsGenerateDialog = memo(function ThirdPartyTtsGenerateDialog() {
  const isOpen = useThirdPartyTtsGenerateDialogStore((s) => s.isOpen)
  const initialText = useThirdPartyTtsGenerateDialogStore((s) => s.initialText)
  const sourceItemId = useThirdPartyTtsGenerateDialogStore((s) => s.sourceItemId)
  const close = useThirdPartyTtsGenerateDialogStore((s) => s.close)

  const currentProjectId = useMediaLibraryStore((state) => state.currentProjectId)
  const loadMediaItems = useMediaLibraryStore((state) => state.loadMediaItems)
  const showNotification = useMediaLibraryStore((state) => state.showNotification)

  const [text, setText] = useState('')
  const [voice, setVoice] = useState<ThirdPartyTtsVoice>('Bella')
  const [voiceprintType, setVoiceprintType] = useState<ThirdPartyTtsVoiceprintType>('1')
  const [emoControlMethod, setEmoControlMethod] = useState<ThirdPartyTtsEmoControlMethod>('1')
  const [emoWeight, setEmoWeight] = useState(0.65)
  const [emotionVectorValues, setEmotionVectorValues] = useState<ThirdPartyTtsEmotionVectorValues>({
    ...THIRD_PARTY_TTS_DEFAULT_EMOTION_VECTOR_VALUES,
  })
  const [voiceprintFile, setVoiceprintFile] = useState<File | null>(null)
  const [emoRefFile, setEmoRefFile] = useState<File | null>(null)
  const [speed, setSpeed] = useState(1.25)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isInserting, setIsInserting] = useState(false)
  const [progress, setProgress] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<GenerationResult | null>(null)
  const [inserted, setInserted] = useState(false)

  const resultUrlRef = useRef<string | null>(null)
  const sessionIdRef = useRef(0)
  const voiceprintInputRef = useRef<HTMLInputElement | null>(null)
  const emoRefInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (isOpen) {
      sessionIdRef.current++
      if (resultUrlRef.current && !inserted) {
        URL.revokeObjectURL(resultUrlRef.current)
        resultUrlRef.current = null
      }
      setText(initialText)
      setError(null)
      setProgress(null)
      setResult(null)
      setVoiceprintFile(null)
      setEmoRefFile(null)
      if (voiceprintInputRef.current) {
        voiceprintInputRef.current.value = ''
      }
      if (emoRefInputRef.current) {
        emoRefInputRef.current.value = ''
      }
      setInserted(false)
    }
  }, [isOpen, initialText, inserted])

  useEffect(() => {
    if (!isOpen && resultUrlRef.current) {
      if (!inserted) {
        URL.revokeObjectURL(resultUrlRef.current)
      }
      resultUrlRef.current = null
    }
  }, [isOpen, inserted])

  const isNetworkSupported = thirdPartyTtsService.isSupported()
  const trimmedText = text.trim()
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
      setError('Open a project before generating audio.')
      return
    }
    if (!trimmedText) {
      setError('Enter some text to synthesize.')
      return
    }
    if (!isNetworkSupported) {
      setError('Network requests are not supported in this environment.')
      return
    }
    if (voiceprintType === '2' && !voiceprintFile) {
      setError('Please upload a voiceprint file.')
      return
    }
    if (emoControlMethod === '2' && !emoRefFile) {
      setError('Please upload an emotion reference audio file.')
      return
    }
    if (resultUrlRef.current && !inserted) {
      URL.revokeObjectURL(resultUrlRef.current)
      resultUrlRef.current = null
    }

    setError(null)
    setResult(null)
    setInserted(false)
    setIsGenerating(true)
    setProgress('Requesting third-party TTS service...')

    const thisSession = sessionIdRef.current

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
        onProgress: (msg) => {
          if (sessionIdRef.current === thisSession) setProgress(msg)
        },
      })

      if (sessionIdRef.current !== thisSession) return

      const objectUrl = URL.createObjectURL(blob)
      resultUrlRef.current = objectUrl

      const voiceLabel =
        voiceprintType === '1' ? voice : voiceprintFile?.name || 'uploaded-voiceprint'
      const voiceTag =
        voiceprintType === '1' ? `tts-voice:${voice.toLowerCase()}` : 'tts-voice:uploaded'

      setResult({
        file,
        objectUrl,
        duration,
        voice: voiceLabel,
        voiceTag,
        voiceprintType,
        emoControlMethod,
        emoWeight,
      })
      setProgress(null)
    } catch (generationError) {
      if (sessionIdRef.current !== thisSession) return
      setError(
        generationError instanceof Error ? generationError.message : 'Failed to generate speech.',
      )
      setProgress(null)
    } finally {
      if (sessionIdRef.current === thisSession) {
        setIsGenerating(false)
      }
    }
  }, [
    currentProjectId,
    trimmedText,
    isNetworkSupported,
    voice,
    voiceprintFile,
    voiceprintType,
    emoControlMethod,
    emoWeight,
    emotionVectorValues,
    emoRefFile,
    speed,
    inserted,
  ])

  const handleInsert = useCallback(async () => {
    if (!result || !currentProjectId || !sourceItemId) return

    setIsInserting(true)
    setError(null)

    try {
      const { mediaLibraryService } = await importMediaLibraryService()
      const media = await mediaLibraryService.importGeneratedAudio(result.file, currentProjectId, {
        tags: [
          'ai-generated',
          'third-party-tts',
          result.voiceTag,
          `tts-voiceprint-type:${result.voiceprintType}`,
          `tts-emo-control-method:${result.emoControlMethod}`,
        ],
      })

      await loadMediaItems()

      const { inserted: didInsert } = insertAndLinkAudioAtTextItem(
        media,
        result.objectUrl,
        sourceItemId,
      )

      if (didInsert) {
        setInserted(true)
        showNotification({
          type: 'success',
          message: `Added "${media.fileName}" to timeline and linked with text.`,
        })
      } else {
        showNotification({
          type: 'warning',
          message: `Saved "${media.fileName}" but no audio track is available.`,
        })
      }
    } catch (insertError) {
      setError(
        insertError instanceof Error ? insertError.message : 'Failed to save and insert audio.',
      )
    } finally {
      setIsInserting(false)
    }
  }, [result, currentProjectId, sourceItemId, loadMediaItems, showNotification])

  const canGenerate =
    !isGenerating &&
    !isInserting &&
    !!trimmedText &&
    !!currentProjectId &&
    isNetworkSupported &&
    (voiceprintType === '1' || !!voiceprintFile) &&
    (emoControlMethod !== '2' || !!emoRefFile)

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) close()
      }}
    >
      <DialogContent className="flex max-h-[85vh] max-w-md min-h-0 flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <WandSparkles className="h-4 w-4" />
            Generate Audio from Text (Third-Party API)
          </DialogTitle>
          <DialogDescription className="text-xs">
            Generate speech via third-party TTS API and insert it at the text clip position.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
          <div className="space-y-2">
            <Label htmlFor="third-party-tts-dialog-text">Text</Label>
            <Textarea
              id="third-party-tts-dialog-text"
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="Enter the text you want to hear spoken..."
              className="min-h-28 resize-y bg-secondary/30 text-sm"
              disabled={isGenerating || isInserting}
            />
          </div>

          {voiceprintType === '1' ? (
            <div className="space-y-1.5">
              <Label>Reference Voiceprint</Label>
              <Select
                value={voice}
                onValueChange={(value) => setVoice(value as ThirdPartyTtsVoice)}
                disabled={isGenerating || isInserting}
              >
                <SelectTrigger className="h-8 text-xs focus:ring-inset">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="[&_[data-radix-select-viewport]]:p-0">
                  {THIRD_PARTY_TTS_VOICE_OPTIONS.map((option) => (
                    <SelectItem
                      key={option.value}
                      value={option.value}
                      className="rounded-none pl-1.5 text-xs"
                    >
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="third-party-tts-dialog-voiceprint-upload">Upload Voiceprint</Label>
              <Input
                ref={voiceprintInputRef}
                id="third-party-tts-dialog-voiceprint-upload"
                type="file"
                accept="audio/*,.wav,.mp3,.m4a,.ogg"
                className="sr-only"
                disabled={isGenerating || isInserting}
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null
                  setVoiceprintFile(file)
                }}
              />
              <label
                htmlFor="third-party-tts-dialog-voiceprint-upload"
                className={`group flex cursor-pointer items-center gap-3 rounded-lg border border-dashed px-3 py-2.5 transition-colors ${
                  isGenerating || isInserting
                    ? 'cursor-not-allowed opacity-60'
                    : 'hover:border-primary/50 hover:bg-secondary/40'
                }`}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-secondary/40">
                  <Upload className="h-4 w-4 text-muted-foreground group-hover:text-foreground" />
                </span>
                <span className="min-w-0">
                  <p className="truncate text-xs font-medium">
                    {voiceprintFile ? 'Replace uploaded voiceprint' : 'Click to upload voiceprint'}
                  </p>
                  <p className="text-[11px] text-muted-foreground">Supported: WAV, MP3, M4A, OGG</p>
                </span>
              </label>
              <div className="flex items-center justify-between rounded-md border border-border bg-secondary/20 px-2.5 py-2">
                <span className="min-w-0 flex items-center gap-2">
                  <FileAudio className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate text-xs text-foreground/90">
                    {voiceprintFile
                      ? `${voiceprintFile.name} (${formatFileSize(voiceprintFile.size)})`
                      : 'No file selected'}
                  </span>
                </span>
                {voiceprintFile && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 gap-1 px-2 text-[11px]"
                    disabled={isGenerating || isInserting}
                    onClick={() => {
                      setVoiceprintFile(null)
                      if (voiceprintInputRef.current) {
                        voiceprintInputRef.current.value = ''
                      }
                    }}
                  >
                    <X className="h-3 w-3" />
                    Clear
                  </Button>
                )}
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Voiceprint Source</Label>
            <Select
              value={voiceprintType}
              onValueChange={(value) => {
                setVoiceprintType(value as ThirdPartyTtsVoiceprintType)
                setVoiceprintFile(null)
                if (voiceprintInputRef.current) {
                  voiceprintInputRef.current.value = ''
                }
              }}
              disabled={isGenerating || isInserting}
            >
              <SelectTrigger className="h-8 text-xs focus:ring-inset">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="[&_[data-radix-select-viewport]]:p-0">
                {THIRD_PARTY_TTS_VOICEPRINT_TYPE_OPTIONS.map((option) => (
                  <SelectItem
                    key={option.value}
                    value={option.value}
                    className="rounded-none pl-1.5 text-xs"
                  >
                    {option.label} ({option.value})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Emotion Control Method</Label>
            <Select
              value={emoControlMethod}
              onValueChange={(value) => {
                setEmoControlMethod(value as ThirdPartyTtsEmoControlMethod)
                setEmoRefFile(null)
                if (emoRefInputRef.current) {
                  emoRefInputRef.current.value = ''
                }
              }}
              disabled={isGenerating || isInserting}
            >
              <SelectTrigger className="h-8 text-xs focus:ring-inset">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="[&_[data-radix-select-viewport]]:p-0">
                {THIRD_PARTY_TTS_EMO_CONTROL_METHOD_OPTIONS.map((option) => (
                  <SelectItem
                    key={option.value}
                    value={option.value}
                    className="rounded-none pl-1.5 text-xs"
                  >
                    {option.value}: {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {emoControlMethod === '2' && (
            <div className="space-y-2">
              <Label htmlFor="third-party-tts-dialog-emo-ref-upload">
                Upload Emotion Reference Audio
              </Label>
              <Input
                ref={emoRefInputRef}
                id="third-party-tts-dialog-emo-ref-upload"
                type="file"
                accept="audio/*,.wav,.mp3,.m4a,.ogg"
                className="sr-only"
                disabled={isGenerating || isInserting}
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null
                  setEmoRefFile(file)
                }}
              />
              <label
                htmlFor="third-party-tts-dialog-emo-ref-upload"
                className={`group flex cursor-pointer items-center gap-3 rounded-lg border border-dashed px-3 py-2.5 transition-colors ${
                  isGenerating || isInserting
                    ? 'cursor-not-allowed opacity-60'
                    : 'hover:border-primary/50 hover:bg-secondary/40'
                }`}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-secondary/40">
                  <Upload className="h-4 w-4 text-muted-foreground group-hover:text-foreground" />
                </span>
                <span className="min-w-0">
                  <p className="truncate text-xs font-medium">
                    {emoRefFile
                      ? 'Replace emotion reference audio'
                      : 'Click to upload emotion reference audio'}
                  </p>
                  <p className="text-[11px] text-muted-foreground">Supported: WAV, MP3, M4A, OGG</p>
                </span>
              </label>
              <div className="flex items-center justify-between rounded-md border border-border bg-secondary/20 px-2.5 py-2">
                <span className="min-w-0 flex items-center gap-2">
                  <FileAudio className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate text-xs text-foreground/90">
                    {emoRefFile
                      ? `${emoRefFile.name} (${formatFileSize(emoRefFile.size)})`
                      : 'No file selected'}
                  </span>
                </span>
                {emoRefFile && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 gap-1 px-2 text-[11px]"
                    disabled={isGenerating || isInserting}
                    onClick={() => {
                      setEmoRefFile(null)
                      if (emoRefInputRef.current) {
                        emoRefInputRef.current.value = ''
                      }
                    }}
                  >
                    <X className="h-3 w-3" />
                    Clear
                  </Button>
                )}
              </div>
            </div>
          )}

          {emoControlMethod === '3' && (
            <div className="space-y-2">
              <Label>Emotion Vector</Label>
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
                    disabled={isGenerating || isInserting}
                  />
                ))}
              </div>
            </div>
          )}

          <SliderInput
            label="Speed"
            value={speed}
            onChange={setSpeed}
            min={0.5}
            max={2}
            step={0.05}
            unit="x"
            disabled={isGenerating || isInserting}
          />

          <SliderInput
            label="Emo Weight"
            value={emoWeight}
            onChange={setEmoWeight}
            min={0}
            max={1}
            step={0.01}
            disabled={isGenerating || isInserting}
          />

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

          {result && (
            <div
              className={`rounded-xl border p-3 space-y-2 ${
                inserted
                  ? 'border-emerald-500/25 bg-emerald-500/5'
                  : 'border-border bg-secondary/20'
              }`}
            >
              <p className="text-[11px] text-muted-foreground">
                {result.voice} / VoiceprintType:{result.voiceprintType} / EmoMethod:
                {result.emoControlMethod} / EmoWeight:{result.emoWeight.toFixed(2)} / Third-Party
                API / {result.duration > 0 ? result.duration.toFixed(1) + 's' : '-'}
              </p>
              <MiniAudioPlayer src={result.objectUrl} />

              {inserted && (
                <span className="flex items-center gap-1 text-[11px] text-emerald-400">
                  <CheckCircle2 className="h-3 w-3" />
                  Inserted & linked
                </span>
              )}
            </div>
          )}

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant={result && !inserted ? 'secondary' : 'default'}
              onClick={() => {
                void handleGenerate()
              }}
              disabled={!canGenerate}
              className="h-8 gap-1.5"
            >
              {isGenerating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <WandSparkles className="h-3.5 w-3.5" />
              )}
              {isGenerating ? 'Generating...' : result ? 'Regenerate' : 'Generate'}
            </Button>

            {result && !inserted && (
              <Button
                size="sm"
                onClick={() => {
                  void handleInsert()
                }}
                disabled={isInserting || isGenerating}
                className="h-8 gap-1.5"
              >
                {isInserting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                )}
                {isInserting ? 'Inserting...' : 'Insert & Link'}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
})
