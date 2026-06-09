import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { Switch } from '@/components/ui/switch'
import { Combobox, type ComboboxOption } from '@/components/ui/combobox'
import { useEditorStore } from '@/app/state/editor'
import { usePlaybackStore } from '@/shared/state/playback'
import { useSettingsStore } from '@/features/media-library/deps/settings-contract'
import {
  getWhisperLanguageSettingValue,
  normalizeWhisperLanguage,
  WHISPER_LANGUAGE_OPTIONS,
} from '@/shared/utils/whisper-settings'
import type { MediaTranscriptModel, MediaTranscriptQuantization } from '@/types/storage'

const RUNTIME_CONFIG_URL = `${import.meta.env.BASE_URL}runtime-config.json`
const DEFAULT_LANGUAGE_ENDPOINT = 'http://192.168.0.15:8022/api/languages'
const DEFAULT_CHUNK_DURATION_SECONDS = 5
const MIN_CHUNK_DURATION_SECONDS = 1
const MAX_CHUNK_DURATION_SECONDS = 10
const AUTO_OPTION: ComboboxOption = {
  value: '',
  label: '自动',
  keywords: ['auto', 'automatic', '自动'],
}

interface SubtitleGenerateRuntimeConfig {
  thirdPartySubtitleLanguageUrl?: string
  thirdPartySubtitleLanguagesUrl?: string
  thirdPartySubtitleLanguageListUrl?: string
  thirdPartySourceLanguageUrl?: string
  thirdPartySourceLanguagesUrl?: string
  subtitleLanguageApiUrl?: string
}

export interface SubtitleGenerateDialogValues {
  model: MediaTranscriptModel
  quantization: MediaTranscriptQuantization
  source_lang: string
  target_lang: string
  chunkDurationSeconds: number
  includeSourceWithTranslation: boolean
}

interface SubtitleGenerateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  fileName: string
  hasTranscript?: boolean
  isRunning?: boolean
  progressPercent?: number | null
  progressLabel?: string
  errorMessage?: string | null
  onStart?: (values: SubtitleGenerateDialogValues) => void
  onCancel?: () => void
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  return value as Record<string, unknown>
}

function readString(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }

  return ''
}

function toAbsoluteEndpoint(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  if (trimmed.startsWith('//')) return `http:${trimmed}`

  if (trimmed.startsWith('/')) {
    if (typeof window !== 'undefined' && window.location?.origin) {
      return new URL(trimmed, window.location.origin).toString()
    }
    return trimmed
  }

  return `http://${trimmed}`
}

function parseLanguageOptions(payload: unknown): ComboboxOption[] {
  const root = asRecord(payload)
  if (!root) {
    return [AUTO_OPTION]
  }

  const languageOptions = Object.entries(root)
    .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
    .map(([code, name]) => ({
      value: code,
      label: name,
      keywords: [code, name],
    }))
    .sort((left, right) => left.label.localeCompare(right.label))

  const options = languageOptions.filter((option) => option.value !== '')
  return [AUTO_OPTION, ...options]
}

function getOutsideInteractionTarget(event: Event): EventTarget | null {
  const detail = (event as Event & { detail?: { originalEvent?: Event } }).detail
  return detail?.originalEvent?.target ?? event.target
}

function isPortalPopoverInteraction(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) {
    return false
  }

  return target.closest('[data-radix-popper-content-wrapper]') !== null
}

async function loadRuntimeConfig(): Promise<SubtitleGenerateRuntimeConfig> {
  try {
    const response = await fetch(RUNTIME_CONFIG_URL, { cache: 'no-store' })
    if (!response.ok) {
      return {}
    }

    const payload = asRecord(await response.json())
    if (!payload) {
      return {}
    }

    return {
      thirdPartySubtitleLanguageUrl: readString(payload, [
        'thirdPartySubtitleLanguageUrl',
        'third_party_subtitle_language_url',
      ]),
      thirdPartySubtitleLanguagesUrl: readString(payload, [
        'thirdPartySubtitleLanguagesUrl',
        'third_party_subtitle_languages_url',
      ]),
      thirdPartySubtitleLanguageListUrl: readString(payload, [
        'thirdPartySubtitleLanguageListUrl',
        'third_party_subtitle_language_list_url',
      ]),
      thirdPartySourceLanguageUrl: readString(payload, [
        'thirdPartySourceLanguageUrl',
        'third_party_source_language_url',
      ]),
      thirdPartySourceLanguagesUrl: readString(payload, [
        'thirdPartySourceLanguagesUrl',
        'third_party_source_languages_url',
      ]),
      subtitleLanguageApiUrl: readString(payload, [
        'subtitleLanguageApiUrl',
        'subtitle_language_api_url',
      ]),
    }
  } catch {
    return {}
  }
}

