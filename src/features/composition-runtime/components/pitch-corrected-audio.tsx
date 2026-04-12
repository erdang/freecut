import React, { useEffect, useRef } from 'react';
import { getAudioTargetTimeSeconds } from '../utils/video-timing';
import {
  acquirePreviewAudioElement,
  markPreviewAudioElementUsesWebAudio,
  releasePreviewAudioElement,
} from '../utils/preview-audio-element-pool';
import { useGizmoStore } from '@/features/composition-runtime/deps/stores';
import { usePlaybackStore } from '@/features/composition-runtime/deps/stores';
import type { AudioPlaybackProps } from './audio-playback-props';
import { useAudioPlaybackState } from './hooks/use-audio-playback-state';
import {
  createPreviewClipAudioGraph,
  rampPreviewClipGain,
  setPreviewClipGain,
  type PreviewClipAudioGraph,
} from '../utils/preview-audio-graph';

interface PitchCorrectedAudioProps extends AudioPlaybackProps {
  src: string;
  sourceStartOffsetSec?: number;
}

/**
 * Audio component with pitch-preserved playback for rate-stretched audio.
 *
 * Uses HTML5 audio element with preservesPitch (native browser feature).
 * Export uses Canvas + WebCodecs (client-render-engine.ts) which handles audio separately.
 *
 * Wrapped in React.memo to prevent re-renders when parent composition updates
 * but audio props haven't changed (e.g., when moving other items in timeline).
 */
