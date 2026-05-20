import { createLogger } from '@/shared/logging/logger'
import { createMediabunnyInputSource } from '@/infrastructure/browser/mediabunny-input-source'

const logger = createLogger('ThirdPartySubtitleGenerateService')
const RUNTIME_CONFIG_URL = `${import.meta.env.BASE_URL}runtime-config.json`
const DEFAULT_WS_ENDPOINT = 'ws://localhost:8000/ws'
const DEFAULT_CHUNK_DURATION_SECONDS = 5
const DEFAULT_TRANSLATE_ENDPOINT = '/subtitle-translate-proxy/api/translate'
const DEFAULT_TRANSLATE_MODEL = '12b'
const DEFAULT_TRANSLATE_QUANTIZATION = 0
const DEFAULT_TRANSLATE_CHUNK_SIZE = 100
const DEFAULT_TRANSLATE_OVERLAP = 0
const DEFAULT_TRANSLATE_AUTO_SPLIT = true
const DEFAULT_TRANSLATE_STREAM = false

interface RuntimeConfig {
  thirdPartySubtitleWsUrl?: string
  thirdPartySubtitleWebSocketUrl?: string
  thirdPartyAsrWsUrl?: string
  subtitleGenerateWsUrl?: string
  thirdPartySubtitleChunkDurationSeconds?: number
  thirdPartySubtitleChunkDuration?: number
  subtitleGenerateChunkDurationSeconds?: number
  subtitleGenerateChunkDuration?: number
  thirdPartySubtitleTranslateApiUrl?: string
  subtitleTranslateApiUrl?: string
  thirdPartySubtitleTranslateModel?: string
  subtitleTranslateModel?: string
  thirdPartySubtitleTranslateQuantization?: number
  subtitleTranslateQuantization?: number
  thirdPartySubtitleTranslateChunkSize?: number
  subtitleTranslateChunkSize?: number
  thirdPartySubtitleTranslateOverlap?: number
  subtitleTranslateOverlap?: number
  thirdPartySubtitleTranslateAutoSplit?: boolean
  subtitleTranslateAutoSplit?: boolean
  thirdPartySubtitleTranslateStream?: boolean
  subtitleTranslateStream?: boolean
  thirdPartySubtitleSaveChunkLocally?: boolean
  subtitleSaveChunkLocally?: boolean
  thirdPartySubtitleSaveChunkOrder?: number
  subtitleSaveChunkOrder?: number
}

interface SubtitleResultMessage {
  type: 'result'
  order?: number
  text?: string
  start_time?: number
  end_time?: number
  [key: string]: unknown
}

interface ErrorMessage {
  type: 'error'
  error?: string
  message?: string
  detail?: string
  [key: string]: unknown
}

interface DoneMessage {
  type: 'done'
  [key: string]: unknown
}

export interface SubtitleGenerateWsResultSegment {
  order: number
  text: string
  start_time?: number
  end_time?: number
}

export interface SubtitleGenerateTrackCue {
  id: string
  startSeconds: number
  endSeconds: number
  text: string
  sourceText: string
  order: number
}

export interface SubtitleGenerateWsResult {
  segments: SubtitleGenerateWsResultSegment[]
  trackCues: SubtitleGenerateTrackCue[]
  fullText: string
  translatedText?: string
  timeBaseOffsetSeconds: number
}

export interface SubtitleGenerateClipTrimRange {
  startSeconds: number
  endSeconds: number
}

export interface GenerateSubtitleByWebSocketOptions {
  file: Blob
  source_lang: string
  target_lang: string
  clipTrimRange?: SubtitleGenerateClipTrimRange | null
  wsUrl?: string
  chunkDurationSeconds?: number
  onProgress?: (message: string) => void
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
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

function readNumber(record: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      return value
    }

    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value)
      if (Number.isFinite(parsed) && parsed > 0) {
        return parsed
      }
    }
  }
  return undefined
}

