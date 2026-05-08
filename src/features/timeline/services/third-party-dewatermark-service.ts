import { createLogger } from '@/shared/logging/logger'
import { createMediabunnyInputSource } from '@/infrastructure/browser/mediabunny-input-source'

const logger = createLogger('ThirdPartyDewatermarkService')
const RUNTIME_CONFIG_URL = `${import.meta.env.BASE_URL}runtime-config.json`
const RUNTIME_CONFIG_PUBLIC_URL = `${import.meta.env.BASE_URL}public/runtime-config.json`

const API_URL_KEYS = [
  'thirdPartyDewatermarkApiUrl',
  'third_party_dewatermark_api_url',
  'dewatermarkApiUrl',
  'dewatermark_api_url',
]
const RESULT_BASE_URL_KEYS = [
  'thirdPartyDewatermarkResultBaseUrl',
  'third_party_dewatermark_result_base_url',
  'dewatermarkResultBaseUrl',
  'dewatermark_result_base_url',
  'dewatermarkDomainUrl',
  'dewatermark_domain_url',
]
const PREVIEW_BASE_URL_KEYS = [
  'thirdPartyDewatermarkPreviewBaseUrl',
  'third_party_dewatermark_preview_base_url',
  'dewatermarkPreviewBaseUrl',
  'dewatermark_preview_base_url',
  'dewatermarkVideoBaseUrl',
  'dewatermark_video_base_url',
]

let lastRuntimeConfigDebugSummary = ''

interface RuntimeConfig {
  thirdPartyDewatermarkApiUrl?: string
  thirdPartyDewatermarkResultBaseUrl?: string
  thirdPartyDewatermarkPreviewBaseUrl?: string
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function readString(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
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
    if (normalized.startsWith('/')) {
      return `${window.location.origin}${normalized}`
    }
    return `${window.location.origin}/${normalized}`
  }
  return normalized
}

