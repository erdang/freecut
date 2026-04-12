import React, { useEffect, useRef, useState } from 'react';
import { useGizmoStore } from '@/features/composition-runtime/deps/stores';
import { usePlaybackStore } from '@/features/composition-runtime/deps/stores';
import { createLogger } from '@/shared/logging/logger';
import type { AudioPlaybackProps } from './audio-playback-props';
import { useAudioPlaybackState } from './hooks/use-audio-playback-state';
import { getAudioTargetTimeSeconds } from '../utils/video-timing';
import {
  createPreviewClipAudioGraph,
  rampPreviewClipGain,
  type PreviewClipAudioGraph,
} from '../utils/preview-audio-graph';
import {
  ensureSoundTouchPreviewWorkletLoaded,
  serializeAudioBufferForSoundTouchPreview,
  SOUND_TOUCH_PREVIEW_PROCESSOR_NAME,
} from '../utils/soundtouch-preview-worklet';
import type { SoundTouchPreviewProcessorMessage } from '../utils/soundtouch-preview-shared';

const log = createLogger('SoundTouchWorkletAudio');
const SEEK_TOLERANCE_SECONDS = 0.05;
const DRIFT_RESYNC_BEHIND_THRESHOLD_SECONDS = -0.2;
const DRIFT_RESYNC_AHEAD_THRESHOLD_SECONDS = 0.5;

interface SoundTouchWorkletAudioProps extends AudioPlaybackProps {
  audioBuffer: AudioBuffer;
  sourceStartOffsetSec?: number;
  isComplete?: boolean;
}