function readBoolean(record: Record<string, unknown>, keys: string[]): boolean | undefined {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'boolean') {
      return value
    }
    if (typeof value === 'number') {
      if (value === 1) return true
      if (value === 0) return false
    }
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase()
      if (normalized === 'true' || normalized === '1') return true
      if (normalized === 'false' || normalized === '0') return false
    }
  }
  return undefined
}

function normalizeHttpUrl(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  if (trimmed.startsWith('//')) return `http:${trimmed}`
  if (
    trimmed.startsWith('/') ||
    trimmed.startsWith('./') ||
    trimmed.startsWith('../') ||
    trimmed.startsWith('?')
  ) {
    if (typeof window !== 'undefined' && window.location?.origin) {
      try {
        return new URL(trimmed, window.location.origin).toString()
      } catch {
        return trimmed
      }
    }
    return trimmed
  }
  return `http://${trimmed}`
}

function normalizeWebSocketUrl(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''

  if (/^wss?:\/\//i.test(trimmed)) {
    return trimmed
  }

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed)
      parsed.protocol = parsed.protocol === 'https:' ? 'wss:' : 'ws:'
      return parsed.toString()
    } catch {
      return trimmed
    }
  }

  if (trimmed.startsWith('//')) {
    const protocol =
      typeof window !== 'undefined' && window.location?.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${protocol}${trimmed}`
  }

  if (
    trimmed.startsWith('/') ||
    trimmed.startsWith('./') ||
    trimmed.startsWith('../') ||
    trimmed.startsWith('?')
  ) {
    if (typeof window !== 'undefined' && window.location?.origin) {
      try {
        const resolved = new URL(trimmed, window.location.origin)
        resolved.protocol = resolved.protocol === 'https:' ? 'wss:' : 'ws:'
        return resolved.toString()
      } catch {
        return trimmed
      }
    }
    return trimmed
  }

  return `ws://${trimmed}`
}

