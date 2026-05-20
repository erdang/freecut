import { createLogger } from '@/shared/logging/logger'

const logger = createLogger('ThirdPartyTtsService')
const RUNTIME_CONFIG_URL = `${import.meta.env.BASE_URL}runtime-config.json`
const RUNTIME_CONFIG_PUBLIC_URL = `${import.meta.env.BASE_URL}public/runtime-config.json`

const API_URL_KEYS = ['thirdPartyTtsApiUrl', 'third_party_tts_api_url']
const VOICEPRINT_LIST_URL_KEYS = [
  'thirdPartyTtsVoiceprintListUrl',
  'third_party_tts_voiceprint_list_url',
  'thirdPartyTtsVoiceprintUrl',
  'third_party_tts_voiceprint_url',
]
const VOICEPRINT_CREATE_URL_KEYS = [
  'thirdPartyTtsVoiceprintCreateUrl',
  'third_party_tts_voiceprint_create_url',
  'thirdPartyTtsVoiceprintAddUrl',
  'third_party_tts_voiceprint_add_url',
]
const VOICEPRINT_DELETE_URL_KEYS = [
  'thirdPartyTtsVoiceprintDeleteUrl',
  'third_party_tts_voiceprint_delete_url',
  'thirdPartyTtsVoiceprintRemoveUrl',
  'third_party_tts_voiceprint_remove_url',
]

let lastRuntimeConfigDebugSummary = ''

interface RuntimeConfig {
  thirdPartyTtsApiUrl?: string
  thirdPartyTtsVoiceprintListUrl?: string
  thirdPartyTtsVoiceprintCreateUrl?: string
  thirdPartyTtsVoiceprintDeleteUrl?: string
}

export type ThirdPartyTtsVoice = string

export type ThirdPartyTtsVoiceprintType = '1' | '2'
export type ThirdPartyTtsEmoControlMethod = '1' | '2' | '3'
export type ThirdPartyTtsEmotionVectorKey =
  | 'vec1'
  | 'vec2'
  | 'vec3'
  | 'vec4'
  | 'vec5'
  | 'vec6'
  | 'vec7'
  | 'vec8'
export type ThirdPartyTtsEmotionVectorValues = Record<ThirdPartyTtsEmotionVectorKey, number>

export interface ThirdPartyTtsVoiceOption {
  value: ThirdPartyTtsVoice
  label: string
}

export const THIRD_PARTY_TTS_VOICE_OPTIONS: ThirdPartyTtsVoiceOption[] = []

export const THIRD_PARTY_TTS_VOICEPRINT_TYPE_OPTIONS: Array<{
  value: ThirdPartyTtsVoiceprintType
  label: string
}> = [
  { value: '1', label: '使用已有声纹' },
  { value: '2', label: '上传声纹文件' },
]

export const THIRD_PARTY_TTS_EMO_CONTROL_METHOD_OPTIONS: Array<{
  value: ThirdPartyTtsEmoControlMethod
  label: string
}> = [
  { value: '1', label: '与声纹参考音频一致' },
  { value: '2', label: '使用情感参考音频' },
  { value: '3', label: '使用情感向量控制' },
]

export const THIRD_PARTY_TTS_EMOTION_VECTOR_OPTIONS: Array<{
  key: ThirdPartyTtsEmotionVectorKey
  label: string
}> = [
  { key: 'vec1', label: '喜' },
  { key: 'vec2', label: '怒' },
  { key: 'vec3', label: '哀' },
  { key: 'vec4', label: '乐' },
  { key: 'vec5', label: '惧' },
  { key: 'vec6', label: '厌恶' },
  { key: 'vec7', label: '低落' },
  { key: 'vec8', label: '惊喜' },
]

export const THIRD_PARTY_TTS_DEFAULT_EMOTION_VECTOR_VALUES: ThirdPartyTtsEmotionVectorValues = {
  vec1: 0,
  vec2: 0,
  vec3: 0,
  vec4: 0,
  vec5: 0,
  vec6: 0,
  vec7: 0,
  vec8: 0,
}

