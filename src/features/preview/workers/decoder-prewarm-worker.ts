/**
 * Web Worker for background mediabunny decoder pre-seeking.
 *
 * Decodes video frames off the main thread so pre-seeking occluded
 * variable-speed clips doesn't block the render loop's rAF callbacks.
 * Returns decoded ImageBitmaps that the render loop can draw directly.
 */

const TIMESTAMP_EPSILON = 1e-4;
const LOOKAHEAD_TOLERANCE_SECONDS = 0.05;
const STREAM_BACKTRACK_SECONDS = 1.0;
const FORWARD_JUMP_RESTART_SECONDS = 3.0;

// Lazy-load mediabunny (same pattern as filmstrip and proxy workers)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mb: any = null;
async function getMediabunny() {
  if (!mb) mb = await import('mediabunny');
  return mb;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WorkerSample = any;

interface ExtractorState {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sink: any;
  canvas: OffscreenCanvas;
  ctx: OffscreenCanvasRenderingContext2D;
  sampleIterator: AsyncGenerator<WorkerSample, void, unknown> | null;
  currentSample: WorkerSample | null;
  nextSample: WorkerSample | null;
  iteratorDone: boolean;
  lastRequestedTimestamp: number | null;
  cachedVideoFrame: VideoFrame | null;
  cachedVideoFrameSample: WorkerSample | null;
  drawLock: Promise<void> | null;
}

const extractors = new Map<string, ExtractorState>();
const initPromises = new Map<string, Promise<ExtractorState | null>>();

async function getExtractor(src: string, blob?: Blob): Promise<ExtractorState | null> {
  const existing = extractors.get(src);
  if (existing) return existing;

  const inflight = initPromises.get(src);
  if (inflight) return inflight;

  const promise = (async () => {
    const mediabunny = await getMediabunny();
    const source = blob
      ? new mediabunny.BlobSource(blob)
      : new mediabunny.UrlSource(src);
    const input = new mediabunny.Input({
      formats: mediabunny.ALL_FORMATS,
      source,
    });

    self.postMessage({ type: 'debug', step: 'init_started' });

    try {
      const videoTrack = await input.getPrimaryVideoTrack();
      if (!videoTrack) {
        input.dispose?.();
        return null;
      }

      if (typeof videoTrack.canDecode === 'function' && !(await videoTrack.canDecode())) {
        input.dispose?.();
        return null;
      }

      const sink = await videoTrack.createVideoSampleSink();
      const canvas = new OffscreenCanvas(1, 1);
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        input.dispose?.();
        return null;
      }

      self.postMessage({ type: 'debug', step: 'init_complete' });

      const state: ExtractorState = {
        input,
        sink,
        canvas,
        ctx,
        sampleIterator: null,
        currentSample: null,
        nextSample: null,
        iteratorDone: false,
        lastRequestedTimestamp: null,
        cachedVideoFrame: null,
        cachedVideoFrameSample: null,
        drawLock: null,
      };
      extractors.set(src, state);
      return state;
    } catch (error) {
      input.dispose?.();
      throw error;
    }
  })();

  initPromises.set(src, promise);
  try {
    return await promise;
  } finally {
    initPromises.delete(src);
  }
}

function closeSample(sample: WorkerSample | null): void {
  if (!sample || typeof sample.close !== 'function') return;
  try {
    sample.close();
  } catch {
    // Ignore close errors.
  }
}

function closeCachedVideoFrame(state: ExtractorState): void {
  if (!state.cachedVideoFrame) return;
  try {
    state.cachedVideoFrame.close();
  } catch {
    // Ignore close errors.
  }
  state.cachedVideoFrame = null;
  state.cachedVideoFrameSample = null;
}

function closeStreamState(state: ExtractorState): void {
  if (state.sampleIterator) {
    void state.sampleIterator.return?.();
  }
  state.sampleIterator = null;
  state.iteratorDone = true;
  state.lastRequestedTimestamp = null;
  closeCachedVideoFrame(state);
  closeSample(state.currentSample);
  closeSample(state.nextSample);
  state.currentSample = null;
  state.nextSample = null;
}

function resetSampleIterator(state: ExtractorState, startTimestamp: number): void {
  closeStreamState(state);
  const streamStart = Math.max(0, startTimestamp - STREAM_BACKTRACK_SECONDS);
  state.sampleIterator = state.sink.samples(streamStart, Infinity) as AsyncGenerator<WorkerSample, void, unknown>;
  state.iteratorDone = false;
  state.lastRequestedTimestamp = null;
}

async function peekNextSample(state: ExtractorState): Promise<WorkerSample | null> {
  if (state.nextSample) {
    return state.nextSample;
  }
  if (!state.sampleIterator || state.iteratorDone) {
    return null;
  }

  const nextResult = await state.sampleIterator.next();
  if (nextResult.done) {
    state.iteratorDone = true;
    return null;
  }

  state.nextSample = nextResult.value;
  return state.nextSample;
}