async function loadRuntimeConfig(): Promise<RuntimeConfig> {
  try {
    const response = await fetch(RUNTIME_CONFIG_URL, { cache: 'no-store' })
    if (!response.ok) return {}
    const payload = asRecord(await response.json())
    if (!payload) return {}

    return {
      thirdPartySubtitleWsUrl: readString(payload, [
        'thirdPartySubtitleWsUrl',
        'third_party_subtitle_ws_url',
      ]),
      thirdPartySubtitleWebSocketUrl: readString(payload, [
        'thirdPartySubtitleWebSocketUrl',
        'third_party_subtitle_websocket_url',
      ]),
      thirdPartyAsrWsUrl: readString(payload, ['thirdPartyAsrWsUrl', 'third_party_asr_ws_url']),
      subtitleGenerateWsUrl: readString(payload, [
        'subtitleGenerateWsUrl',
        'subtitle_generate_ws_url',
      ]),
      thirdPartySubtitleChunkDurationSeconds: readNumber(payload, [
        'thirdPartySubtitleChunkDurationSeconds',
        'third_party_subtitle_chunk_duration_seconds',
      ]),
      thirdPartySubtitleChunkDuration: readNumber(payload, [
        'thirdPartySubtitleChunkDuration',
        'third_party_subtitle_chunk_duration',
      ]),
      subtitleGenerateChunkDurationSeconds: readNumber(payload, [
        'subtitleGenerateChunkDurationSeconds',
        'subtitle_generate_chunk_duration_seconds',
      ]),
      subtitleGenerateChunkDuration: readNumber(payload, [
        'subtitleGenerateChunkDuration',
        'subtitle_generate_chunk_duration',
      ]),
      thirdPartySubtitleTranslateApiUrl: readString(payload, [
        'thirdPartySubtitleTranslateApiUrl',
        'third_party_subtitle_translate_api_url',
      ]),
      subtitleTranslateApiUrl: readString(payload, [
        'subtitleTranslateApiUrl',
        'subtitle_translate_api_url',
      ]),
      thirdPartySubtitleTranslateModel: readString(payload, [
        'thirdPartySubtitleTranslateModel',
        'third_party_subtitle_translate_model',
      ]),
      subtitleTranslateModel: readString(payload, [
        'subtitleTranslateModel',
        'subtitle_translate_model',
      ]),
      thirdPartySubtitleTranslateQuantization: readNumber(payload, [
        'thirdPartySubtitleTranslateQuantization',
        'third_party_subtitle_translate_quantization',
      ]),
      subtitleTranslateQuantization: readNumber(payload, [
        'subtitleTranslateQuantization',
        'subtitle_translate_quantization',
      ]),
      thirdPartySubtitleTranslateChunkSize: readNumber(payload, [
        'thirdPartySubtitleTranslateChunkSize',
        'third_party_subtitle_translate_chunk_size',
      ]),
      subtitleTranslateChunkSize: readNumber(payload, [
        'subtitleTranslateChunkSize',
        'subtitle_translate_chunk_size',
      ]),
      thirdPartySubtitleTranslateOverlap: readNumber(payload, [
        'thirdPartySubtitleTranslateOverlap',
        'third_party_subtitle_translate_overlap',
      ]),
      subtitleTranslateOverlap: readNumber(payload, [
        'subtitleTranslateOverlap',
        'subtitle_translate_overlap',
      ]),
      thirdPartySubtitleTranslateAutoSplit: readBoolean(payload, [
        'thirdPartySubtitleTranslateAutoSplit',
        'third_party_subtitle_translate_auto_split',
      ]),
      subtitleTranslateAutoSplit: readBoolean(payload, [
        'subtitleTranslateAutoSplit',
        'subtitle_translate_auto_split',
      ]),
      thirdPartySubtitleTranslateStream: readBoolean(payload, [
        'thirdPartySubtitleTranslateStream',
        'third_party_subtitle_translate_stream',
      ]),
      subtitleTranslateStream: readBoolean(payload, [
        'subtitleTranslateStream',
        'subtitle_translate_stream',
      ]),
      thirdPartySubtitleSaveChunkLocally: readBoolean(payload, [
        'thirdPartySubtitleSaveChunkLocally',
        'third_party_subtitle_save_chunk_locally',
      ]),
      subtitleSaveChunkLocally: readBoolean(payload, [
        'subtitleSaveChunkLocally',
        'subtitle_save_chunk_locally',
      ]),
      thirdPartySubtitleSaveChunkOrder: readNumber(payload, [
        'thirdPartySubtitleSaveChunkOrder',
        'third_party_subtitle_save_chunk_order',
      ]),
      subtitleSaveChunkOrder: readNumber(payload, [
        'subtitleSaveChunkOrder',
        'subtitle_save_chunk_order',
      ]),
    }
  } catch {
    return {}
  }
}

interface TranslateConfig {
  endpoint: string
  model: string
  quantization: number
  chunk_size: number
  overlap: number
  auto_split: boolean
  stream: boolean
}

function resolveTranslateConfig(runtimeConfig: RuntimeConfig): TranslateConfig {
  const endpoint = normalizeHttpUrl(
    runtimeConfig.thirdPartySubtitleTranslateApiUrl ||
      runtimeConfig.subtitleTranslateApiUrl ||
      DEFAULT_TRANSLATE_ENDPOINT,
  )
  const model =
    runtimeConfig.thirdPartySubtitleTranslateModel ||
    runtimeConfig.subtitleTranslateModel ||
    DEFAULT_TRANSLATE_MODEL
  const quantization =
    runtimeConfig.thirdPartySubtitleTranslateQuantization ??
    runtimeConfig.subtitleTranslateQuantization ??
    DEFAULT_TRANSLATE_QUANTIZATION
  const chunk_size =
    runtimeConfig.thirdPartySubtitleTranslateChunkSize ??
    runtimeConfig.subtitleTranslateChunkSize ??
    DEFAULT_TRANSLATE_CHUNK_SIZE
  const overlap =
    runtimeConfig.thirdPartySubtitleTranslateOverlap ??
    runtimeConfig.subtitleTranslateOverlap ??
    DEFAULT_TRANSLATE_OVERLAP
  const auto_split =
    runtimeConfig.thirdPartySubtitleTranslateAutoSplit ??
    runtimeConfig.subtitleTranslateAutoSplit ??
    DEFAULT_TRANSLATE_AUTO_SPLIT
  const stream =
    runtimeConfig.thirdPartySubtitleTranslateStream ??
    runtimeConfig.subtitleTranslateStream ??
    DEFAULT_TRANSLATE_STREAM

  return {
    endpoint,
    model,
    quantization: Number.isFinite(quantization) ? quantization : DEFAULT_TRANSLATE_QUANTIZATION,
    chunk_size: Number.isFinite(chunk_size) ? chunk_size : DEFAULT_TRANSLATE_CHUNK_SIZE,
    overlap: Number.isFinite(overlap) ? overlap : DEFAULT_TRANSLATE_OVERLAP,
    auto_split,
    stream,
  }
}

