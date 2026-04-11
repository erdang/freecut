import { describe, expect, it } from 'vitest';
import type { AudioItem, TimelineTrack, VideoItem } from '@/types/timeline';
import {
  buildInsertedGapPreviewUpdatesForSyncLockedTracks,
  buildRemovedIntervalPreviewUpdatesForSyncLockedTracks,
} from './sync-lock-ripple';

function makeTrack(
  overrides: Partial<TimelineTrack> & Pick<TimelineTrack, 'id' | 'name' | 'order' | 'kind'>,
): TimelineTrack {
  return {
    height: 80,
    locked: false,
    syncLock: true,
    visible: true,
    muted: false,
    solo: false,
    volume: 0,
    items: [],
    ...overrides,
  };
}

function makeVideoItem(overrides: Partial<VideoItem> = {}): VideoItem {
  return {
    id: 'video-1',
    type: 'video',
    trackId: 'video-track',
    from: 0,
    durationInFrames: 60,
    label: 'clip.mp4',
    src: 'blob:video',
    mediaId: 'media-video',
    ...overrides,
  };
}

function makeAudioItem(overrides: Partial<AudioItem> = {}): AudioItem {
  return {
    id: 'audio-1',
    type: 'audio',
    trackId: 'audio-track',
    from: 0,
    durationInFrames: 60,
    label: 'clip.wav',
    src: 'blob:audio',
    mediaId: 'media-audio',
    ...overrides,
  };
}

describe('sync-lock ripple preview helpers', () => {
  it('moves downstream clips on other sync-locked tracks during removed-interval preview', () => {
    const updates = buildRemovedIntervalPreviewUpdatesForSyncLockedTracks({
      items: [
        makeVideoItem(),
        makeAudioItem({ id: 'audio-after', from: 90, durationInFrames: 20 }),
      ],
      tracks: [
        makeTrack({ id: 'video-track', name: 'V1', order: 0, kind: 'video' }),
        makeTrack({ id: 'audio-track', name: 'A1', order: 1, kind: 'audio' }),
      ],
      editedTrackIds: new Set(['video-track']),
      intervals: [{ start: 50, end: 60 }],
    });

    expect(updates).toEqual([
      expect.objectContaining({ id: 'audio-after', from: 80 }),
    ]);
  });

  it('collapses a continuous sync-locked clip and hides fully covered clips during removed-interval preview', () => {
    const updates = buildRemovedIntervalPreviewUpdatesForSyncLockedTracks({
      items: [
        makeVideoItem(),
        makeAudioItem({ id: 'music-bed', from: 0, durationInFrames: 120 }),
        makeAudioItem({ id: 'stinger', from: 52, durationInFrames: 4 }),
      ],
      tracks: [
        makeTrack({ id: 'video-track', name: 'V1', order: 0, kind: 'video' }),
        makeTrack({ id: 'audio-track', name: 'A1', order: 1, kind: 'audio' }),
      ],
      editedTrackIds: new Set(['video-track']),
      intervals: [{ start: 50, end: 60 }],
    });

    expect(updates).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'music-bed', durationInFrames: 110 }),
      expect.objectContaining({ id: 'stinger', hidden: true }),
    ]));
  });

  it('opens a live gap on other sync-locked tracks during inserted-gap preview', () => {
    const updates = buildInsertedGapPreviewUpdatesForSyncLockedTracks({
      items: [
        makeVideoItem(),
        makeAudioItem({ id: 'music-bed', from: 0, durationInFrames: 120 }),
        makeAudioItem({ id: 'audio-after', from: 60, durationInFrames: 20 }),
      ],
      tracks: [
        makeTrack({ id: 'video-track', name: 'V1', order: 0, kind: 'video' }),
        makeTrack({ id: 'audio-track', name: 'A1', order: 1, kind: 'audio' }),
      ],
      editedTrackIds: new Set(['video-track']),
      cutFrame: 50,
      amount: 10,
    });

    expect(updates).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'music-bed', durationInFrames: 130 }),
      expect.objectContaining({ id: 'audio-after', from: 70 }),
    ]));
  });

  it('skips tracks with sync lock disabled in preview helpers', () => {
    const updates = buildRemovedIntervalPreviewUpdatesForSyncLockedTracks({
      items: [
        makeVideoItem(),
        makeAudioItem({ id: 'audio-after', from: 90, durationInFrames: 20 }),
      ],
      tracks: [
        makeTrack({ id: 'video-track', name: 'V1', order: 0, kind: 'video' }),
        makeTrack({ id: 'audio-track', name: 'A1', order: 1, kind: 'audio', syncLock: false }),
      ],
      editedTrackIds: new Set(['video-track']),
      intervals: [{ start: 50, end: 60 }],
    });

    expect(updates).toEqual([]);
  });
});
