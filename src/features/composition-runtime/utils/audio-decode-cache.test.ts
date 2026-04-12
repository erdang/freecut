import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const decodedPreviewAudioMocks = vi.hoisted(() => ({
  getDecodedPreviewAudio: vi.fn(async () => null),
  saveDecodedPreviewAudio: vi.fn(async () => undefined),
  deleteDecodedPreviewAudio: vi.fn(async () => undefined),
}));

const mediaDbMocks = vi.hoisted(() => ({
  getMedia: vi.fn(async () => null),
}));

const ac3Mocks = vi.hoisted(() => ({
  ensureAc3DecoderRegistered: vi.fn(async () => undefined),
  isAc3AudioCodec: vi.fn(() => false),
}));

const objectUrlRegistryMocks = vi.hoisted(() => ({
  getObjectUrlBlob: vi.fn(() => null),
}));

const mediabunnyMocks = vi.hoisted(() => {
  let pendingBuffer: Promise<{ buffer: AudioBuffer; timestamp: number; duration: number }> | null = null;
  const stats = {
    inputConstructed: 0,
    sinkConstructed: 0,
  };

  class Input {
    constructor(sourceConfig: unknown) {
      void sourceConfig;
      stats.inputConstructed += 1;
    }
    async getPrimaryAudioTrack() {
      return { id: 'track-1' };
    }
    dispose() {}
  }

  class UrlSource {
    constructor(url: string) {
      void url;
    }
  }

  class BlobSource {
    constructor(blob: Blob) {
      void blob;
    }
  }

  class AudioBufferSink {
    constructor(track: unknown) {
      void track;
      stats.sinkConstructed += 1;
    }
    async getBuffer(startTime: number) {
      void startTime;
      if (!pendingBuffer) {
        throw new Error('No pending buffer configured');
      }
      return pendingBuffer;
    }
    buffers(startTime: number, endTime: number) {
      void startTime;
      void endTime;
      return (async function* emptyBuffers() {
        yield* [];
      })();
    }
  }

  return {
    ALL_FORMATS: [],
    Input,
    UrlSource,
    BlobSource,
    AudioBufferSink,
    __setPendingBuffer(promise: Promise<{ buffer: AudioBuffer; timestamp: number; duration: number }>) {
      pendingBuffer = promise;
    },
    __reset() {
      pendingBuffer = null;
      stats.inputConstructed = 0;
      stats.sinkConstructed = 0;
    },
    __stats: stats,
  };
});

vi.mock('@/infrastructure/storage/indexeddb/decoded-preview-audio', () => decodedPreviewAudioMocks);
vi.mock('@/infrastructure/storage/indexeddb/media', () => mediaDbMocks);
vi.mock('@/shared/media/ac3-decoder', () => ac3Mocks);
vi.mock('@/infrastructure/browser/object-url-registry', () => objectUrlRegistryMocks);
vi.mock('mediabunny', () => mediabunnyMocks);

import {
  clearPreviewAudioCache,
  getOrDecodeAudioSliceForPlayback,
} from './audio-decode-cache';

function makeAudioBuffer(duration: number, sampleRate = 22050): AudioBuffer {
  const length = Math.max(1, Math.round(duration * sampleRate));
  const channels = [new Float32Array(length), new Float32Array(length)];
  return {
    duration,
    numberOfChannels: 2,
    length,
    sampleRate,
    getChannelData: (channel: number) => channels[channel] ?? channels[0]!,
  } as unknown as AudioBuffer;
}