function readTranslatedTextPayload(payload: unknown): string {
  const root = asRecord(payload)
  if (!root) return ''
  const directText = readString(root, ['text', 'translation', 'translated_text', 'result'])
  if (directText) return directText
  const nestedData = asRecord(root.data)
  if (!nestedData) return ''
  return readString(nestedData, ['text', 'translation', 'translated_text', 'result'])
}

async function requestTranslateText(args: {
  text: string
  source_lang: string
  target_lang: string
  config: TranslateConfig
}): Promise<string> {
  const payload = {
    text: args.text,
    target_lang: args.target_lang,
    source_lang: args.source_lang,
    model: args.config.model,
    quantization: args.config.quantization,
    chunk_size: args.config.chunk_size,
    overlap: args.config.overlap,
    auto_split: args.config.auto_split,
    stream: args.config.stream,
  }

  const response = await fetch(args.config.endpoint, {
    method: 'POST',
    headers: {
      Accept: 'application/json,text/plain,*/*',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const details = (await response.text()).trim()
    throw new Error(details || `Subtitle translate API request failed (${response.status})`)
  }

  const contentType = (response.headers.get('content-type') ?? '').toLowerCase()
  const bodyText = await response.text()
  if (!bodyText.trim()) {
    return ''
  }

  if (contentType.includes('json')) {
    try {
      return readTranslatedTextPayload(JSON.parse(bodyText))
    } catch {
      return bodyText.trim()
    }
  }

  try {
    return readTranslatedTextPayload(JSON.parse(bodyText))
  } catch {
    return bodyText.trim()
  }
}

function buildTrackCuesFromSegments(
  segments: readonly SubtitleGenerateWsResultSegment[],
  translatedByOrder: ReadonlyMap<number, string>,
): SubtitleGenerateTrackCue[] {
  const sorted = [...segments].sort((a, b) => a.order - b.order)
  const cues: SubtitleGenerateTrackCue[] = []
  let fallbackStart = 0
  let fallbackEnd = 0

  for (const segment of sorted) {
    const rawSourceText = segment.text.trim()
    if (!rawSourceText) {
      continue
    }

    const translated = translatedByOrder.get(segment.order)?.trim() || rawSourceText
    const startSeconds = Number.isFinite(segment.start_time)
      ? Math.max(0, Number(segment.start_time))
      : Math.max(0, fallbackEnd)
    const endCandidate = Number.isFinite(segment.end_time)
      ? Math.max(startSeconds + 0.1, Number(segment.end_time))
      : startSeconds + Math.max(0.1, fallbackEnd - fallbackStart, 1)
    const endSeconds = Math.max(startSeconds + 0.1, endCandidate)

    cues.push({
      id: `subtitle-generate-${segment.order}-${Math.round(startSeconds * 1000)}`,
      startSeconds,
      endSeconds,
      text: translated,
      sourceText: rawSourceText,
      order: segment.order,
    })

    fallbackStart = startSeconds
    fallbackEnd = endSeconds
  }

  return cues
}

function downmixToMono(buffer: AudioBuffer): Float32Array {
  const { length, numberOfChannels } = buffer
  if (numberOfChannels <= 1) {
    return new Float32Array(buffer.getChannelData(0))
  }

  const mono = new Float32Array(length)
  for (let channel = 0; channel < numberOfChannels; channel += 1) {
    const samples = buffer.getChannelData(channel)
    for (let i = 0; i < length; i += 1) {
      mono[i] = (mono[i] ?? 0) + (samples[i] ?? 0)
    }
  }

  const gain = 1 / numberOfChannels
  for (let i = 0; i < length; i += 1) {
    mono[i] = (mono[i] ?? 0) * gain
  }
  return mono
}

function createWavBuffer(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const bytesPerSample = 2
  const blockAlign = bytesPerSample
  const byteRate = sampleRate * blockAlign
  const dataSize = samples.length * bytesPerSample
  const buffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buffer)

  const writeString = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i += 1) {
      view.setUint8(offset + i, value.charCodeAt(i))
    }
  }

  writeString(0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeString(8, 'WAVE')
  writeString(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, byteRate, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, 16, true)
  writeString(36, 'data')
  view.setUint32(40, dataSize, true)

  let writeOffset = 44
  for (let i = 0; i < samples.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[i] ?? 0))
    view.setInt16(writeOffset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true)
    writeOffset += 2
  }

  return buffer
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, i + chunkSize)
    binary += String.fromCharCode(...slice)
  }
  return btoa(binary)
}

