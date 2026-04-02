import { describe, expect, it } from 'vitest';
import {
  getCompatibleVideoCodecs,
  getDefaultAudioCodec,
  getDefaultVideoCodec,
  mapToClientSettings,
  selectFallbackVideoCodec,
  validateSettings,
} from './client-renderer';

describe('client-renderer export matrix', () => {
  it('exposes AV1 only for containers that can actually carry it', () => {
    expect(getCompatibleVideoCodecs('mp4')).toEqual(['h264', 'h265']);
    expect(getCompatibleVideoCodecs('webm')).toEqual(['vp9', 'vp8', 'av1']);
    expect(getCompatibleVideoCodecs('mkv')).toEqual(['h264', 'h265', 'vp9', 'vp8', 'av1']);
  });

  it('keeps sensible default codecs by container', () => {
    expect(getDefaultVideoCodec('mp4')).toBe('h264');
    expect(getDefaultVideoCodec('webm')).toBe('vp9');
    expect(getDefaultAudioCodec('mp4')).toBe('aac');
    expect(getDefaultAudioCodec('mkv')).toBe('opus');
    expect(getDefaultAudioCodec('wav')).toBe('pcm-s16');
  });

  it('maps AV1 exports to a WebM-compatible client configuration', () => {
    const clientSettings = mapToClientSettings({
      codec: 'av1',
      quality: 'high',
      resolution: { width: 1920, height: 1080 },
    }, 30);

    expect(clientSettings.codec).toBe('av1');
    expect(clientSettings.container).toBe('webm');
  });

  it('only falls back to codecs that match the selected container', () => {
    expect(selectFallbackVideoCodec(['avc'], 'webm')).toBeNull();
    expect(selectFallbackVideoCodec(['av1', 'avc'], 'webm')).toBe('av1');
    expect(selectFallbackVideoCodec(['vp9', 'avc'], 'mkv')).toBe('avc');
  });

  it('rejects invalid codec and container combinations', () => {
    expect(validateSettings({
      mode: 'video',
      codec: 'avc',
      container: 'webm',
      quality: 'high',
      resolution: { width: 1920, height: 1080 },
      fps: 30,
    })).toEqual({
      valid: false,
      error: 'Codec avc is not supported in WEBM',
    });

    expect(validateSettings({
      mode: 'audio',
      codec: 'avc',
      container: 'mp4',
      quality: 'high',
      resolution: { width: 1920, height: 1080 },
      fps: 30,
    })).toEqual({
      valid: false,
      error: 'Audio export must use an audio-only container',
    });
  });
});
