const TTS_QUALITY_STORAGE_KEY = 'editor:ttsQuality';
const TTS_ENGINE_STORAGE_KEY = 'editor:ttsEngine';
type StoredTtsQuality = 'q8' | 'fp16' | 'fp32';
export type StoredTtsEngine = 'kokoro' | 'moss';

const DEFAULT_TTS_QUALITY: StoredTtsQuality = 'q8';
const DEFAULT_TTS_ENGINE: StoredTtsEngine = 'kokoro';

function isStoredTtsQuality(value: string): value is StoredTtsQuality {
  return value === 'q8' || value === 'fp16' || value === 'fp32';
}

function isStoredTtsEngine(value: string): value is StoredTtsEngine {
  return value === 'kokoro' || value === 'moss';
}

export function getStoredTtsQuality(): StoredTtsQuality {
  try {
    const value = localStorage.getItem(TTS_QUALITY_STORAGE_KEY);
    return value && isStoredTtsQuality(value) ? value : DEFAULT_TTS_QUALITY;
  } catch {
    return DEFAULT_TTS_QUALITY;
  }
}

export function setStoredTtsQuality(model: StoredTtsQuality): void {
  try {
    localStorage.setItem(TTS_QUALITY_STORAGE_KEY, model);
  } catch {
    // ignore persistence failures
  }
}

export function getStoredTtsEngine(): StoredTtsEngine {
  try {
    const value = localStorage.getItem(TTS_ENGINE_STORAGE_KEY);
    return value && isStoredTtsEngine(value) ? value : DEFAULT_TTS_ENGINE;
  } catch {
    return DEFAULT_TTS_ENGINE;
  }
}

export function setStoredTtsEngine(engine: StoredTtsEngine): void {
  try {
    localStorage.setItem(TTS_ENGINE_STORAGE_KEY, engine);
  } catch {
    // ignore persistence failures
  }
}
