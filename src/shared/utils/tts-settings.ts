const TTS_QUALITY_STORAGE_KEY = 'editor:ttsQuality';
type StoredTtsQuality = 'q8' | 'fp16' | 'fp32';

const DEFAULT_TTS_QUALITY: StoredTtsQuality = 'q8';

function isStoredTtsQuality(value: string): value is StoredTtsQuality {
  return value === 'q8' || value === 'fp16' || value === 'fp32';
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