function resolveProxyRoot(baseEndpoint: string): string | null {
  const proxyPrefix = '/dewatermark-proxy'
  const normalized = normalizeHttpUrl(baseEndpoint)
  if (!normalized) return null

  if (/^https?:\/\//i.test(normalized)) {
    try {
      const parsed = new URL(normalized)
      if (!parsed.pathname.startsWith(proxyPrefix)) return null
      return `${parsed.origin}${proxyPrefix}`
    } catch {
      return null
    }
  }

  if (!normalized.startsWith(proxyPrefix)) return null
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}${proxyPrefix}`
  }
  return proxyPrefix
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
    thirdPartyDewatermarkApiUrl: readString(source, API_URL_KEYS) ?? '',
    thirdPartyDewatermarkResultBaseUrl: readString(source, RESULT_BASE_URL_KEYS) ?? '',
    thirdPartyDewatermarkPreviewBaseUrl: readString(source, PREVIEW_BASE_URL_KEYS) ?? '',
  }
}

function mergeMissingRuntimeConfig(target: RuntimeConfig, incoming: RuntimeConfig): void {
  if (!target.thirdPartyDewatermarkApiUrl && incoming.thirdPartyDewatermarkApiUrl) {
    target.thirdPartyDewatermarkApiUrl = incoming.thirdPartyDewatermarkApiUrl
  }
  if (!target.thirdPartyDewatermarkResultBaseUrl && incoming.thirdPartyDewatermarkResultBaseUrl) {
    target.thirdPartyDewatermarkResultBaseUrl = incoming.thirdPartyDewatermarkResultBaseUrl
  }
  if (!target.thirdPartyDewatermarkPreviewBaseUrl && incoming.thirdPartyDewatermarkPreviewBaseUrl) {
    target.thirdPartyDewatermarkPreviewBaseUrl = incoming.thirdPartyDewatermarkPreviewBaseUrl
  }
}

function mergeOverrideRuntimeConfig(target: RuntimeConfig, incoming: RuntimeConfig): void {
  if (incoming.thirdPartyDewatermarkApiUrl) {
    target.thirdPartyDewatermarkApiUrl = incoming.thirdPartyDewatermarkApiUrl
  }
  if (incoming.thirdPartyDewatermarkResultBaseUrl) {
    target.thirdPartyDewatermarkResultBaseUrl = incoming.thirdPartyDewatermarkResultBaseUrl
  }
  if (incoming.thirdPartyDewatermarkPreviewBaseUrl) {
    target.thirdPartyDewatermarkPreviewBaseUrl = incoming.thirdPartyDewatermarkPreviewBaseUrl
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
      parsed.thirdPartyDewatermarkApiUrl ||
      parsed.thirdPartyDewatermarkResultBaseUrl ||
      parsed.thirdPartyDewatermarkPreviewBaseUrl
    ) {
      return parsed
    }
  }

  return {}
}

function readLocalStorageRuntimeConfig(): RuntimeConfig {
  if (typeof window === 'undefined') return {}
  try {
    const api = window.localStorage.getItem('thirdPartyDewatermarkApiUrl')?.trim() ?? ''
    const result = window.localStorage.getItem('thirdPartyDewatermarkResultBaseUrl')?.trim() ?? ''
    const preview = window.localStorage.getItem('thirdPartyDewatermarkPreviewBaseUrl')?.trim() ?? ''
    return {
      thirdPartyDewatermarkApiUrl: api,
      thirdPartyDewatermarkResultBaseUrl: result,
      thirdPartyDewatermarkPreviewBaseUrl: preview,
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
        mergedConfig.thirdPartyDewatermarkApiUrl &&
        mergedConfig.thirdPartyDewatermarkResultBaseUrl &&
        mergedConfig.thirdPartyDewatermarkPreviewBaseUrl
      ) {
        break
      }
    } catch {
      diagnostics.push(`${candidate} => fetch failed`)
      // try next candidate
    }
  }

  const windowConfig = readWindowRuntimeConfig()
  const localStorageConfig = readLocalStorageRuntimeConfig()
  const hadWindowOverride =
    !!windowConfig.thirdPartyDewatermarkApiUrl ||
    !!windowConfig.thirdPartyDewatermarkResultBaseUrl ||
    !!windowConfig.thirdPartyDewatermarkPreviewBaseUrl
  const hadLocalStorageOverride =
    !!localStorageConfig.thirdPartyDewatermarkApiUrl ||
    !!localStorageConfig.thirdPartyDewatermarkResultBaseUrl ||
    !!localStorageConfig.thirdPartyDewatermarkPreviewBaseUrl
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
    logger.warn('Failed to load runtime-config.json for dewatermark service', {
      candidates,
      diagnostics,
    })
  }
  return mergedConfig
}

async function readResponseError(response: Response): Promise<string> {
  const contentType = (response.headers.get('content-type') ?? '').toLowerCase()
  try {
    if (contentType.includes('json')) {
      const payload = asRecord(await response.json())
      if (payload) {
        const message = readString(payload, ['message', 'msg', 'error', 'detail'])
        if (message) return message
      }
    } else {
      const text = (await response.text()).trim()
      if (text) return text
    }
  } catch {
    // fall through
  }
  return `Dewatermark API request failed (${response.status})`
}

export type DewatermarkSubArea = [yMin: number, yMax: number, xMin: number, xMax: number]

export interface DewatermarkClipTrimRange {
  startSeconds: number
  endSeconds: number
}

export interface DewatermarkTaskResponse {
  completion_url?: string
  download_url?: string
  message?: string
  progress_url?: string
  status_url?: string
  success?: boolean
  task_id?: string
  [key: string]: unknown
}

export interface DewatermarkCompletionResponse {
  is_completed?: boolean
  is_failed?: boolean
  message?: string
  status?: string
  task_id?: string
  completion_time?: string
  download_url?: string
  output_path?: string
  output_url?: string
  [key: string]: unknown
}

function inferVideoContainerFromFile(file: File): 'mp4' | 'webm' | 'mov' | 'mkv' {
  const fileName = file.name.toLowerCase()
  const mimeType = (file.type || '').toLowerCase()

  if (fileName.endsWith('.webm') || mimeType.includes('webm')) return 'webm'
  if (fileName.endsWith('.mov') || mimeType.includes('quicktime')) return 'mov'
  if (fileName.endsWith('.mkv') || fileName.endsWith('.matroska') || mimeType.includes('matroska'))
    return 'mkv'
  return 'mp4'
}

function replaceFileExtension(fileName: string, extension: string): string {
  const index = fileName.lastIndexOf('.')
  const stem = index > 0 ? fileName.slice(0, index) : fileName
  return `${stem}.${extension}`
}

async function createTrimmedUploadFile(
  file: File,
  trimRange: DewatermarkClipTrimRange,
): Promise<File> {
  const start = Math.max(0, trimRange.startSeconds)
  const end = Math.max(0, trimRange.endSeconds)
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start + 0.001) {
    return file
  }

  if (!(Number.isFinite(file.size) && file.size > 0)) {
    return file
  }

  const mb = await import('mediabunny')
  const { Input, Output, BufferTarget, Conversion, ALL_FORMATS } = mb

  const container = inferVideoContainerFromFile(file)
  const { createOutputFormat } = await import('@/features/timeline/deps/export-contract')
  const format = await createOutputFormat(container, { fastStart: true })

  const input = new Input({
    formats: ALL_FORMATS,
    source: createMediabunnyInputSource(mb, file),
  })
  const target = new BufferTarget()
  const output = new Output({
    format,
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

  const extensionByContainer: Record<'mp4' | 'webm' | 'mov' | 'mkv', string> = {
    mp4: 'mp4',
    webm: 'webm',
    mov: 'mov',
    mkv: 'mkv',
  }
  const mimeByContainer: Record<'mp4' | 'webm' | 'mov' | 'mkv', string> = {
    mp4: 'video/mp4',
    webm: 'video/webm',
    mov: 'video/quicktime',
    mkv: 'video/x-matroska',
  }

  return new File(
    [trimmedBuffer],
    replaceFileExtension(file.name, extensionByContainer[container]),
    {
      type: mimeByContainer[container],
      lastModified: Date.now(),
    },
  )
}

function resolveTaskUrl(url: string | undefined, baseEndpoint: string): string | undefined {
  if (!url) return undefined
  try {
    if (url.startsWith('/')) {
      const proxyRoot = resolveProxyRoot(baseEndpoint)
      if (proxyRoot) {
        return `${proxyRoot}${url}`
      }
    }
    const absoluteBase = toAbsoluteBaseUrl(baseEndpoint)
    return absoluteBase ? new URL(url, absoluteBase).toString() : url
  } catch {
    return url
  }
}

function resolveUrlByDomain(url: string | undefined, baseEndpoint: string): string | undefined {
  if (!url) return undefined
  try {
    if (/^https?:\/\//i.test(url)) return url
    if (url.startsWith('/')) {
      const proxyRoot = resolveProxyRoot(baseEndpoint)
      if (proxyRoot) {
        return `${proxyRoot}${url}`
      }
    }
    const absoluteBase = toAbsoluteBaseUrl(baseEndpoint)
    if (!absoluteBase) return url
    const baseWithTrailingSlash = absoluteBase.endsWith('/') ? absoluteBase : `${absoluteBase}/`
    return new URL(url, baseWithTrailingSlash).toString()
  } catch {
    return url
  }
}

class ThirdPartyDewatermarkService {
  isSupported(): boolean {
    return typeof fetch === 'function'
  }

  async createTask({
    file,
    sub_area,
    clipTrimRange,
    apiUrl,
  }: {
    file: File
    sub_area: DewatermarkSubArea
    clipTrimRange?: DewatermarkClipTrimRange | null
    apiUrl?: string
  }): Promise<DewatermarkTaskResponse> {
    if (!file) {
      throw new Error('Missing source file for dewatermark task.')
    }
    if (!this.isSupported()) {
      throw new Error('Network requests are not supported in this environment')
    }

    const runtimeConfig = await loadRuntimeConfig()
    const endpoint = normalizeHttpUrl(apiUrl ?? runtimeConfig.thirdPartyDewatermarkApiUrl ?? '')
    const resultBase =
      normalizeHttpUrl(runtimeConfig.thirdPartyDewatermarkResultBaseUrl ?? '') || endpoint
    if (!endpoint) {
      throw new Error(
        `Please configure thirdPartyDewatermarkApiUrl in public/runtime-config.json (read from ${RUNTIME_CONFIG_URL}). Current values: api="${runtimeConfig.thirdPartyDewatermarkApiUrl ?? ''}", result="${runtimeConfig.thirdPartyDewatermarkResultBaseUrl ?? ''}", preview="${runtimeConfig.thirdPartyDewatermarkPreviewBaseUrl ?? ''}". ${lastRuntimeConfigDebugSummary}`,
      )
    }

    let uploadFile = file
    if (clipTrimRange) {
      try {
        uploadFile = await createTrimmedUploadFile(file, clipTrimRange)
      } catch (error) {
        logger.warn('Failed to create trimmed file for dewatermark upload, fallback to original', {
          error,
          clipTrimRange,
          fileName: file.name,
        })
        uploadFile = file
      }
    }

    const formData = new FormData()
    formData.append('file', uploadFile, uploadFile.name)
    formData.append('sub_area', JSON.stringify(sub_area))
    logger.debug('Dewatermark createTask request prepared', {
      endpoint,
      fileName: uploadFile.name,
      fileType: uploadFile.type,
      fileSize: uploadFile.size,
      originalFileName: file.name,
      originalFileSize: file.size,
      clipTrimRange,
      sub_area,
    })

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Accept: 'application/json,text/plain,*/*',
      },
      body: formData,
    })
    logger.debug('Dewatermark createTask response received', {
      endpoint,
      status: response.status,
      ok: response.ok,
      contentType: response.headers.get('content-type') ?? '',
    })

    if (!response.ok) {
      throw new Error(await readResponseError(response))
    }

    const text = await response.text()
    logger.debug('Dewatermark createTask response body', {
      endpoint,
      bodyPreview: text.slice(0, 1200),
    })
    const payload = parseJsonRecord(text)
    if (!payload) {
      logger.warn('Dewatermark createTask response parse failed', {
        endpoint,
        bodyPreview: text.slice(0, 1200),
      })
      throw new Error('Invalid dewatermark API response.')
    }

    const result: DewatermarkTaskResponse = {
      ...payload,
      completion_url: resolveTaskUrl(
        typeof payload.completion_url === 'string' ? payload.completion_url : undefined,
        resultBase,
      ),
      download_url: resolveTaskUrl(
        typeof payload.download_url === 'string' ? payload.download_url : undefined,
        resultBase,
      ),
      progress_url: resolveTaskUrl(
        typeof payload.progress_url === 'string' ? payload.progress_url : undefined,
        resultBase,
      ),
      status_url: resolveTaskUrl(
        typeof payload.status_url === 'string' ? payload.status_url : undefined,
        resultBase,
      ),
    }

    if (typeof result.success === 'boolean' && !result.success) {
      throw new Error(
        (typeof result.message === 'string' && result.message) || 'Dewatermark failed.',
      )
    }

    return result
  }

  async getCompletionStatus({
    completionUrl,
    apiUrl,
  }: {
    completionUrl: string
    apiUrl?: string
  }): Promise<DewatermarkCompletionResponse> {
    const runtimeConfig = await loadRuntimeConfig()
    const configuredApiUrl = normalizeHttpUrl(
      apiUrl ?? runtimeConfig.thirdPartyDewatermarkApiUrl ?? '',
    )
    const resultBase = normalizeHttpUrl(runtimeConfig.thirdPartyDewatermarkResultBaseUrl ?? '')
    const previewBase = normalizeHttpUrl(runtimeConfig.thirdPartyDewatermarkPreviewBaseUrl ?? '')
    const endpoint = resolveTaskUrl(completionUrl, resultBase || configuredApiUrl || completionUrl)
    if (!endpoint) {
      throw new Error('Missing completion URL.')
    }

    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        Accept: 'application/json,text/plain,*/*',
      },
    })
    logger.debug('Dewatermark completion poll response received', {
      endpoint,
      status: response.status,
      ok: response.ok,
      contentType: response.headers.get('content-type') ?? '',
    })

    if (!response.ok) {
      throw new Error(await readResponseError(response))
    }

    const text = await response.text()
    logger.debug('Dewatermark completion poll response body', {
      endpoint,
      bodyPreview: text.slice(0, 1200),
    })
    const payload = parseJsonRecord(text)
    if (!payload) {
      logger.warn('Dewatermark completion response parse failed', {
        endpoint,
        bodyPreview: text.slice(0, 1200),
      })
      throw new Error('Invalid completion response.')
    }

    const rawDownloadUrl =
      typeof payload.download_url === 'string' ? payload.download_url : undefined
    const rawOutputPath = typeof payload.output_path === 'string' ? payload.output_path : undefined

    return {
      ...payload,
      download_url: resolveUrlByDomain(rawDownloadUrl, resultBase || endpoint),
      output_path: rawOutputPath,
      output_url: resolveUrlByDomain(rawOutputPath, previewBase || resultBase || endpoint),
    }
  }
}

export const thirdPartyDewatermarkService = new ThirdPartyDewatermarkService()

logger.debug('Third-party dewatermark service initialized')