export const PitchCorrectedAudio: React.FC<PitchCorrectedAudioProps> = React.memo(({
  src,
  itemId,
  volume = 0,
  playbackRate = 1,
  trimBefore = 0,
  sourceFps,
  sourceStartOffsetSec = 0,
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

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const graphRef = useRef<PreviewClipAudioGraph | null>(null);
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  // Track when we last synced - initialized to current time
  const lastSyncTimeRef = useRef<number>(Date.now());
  // Track if this is the very first sync (component just mounted)
  const needsInitialSyncRef = useRef<boolean>(true);
  // Track last frame for scrub detection (only seek on pause if frame changed)
  const lastFrameRef = useRef<number>(-1);
  const preWarmTimerRef = useRef<number | null>(null);

  // Force a hard resync on resume after paused scrubbing/skimming.
  useEffect(() => {
    if (playing) {
      needsInitialSyncRef.current = true;
    }
  }, [playing]);

  // Use HTML5 audio transport with a shared clip graph so future EQ/SFX can be
  // inserted in the same place as buffered custom-decoder playback.
  useEffect(() => {
    const audio = acquirePreviewAudioElement(src);
    const graph = createPreviewClipAudioGraph();
    if (!graph) {
      releasePreviewAudioElement(audio);
      return;
    }
    audioRef.current = audio;
    graphRef.current = graph;
    audio.volume = 1;
    audio.muted = false;

    try {
      const sourceNode = graph.context.createMediaElementSource(audio);
      markPreviewAudioElementUsesWebAudio(audio);
      sourceNode.connect(graph.sourceInputNode);
      sourceNodeRef.current = sourceNode;
    } catch {
      graph.dispose();
      graphRef.current = null;
      audioRef.current = null;
      releasePreviewAudioElement(audio);
      return;
    }

    return () => {
      audioRef.current = null;
      sourceNodeRef.current?.disconnect();
      sourceNodeRef.current = null;
      graph.dispose();
      graphRef.current = null;
      if (preWarmTimerRef.current !== null) {
        clearTimeout(preWarmTimerRef.current);
        preWarmTimerRef.current = null;
      }
      releasePreviewAudioElement(audio);
    };
  }, [src]);

  // Update playback rate
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  // Update volume. Use native audio.volume for <= 1, lazily promote to Web Audio gain for boosts.
  useEffect(() => {
    const graph = graphRef.current;
    if (!graph) return;
    const clampedVolume = muted ? 0 : Math.max(0, finalVolume);
    rampPreviewClipGain(graph, clampedVolume);
  }, [finalVolume, muted]);

  // Sync playback with Composition timeline
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const effectiveSourceFps = sourceFps ?? fps;

    // Calculate target time in the source audio
    // IMPORTANT: trimBefore is in source FPS frames — must use effectiveSourceFps, not fps
    const sourceTimeSeconds = getAudioTargetTimeSeconds(trimBefore, effectiveSourceFps, frame, playbackRate, fps) - sourceStartOffsetSec;
    const clipStartTimeSeconds = Math.max(0, (trimBefore / effectiveSourceFps) - sourceStartOffsetSec);

    // During Sequence premount, frame is negative. Keep audio paused and pre-seek to
    // clip start so playback starts immediately when frame reaches 0.
    const isPremounted = frame < 0;
    const targetTimeSeconds = isPremounted
      ? clipStartTimeSeconds
      : Math.max(0, sourceTimeSeconds);

    // Detect if frame actually changed (for scrub detection)
    const frameChanged = frame !== lastFrameRef.current;
    lastFrameRef.current = frame;

    // Guard: Only seek if audio has enough data loaded
    // readyState: 0=HAVE_NOTHING, 1=HAVE_METADATA, 2=HAVE_CURRENT_DATA, 3=HAVE_FUTURE_DATA, 4=HAVE_ENOUGH_DATA
    const canSeek = audio.readyState >= 1;

    if (isPremounted) {
      if (!audio.paused) {
        audio.pause();
      }
      if (canSeek && Math.abs(audio.currentTime - clipStartTimeSeconds) > 0.05) {
        try {
          audio.currentTime = clipStartTimeSeconds;
        } catch {
          // Seek failed - audio may not be ready yet
        }
      }
      return;
    }

    if (playing) {
      // Cancel any pending pre-warm since we're about to play
      if (preWarmTimerRef.current !== null) {
        clearTimeout(preWarmTimerRef.current);
        preWarmTimerRef.current = null;
      }

      const currentTime = audio.currentTime;
      const now = Date.now();

      // Calculate drift direction: positive = audio ahead, negative = audio behind
      const drift = currentTime - targetTimeSeconds;
      const timeSinceLastSync = now - lastSyncTimeRef.current;

      // Determine if we need to seek:
      // 1. Initial sync when component first plays
      // 2. Audio is BEHIND by more than threshold (needs to catch up)
      // 3. Audio is far AHEAD (user seeked backwards, e.g., "Go to start")
      //
      // Small positive drift (< 0.5s) during heavy renders is tolerated — the
      // frame will catch up naturally. Seeking backwards on every render lag
      // causes an audible "rewind" glitch. But large drift (> 0.5s) signals a
      // deliberate user seek and must be respected.
      const audioBehind = drift < -0.2;
      const audioFarAhead = drift > 0.5;
      const needsSync = needsInitialSyncRef.current || audioFarAhead || (audioBehind && timeSinceLastSync > 500);

      if (needsSync && canSeek) {
        try {
          audio.currentTime = targetTimeSeconds;
          lastSyncTimeRef.current = now;
          needsInitialSyncRef.current = false;
        } catch {
          // Seek failed - audio may not be ready yet
        }
      }

      // Play if paused and audio has buffered ahead (HAVE_FUTURE_DATA).
      // >= 3 ensures the decoder has data beyond the current position,
      // preventing audio stutter on play start after seeking.
      if (audio.paused && audio.readyState >= 3) {
        // After a large seek (e.g. element remounted at currentTime=0 but target
        // is 70s in), wait for the browser to finish seeking before playing.
        // Playing immediately after a large currentTime assignment causes audible
        // jitter because the decoder hasn't buffered the new position yet.
        const seekDistance = Math.abs(drift);
        if (seekDistance > 1 && !audio.seeking) {
          // Seek was large but already completed — safe to play
        } else if (seekDistance > 1 && audio.seeking) {
          // Still seeking — defer play until seeked event
          const onSeeked = () => {
            audio.removeEventListener('seeked', onSeeked);
            if (usePlaybackStore.getState().isPlaying && audio.paused) {
              const ctx = graphRef.current?.context;
              if (ctx?.state === 'suspended') ctx.resume();
              audio.play().catch(() => {});
            }
          };
          audio.addEventListener('seeked', onSeeked, { once: true });
          return; // Don't play yet
        }
        // Resume shared context when this clip is using Web Audio gain.
        const sharedContext = graphRef.current?.context;
        if (sharedContext?.state === 'suspended') {
          sharedContext.resume();
        }
        audio.play().catch(() => {
          // Autoplay might be blocked - this is fine
        });
      }
    } else {
      // Pause audio when not playing
      if (!audio.paused) {
        audio.pause();
      }
      const playbackState = usePlaybackStore.getState();
      const isPreviewScrubbing =
        !playbackState.isPlaying
        && playbackState.previewFrame !== null
        && useGizmoStore.getState().activeGizmo === null;
      // Only seek when paused if frame actually changed (user is scrubbing) and audio is ready
      if (frameChanged && canSeek && !isPreviewScrubbing) {
        try {
          audio.currentTime = targetTimeSeconds;
        } catch {
          // Seek failed - audio may not be ready yet
        }

        // Pre-warm audio decoder at the new position (debounced).
        // A brief muted play/pause fills the decode buffer so audio
        // starts without a pop/stutter when the user presses play.
        if (preWarmTimerRef.current !== null) {
          clearTimeout(preWarmTimerRef.current);
        }
        preWarmTimerRef.current = window.setTimeout(() => {
          preWarmTimerRef.current = null;
          const a = audioRef.current;
          if (a && a.paused && a.readyState >= 2 && !usePlaybackStore.getState().isPlaying) {
            const graph = graphRef.current;
            const previousGain = graph?.outputGainNode.gain.value ?? 0;
            if (graph) {
              setPreviewClipGain(graph, 0);
            } else {
              a.volume = 0;
            }
            a.play().then(() => {
              if (!usePlaybackStore.getState().isPlaying) {
                a.pause();
                if (graph) {
                  setPreviewClipGain(graph, previousGain);
                } else {
                  a.volume = previousGain;
                }
              }
              // If playback started, leave volume to the volume sync effect
            }).catch(() => {
              if (!usePlaybackStore.getState().isPlaying) {
                if (graph) {
                  setPreviewClipGain(graph, previousGain);
                } else {
                  a.volume = previousGain;
                }
              }
            });
          }
        }, 50);
      }
    }
  }, [frame, fps, sourceFps, sourceStartOffsetSec, playing, playbackRate, trimBefore]);

  // This component renders nothing visually
  return null;
});