function makeInt16Buffer(length: number): ArrayBuffer {
  return new Int16Array(length).buffer;
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe('audio-decode-cache targeted slice reuse', () => {
  beforeAll(() => {
    class OfflineAudioContextMock {
      constructor(
        private readonly channels: number,
        private readonly length: number,
        private readonly sampleRate: number,
      ) {}

      createBuffer(channels: number, length: number, sampleRate: number): AudioBuffer {
        const data = Array.from({ length: channels }, () => new Float32Array(length));
        return {
          duration: length / sampleRate,
          numberOfChannels: channels,
          length,
          sampleRate,
          getChannelData: (channel: number) => data[channel] ?? data[0]!,
        } as unknown as AudioBuffer;
      }
    }

    vi.stubGlobal('OfflineAudioContext', OfflineAudioContextMock);
  });

  beforeEach(() => {
    clearPreviewAudioCache();
    mediabunnyMocks.__reset();
    decodedPreviewAudioMocks.getDecodedPreviewAudio.mockReset();
    decodedPreviewAudioMocks.getDecodedPreviewAudio.mockImplementation(async () => null);
  });

  it('reuses a completed targeted slice for the same playback request', async () => {
    mediabunnyMocks.__setPendingBuffer(Promise.resolve({
      buffer: makeAudioBuffer(2),
      timestamp: 0,
      duration: 2,
    }));

    const firstSlice = await getOrDecodeAudioSliceForPlayback('media-1', 'blob://audio', {
      minReadySeconds: 2,
      targetTimeSeconds: 0,
      waitTimeoutMs: 0,
    });

    const secondSlice = await getOrDecodeAudioSliceForPlayback('media-1', 'blob://audio', {
      minReadySeconds: 2,
      targetTimeSeconds: 0,
      waitTimeoutMs: 0,
    });

    expect(firstSlice.buffer).toBe(secondSlice.buffer);
    expect(mediabunnyMocks.__stats.inputConstructed).toBe(1);
    expect(mediabunnyMocks.__stats.sinkConstructed).toBe(1);
  });

  it('shares an in-flight targeted slice decode for duplicate startup requests', async () => {
    const deferred = createDeferred<{ buffer: AudioBuffer; timestamp: number; duration: number }>();
    mediabunnyMocks.__setPendingBuffer(deferred.promise);

    const firstPromise = getOrDecodeAudioSliceForPlayback('media-2', 'blob://audio', {
      minReadySeconds: 2,
      targetTimeSeconds: 0,
      waitTimeoutMs: 0,
    });
    const secondPromise = getOrDecodeAudioSliceForPlayback('media-2', 'blob://audio', {
      minReadySeconds: 2,
      targetTimeSeconds: 0,
      waitTimeoutMs: 0,
    });

    deferred.resolve({
      buffer: makeAudioBuffer(2),
      timestamp: 0,
      duration: 2,
    });

    const [firstSlice, secondSlice] = await Promise.all([firstPromise, secondPromise]);

    expect(firstSlice.buffer).toBe(secondSlice.buffer);
    expect(mediabunnyMocks.__stats.inputConstructed).toBe(1);
    expect(mediabunnyMocks.__stats.sinkConstructed).toBe(1);
  });

  it('reuses a nearby in-flight targeted slice request while playback advances', async () => {
    const deferred = createDeferred<{ buffer: AudioBuffer; timestamp: number; duration: number }>();
    mediabunnyMocks.__setPendingBuffer(deferred.promise);

    const firstPromise = getOrDecodeAudioSliceForPlayback('media-3', 'blob://audio', {
      minReadySeconds: 3,
      targetTimeSeconds: 0,
      waitTimeoutMs: 0,
    });
    const secondPromise = getOrDecodeAudioSliceForPlayback('media-3', 'blob://audio', {
      minReadySeconds: 3,
      targetTimeSeconds: 1.5,
      waitTimeoutMs: 0,
    });

    deferred.resolve({
      buffer: makeAudioBuffer(3),
      timestamp: 0,
      duration: 3,
    });

    const [firstSlice, secondSlice] = await Promise.all([firstPromise, secondPromise]);

    expect(firstSlice.buffer).toBe(secondSlice.buffer);
    expect(mediabunnyMocks.__stats.inputConstructed).toBe(1);
    expect(mediabunnyMocks.__stats.sinkConstructed).toBe(1);
  });

  it('rebuilds an immediate partial slice from persisted bins around the target time', async () => {
    const records = new Map<string, unknown>([
      ['media-4', {
        id: 'media-4',
        mediaId: 'media-4',
        kind: 'meta',
        sampleRate: 10,
        totalFrames: 300,
        binCount: 3,
        binDurationSec: 10,
        createdAt: Date.now(),
      }],
      ['media-4:bin:0', {
        id: 'media-4:bin:0',
        mediaId: 'media-4',
        kind: 'bin',
        binIndex: 0,
        left: makeInt16Buffer(100),
        right: makeInt16Buffer(100),
        frames: 100,
        sampleRate: 10,
        createdAt: Date.now(),
      }],
      ['media-4:bin:1', {
        id: 'media-4:bin:1',
        mediaId: 'media-4',
        kind: 'bin',
        binIndex: 1,
        left: makeInt16Buffer(100),
        right: makeInt16Buffer(100),
        frames: 100,
        sampleRate: 10,
        createdAt: Date.now(),
      }],
      ['media-4:bin:2', {
        id: 'media-4:bin:2',
        mediaId: 'media-4',
        kind: 'bin',
        binIndex: 2,
        left: makeInt16Buffer(100),
        right: makeInt16Buffer(100),
        frames: 100,
        sampleRate: 10,
        createdAt: Date.now(),
      }],
    ]);
    decodedPreviewAudioMocks.getDecodedPreviewAudio.mockImplementation(async (id: string) => records.get(id) ?? null);

    const slice = await getOrDecodeAudioSliceForPlayback('media-4', 'blob://audio', {
      minReadySeconds: 3,
      targetTimeSeconds: 25,
      preRollSeconds: 1,
      waitTimeoutMs: 0,
    });

    expect(slice.startTime).toBe(20);
    expect(slice.buffer.duration).toBe(10);
    expect(slice.isComplete).toBe(false);
    expect(mediabunnyMocks.__stats.inputConstructed).toBe(0);
    expect(mediabunnyMocks.__stats.sinkConstructed).toBe(0);
  });
});