async function ensureSampleForTimestamp(state: ExtractorState, timestamp: number): Promise<void> {
  if (!state.sampleIterator) {
    resetSampleIterator(state, timestamp);
  } else if (
    state.lastRequestedTimestamp !== null
    && timestamp + TIMESTAMP_EPSILON < state.lastRequestedTimestamp
  ) {
    resetSampleIterator(state, timestamp);
  } else if (
    state.lastRequestedTimestamp !== null
    && timestamp - state.lastRequestedTimestamp > FORWARD_JUMP_RESTART_SECONDS
  ) {
    resetSampleIterator(state, timestamp);
  }

  state.lastRequestedTimestamp = timestamp;

  while (true) {
    const candidate = await peekNextSample(state);
    if (!candidate) break;

    if (candidate.timestamp <= timestamp + TIMESTAMP_EPSILON) {
      closeCachedVideoFrame(state);
      closeSample(state.currentSample);
      state.currentSample = candidate;
      state.nextSample = null;
      continue;
    }

    if (
      !state.currentSample
      && candidate.timestamp - timestamp <= LOOKAHEAD_TOLERANCE_SECONDS
    ) {
      state.currentSample = candidate;
      state.nextSample = null;
    }
    break;
  }
}

function getOrCreateCurrentVideoFrame(state: ExtractorState): VideoFrame | null {
  const sample = state.currentSample;
  if (!sample) {
    return null;
  }

  let videoFrame = state.cachedVideoFrame;
  if (!videoFrame || state.cachedVideoFrameSample !== sample) {
    closeCachedVideoFrame(state);
    if (typeof sample.toVideoFrame === 'function') {
      videoFrame = sample.toVideoFrame();
    } else {
      videoFrame = sample.frame ?? null;
    }
    if (!videoFrame) {
      return null;
    }
    state.cachedVideoFrame = videoFrame;
    state.cachedVideoFrameSample = sample;
  }

  return videoFrame;
}

function renderCurrentSampleToBitmap(state: ExtractorState): ImageBitmap | null {
  const videoFrame = getOrCreateCurrentVideoFrame(state);
  if (!videoFrame) {
    return null;
  }

  const visibleRect = (videoFrame as VideoFrame & {
    visibleRect?: { x: number; y: number; width: number; height: number };
  }).visibleRect;

  const width = visibleRect?.width && visibleRect.width > 0
    ? visibleRect.width
    : videoFrame.displayWidth;
  const height = visibleRect?.height && visibleRect.height > 0
    ? visibleRect.height
    : videoFrame.displayHeight;
  if (width < 1 || height < 1) {
    return null;
  }

  state.canvas.width = width;
  state.canvas.height = height;

  if (
    visibleRect
    && Number.isFinite(visibleRect.width)
    && Number.isFinite(visibleRect.height)
    && visibleRect.width > 0
    && visibleRect.height > 0
  ) {
    state.ctx.drawImage(
      videoFrame,
      visibleRect.x,
      visibleRect.y,
      visibleRect.width,
      visibleRect.height,
      0,
      0,
      width,
      height,
    );
  } else {
    state.ctx.drawImage(videoFrame, 0, 0, width, height);
  }

  return state.canvas.transferToImageBitmap();
}

async function recoverAndPrime(state: ExtractorState, timestamp: number, error: unknown): Promise<boolean> {
  const message = error instanceof Error ? error.message : String(error);
  const looksRecoverable = /key frame|configure\(\)|flush\(\)|InvalidStateError|decode/i.test(message);
  if (!looksRecoverable) {
    return false;
  }

  try {
    resetSampleIterator(state, timestamp);
    await ensureSampleForTimestamp(state, timestamp);
    return state.currentSample !== null;
  } catch {
    return false;
  }
}

async function preseekWithState(state: ExtractorState, timestamp: number): Promise<ImageBitmap | null> {
  try {
    await ensureSampleForTimestamp(state, timestamp);
    return renderCurrentSampleToBitmap(state);
  } catch (error) {
    const recovered = await recoverAndPrime(state, timestamp, error);
    if (!recovered) {
      return null;
    }
    return renderCurrentSampleToBitmap(state);
  }
}

async function preseek(src: string, timestamp: number, blob?: Blob): Promise<ImageBitmap | null> {
  const state = await getExtractor(src, blob);
  if (!state) return null;

  const previous = state.drawLock ?? Promise.resolve();
  const result = previous.then(() => preseekWithState(state, timestamp));
  state.drawLock = result.then(() => undefined, () => undefined);
  return result;
}

// Signal worker is alive.
self.postMessage({ type: 'ready' });

self.onmessage = async (event: MessageEvent) => {
  const msg = event.data;
  if (msg.type !== 'preseek') return;

  try {
    const bitmap = await preseek(msg.src, msg.timestamp, msg.blob);
    if (bitmap) {
      self.postMessage(
        { type: 'preseek_done', id: msg.id, success: true, timestamp: msg.timestamp, bitmap },
        { transfer: [bitmap] },
      );
    } else {
      self.postMessage({ type: 'preseek_done', id: msg.id, success: false, timestamp: msg.timestamp });
    }
  } catch (error) {
    self.postMessage({
      type: 'preseek_done',
      id: msg.id,
      success: false,
      timestamp: msg.timestamp,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
