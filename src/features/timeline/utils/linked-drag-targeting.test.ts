import { describe, expect, it } from 'vitest';
import type { TimelineTrack } from '@/types/timeline';
import { resolveLinkedDragTrackTargets } from './linked-drag-targeting';

function makeTrack(overrides: Partial<TimelineTrack> = {}): TimelineTrack {
  return {
    id: 'track-1',
    name: 'Track 1',
    height: 80,
    locked: false,
    visible: true,
    muted: false,
    solo: false,
    volume: 0,
    order: 0,
    items: [],
    ...overrides,
  };
}

describe('resolveLinkedDragTrackTargets', () => {
  it('uses the hovered video lane and its audio companion for a video drop zone', () => {
    const result = resolveLinkedDragTrackTargets({
      tracks: [
        makeTrack({ id: 'v1', name: 'V1', kind: 'video', order: 0 }),
        makeTrack({ id: 'a1', name: 'A1', kind: 'audio', order: 1 }),
      ],
      hoveredTrackId: 'v1',
      zone: 'video',
      preferredTrackHeight: 80,
    });

    expect(result).toMatchObject({ videoTrackId: 'v1', audioTrackId: 'a1' });
  });

  it('creates a new video lane above an audio lane when dropping into the video zone', () => {
    const result = resolveLinkedDragTrackTargets({
      tracks: [makeTrack({ id: 'a1', name: 'A1', kind: 'audio', order: 1 })],
      hoveredTrackId: 'a1',
      zone: 'video',
      preferredTrackHeight: 72,
    });

    expect(result?.tracks.find((track) => track.id === result.videoTrackId)).toMatchObject({ kind: 'video', name: 'V1' });
    expect(result?.audioTrackId).toBe('a1');
  });

  it('creates a new audio lane below a video lane when dropping into the audio zone', () => {
    const result = resolveLinkedDragTrackTargets({
      tracks: [makeTrack({ id: 'v1', name: 'V1', kind: 'video', order: 0 })],
      hoveredTrackId: 'v1',
      zone: 'audio',
      preferredTrackHeight: 72,
    });

    expect(result?.videoTrackId).toBe('v1');
    expect(result?.tracks.find((track) => track.id === result.audioTrackId)).toMatchObject({ kind: 'audio', name: 'A1' });
  });

  it('maps linked pairs by matching section index across video and audio lanes', () => {
    const result = resolveLinkedDragTrackTargets({
      tracks: [
        makeTrack({ id: 'v1', name: 'V1', kind: 'video', order: 0 }),
        makeTrack({ id: 'v2', name: 'V2', kind: 'video', order: 1 }),
        makeTrack({ id: 'a1', name: 'A1', kind: 'audio', order: 2 }),
      ],
      hoveredTrackId: 'v2',
      zone: 'audio',
      preferredTrackHeight: 72,
    });

    expect(result?.videoTrackId).toBe('v2');
    expect(result?.tracks.find((track) => track.id === result.audioTrackId)).toMatchObject({ kind: 'audio', name: 'A2' });
  });

  it('creates a fresh top video lane and bottom audio lane for new-track drop zones', () => {
    const result = resolveLinkedDragTrackTargets({
      tracks: [
        makeTrack({ id: 'v1', name: 'V1', kind: 'video', order: 0 }),
        makeTrack({ id: 'a1', name: 'A1', kind: 'audio', order: 1 }),
      ],
      hoveredTrackId: 'v1',
      zone: 'video',
      createNew: true,
      preferredTrackHeight: 72,
    });

    expect(result?.tracks.find((track) => track.id === result.videoTrackId)).toMatchObject({ kind: 'video', name: 'V2' });
    expect(result?.tracks.find((track) => track.id === result.audioTrackId)).toMatchObject({ kind: 'audio', name: 'A2' });
  });
});
