import { describe, expect, it, vi } from 'vitest';

vi.mock('../deps/timeline-contract', () => ({
  DEFAULT_TRACK_HEIGHT: 100,
  timelineToSourceFrames: (
    timelineFrames: number,
    speed = 1,
    timelineFps: number,
    sourceFps: number,
  ) => Math.max(0, Math.round((timelineFrames / timelineFps) * sourceFps * speed)),
}));

import {
  buildCaptionTrack,
  buildCaptionTextItems,
  findDedicatedCaptionTrackForRanges,
  findGeneratedCaptionItemsForClip,
  findReplaceableCaptionItemsForClip,
  getCaptionTextItemTemplate,
  findCompatibleCaptionTrack,
  getCaptionRangeForClip,
  getCaptionFrameRange,
  normalizeCaptionSegments,
} from './caption-items';
import type { TimelineItem, TimelineTrack, VideoItem } from '@/types/timeline';

describe('caption-items', () => {
  it('creates caption tracks above all non-caption video tracks', () => {
    const track = buildCaptionTrack([
      {
        id: 'track-v1',
        name: 'V1',
        kind: 'video',
        height: 64,
        locked: false,
        visible: true,
        muted: false,
        solo: false,
        order: 0,
        items: [],
      },
      {
        id: 'track-a1',
        name: 'A1',
        kind: 'audio',
        height: 64,
        locked: false,
        visible: true,
        muted: false,
        solo: false,
        order: 1,
        items: [],
      },
    ]);

    expect(track.name).toBe('字幕');
    expect(track.kind).toBe('video');
    expect(track.order).toBe(-1);
  });

  it('normalizes empty and invalid transcript segments', () => {
    const normalized = normalizeCaptionSegments([
      { text: '  Hello  ', start: 0, end: 1.2 },
      { text: '   ', start: 2, end: 3 },
      { text: 'Backwards', start: 5, end: 4 },
    ]);

    expect(normalized).toEqual([
      { text: 'Hello', start: 0, end: 1.2 },
    ]);
  });

  it('maps transcript segments to timed text items within a trimmed clip using source fps', () => {
    const clip: VideoItem = {
      id: 'clip-1',
      type: 'video',
      trackId: 'track-1',
      from: 120,
      durationInFrames: 30,
      label: 'Clip',
      mediaId: 'media-1',
      src: 'blob:test',
      sourceStart: 30,
      sourceEnd: 90,
      sourceDuration: 300,
      sourceFps: 60,
      speed: 1,
    };

    const items = buildCaptionTextItems({
      mediaId: 'media-1',
      trackId: 'track-captions',
      segments: [
        { text: 'First line', start: 0.25, end: 1.0 },
        { text: 'Second line', start: 1.0, end: 1.5 },
        { text: 'Outside', start: 2.0, end: 3.0 },
      ],
      clip,
      timelineFps: 30,
      canvasWidth: 1920,
      canvasHeight: 1080,
    });

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      type: 'text',
      trackId: 'track-captions',
      mediaId: 'media-1',
      from: 120,
      durationInFrames: 15,
      text: 'First line',
      captionSource: {
        type: 'transcript',
        clipId: 'clip-1',
        mediaId: 'media-1',
      },
    });
    expect(items[1]).toMatchObject({
      from: 135,
      durationInFrames: 15,
      text: 'Second line',
    });
    expect(items[0]?.transform?.y).toBeGreaterThan(0);
  });

  it('derives caption range using clip speed and converted fps', () => {
    const clip: VideoItem = {
      id: 'clip-2',
      type: 'video',
      trackId: 'track-1',
      from: 200,
      durationInFrames: 15,
      label: 'Fast Clip',
      mediaId: 'media-1',
      src: 'blob:test',
      sourceStart: 30,
      sourceEnd: 90,
      sourceDuration: 300,
      sourceFps: 60,
      speed: 2,
    };

    const range = getCaptionRangeForClip(
      clip,
      [{ text: 'Fast segment', start: 0.5, end: 1.5 }],
      30,
    );

    expect(range).toEqual({
      startFrame: 200,
      endFrame: 215,
    });
  });

  it('finds a compatible track without overlap', () => {
    const tracks: TimelineTrack[] = [
      {
        id: 'track-1',
        name: 'Track 1',
        height: 64,
        locked: false,
        visible: true,
        muted: false,
        solo: false,
        order: 0,
        items: [],
      },
      {
        id: 'track-2',
        name: 'Track 2',
        height: 64,
        locked: false,
        visible: true,
        muted: false,
        solo: false,
        order: 1,
        items: [],
      },
    ];
    const items: TimelineItem[] = [
      {
        id: 'clip-1',
        type: 'video',
        trackId: 'track-1',
        from: 0,
        durationInFrames: 300,
        label: 'Clip',
        src: 'blob:test',
      },
    ];

    const track = findCompatibleCaptionTrack(tracks, items, 30, 90);
    expect(track?.id).toBe('track-2');
  });

  it('returns the overall transcript frame range', () => {
    const frameRange = getCaptionFrameRange(
      [
        { text: 'One', start: 0.2, end: 1.1 },
        { text: 'Two', start: 2.5, end: 4 },
      ],
      30,
    );

    expect(frameRange).toEqual({
      startFrame: 6,
      endFrame: 120,
    });
  });

  it('finds generated caption items for a clip and reuses their style template', () => {
    const clip: VideoItem = {
      id: 'clip-3',
      type: 'video',
      trackId: 'track-1',
      from: 0,
      durationInFrames: 60,
      label: 'Clip',
      mediaId: 'media-1',
      src: 'blob:test',
      sourceStart: 0,
      sourceEnd: 60,
      sourceDuration: 120,
      sourceFps: 30,
    };

    const generatedCaptions = buildCaptionTextItems({
      mediaId: 'media-1',
      trackId: 'track-captions',
      segments: [{ text: 'Original line', start: 0, end: 1 }],
      clip,
      timelineFps: 30,
      canvasWidth: 1920,
      canvasHeight: 1080,
    });

    const existingCaption = {
      ...generatedCaptions[0]!,
      color: '#ffcc00',
      backgroundColor: undefined,
      fontFamily: 'Sora',
      transform: {
        ...generatedCaptions[0]!.transform!,
        y: 420,
      },
    };

    const foundCaptions = findGeneratedCaptionItemsForClip(
      [
        existingCaption,
        {
          id: 'manual-text',
          type: 'text' as const,
          trackId: 'track-2',
          from: 0,
          durationInFrames: 30,
          label: 'Manual',
          text: 'Manual',
          color: '#ffffff',
        },
      ],
      clip.id,
    );

    expect(foundCaptions).toHaveLength(1);

    const regeneratedCaptions = buildCaptionTextItems({
      mediaId: 'media-1',
      trackId: 'track-captions',
      segments: [{ text: 'Updated line', start: 0, end: 1 }],
      clip,
      timelineFps: 30,
      canvasWidth: 1920,
      canvasHeight: 1080,
      styleTemplate: getCaptionTextItemTemplate(existingCaption),
    });

    expect(regeneratedCaptions[0]).toMatchObject({
      text: 'Updated line',
      color: '#ffcc00',
      backgroundColor: undefined,
      fontFamily: 'Sora',
      transform: {
        y: 420,
      },
    });
  });

  it('falls back to legacy generated caption detection when source metadata is missing', () => {
    const clip: VideoItem = {
      id: 'clip-legacy',
      type: 'video',
      trackId: 'track-1',
      from: 200,
      durationInFrames: 40,
      label: 'Legacy Clip',
      mediaId: 'media-legacy',
      src: 'blob:test',
    };

    const replaceableCaptions = findReplaceableCaptionItemsForClip(
      [
        {
          id: 'legacy-caption',
          type: 'text',
          trackId: 'track-captions',
          from: 205,
          durationInFrames: 12,
          label: 'Legacy caption',
          mediaId: 'media-legacy',
          text: 'Legacy caption',
          color: '#ffffff',
        },
        {
          id: 'manual-text',
          type: 'text',
          trackId: 'track-captions',
          from: 205,
          durationInFrames: 12,
          label: 'Manual title',
          mediaId: 'media-legacy',
          text: 'Different text',
          color: '#ffffff',
        },
      ],
      clip,
    );

    expect(replaceableCaptions.map((item) => item.id)).toEqual(['legacy-caption']);
  });

  it('selects a dedicated caption track instead of regular media tracks', () => {
    const tracks: TimelineTrack[] = [
      {
        id: 'track-video',
        name: 'V1',
        height: 64,
        locked: false,
        visible: true,
        muted: false,
        solo: false,
        order: 0,
        items: [],
      },
      {
        id: 'track-captions',
        name: '字幕',
        kind: 'video',
        height: 64,
        locked: false,
        visible: true,
        muted: false,
        solo: false,
        order: 1,
        items: [],
      },
    ];

    const items: TimelineItem[] = [
      {
        id: 'clip-1',
        type: 'video',
        trackId: 'track-video',
        from: 100,
        durationInFrames: 60,
        label: 'Clip',
        src: 'blob:test',
      },
    ];

    const track = findDedicatedCaptionTrackForRanges(
      tracks,
      items,
      [{ startFrame: 110, endFrame: 150 }],
    );

    expect(track?.id).toBe('track-captions');
  });

  it('skips dedicated caption tracks that overlap and picks the next free caption track', () => {
    const tracks: TimelineTrack[] = [
      {
        id: 'track-captions-1',
        name: '字幕',
        kind: 'video',
        height: 64,
        locked: false,
        visible: true,
        muted: false,
        solo: false,
        order: 0,
        items: [],
      },
      {
        id: 'track-captions-2',
        name: '字幕',
        kind: 'video',
        height: 64,
        locked: false,
        visible: true,
        muted: false,
        solo: false,
        order: 1,
        items: [],
      },
    ];

    const items: TimelineItem[] = [
      {
        id: 'caption-1',
        type: 'text',
        trackId: 'track-captions-1',
        from: 100,
        durationInFrames: 40,
        label: 'caption 1',
        mediaId: 'media-1',
        text: 'caption 1',
        color: '#ffffff',
        captionSource: {
          type: 'transcript',
          clipId: 'clip-1',
          mediaId: 'media-1',
        },
      },
    ];

    const track = findDedicatedCaptionTrackForRanges(
      tracks,
      items,
      [{ startFrame: 120, endFrame: 150 }],
    );

    expect(track?.id).toBe('track-captions-2');
  });
});