function createChunkId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function triggerLocalDownload(blob: Blob, fileName: string): void {
  if (typeof document === 'undefined') return
  const url = URL.createObjectURL(blob)
  try {
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = fileName
    anchor.style.display = 'none'
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
  } finally {
    window.setTimeout(() => {
      URL.revokeObjectURL(url)
    }, 2000)
  }
}

type TrimOutputContainer = 'mp4' | 'webm' | 'mov' | 'mkv' | 'mp3' | 'aac' | 'wav'

function replaceFileExtension(fileName: string, extension: string): string {
  const index = fileName.lastIndexOf('.')
  const stem = index > 0 ? fileName.slice(0, index) : fileName
  return `${stem}.${extension}`
}

function inferTrimOutputContainer(file: Blob): TrimOutputContainer {
  const fileName = file instanceof File ? file.name.toLowerCase() : ''
  const mimeType = (file.type || '').toLowerCase()

  if (fileName.endsWith('.webm') || mimeType.includes('webm')) return 'webm'
  if (fileName.endsWith('.mov') || mimeType.includes('quicktime')) return 'mov'
  if (fileName.endsWith('.mkv') || mimeType.includes('matroska')) return 'mkv'
  if (fileName.endsWith('.mp3') || mimeType.includes('mpeg')) return 'mp3'
  if (
    fileName.endsWith('.aac') ||
    fileName.endsWith('.m4a') ||
    mimeType.includes('aac') ||
    mimeType.includes('mp4a')
  ) {
    return 'aac'
  }
  if (fileName.endsWith('.wav') || mimeType.includes('wav')) return 'wav'

  if (mimeType.startsWith('audio/')) return 'wav'
  return 'mp4'
}

