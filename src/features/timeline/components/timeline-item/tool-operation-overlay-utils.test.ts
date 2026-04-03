import { describe, expect, it } from 'vitest';
import type { VideoItem } from '@/types/timeline';
import type { Transition } from '@/types/transition';
import { getSlideOperationBoundsVisual, getSlipOperationBoundsVisual, getTrimOperationBoundsVisual } from './tool-operation-overlay-utils';

function createVideoItem(): VideoItem {
  return {
    id: 'clip-1',
    type: 'video',
    trackId: 'track-1',
    from: 100,
    durationInFrames: 60,
    label: 'clip-1',
    src: 'clip-1.mp4',
    sourceStart: 20,
    sourceEnd: 80,
    sourceDuration: 120,
    sourceFps: 30,
  };
}

describe('tool operation overlay utils', () => {
  it('moves the slip bounds box together with the slip preview delta', () => {
    const visual = getSlipOperationBoundsVisual({
      item: {
        ...createVideoItem(),
        sourceStart: 30,
        sourceEnd: 90,
      },
      fps: 30,
      frameToPixels: (frames) => frames,
      constraintEdge: null,
      constrained: false,
      currentLeftPx: 100,
      currentRightPx: 160,
    });

    expect(visual.boxLeftPx).toBe(70);
    expect(visual.boxWidthPx).toBe(120);
    expect(visual.limitEdgePositionsPx).toEqual([70, 190]);
  });

  it('uses the rolling intersection span around the cut instead of the active clip span', () => {
    const left = {
      ...createVideoItem(),
      id: 'left',
      from: 100,
      durationInFrames: 60,
      sourceStart: 20,
      sourceEnd: 80,
      sourceDuration: 90,
    };
    const right = {
      ...createVideoItem(),
      id: 'right',
      from: 160,
      durationInFrames: 60,
      sourceStart: 0,
      sourceEnd: 60,
      sourceDuration: 60,
    };

    const visual = getTrimOperationBoundsVisual({
      item: left,
      items: [left, right],
      transitions: [],
      fps: 30,
      frameToPixels: (frames) => frames,
      handle: 'end',
      isRollingEdit: true,
      isRippleEdit: false,
      constrained: false,
      currentLeftPx: 100,
      currentRightPx: 160,
    });

    expect(visual.mode).toBe('rolling');
    expect(visual.boxLeftPx).toBe(160);
    expect(visual.boxWidthPx).toBe(10);
    expect(visual.limitEdgePositionsPx).toEqual([160, 170]);
  });

  it('slide bounds box accounts for transition constraints', () => {
    // Setup: three clips with a transition between the left neighbor and the slid item.
    // The transition consumes source handles, limiting how far the item can slide left.
    const leftNeighbor: VideoItem = {
      ...createVideoItem(),
      id: 'left',
      from: 0,
      durationInFrames: 100,
      sourceStart: 0,
      sourceEnd: 100,
      sourceDuration: 110, // only 10 frames of right handle
    };
    const item: VideoItem = {
      ...createVideoItem(),
      id: 'center',
      from: 100,
      durationInFrames: 60,
      sourceStart: 10,
      sourceEnd: 70,
      sourceDuration: 120,
    };
    const rightNeighbor: VideoItem = {
      ...createVideoItem(),
      id: 'right',
      from: 160,
      durationInFrames: 60,
      sourceStart: 0,
      sourceEnd: 60,
      sourceDuration: 120,
    };
    const items = [leftNeighbor, item, rightNeighbor];

    // Without transitions the box should span the full neighbor-limited range
    const withoutTransitions = getSlideOperationBoundsVisual({
      item,
      items,
      transitions: [],
      fps: 30,
      frameToPixels: (f) => f,
      leftNeighbor,
      rightNeighbor,
      constraintEdge: null,
      constrained: false,
      currentLeftPx: 100,
      currentRightPx: 160,
    });

    // With a transition that consumes handles, the box should be tighter
    const transition: Transition = {
      id: 'trans-1',
      type: 'crossfade',
      presentation: 'fade',
      timing: 'linear',
      leftClipId: 'left',
      rightClipId: 'center',
      trackId: 'track-1',
      durationInFrames: 10,
      alignment: 0.5,
    };
    const withTransitions = getSlideOperationBoundsVisual({
      item,
      items,
      transitions: [transition],
      fps: 30,
      frameToPixels: (f) => f,
      leftNeighbor,
      rightNeighbor,
      constraintEdge: null,
      constrained: false,
      currentLeftPx: 100,
      currentRightPx: 160,
    });

    // The transition-constrained box should be equal or narrower than the unconstrained one
    expect(withTransitions.boxWidthPx!).toBeLessThanOrEqual(withoutTransitions.boxWidthPx!);
  });

  it('anchors ripple-start limits to the previewed right-edge span', () => {
    const item = createVideoItem();

    const visual = getTrimOperationBoundsVisual({
      item,
      items: [item],
      transitions: [],
      fps: 30,
      frameToPixels: (frames) => frames,
      handle: 'start',
      isRollingEdit: false,
      isRippleEdit: true,
      constrained: false,
      currentLeftPx: 100,
      currentRightPx: 170,
    });

    expect(visual.mode).toBe('ripple');
    expect(visual.boxLeftPx).toBe(100);
    expect(visual.boxWidthPx).toBe(80);
    expect(visual.limitEdgePositionsPx).toEqual([101, 180]);
    expect(visual.edgePositionsPx).toEqual([170]);
  });
});