interface GenerateSpeechOptions {
  text: string
  voice: ThirdPartyTtsVoice
  voiceprintType: ThirdPartyTtsVoiceprintType
  emoControlMethod: ThirdPartyTtsEmoControlMethod
  emoWeight: number
  emotionVectorValues?: ThirdPartyTtsEmotionVectorValues
  voiceprintFile?: File | null
  emoRefFile?: File | null
  speed: number
  apiUrl?: string
  onProgress?: (stage: string) => void
}

function normalizeHttpUrl(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  if (trimmed.startsWith('//')) return `http:${trimmed}`
  if (trimmed.startsWith('/') || trimmed.startsWith('./') || trimmed.startsWith('../')) {
    return trimmed
  }
  return `http://${trimmed}`
}

function toAbsoluteBaseUrl(baseEndpoint: string): string {
  const normalized = normalizeHttpUrl(baseEndpoint)
  if (!normalized) return ''
  if (/^https?:\/\//i.test(normalized)) return normalized
  if (typeof window !== 'undefined' && window.location?.origin) {
    return new URL(normalized, window.location.origin).toString()
  }
  return normalized
}

function resolveProxyRoot(baseEndpoint: string): string | null {
  const normalized = normalizeHttpUrl(baseEndpoint)
  if (!normalized) return null

  const knownProxyPrefixes = ['/tts-proxy']

  if (/^https?:\/\//i.test(normalized)) {
    try {
      const parsed = new URL(normalized)
      const matched = knownProxyPrefixes.find((prefix) => parsed.pathname.startsWith(prefix))
      if (!matched) return null
      return `${parsed.origin}${matched}`
    } catch {
      return null
    }
  }

  const matched = knownProxyPrefixes.find((prefix) => normalized.startsWith(prefix))
  if (!matched) return null
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}${matched}`
  }
  return matched
}

function resolveUrlByBase(url: string, baseEndpoint: string): string {
  const trimmed = url.trim()
  if (!trimmed) return trimmed
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  if (trimmed.startsWith('/')) {
    const proxyRoot = resolveProxyRoot(baseEndpoint)
    if (proxyRoot) {
      return `${proxyRoot}${trimmed}`
    }
  }
  try {
    const absoluteBase = toAbsoluteBaseUrl(baseEndpoint)
    if (!absoluteBase) return trimmed
    return new URL(trimmed, absoluteBase).toString()
  } catch {
    return trimmed
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  return value as Record<string, unknown>
}

function readString(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }

  return null
}

function parseJsonRecord(rawText: string): Record<string, unknown> | null {
  const sanitized = rawText.replace(/^\uFEFF/, '')
  if (!sanitized.trim()) return {}

  try {
    return asRecord(JSON.parse(sanitized))
  } catch {
    return null
  }
}

function readConfigFromSource(record: Record<string, unknown> | null): RuntimeConfig {
  if (!record) return {}

  const nested =
    asRecord(record.data) ?? asRecord(record.config) ?? asRecord(record.runtimeConfig) ?? null
  const source = nested ?? record

  return {
    thirdPartyTtsApiUrl: readString(source, API_URL_KEYS) ?? '',
    thirdPartyTtsVoiceprintListUrl: readString(source, VOICEPRINT_LIST_URL_KEYS) ?? '',
    thirdPartyTtsVoiceprintCreateUrl: readString(source, VOICEPRINT_CREATE_URL_KEYS) ?? '',
    thirdPartyTtsVoiceprintDeleteUrl: readString(source, VOICEPRINT_DELETE_URL_KEYS) ?? '',
  }
}

function mergeMissingRuntimeConfig(target: RuntimeConfig, incoming: RuntimeConfig): void {
  if (!target.thirdPartyTtsApiUrl && incoming.thirdPartyTtsApiUrl) {
    target.thirdPartyTtsApiUrl = incoming.thirdPartyTtsApiUrl
  }
  if (!target.thirdPartyTtsVoiceprintListUrl && incoming.thirdPartyTtsVoiceprintListUrl) {
    target.thirdPartyTtsVoiceprintListUrl = incoming.thirdPartyTtsVoiceprintListUrl
  }
  if (!target.thirdPartyTtsVoiceprintCreateUrl && incoming.thirdPartyTtsVoiceprintCreateUrl) {
    target.thirdPartyTtsVoiceprintCreateUrl = incoming.thirdPartyTtsVoiceprintCreateUrl
  }
  if (!target.thirdPartyTtsVoiceprintDeleteUrl && incoming.thirdPartyTtsVoiceprintDeleteUrl) {
    target.thirdPartyTtsVoiceprintDeleteUrl = incoming.thirdPartyTtsVoiceprintDeleteUrl
  }
}

function mergeOverrideRuntimeConfig(target: RuntimeConfig, incoming: RuntimeConfig): void {
  if (incoming.thirdPartyTtsApiUrl) {
    target.thirdPartyTtsApiUrl = incoming.thirdPartyTtsApiUrl
  }
  if (incoming.thirdPartyTtsVoiceprintListUrl) {
    target.thirdPartyTtsVoiceprintListUrl = incoming.thirdPartyTtsVoiceprintListUrl
  }
  if (incoming.thirdPartyTtsVoiceprintCreateUrl) {
    target.thirdPartyTtsVoiceprintCreateUrl = incoming.thirdPartyTtsVoiceprintCreateUrl
  }
  if (incoming.thirdPartyTtsVoiceprintDeleteUrl) {
    target.thirdPartyTtsVoiceprintDeleteUrl = incoming.thirdPartyTtsVoiceprintDeleteUrl
  }
}

function readWindowRuntimeConfig(): RuntimeConfig {
  if (typeof window === 'undefined') return {}

  const win = window as unknown as Record<string, unknown>
  const candidates = [
    asRecord(win.__FREECUT_RUNTIME_CONFIG__),
    asRecord(win.__FREECUT_CONFIG__),
    asRecord(win.__RUNTIME_CONFIG__),
  ]

  for (const candidate of candidates) {
    const parsed = readConfigFromSource(candidate)
    if (
      parsed.thirdPartyTtsApiUrl ||
      parsed.thirdPartyTtsVoiceprintListUrl ||
      parsed.thirdPartyTtsVoiceprintCreateUrl ||
      parsed.thirdPartyTtsVoiceprintDeleteUrl
    ) {
      return parsed
    }
  }

  return {}
}

function readLocalStorageRuntimeConfig(): RuntimeConfig {
  if (typeof window === 'undefined') return {}

  try {
    return {
      thirdPartyTtsApiUrl: window.localStorage.getItem('thirdPartyTtsApiUrl')?.trim() ?? '',
      thirdPartyTtsVoiceprintListUrl:
        window.localStorage.getItem('thirdPartyTtsVoiceprintListUrl')?.trim() ?? '',
      thirdPartyTtsVoiceprintCreateUrl:
        window.localStorage.getItem('thirdPartyTtsVoiceprintCreateUrl')?.trim() ?? '',
      thirdPartyTtsVoiceprintDeleteUrl:
        window.localStorage.getItem('thirdPartyTtsVoiceprintDeleteUrl')?.trim() ?? '',
    }
  } catch {
    return {}
  }
}

async function loadRuntimeConfig(): Promise<RuntimeConfig> {
  const cacheBust = `_fc=${Date.now()}`
  const candidates = Array.from(
    new Set([
      RUNTIME_CONFIG_URL,
      RUNTIME_CONFIG_PUBLIC_URL,
      '/runtime-config.json',
      '/public/runtime-config.json',
      'runtime-config.json',
      './runtime-config.json',
    ]),
  )

  const mergedConfig: RuntimeConfig = {}
  const diagnostics: string[] = []
  let loadedAny = false

  for (const candidate of candidates) {
    try {
      const candidateUrl = candidate.includes('?')
        ? `${candidate}&${cacheBust}`
        : `${candidate}?${cacheBust}`
      const response = await fetch(candidateUrl, { cache: 'no-store' })
      diagnostics.push(`${candidateUrl} => ${response.status}`)
      if (!response.ok) continue

      const rawText = await response.text()
      const payload = parseJsonRecord(rawText)
      if (!payload) {
        diagnostics.push(`${candidateUrl} => invalid JSON`)
        continue
      }

      loadedAny = true
      mergeMissingRuntimeConfig(mergedConfig, readConfigFromSource(payload))

      if (
        mergedConfig.thirdPartyTtsApiUrl &&
        mergedConfig.thirdPartyTtsVoiceprintListUrl &&
        mergedConfig.thirdPartyTtsVoiceprintCreateUrl &&
        mergedConfig.thirdPartyTtsVoiceprintDeleteUrl
      ) {
        break
      }
    } catch {
      diagnostics.push(`${candidate} => fetch failed`)
    }
  }

  const windowConfig = readWindowRuntimeConfig()
  const localStorageConfig = readLocalStorageRuntimeConfig()
  const hadWindowOverride =
    !!windowConfig.thirdPartyTtsApiUrl ||
    !!windowConfig.thirdPartyTtsVoiceprintListUrl ||
    !!windowConfig.thirdPartyTtsVoiceprintCreateUrl ||
    !!windowConfig.thirdPartyTtsVoiceprintDeleteUrl
  const hadLocalStorageOverride =
    !!localStorageConfig.thirdPartyTtsApiUrl ||
    !!localStorageConfig.thirdPartyTtsVoiceprintListUrl ||
    !!localStorageConfig.thirdPartyTtsVoiceprintCreateUrl ||
    !!localStorageConfig.thirdPartyTtsVoiceprintDeleteUrl

  mergeOverrideRuntimeConfig(mergedConfig, windowConfig)
  mergeOverrideRuntimeConfig(mergedConfig, localStorageConfig)

  lastRuntimeConfigDebugSummary = [
    `candidates=[${candidates.join(', ')}]`,
    diagnostics.length > 0 ? `results=[${diagnostics.join('; ')}]` : '',
    `windowOverride=${hadWindowOverride ? 'yes' : 'no'}`,
    `localStorageOverride=${hadLocalStorageOverride ? 'yes' : 'no'}`,
  ]
    .filter(Boolean)
    .join(' ')

  if (!loadedAny) {
    logger.warn('Failed to load runtime-config.json for third-party TTS service', {
      candidates,
      diagnostics,
    })
  }

  return mergedConfig
}

function normalizeVoiceOption(value: unknown): ThirdPartyTtsVoiceOption | null {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return null
    return { value: trimmed, label: trimmed }
  }

  const record = asRecord(value)
  if (!record) return null

  const optionValue = readString(record, [
    'value',
    'voice',
    'voiceprint',
    'voice_name',
    'name',
    'id',
    'prompt_name',
  ])
  if (!optionValue) return null

  const label =
    readString(record, ['label', 'displayName', 'display_name', 'title', 'name']) ?? optionValue

  return {
    value: optionValue,
    label,
  }
}

function collectVoiceOptionsFromArray(values: unknown[]): ThirdPartyTtsVoiceOption[] {
  const normalized = values
    .map((entry) => normalizeVoiceOption(entry))
    .filter((entry): entry is ThirdPartyTtsVoiceOption => !!entry)

  const deduped: ThirdPartyTtsVoiceOption[] = []
  const seen = new Set<string>()
  for (const option of normalized) {
    if (seen.has(option.value)) continue
    seen.add(option.value)
    deduped.push(option)
  }
  return deduped
}

function parseVoiceOptionsPayload(payload: unknown): ThirdPartyTtsVoiceOption[] {
  if (Array.isArray(payload)) {
    return collectVoiceOptionsFromArray(payload)
  }

  const root = asRecord(payload)
  if (!root) return []

  const rootData = asRecord(root.data)
  const candidateArrays: unknown[][] = []

  const addArray = (value: unknown) => {
    if (Array.isArray(value)) {
      candidateArrays.push(value)
    }
  }

  addArray(root.options)
  addArray(root.voices)
  addArray(root.voiceprints)
  addArray(root.items)
  addArray(root.list)
  addArray(root.data)

  if (rootData) {
    addArray(rootData.options)
    addArray(rootData.voices)
    addArray(rootData.voiceprints)
    addArray(rootData.items)
    addArray(rootData.list)
    addArray(rootData.data)
  }

  for (const candidate of candidateArrays) {
    const parsed = collectVoiceOptionsFromArray(candidate)
    if (parsed.length > 0) {
      return parsed
    }
  }

  return []
}

function parseVoiceOptionsTextPayload(payload: string): ThirdPartyTtsVoiceOption[] {
  const lines = payload
    .split(/\r?\n|,/g)
    .map((line) => line.trim())
    .filter(Boolean)
  return collectVoiceOptionsFromArray(lines)
}

function parseVoiceOptionsLooseJsonLikeText(payload: string): ThirdPartyTtsVoiceOption[] {
  const dataArrayMatch = payload.match(/data\s*:\s*\[([\s\S]*?)\]/i)
  if (!dataArrayMatch) return []
  const inner = dataArrayMatch[1] ?? ''
  const extracted: string[] = []
  const regex = /'([^']+)'|"([^"]+)"/g
  let match: RegExpExecArray | null = regex.exec(inner)
  while (match) {
    const value = (match[1] ?? match[2] ?? '').trim()
    if (value) extracted.push(value)
    match = regex.exec(inner)
  }
  return collectVoiceOptionsFromArray(extracted)
}

function makeSafeFileNameSegment(text: string): string {
  const collapsed = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return collapsed.slice(0, 32) || 'speech'
}

function getFileExtensionFromMimeType(mimeType: string): string {
  const normalized = mimeType.toLowerCase()
  if (normalized.includes('mpeg') || normalized.includes('mp3')) return 'mp3'
  if (normalized.includes('ogg')) return 'ogg'
  if (normalized.includes('aac')) return 'aac'
  if (normalized.includes('flac')) return 'flac'
  if (normalized.includes('m4a') || normalized.includes('mp4')) return 'm4a'
  return 'wav'
}

function createOutputFileName(text: string, voice: ThirdPartyTtsVoice, extension: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const voiceSegment = voice.trim().toLowerCase() || 'voice'
  return `ai-tts-${makeSafeFileNameSegment(text)}-${voiceSegment}-${timestamp}.${extension}`
}

function decodeBase64Audio(base64Value: string): Blob {
  const dataUrlMatch = base64Value.match(/^data:(audio\/[^;]+);base64,(.+)$/i)
  const mimeType = dataUrlMatch?.[1] ?? 'audio/wav'
  const payload = dataUrlMatch?.[2] ?? base64Value
  const cleanPayload = payload.replace(/\s+/g, '')

  const binary = atob(cleanPayload)
  const bytes = new Uint8Array(binary.length)

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }

  return new Blob([bytes], { type: mimeType })
}

async function readResponseError(response: Response): Promise<string> {
  const contentType = response.headers.get('content-type') ?? ''

  try {
    if (contentType.includes('json')) {
      const payload = asRecord(await response.json())
      if (payload) {
        const message = readString(payload, ['message', 'error', 'detail'])
        if (message) {
          return message
        }
      }
    } else {
      const text = (await response.text()).trim()
      if (text) {
        return text
      }
    }
  } catch {
    // fall through to status-based message
  }

  return `TTS API request failed (${response.status})`
}

async function fetchAudioByUrl(url: string, apiUrl: string): Promise<Blob> {
  const resolvedUrl = resolveUrlByBase(url, apiUrl)
  const response = await fetch(resolvedUrl)

  if (!response.ok) {
    let detail = ''
    try {
      detail = (await response.text()).slice(0, 240).trim()
    } catch {
      // ignore
    }
    throw new Error(
      `Failed to download TTS audio (${response.status}) from ${resolvedUrl}${detail ? `: ${detail}` : ''}`,
    )
  }

  return response.blob()
}

async function resolveAudioFromJsonPayload(payload: unknown, apiUrl: string): Promise<Blob> {
  const root = asRecord(payload)
  if (!root) {
    throw new Error('Invalid JSON payload returned by TTS API')
  }

  const nested = asRecord(root.data)
  const candidates = [root, nested].filter((item): item is Record<string, unknown> => !!item)

  for (const candidate of candidates) {
    const audioUrl = readString(candidate, ['audioUrl', 'audio_url', 'url'])
    if (audioUrl) {
      return fetchAudioByUrl(audioUrl, apiUrl)
    }

    const audioBase64 = readString(candidate, ['audioBase64', 'audio_base64', 'base64', 'audio'])
    if (audioBase64) {
      return decodeBase64Audio(audioBase64)
    }
  }

  throw new Error(
    'No audio data found in TTS API JSON response. Supported fields: audioUrl/audio_url/url or audioBase64/audio_base64/base64/audio',
  )
}

function isLikelyAudioContentType(contentType: string): boolean {
  if (!contentType) return false

  return (
    contentType.startsWith('audio/') ||
    contentType.includes('application/octet-stream') ||
    contentType.includes('application/wav') ||
    contentType.includes('application/x-wav') ||
    contentType.includes('application/wave')
  )
}

function isLikelyTextContentType(contentType: string): boolean {
  if (!contentType) return false

  return (
    contentType.startsWith('text/') ||
    contentType.includes('application/json') ||
    contentType.includes('application/xml') ||
    contentType.includes('application/xhtml+xml')
  )
}

async function resolveAudioBlob(response: Response, apiUrl: string): Promise<Blob> {
  const contentType = (response.headers.get('content-type') ?? '').toLowerCase()

  if (contentType.includes('json')) {
    const payload = await response.json()
    return resolveAudioFromJsonPayload(payload, apiUrl)
  }

  if (isLikelyAudioContentType(contentType)) {
    return response.blob()
  }

  if (contentType && !isLikelyTextContentType(contentType)) {
    const blob = await response.blob()
    if (blob.size > 0) {
      return blob
    }
  }

  const text = (await response.text()).trim()
  if (!text) {
    throw new Error('TTS API returned an empty response')
  }

  if (text.startsWith('data:audio/')) {
    return decodeBase64Audio(text)
  }

  if (/^https?:\/\//i.test(text) || text.startsWith('/')) {
    return fetchAudioByUrl(text, apiUrl)
  }

  throw new Error(
    'Unable to parse TTS API response. Return audio, JSON, or a downloadable audio URL.',
  )
}

async function readAudioDuration(blob: Blob): Promise<number> {
  if (typeof Audio === 'undefined') {
    return 0
  }

  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(blob)
    const audio = new Audio()

    const cleanup = () => {
      audio.removeEventListener('loadedmetadata', handleLoaded)
      audio.removeEventListener('error', handleError)
      URL.revokeObjectURL(objectUrl)
    }

    const handleLoaded = () => {
      const duration = Number.isFinite(audio.duration) ? audio.duration : 0
      cleanup()
      resolve(duration)
    }

    const handleError = () => {
      cleanup()
      resolve(0)
    }

    audio.addEventListener('loadedmetadata', handleLoaded)
    audio.addEventListener('error', handleError)
    audio.preload = 'metadata'
    audio.src = objectUrl
  })
}

class ThirdPartyTtsService {
  isSupported(): boolean {
    return typeof fetch === 'function'
  }

  async getReferenceVoiceprintOptions(customUrl?: string): Promise<ThirdPartyTtsVoiceOption[]> {
    const runtimeConfig = await loadRuntimeConfig()
    const endpoint = normalizeHttpUrl(
      customUrl ?? runtimeConfig.thirdPartyTtsVoiceprintListUrl ?? '',
    )
    if (!endpoint || !this.isSupported()) {
      return []
    }

    try {
      const response = await fetch(endpoint, {
        cache: 'no-store',
        headers: {
          Accept: 'application/json,text/plain',
        },
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const contentType = (response.headers.get('content-type') ?? '').toLowerCase()
      const rawText = await response.text()
      let parsed: ThirdPartyTtsVoiceOption[] = []
      if (contentType.includes('json')) {
        try {
          parsed = parseVoiceOptionsPayload(JSON.parse(rawText))
        } catch {
          parsed = parseVoiceOptionsLooseJsonLikeText(rawText)
        }
      } else {
        parsed = parseVoiceOptionsTextPayload(rawText)
      }

      return parsed
    } catch (error) {
      logger.warn('Failed to load third-party voiceprint options', error)
      return []
    }
  }

  async addReferenceVoiceprint({
    name,
    promptVoice,
    apiUrl,
  }: {
    name: string
    promptVoice: File
    apiUrl?: string
  }): Promise<void> {
    const trimmedName = name.trim()
    if (!trimmedName) {
      throw new Error('Please provide a voiceprint name')
    }
    if (!promptVoice) {
      throw new Error('Please upload a voiceprint audio file')
    }

    const runtimeConfig = await loadRuntimeConfig()
    const endpoint = normalizeHttpUrl(
      apiUrl ?? runtimeConfig.thirdPartyTtsVoiceprintCreateUrl ?? '',
    )
    if (!endpoint) {
      throw new Error(
        `Please configure thirdPartyTtsVoiceprintCreateUrl in public/runtime-config.json. ${lastRuntimeConfigDebugSummary}`,
      )
    }
    if (!this.isSupported()) {
      throw new Error('Network requests are not supported in this environment')
    }

    const formData = new FormData()
    formData.append('name', trimmedName)
    formData.append('prompt_voice', promptVoice, promptVoice.name)

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Accept: 'application/json,text/plain,*/*',
      },
      body: formData,
    })

    if (!response.ok) {
      throw new Error(await readResponseError(response))
    }

    const contentType = (response.headers.get('content-type') ?? '').toLowerCase()
    if (!contentType.includes('json')) {
      return
    }

    try {
      const payload = asRecord(await response.json())
      if (!payload) return
      const code = payload.code
      if (typeof code === 'number' && code !== 200) {
        const message = readString(payload, ['msg', 'message', 'error', 'detail'])
        throw new Error(message || `Add voiceprint failed (code ${code})`)
      }
    } catch (error) {
      if (error instanceof Error) {
        throw error
      }
    }
  }

  async deleteReferenceVoiceprint({
    name,
    apiUrl,
  }: {
    name: string
    apiUrl?: string
  }): Promise<void> {
    const trimmedName = name.trim()
    if (!trimmedName) {
      throw new Error('Please select a voiceprint to delete')
    }

    const runtimeConfig = await loadRuntimeConfig()
    const endpoint = normalizeHttpUrl(
      apiUrl ?? runtimeConfig.thirdPartyTtsVoiceprintDeleteUrl ?? '',
    )
    if (!endpoint) {
      throw new Error(
        `Please configure thirdPartyTtsVoiceprintDeleteUrl in public/runtime-config.json. ${lastRuntimeConfigDebugSummary}`,
      )
    }
    if (!this.isSupported()) {
      throw new Error('Network requests are not supported in this environment')
    }

    const encodedName = encodeURIComponent(trimmedName)
    const resolvedEndpoint = endpoint.includes('{name}')
      ? endpoint.replace('{name}', encodedName)
      : `${endpoint.replace(/\/+$/, '')}/${encodedName}`

    const response = await fetch(resolvedEndpoint, {
      method: 'DELETE',
      headers: {
        Accept: 'application/json,text/plain,*/*',
      },
    })

    if (!response.ok) {
      throw new Error(await readResponseError(response))
    }

    const contentType = (response.headers.get('content-type') ?? '').toLowerCase()
    if (!contentType.includes('json')) {
      return
    }

    try {
      const payload = asRecord(await response.json())
      if (!payload) return
      const code = payload.code
      if (typeof code === 'number' && code !== 200) {
        const message = readString(payload, ['msg', 'message', 'error', 'detail'])
        throw new Error(message || `Delete voiceprint failed (code ${code})`)
      }
    } catch (error) {
      if (error instanceof Error) {
        throw error
      }
    }
  }

  async generateSpeechFile({
    text,
    voice,
    voiceprintType,
    emoControlMethod,
    emoWeight,
    emotionVectorValues,
    voiceprintFile,
    emoRefFile,
    speed,
    apiUrl,
    onProgress,
  }: GenerateSpeechOptions): Promise<{
    blob: Blob
    file: File
    duration: number
  }> {
    const trimmedText = text.trim()
    if (!trimmedText) {
      throw new Error('Please provide text to synthesize')
    }

    const runtimeConfig = await loadRuntimeConfig()
    const endpoint = normalizeHttpUrl(apiUrl ?? runtimeConfig.thirdPartyTtsApiUrl ?? '')
    if (!endpoint) {
      throw new Error(
        `Please configure thirdPartyTtsApiUrl in public/runtime-config.json. ${lastRuntimeConfigDebugSummary}`,
      )
    }

    if (!this.isSupported()) {
      throw new Error('Network requests are not supported in this environment')
    }

    onProgress?.('Requesting third-party TTS service...')

    const formData = new FormData()
    formData.append('text', trimmedText)
    formData.append('speed', String(speed))
    formData.append('prompt_type', voiceprintType)
    formData.append('emo_control_method', emoControlMethod)
    formData.append('emo_weight', String(emoWeight))

    if (voiceprintType === '1') {
      const selectedVoice = voice.trim()
      if (!selectedVoice) {
        throw new Error('Please select a reference voiceprint')
      }
      formData.append('prompt_name', selectedVoice)
    } else {
      if (!voiceprintFile) {
        throw new Error('Please upload a voiceprint file')
      }

      onProgress?.('Preparing uploaded voiceprint...')
      formData.append('prompt_voice', voiceprintFile, voiceprintFile.name)
    }

    if (emoControlMethod === '2') {
      if (!emoRefFile) {
        throw new Error('Please upload an emotion reference audio file')
      }

      formData.append('emo_ref_path', emoRefFile, emoRefFile.name)
    }

    if (emoControlMethod === '3') {
      const vectors = emotionVectorValues ?? THIRD_PARTY_TTS_DEFAULT_EMOTION_VECTOR_VALUES
      for (const option of THIRD_PARTY_TTS_EMOTION_VECTOR_OPTIONS) {
        const rawValue = vectors[option.key]
        const normalizedValue = Number.isFinite(rawValue) ? Math.min(1, Math.max(0, rawValue)) : 0
        formData.append(option.key, String(normalizedValue))
      }
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 120_000)

    let response: Response
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Accept: 'audio/wav,audio/*,application/json,text/plain',
        },
        body: formData,
        signal: controller.signal,
      })
    } catch (error) {
      if (controller.signal.aborted) {
        throw new Error('Third-party TTS API request timed out')
      }
      throw error
    } finally {
      clearTimeout(timeout)
    }

    if (!response.ok) {
      throw new Error(await readResponseError(response))
    }

    onProgress?.('Parsing generated audio...')
    const blob = await resolveAudioBlob(response, endpoint)
    const normalizedBlob = blob.type ? blob : new Blob([blob], { type: 'audio/wav' })

    onProgress?.('Processing audio...')
    const duration = await readAudioDuration(normalizedBlob)
    const extension = getFileExtensionFromMimeType(normalizedBlob.type)
    const file = new File([normalizedBlob], createOutputFileName(trimmedText, voice, extension), {
      type: normalizedBlob.type || 'audio/wav',
      lastModified: Date.now(),
    })

    return { blob: normalizedBlob, file, duration }
  }
}

export const thirdPartyTtsService = new ThirdPartyTtsService()

logger.debug('Third-party TTS service initialized')