async function createTrimmedUploadFile(
  file: Blob,
  trimRange: SubtitleGenerateClipTrimRange,
): Promise<Blob> {
  const start = Math.max(0, trimRange.startSeconds)
  const end = Math.max(0, trimRange.endSeconds)
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start + 0.001) {
    return file
  }

  if (!(Number.isFinite(file.size) && file.size > 0)) {
    return file
  }

  const mb = await import('mediabunny')
  const {
    Input,
    Output,
    BufferTarget,
    Conversion,
    ALL_FORMATS,
    Mp4OutputFormat,
    WebMOutputFormat,
    MovOutputFormat,
    MkvOutputFormat,
    Mp3OutputFormat,
    WavOutputFormat,
    AdtsOutputFormat,
  } = mb
  const container = inferTrimOutputContainer(file)

  const outputFormat =
    container === 'mp4'
      ? new Mp4OutputFormat({ fastStart: 'in-memory' })
      : container === 'webm'
        ? new WebMOutputFormat()
        : container === 'mov'
          ? new MovOutputFormat({ fastStart: 'in-memory' })
          : container === 'mkv'
            ? new MkvOutputFormat()
            : container === 'mp3'
              ? new Mp3OutputFormat()
              : container === 'aac'
                ? new AdtsOutputFormat()
                : new WavOutputFormat()

  const input = new Input({
    formats: ALL_FORMATS,
    source: createMediabunnyInputSource(mb, file),
  })
  const target = new BufferTarget()
  const output = new Output({
    format: outputFormat,
    target,
  })

  const conversion = await Conversion.init({
    input,
    output,
    trim: {
      start,
      end,
    },
    video: {
      forceTranscode: false,
    },
    audio: {
      forceTranscode: false,
    },
    showWarnings: false,
  })

  if (!conversion.isValid) {
    throw new Error('Trim conversion is not valid for this source media')
  }

  await conversion.execute()

  const trimmedBuffer = target.buffer
  if (!trimmedBuffer || trimmedBuffer.byteLength === 0) {
    throw new Error('Trim conversion produced an empty file')
  }

  const mimeByContainer: Record<TrimOutputContainer, string> = {
    mp4: 'video/mp4',
    webm: 'video/webm',
    mov: 'video/quicktime',
    mkv: 'video/x-matroska',
    mp3: 'audio/mpeg',
    aac: 'audio/aac',
    wav: 'audio/wav',
  }

  if (file instanceof File) {
    return new File([trimmedBuffer], replaceFileExtension(file.name, container), {
      type: mimeByContainer[container],
      lastModified: Date.now(),
    })
  }

  return new Blob([trimmedBuffer], {
    type: mimeByContainer[container],
  })
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

function parseServerMessage(value: unknown): Record<string, unknown> | null {
  const record = asRecord(value)
  if (!record) return null
  return record
}

function isErrorMessage(message: Record<string, unknown>): message is ErrorMessage {
  return message.type === 'error'
}

function isDoneMessage(message: Record<string, unknown>): message is DoneMessage {
  return message.type === 'done'
}

function isResultMessage(message: Record<string, unknown>): message is SubtitleResultMessage {
  return message.type === 'result'
}

function getServerErrorMessage(message: ErrorMessage): string {
  const candidates = [message.error, message.message, message.detail]
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim()
    }
  }
  return 'WebSocket ASR service returned an error'
}