async function resolveLanguageEndpoint(): Promise<string> {
  const runtimeConfig = await loadRuntimeConfig()
  const configuredEndpoint =
    runtimeConfig.thirdPartySubtitleLanguageUrl ||
    runtimeConfig.thirdPartySubtitleLanguagesUrl ||
    runtimeConfig.thirdPartySubtitleLanguageListUrl ||
    runtimeConfig.thirdPartySourceLanguageUrl ||
    runtimeConfig.thirdPartySourceLanguagesUrl ||
    runtimeConfig.subtitleLanguageApiUrl ||
    DEFAULT_LANGUAGE_ENDPOINT

  return toAbsoluteEndpoint(configuredEndpoint)
}

async function loadLanguageOptions(): Promise<ComboboxOption[]> {
  const endpoint = await resolveLanguageEndpoint()
  if (!endpoint) {
    return []
  }

  const response = await fetch(endpoint, {
    cache: 'no-store',
    headers: {
      Accept: 'application/json,text/plain',
    },
  })

  if (!response.ok) {
    throw new Error(`Failed to load languages (${response.status})`)
  }

  const contentType = (response.headers.get('content-type') ?? '').toLowerCase()
  const text = await response.text()

  if (!text.trim()) {
    return []
  }

  if (contentType.includes('json')) {
    try {
      return parseLanguageOptions(JSON.parse(text))
    } catch {
      return []
    }
  }

  try {
    return parseLanguageOptions(JSON.parse(text))
  } catch {
    return []
  }
}

