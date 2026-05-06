import { createLogger } from '@/shared/logging/logger'

const logger = createLogger('ThirdPartyTtsService')
const RUNTIME_CONFIG_URL = `${import.meta.env.BASE_URL}runtime-config.json`

interface RuntimeConfig {
  thirdPartyTtsApiUrl?: string
}

export type ThirdPartyTtsVoice =
  | 'Bella'
  | 'Luna'
  | 'Rosie'
  | 'Kiki'
  | 'Jasper'
  | 'Bruno'
  | 'Hugo'
  | 'Leo'

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

export const THIRD_PARTY_TTS_VOICE_OPTIONS: Array<{
  value: ThirdPartyTtsVoice
  label: string
}> = [
  { value: 'Bella', label: 'Bella' },
  { value: 'Luna', label: 'Luna' },
  { value: 'Rosie', label: 'Rosie' },
  { value: 'Kiki', label: 'Kiki' },
  { value: 'Jasper', label: 'Jasper' },
  { value: 'Bruno', label: 'Bruno' },
  { value: 'Hugo', label: 'Hugo' },
  { value: 'Leo', label: 'Leo' },
]

export const THIRD_PARTY_TTS_VOICEPRINT_TYPE_OPTIONS: Array<{
  value: ThirdPartyTtsVoiceprintType
  label: string
}> = [
  { value: '1', label: 'Existing Voiceprint' },
  { value: '2', label: 'Upload Voiceprint' },
]

export const THIRD_PARTY_TTS_EMO_CONTROL_METHOD_OPTIONS: Array<{
  value: ThirdPartyTtsEmoControlMethod
  label: string
}> = [
  { value: '1', label: 'Same as voice reference audio' },
  { value: '2', label: 'Use emotion reference audio' },
  { value: '3', label: 'Use emotion vector control' },
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

async function loadRuntimeConfig(): Promise<RuntimeConfig> {
  try {
    const response = await fetch(RUNTIME_CONFIG_URL, { cache: 'no-store' })
    if (!response.ok) {
      return {}
    }

    const payload = asRecord(await response.json())
    return payload
      ? {
          thirdPartyTtsApiUrl:
            readString(payload, ['thirdPartyTtsApiUrl', 'third_party_tts_api_url']) ?? '',
        }
      : {}
  } catch {
    return {}
  }
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
  return `ai-tts-${makeSafeFileNameSegment(text)}-${voice.toLowerCase()}-${timestamp}.${extension}`
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
  const resolvedUrl = new URL(url, apiUrl).toString()
  const response = await fetch(resolvedUrl)

  if (!response.ok) {
    throw new Error(`Failed to download TTS audio (${response.status})`)
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
    const endpoint = (apiUrl ?? runtimeConfig.thirdPartyTtsApiUrl ?? '').trim()
    if (!endpoint) {
      throw new Error('Please configure thirdPartyTtsApiUrl in public/runtime-config.json')
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
      formData.append('prompt_name', voice)
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