class ThirdPartySubtitleGenerateService {
  async generateByWebSocket(
    options: GenerateSubtitleByWebSocketOptions,
  ): Promise<SubtitleGenerateWsResult> {
    const targetLang = options.target_lang.trim()
    if (!targetLang) {
      throw new Error('target_lang is required')
    }

    if (typeof WebSocket === 'undefined') {
      throw new Error('WebSocket is not supported in this environment')
    }

    const AudioContextClass =
      window.AudioContext ??
      (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioContextClass) {
      throw new Error('AudioContext is not available in this browser')
    }

    const runtimeConfig = await loadRuntimeConfig()
    const wsEndpoint = options.wsUrl?.trim()
      ? normalizeWebSocketUrl(options.wsUrl)
      : normalizeWebSocketUrl(
          runtimeConfig.thirdPartySubtitleWsUrl ||
            runtimeConfig.thirdPartySubtitleWebSocketUrl ||
            runtimeConfig.thirdPartyAsrWsUrl ||
            runtimeConfig.subtitleGenerateWsUrl ||
            DEFAULT_WS_ENDPOINT,
        )
    if (!wsEndpoint) {
      throw new Error('Missing WebSocket endpoint for subtitle generation')
    }

    const chunkDurationSeconds =
      typeof options.chunkDurationSeconds === 'number' &&
      Number.isFinite(options.chunkDurationSeconds) &&
      options.chunkDurationSeconds > 0
        ? Math.max(1, Math.floor(options.chunkDurationSeconds))
        : Math.max(
            1,
            Math.floor(
              runtimeConfig.thirdPartySubtitleChunkDurationSeconds ??
                runtimeConfig.thirdPartySubtitleChunkDuration ??
                runtimeConfig.subtitleGenerateChunkDurationSeconds ??
                runtimeConfig.subtitleGenerateChunkDuration ??
                DEFAULT_CHUNK_DURATION_SECONDS,
            ),
          )
    const onProgress = options.onProgress
    let uploadFile = options.file
    let timeBaseOffsetSeconds = 0

    if (options.clipTrimRange) {
      try {
        uploadFile = await createTrimmedUploadFile(options.file, options.clipTrimRange)
        timeBaseOffsetSeconds = Math.max(0, options.clipTrimRange.startSeconds)
      } catch (error) {
        logger.warn('Failed to create trimmed subtitle upload file, fallback to original', {
          error,
          clipTrimRange: options.clipTrimRange,
          fileSize: options.file.size,
          fileType: options.file.type,
        })
      }
    }

    onProgress?.('Decoding audio...')

    const inputArrayBuffer = await uploadFile.arrayBuffer()
    const audioContext = new AudioContextClass()

    let decoded: AudioBuffer
    try {
      decoded = await audioContext.decodeAudioData(inputArrayBuffer.slice(0))
    } finally {
      try {
        await audioContext.close()
      } catch (error) {
        logger.debug('Failed to close AudioContext after subtitle generation decode', error)
      }
    }

    const mono = downmixToMono(decoded)
    const sampleRate = Math.max(1, Math.round(decoded.sampleRate))
    const chunkSize = Math.max(1, Math.floor(sampleRate * chunkDurationSeconds))
    const totalChunks = Math.max(1, Math.ceil(mono.length / chunkSize))
    const sourceLang = options.source_lang.trim()
    const translateConfig = resolveTranslateConfig(runtimeConfig)
    const shouldSaveChunkLocally =
      runtimeConfig.thirdPartySubtitleSaveChunkLocally ??
      runtimeConfig.subtitleSaveChunkLocally ??
      false
    const saveChunkOrder = Math.max(
      0,
      Math.floor(
        runtimeConfig.thirdPartySubtitleSaveChunkOrder ?? runtimeConfig.subtitleSaveChunkOrder ?? 0,
      ),
    )
    let hasSavedLocalChunk = false

    return new Promise<SubtitleGenerateWsResult>((resolve, reject) => {
      let settled = false
      const ws = new WebSocket(wsEndpoint)
      const timeout = window.setTimeout(() => {
        if (settled) return
        settled = true
        ws.close()
        reject(new Error('Subtitle generation timed out while waiting for WebSocket response'))
      }, 180_000)

      const resultMap = new Map<number, SubtitleGenerateWsResultSegment>()

      const settleResolve = async () => {
        if (settled) return
        settled = true
        window.clearTimeout(timeout)
        try {
          ws.close()
        } catch {
          // ignore
        }
        const segments = Array.from(resultMap.values()).sort((a, b) => a.order - b.order)
        const fullText = segments
          .map((segment) => segment.text.trim())
          .filter(Boolean)
          .join(' ')
        const translatedByOrder = new Map<number, string>()

        if (segments.length > 0) {
          const translateTotal = segments.length
          let translatedDone = 0
          onProgress?.(`翻译进度 ${translatedDone}/${translateTotal}`)
          for (const segment of segments) {
            const sourceText = segment.text.trim()
            if (!sourceText) {
              translatedDone += 1
              onProgress?.(`翻译进度 ${translatedDone}/${translateTotal}`)
              continue
            }
            const translated = await requestTranslateText({
              text: sourceText,
              source_lang: sourceLang,
              target_lang: targetLang,
              config: translateConfig,
            })
            translatedByOrder.set(segment.order, translated.trim() || sourceText)
            translatedDone += 1
            onProgress?.(`翻译进度 ${translatedDone}/${translateTotal}`)
          }
        }

        const trackCues = buildTrackCuesFromSegments(segments, translatedByOrder)
        const translatedText = trackCues
          .map((cue) => cue.text.trim())
          .filter(Boolean)
          .join('\n')

        resolve({ segments, trackCues, fullText, translatedText, timeBaseOffsetSeconds })
      }

      const settleReject = (error: Error) => {
        if (settled) return
        settled = true
        window.clearTimeout(timeout)
        try {
          ws.close()
        } catch {
          // ignore
        }
        reject(error)
      }

      ws.onopen = () => {
        void (async () => {
          try {
            for (let offset = 0, order = 0; offset < mono.length; offset += chunkSize, order += 1) {
              if (settled || ws.readyState !== WebSocket.OPEN) {
                return
              }

              const chunk = mono.subarray(offset, Math.min(mono.length, offset + chunkSize))
              const chunkDurationActualSeconds = chunk.length / sampleRate
              const audioWav = createWavBuffer(chunk, sampleRate)
              const message = {
                type: 'audio',
                chunk_id: createChunkId(),
                order,
                audio: arrayBufferToBase64(audioWav),
                duration: chunkDurationSeconds,
                sample_rate: sampleRate,
                source_lang: sourceLang,
                target_lang: targetLang,
              }

              if (shouldSaveChunkLocally && !hasSavedLocalChunk && order === saveChunkOrder) {
                const fileName = `subtitle-chunk-${order + 1}-${Date.now()}.wav`
                const chunkBlob = new Blob([audioWav], { type: 'audio/wav' })
                triggerLocalDownload(chunkBlob, fileName)
                hasSavedLocalChunk = true
                logger.info('Saved subtitle chunk locally', {
                  order,
                  fileName,
                  sampleRate,
                  chunkSamples: chunk.length,
                  chunkDurationActualSeconds,
                })
              }

              ws.send(JSON.stringify(message))
              onProgress?.(
                `Uploaded chunk ${order + 1}/${totalChunks} (${chunkDurationActualSeconds.toFixed(3)}s)`,
              )
              logger.debug('Subtitle WS chunk uploaded', {
                order,
                totalChunks,
                chunkSamples: chunk.length,
                sampleRate,
                chunkDurationSeconds: chunkDurationActualSeconds,
              })
              await sleep(20)
            }

            if (ws.readyState === WebSocket.OPEN) {
              ws.send(
                JSON.stringify({
                  type: 'done',
                  source_lang: sourceLang,
                  target_lang: targetLang,
                }),
              )
              onProgress?.('Waiting for recognition results...')
            }
          } catch (error) {
            settleReject(
              error instanceof Error
                ? error
                : new Error('Failed to send audio chunks via WebSocket'),
            )
          }
        })()
      }

      ws.onmessage = (event) => {
        try {
          if (typeof event.data !== 'string') {
            return
          }
          const message = parseServerMessage(JSON.parse(event.data))
          if (!message) {
            return
          }

          if (isErrorMessage(message)) {
            settleReject(new Error(getServerErrorMessage(message)))
            return
          }

          if (isResultMessage(message)) {
            const parsedOrder = Number(message.order)
            const order = Number.isFinite(parsedOrder) ? parsedOrder : 0
            const text = typeof message.text === 'string' ? message.text : ''
            resultMap.set(order, {
              order,
              text,
              start_time:
                typeof message.start_time === 'number' ? Number(message.start_time) : undefined,
              end_time: typeof message.end_time === 'number' ? Number(message.end_time) : undefined,
            })
            return
          }

          if (isDoneMessage(message)) {
            void settleResolve().catch((error: unknown) => {
              settleReject(
                error instanceof Error ? error : new Error('Subtitle translation request failed'),
              )
            })
          }
        } catch (error) {
          settleReject(
            error instanceof Error
              ? error
              : new Error('Failed to parse WebSocket subtitle response'),
          )
        }
      }

      ws.onerror = () => {
        settleReject(new Error(`WebSocket error while connecting to ${wsEndpoint}`))
      }

      ws.onclose = () => {
        if (!settled) {
          settleReject(new Error('WebSocket connection closed before completion'))
        }
      }
    })
  }
}

export const thirdPartySubtitleGenerateService = new ThirdPartySubtitleGenerateService()
