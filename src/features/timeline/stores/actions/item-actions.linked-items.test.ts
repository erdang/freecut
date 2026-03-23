import { beforeEach, describe, expect, it } from 'vitest';
import type { AudioItem, VideoItem } from '@/types/timeline';
import { useItemsStore } from '../items-store';
import { useTransitionsStore } from '../transitions-store';
import { useKeyframesStore } from '../keyframes-store';
import { useTimelineCommandStore } from '../timeline-command-store';
import { useTimelineSettingsStore } from '../timeline-settings-store';
import { useSelectionStore } from '@/shared/state/selection';
import { linkItems, splitItem, unlinkItems } from './item-actions';

function makeVideoItem(overrides: Partial<VideoItem> = {}): VideoItem {
  return {
    id: 'video-1',
    type: 'video',
    trackId: 'video-track',
    from: 0,
    durationInFrames: 60,
    label: 'clip.mp4',
    src: 'blob:video',
    mediaId: 'media-1',
    linkedGroupId: 'group-1',
    originId: 'origin-1',
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
    label: 'clip.mp4',
    src: 'blob:audio',
    mediaId: 'media-1',
    linkedGroupId: 'group-1',
    originId: 'origin-1',
    ...overrides,
  };
}

describe('linked timeline items', () => {
  beforeEach(() => {
    useTimelineCommandStore.getState().clearHistory();
    useTimelineSettingsStore.setState({ fps: 30, isDirty: false });
    useItemsStore.getState().setItems([]);
    useItemsStore.getState().setTracks([]);
    useTransitionsStore.getState().setTransitions([]);
    useKeyframesStore.getState().setKeyframes([]);
    useSelectionStore.getState().clearSelection();
  });

  it('splits linked video/audio items together and preserves pairing per segment', () => {
    useItemsStore.getState().setItems([
      makeVideoItem(),
      makeAudioItem(),
    ]);

    const result = splitItem('video-1', 30);
    expect(result).not.toBeNull();

    const items = useItemsStore.getState().items;
    const leftVideo = items.find((item) => item.id === 'video-1');
    const leftAudio = items.find((item) => item.id === 'audio-1');
    const rightVideo = items.find((item) => item.type === 'video' && item.id !== 'video-1');
    const rightAudio = items.find((item) => item.type === 'audio' && item.id !== 'audio-1');

    expect(leftVideo).toMatchObject({ from: 0, durationInFrames: 30 });
    expect(leftAudio).toMatchObject({ from: 0, durationInFrames: 30 });
    expect(rightVideo).toMatchObject({ from: 30, durationInFrames: 30 });
    expect(rightAudio).toMatchObject({ from: 30, durationInFrames: 30 });
    expect(leftVideo?.linkedGroupId).toBe(leftAudio?.linkedGroupId);
    expect(rightVideo?.linkedGroupId).toBe(rightAudio?.linkedGroupId);
    expect(leftVideo?.linkedGroupId).not.toBe(rightVideo?.linkedGroupId);
    expect(useSelectionStore.getState().selectedItemIds).toEqual(['video-1', 'audio-1']);
  });

  it('unlinks a selected linked pair together', () => {
    useItemsStore.getState().setItems([makeVideoItem(), makeAudioItem()]);

    unlinkItems(['video-1']);

    const items = useItemsStore.getState().items;
    expect(items.find((item) => item.id === 'video-1')?.linkedGroupId).toBe('video-1');
    expect(items.find((item) => item.id === 'audio-1')?.linkedGroupId).toBe('audio-1');
    expect(useSelectionStore.getState().selectedItemIds).toEqual(['video-1', 'audio-1']);
  });

  it('links an eligible audio/video pair with a fresh group id', () => {
    useItemsStore.getState().setItems([
      makeVideoItem({ linkedGroupId: 'video-1' }),
      makeAudioItem({ linkedGroupId: 'audio-1' }),
    ]);

    const linked = linkItems(['video-1', 'audio-1']);

    const items = useItemsStore.getState().items;
    const video = items.find((item) => item.id === 'video-1');
    const audio = items.find((item) => item.id === 'audio-1');

    expect(linked).toBe(true);
    expect(video?.linkedGroupId).toBeTruthy();
    expect(video?.linkedGroupId).toBe(audio?.linkedGroupId);
  });
});