export function SubtitleGenerateDialog(props: SubtitleGenerateDialogProps) {
  const {
    open,
    onOpenChange,
    fileName,
    isRunning = false,
    progressPercent,
    progressLabel,
    errorMessage,
  } = props
  const outsideCloseBlockedRef = useRef(false)
  const clearOutsideCloseBlockedTimerRef = useRef<number | null>(null)
  const defaultModel = useSettingsStore((s) => s.defaultWhisperModel)
  const defaultQuantization = useSettingsStore((s) => s.defaultWhisperQuantization)
  const clearMediaSkimPreview = useEditorStore((s) => s.clearMediaSkimPreview)
  const clearCompoundClipSkimPreview = useEditorStore((s) => s.clearCompoundClipSkimPreview)
  const beginTranscriptionDialog = useEditorStore((s) => s.beginTranscriptionDialog)
  const endTranscriptionDialog = useEditorStore((s) => s.endTranscriptionDialog)

  const [languageOptions, setLanguageOptions] = useState<ComboboxOption[]>(() => [
    ...WHISPER_LANGUAGE_OPTIONS,
  ])
  const [sourceLangValue, setSourceLangValue] = useState<string>('')
  const [targetLangValue, setTargetLangValue] = useState<string>('')
  const [chunkDurationValue, setChunkDurationValue] = useState<string>(
    String(DEFAULT_CHUNK_DURATION_SECONDS),
  )
  const [includeSourceWithTranslation, setIncludeSourceWithTranslation] = useState<boolean>(false)

  const targetLanguageOptions = useMemo(
    () => languageOptions.filter((option) => option.value !== ''),
    [languageOptions],
  )

  const hasSourceLanguageValue = useMemo(
    () => languageOptions.some((option) => option.value === sourceLangValue),
    [languageOptions, sourceLangValue],
  )

  const chunkDurationNumber = Number(chunkDurationValue)
  const isChunkDurationValid =
    Number.isFinite(chunkDurationNumber) &&
    chunkDurationNumber >= MIN_CHUNK_DURATION_SECONDS &&
    chunkDurationNumber <= MAX_CHUNK_DURATION_SECONDS

  useEffect(() => {
    return () => {
      if (clearOutsideCloseBlockedTimerRef.current !== null) {
        window.clearTimeout(clearOutsideCloseBlockedTimerRef.current)
      }
    }
  }, [])

  const markOutsideCloseBlocked = useCallback(() => {
    outsideCloseBlockedRef.current = true
    if (clearOutsideCloseBlockedTimerRef.current !== null) {
      window.clearTimeout(clearOutsideCloseBlockedTimerRef.current)
    }
    clearOutsideCloseBlockedTimerRef.current = window.setTimeout(() => {
      outsideCloseBlockedRef.current = false
      clearOutsideCloseBlockedTimerRef.current = null
    }, 0)
  }, [])

  useEffect(() => {
    if (!open) return

    let cancelled = false
    void (async () => {
      try {
        const options = await loadLanguageOptions()
        if (!cancelled && options.length > 0) {
          setLanguageOptions(options)
        }
      } catch {
        if (!cancelled) {
          setLanguageOptions([...WHISPER_LANGUAGE_OPTIONS])
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    beginTranscriptionDialog()
    setSourceLangValue('')
    setTargetLangValue('')
    setChunkDurationValue(String(DEFAULT_CHUNK_DURATION_SECONDS))
    setIncludeSourceWithTranslation(false)
    clearMediaSkimPreview()
    clearCompoundClipSkimPreview()
    usePlaybackStore.getState().setPreviewFrame(null)
    usePlaybackStore.getState().pause()

    return () => {
      endTranscriptionDialog()
    }
  }, [
    beginTranscriptionDialog,
    clearCompoundClipSkimPreview,
    clearMediaSkimPreview,
    endTranscriptionDialog,
    open,
  ])

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen && outsideCloseBlockedRef.current) {
        outsideCloseBlockedRef.current = false
        return
      }
      onOpenChange(nextOpen)
    },
    [onOpenChange],
  )

  const handleStart = () => {
    if (isRunning) {
      return
    }
    if (!targetLangValue) {
      return
    }
    if (!isChunkDurationValid) {
      return
    }

    props.onStart?.({
      model: defaultModel as MediaTranscriptModel,
      quantization: defaultQuantization as MediaTranscriptQuantization,
      source_lang: getWhisperLanguageSettingValue(normalizeWhisperLanguage(sourceLangValue) ?? ''),
      target_lang: getWhisperLanguageSettingValue(normalizeWhisperLanguage(targetLangValue) ?? ''),
      chunkDurationSeconds: Math.floor(chunkDurationNumber),
      includeSourceWithTranslation,
    })
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange} modal>
      <DialogContent
        className="sm:max-w-lg"
        onPointerDownOutside={(event) => {
          if (isPortalPopoverInteraction(getOutsideInteractionTarget(event))) {
            return
          }
          markOutsideCloseBlocked()
          event.preventDefault()
        }}
        onInteractOutside={(event) => {
          if (isPortalPopoverInteraction(getOutsideInteractionTarget(event))) {
            return
          }
          markOutsideCloseBlocked()
          event.preventDefault()
        }}
      >
        <DialogHeader>
          <DialogTitle>生成字幕</DialogTitle>
          <DialogDescription className="truncate">{fileName}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-sm">源语言</Label>
            <Combobox
              value={sourceLangValue}
              onValueChange={setSourceLangValue}
              options={languageOptions}
              portalled={false}
              placeholder="自动检测"
              searchPlaceholder="搜索源语言..."
              emptyMessage="没有匹配的语言。"
              triggerClassName={!hasSourceLanguageValue ? 'text-muted-foreground' : undefined}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm">目标语言（必选）</Label>
            <Combobox
              value={targetLangValue}
              onValueChange={setTargetLangValue}
              options={targetLanguageOptions}
              portalled={false}
              placeholder="选择目标语言（必选）"
              searchPlaceholder="搜索目标语言..."
              emptyMessage="没有匹配的语言。"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">分块大小（秒）</Label>
            <Input
              type="number"
              min={MIN_CHUNK_DURATION_SECONDS}
              max={MAX_CHUNK_DURATION_SECONDS}
              step={1}
              value={chunkDurationValue}
              onChange={(event) => setChunkDurationValue(event.target.value)}
              placeholder={String(DEFAULT_CHUNK_DURATION_SECONDS)}
            />
            <p className="text-xs text-muted-foreground">范围 1-10 秒，默认 5 秒</p>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
              <div>
                <Label className="text-sm">显示源语和翻译对照</Label>
                <p className="text-xs text-muted-foreground">开启后每条字幕显示两行：源语 + 翻译</p>
              </div>
              <Switch
                checked={includeSourceWithTranslation}
                onCheckedChange={(checked) => setIncludeSourceWithTranslation(checked)}
              />
            </div>
          </div>
          {errorMessage ? (
            <div className="text-sm text-destructive" role="alert">
              {errorMessage}
            </div>
          ) : null}

          {isRunning && typeof progressPercent === 'number' ? (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>进度</span>
                <span>{Math.max(0, Math.min(100, Math.round(progressPercent)))}%</span>
              </div>
              <Progress value={Math.max(0, Math.min(100, progressPercent))} className="h-2" />
            </div>
          ) : null}

          {isRunning && progressLabel ? (
            <div className="text-xs text-muted-foreground">{progressLabel}</div>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isRunning}>
            取消
          </Button>
          <Button
            onClick={handleStart}
            disabled={!targetLangValue || !isChunkDurationValid || isRunning}
          >
            {isRunning ? '执行中...' : '开始生成'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