export const SoundTouchWorkletAudio: React.FC<SoundTouchWorkletAudioProps> = React.memo(({
  audioBuffer,
  itemId,
  volume = 0,
  playbackRate = 1,
  trimBefore = 0,
  sourceFps,
  sourceStartOffsetSec = 0,
  isComplete = false,
  muted = false,
  durationInFrames,
  audioFadeIn = 0,
  audioFadeOut = 0,
  audioFadeInCurve = 0,
  audioFadeOutCurve = 0,
  audioFadeInCurveX = 0.52,
  audioFadeOutCurveX = 0.52,
  clipFadeSpans,
  contentStartOffsetFrames = 0,
  contentEndOffsetFrames = 0,
  fadeInDelayFrames = 0,
  fadeOutLeadFrames = 0,
  crossfadeFadeIn,
  crossfadeFadeOut,
  liveGainItemIds,
  volumeMultiplier = 1,
}) => {
  const { frame, fps, playing, resolvedVolume: finalVolume } = useAudioPlaybackState({
    itemId,
    liveGainItemIds,
    volume,
    muted,
    durationInFrames,
    audioFadeIn,
    audioFadeOut,
    audioFadeInCurve,
    audioFadeOutCurve,
    audioFadeInCurveX,
    audioFadeOutCurveX,
    clipFadeSpans,
    contentStartOffsetFrames,
    contentEndOffsetFrames,
    fadeInDelayFrames,
    fadeOutLeadFrames,
    crossfadeFadeIn,
    crossfadeFadeOut,
    volumeMultiplier,
  });

  const graphRef = useRef<PreviewClipAudioGraph | null>(null);
  const nodeRef = useRef<AudioWorkletNode | null>(null);
  const [nodeReady, setNodeReady] = useState(false);
  const needsInitialSyncRef = useRef(true);
  const lastSyncWallClockRef = useRef(Date.now());
  const lastSyncContextTimeRef = useRef(0);
  const lastStartOffsetRef = useRef(0);
  const lastStartRateRef = useRef(playbackRate);
  const lastFrameRef = useRef(-1);
  const lastPostedPlayingRef = useRef<boolean | null>(null);

  const postMessage = (message: SoundTouchPreviewProcessorMessage): void => {
    nodeRef.current?.port.postMessage(message);
  };

  const postSeekSeconds = (seconds: number, sampleRate: number): void => {
    postMessage({
      type: 'seek',
      frame: Math.max(0, Math.floor(seconds * sampleRate)),
    });
  };

  // Force a hard resync on resume after paused scrubbing/skimming.
  useEffect(() => {
    if (playing) {
      needsInitialSyncRef.current = true;
    }
  }, [playing]);

  useEffect(() => {
    const graph = createPreviewClipAudioGraph();
    if (!graph) {
      return;
    }
    graphRef.current = graph;

    let cancelled = false;
    ensureSoundTouchPreviewWorkletLoaded(graph.context)
      .then((loaded) => {
        if (cancelled || !loaded) {
          return;
        }
        const node = new AudioWorkletNode(graph.context, SOUND_TOUCH_PREVIEW_PROCESSOR_NAME, {
          numberOfInputs: 0,
          numberOfOutputs: 1,
          outputChannelCount: [2],
          channelCount: 2,
          channelCountMode: 'explicit',
          channelInterpretation: 'speakers',
        });
        node.connect(graph.sourceInputNode);
        nodeRef.current = node;
        setNodeReady(true);
      })
      .catch((error) => {
        if (!cancelled) {
          log.warn('Failed to initialize SoundTouch preview node', { error });
        }
      });

    return () => {
      cancelled = true;
      setNodeReady(false);
      lastPostedPlayingRef.current = null;
      try {
        nodeRef.current?.port.postMessage({ type: 'reset' });
      } catch {
        // Ignore teardown races.
      }
      nodeRef.current?.disconnect();
      nodeRef.current = null;
      graph.dispose();
      graphRef.current = null;
    };
  }, []);

  useEffect(() => {
    const resume = () => {
      const graph = graphRef.current;
      if (graph?.context.state === 'suspended') {
        void graph.context.resume().catch(() => undefined);
      }
    };

    window.addEventListener('pointerdown', resume, { capture: true });
    window.addEventListener('keydown', resume, { capture: true });

    return () => {
      window.removeEventListener('pointerdown', resume, { capture: true });
      window.removeEventListener('keydown', resume, { capture: true });
    };
  }, []);

  useEffect(() => {
    const graph = graphRef.current;
    if (!graph) return;
    const clampedVolume = muted ? 0 : Math.max(0, finalVolume);
    rampPreviewClipGain(graph, clampedVolume);
  }, [finalVolume, muted]);

  useEffect(() => {
    if (!nodeReady) return;
    postMessage({
      type: 'set-tempo',
      tempo: Math.max(0.01, playbackRate),
    });
  }, [nodeReady, playbackRate]);

  useEffect(() => {
    const graph = graphRef.current;
    const node = nodeRef.current;
    if (!graph || !node || !nodeReady) {
      return;
    }

    const serialized = serializeAudioBufferForSoundTouchPreview(audioBuffer, graph.context.sampleRate);
    postMessage({
      type: 'load-source',
      leftChannel: serialized.leftChannel.buffer,
      rightChannel: serialized.rightChannel.buffer,
      frameCount: serialized.frameCount,
      sampleRate: serialized.sampleRate,
    });

    const effectiveSourceFps = sourceFps ?? fps;
    const initialTargetTime = Math.max(
      0,
      getAudioTargetTimeSeconds(trimBefore, effectiveSourceFps, Math.max(0, frame), playbackRate, fps) - sourceStartOffsetSec,
    );
    const clampedTargetTime = Math.max(0, Math.min(initialTargetTime, Math.max(0, audioBuffer.duration - 0.01)));
    postSeekSeconds(clampedTargetTime, graph.context.sampleRate);
    postMessage({ type: 'set-tempo', tempo: Math.max(0.01, playbackRate) });
    postMessage({ type: 'set-playing', playing });

    lastPostedPlayingRef.current = playing;
    lastStartOffsetRef.current = clampedTargetTime;
    lastStartRateRef.current = playbackRate;
    lastSyncContextTimeRef.current = graph.context.currentTime;
    lastSyncWallClockRef.current = Date.now();
    needsInitialSyncRef.current = !playing;
  }, [audioBuffer, fps, frame, nodeReady, playbackRate, playing, sourceFps, sourceStartOffsetSec, trimBefore]);

  useEffect(() => {
    const graph = graphRef.current;
    if (!graph || !nodeReady) return;

    const effectiveSourceFps = sourceFps ?? fps;
    const sourceTimeSeconds = getAudioTargetTimeSeconds(trimBefore, effectiveSourceFps, frame, playbackRate, fps) - sourceStartOffsetSec;
    const clipStartTimeSeconds = Math.max(0, (trimBefore / effectiveSourceFps) - sourceStartOffsetSec);
    const isPremounted = frame < 0;
    const targetTimeSeconds = isPremounted
      ? clipStartTimeSeconds
      : Math.max(0, sourceTimeSeconds);
    const clampedTargetTime = Math.max(0, Math.min(targetTimeSeconds, Math.max(0, audioBuffer.duration - 0.01)));

    const frameChanged = frame !== lastFrameRef.current;
    lastFrameRef.current = frame;

    if (isPremounted) {
      if (lastPostedPlayingRef.current !== false) {
        postMessage({ type: 'set-playing', playing: false });
        lastPostedPlayingRef.current = false;
      }
      if (Math.abs(lastStartOffsetRef.current - clipStartTimeSeconds) > SEEK_TOLERANCE_SECONDS) {
        postSeekSeconds(clipStartTimeSeconds, graph.context.sampleRate);
        lastStartOffsetRef.current = clipStartTimeSeconds;
      }
      needsInitialSyncRef.current = true;
      return;
    }

    const targetOutsideLoadedSlice = targetTimeSeconds > audioBuffer.duration - 0.01;
    if (targetOutsideLoadedSlice && !isComplete) {
      if (lastPostedPlayingRef.current !== false) {
        postMessage({ type: 'set-playing', playing: false });
        lastPostedPlayingRef.current = false;
      }
      needsInitialSyncRef.current = true;
      return;
    }

    if (playing) {
      if (graph.context.state === 'suspended') {
        void graph.context.resume().catch(() => undefined);
      }

      const now = graph.context.currentTime;
      const expectedOffset = lastStartOffsetRef.current
        + Math.max(0, now - lastSyncContextTimeRef.current) * lastStartRateRef.current;
      const drift = expectedOffset - clampedTargetTime;
      const timeSinceLastSync = Date.now() - lastSyncWallClockRef.current;
      const audioBehind = drift < DRIFT_RESYNC_BEHIND_THRESHOLD_SECONDS;
      const audioFarAhead = drift > DRIFT_RESYNC_AHEAD_THRESHOLD_SECONDS;
      const needsSync = needsInitialSyncRef.current || audioFarAhead || (audioBehind && timeSinceLastSync > 500);

      if (needsSync) {
        postSeekSeconds(clampedTargetTime, graph.context.sampleRate);
        lastSyncContextTimeRef.current = now;
        lastSyncWallClockRef.current = Date.now();
        lastStartOffsetRef.current = clampedTargetTime;
        lastStartRateRef.current = playbackRate;
        needsInitialSyncRef.current = false;
      }

      if (lastPostedPlayingRef.current !== true) {
        postMessage({ type: 'set-playing', playing: true });
        lastPostedPlayingRef.current = true;
      }
    } else {
      if (lastPostedPlayingRef.current !== false) {
        postMessage({ type: 'set-playing', playing: false });
        lastPostedPlayingRef.current = false;
      }

      const playbackState = usePlaybackStore.getState();
      const isPreviewScrubbing =
        !playbackState.isPlaying
        && playbackState.previewFrame !== null
        && useGizmoStore.getState().activeGizmo === null;

      if (frameChanged && !isPreviewScrubbing) {
        postSeekSeconds(clampedTargetTime, graph.context.sampleRate);
        lastStartOffsetRef.current = clampedTargetTime;
      }

      needsInitialSyncRef.current = true;
    }
  }, [audioBuffer.duration, fps, frame, isComplete, nodeReady, playbackRate, playing, sourceFps, sourceStartOffsetSec, trimBefore]);

  return null;
});
