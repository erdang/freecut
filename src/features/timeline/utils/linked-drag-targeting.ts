import type { TimelineTrack } from '@/types/timeline';
import {
  createClassicTrack,
  getTrackKind,
  renameTrackForKind,
  type TrackKind,
} from './classic-tracks';

export type LinkedDragDropZone = 'video' | 'audio';

interface EnsureTrackIndexParams {
  tracks: TimelineTrack[];
  kind: TrackKind;
  index: number;
  preferredTrackHeight: number;
}

export interface LinkedDragTrackTargetResult {
  tracks: TimelineTrack[];
  videoTrackId: string;
  audioTrackId: string;
}

function getKindTracks(tracks: TimelineTrack[], kind: TrackKind): TimelineTrack[] {
  return [...tracks]
    .filter((track) => getTrackKind(track) === kind)
    .sort((left, right) => left.order - right.order);
}

function getClassicTrackNumber(track: TimelineTrack, kind: TrackKind): number | null {
  const prefix = kind === 'video' ? 'V' : 'A';
  const match = track.name.match(new RegExp(`^${prefix}(\\d+)$`, 'i'));
  if (!match?.[1]) {
    return null;
  }

  const value = Number.parseInt(match[1], 10);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function getTrackNumberIndex(tracks: TimelineTrack[], kind: TrackKind, trackId: string): number {
  return getKindTracks(tracks, kind).findIndex((track) => track.id === trackId);
}

function getNextSectionOrder(tracks: TimelineTrack[], kind: TrackKind): number {
  const sortedTracks = [...tracks].sort((left, right) => left.order - right.order);
  const kindTracks = getKindTracks(sortedTracks, kind);

  if (kind === 'video') {
    const lastVideoTrack = kindTracks[kindTracks.length - 1];
    const firstAudioTrack = getKindTracks(sortedTracks, 'audio')[0];

    if (lastVideoTrack && firstAudioTrack) {
      return (lastVideoTrack.order + firstAudioTrack.order) / 2;
    }
    if (lastVideoTrack) {
      return lastVideoTrack.order + 1;
    }
    if (firstAudioTrack) {
      return firstAudioTrack.order - 1;
    }
    return 0;
  }

  const lastAudioTrack = kindTracks[kindTracks.length - 1];
  if (lastAudioTrack) {
    return lastAudioTrack.order + 1;
  }

  const lastVideoTrack = getKindTracks(sortedTracks, 'video').at(-1);
  return lastVideoTrack ? lastVideoTrack.order + 1 : 1;
}

function ensureTrackIndex(params: EnsureTrackIndexParams): { tracks: TimelineTrack[]; trackId: string } {
  const { kind, index, preferredTrackHeight } = params;
  let workingTracks = [...params.tracks];

  while (getKindTracks(workingTracks, kind).length <= index) {
    const createdTrack = createClassicTrack({
      tracks: workingTracks,
      kind,
      order: getNextSectionOrder(workingTracks, kind),
      height: preferredTrackHeight,
    });
    workingTracks = [...workingTracks, createdTrack];
  }

  return {
    tracks: workingTracks,
    trackId: getKindTracks(workingTracks, kind)[index]!.id,
  };
}

function ensureTrackNumber(params: {
  tracks: TimelineTrack[];
  kind: TrackKind;
  number: number;
  preferredTrackHeight: number;
}): { tracks: TimelineTrack[]; trackId: string } {
  let workingTracks = [...params.tracks];

  while (!getKindTracks(workingTracks, params.kind).some((track) => getClassicTrackNumber(track, params.kind) === params.number)) {
    const createdTrack = createClassicTrack({
      tracks: workingTracks,
      kind: params.kind,
      order: getNextSectionOrder(workingTracks, params.kind),
      height: params.preferredTrackHeight,
    });
    workingTracks = [...workingTracks, createdTrack];
  }

  const resolvedTrack = getKindTracks(workingTracks, params.kind)
    .find((track) => getClassicTrackNumber(track, params.kind) === params.number);

  return {
    tracks: workingTracks,
    trackId: resolvedTrack!.id,
  };
}

export function resolveLinkedDragTrackTargets(params: {
  tracks: TimelineTrack[];
  hoveredTrackId: string;
  zone: LinkedDragDropZone;
  createNew?: boolean;
  preferredTrackHeight: number;
}): LinkedDragTrackTargetResult | null {
  const { tracks, hoveredTrackId, zone, createNew = false, preferredTrackHeight } = params;
  const hoveredTrack = tracks.find((track) => track.id === hoveredTrackId);
  if (!hoveredTrack) {
    return null;
  }

  if (createNew) {
    const topVideoOrder = (() => {
      const firstVideoTrack = getKindTracks(tracks, 'video')[0];
      const firstAudioTrack = getKindTracks(tracks, 'audio')[0];
      if (firstVideoTrack) return firstVideoTrack.order - 1;
      if (firstAudioTrack) return firstAudioTrack.order - 1;
      return 0;
    })();
    const bottomAudioOrder = (() => {
      const lastAudioTrack = getKindTracks(tracks, 'audio').at(-1);
      const lastVideoTrack = getKindTracks(tracks, 'video').at(-1);
      if (lastAudioTrack) return lastAudioTrack.order + 1;
      if (lastVideoTrack) return lastVideoTrack.order + 1;
      return 1;
    })();

    const newVideoTrack = createClassicTrack({
      tracks,
      kind: 'video',
      order: topVideoOrder,
      height: preferredTrackHeight,
    });
    const tracksWithVideo = [...tracks, newVideoTrack];
    const newAudioTrack = createClassicTrack({
      tracks: tracksWithVideo,
      kind: 'audio',
      order: bottomAudioOrder,
      height: preferredTrackHeight,
    });

    return {
      tracks: [...tracksWithVideo, newAudioTrack],
      videoTrackId: newVideoTrack.id,
      audioTrackId: newAudioTrack.id,
    };
  }

  const zoneKind: TrackKind = zone === 'video' ? 'video' : 'audio';
  const companionKind: TrackKind = zone === 'video' ? 'audio' : 'video';
  const hoveredKind = getTrackKind(hoveredTrack);
  let workingTracks = [...tracks];
  let zoneTrackId: string;
  let sectionIndex: number;
  const hoveredTrackNumber = hoveredKind ? getClassicTrackNumber(hoveredTrack, hoveredKind) : null;

  if (!hoveredTrack.locked && (hoveredKind === zoneKind || hoveredKind === null)) {
    const upgradedTrack = renameTrackForKind(hoveredTrack, workingTracks, zoneKind);
    if (upgradedTrack !== hoveredTrack) {
      workingTracks = workingTracks.map((track) => track.id === hoveredTrack.id ? upgradedTrack : track);
    }
    zoneTrackId = hoveredTrack.id;
    sectionIndex = getTrackNumberIndex(workingTracks, zoneKind, zoneTrackId);
  } else {
    const referenceKind = hoveredKind === companionKind ? companionKind : zoneKind;
    const referenceTracks = getKindTracks(workingTracks, referenceKind);
    sectionIndex = Math.max(0, referenceTracks.findIndex((track) => track.id === hoveredTrack.id));
    const ensuredZoneTrack = hoveredTrackNumber !== null
      ? ensureTrackNumber({
        tracks: workingTracks,
        kind: zoneKind,
        number: hoveredTrackNumber,
        preferredTrackHeight,
      })
      : ensureTrackIndex({
        tracks: workingTracks,
        kind: zoneKind,
        index: sectionIndex,
        preferredTrackHeight,
      });
    workingTracks = ensuredZoneTrack.tracks;
    zoneTrackId = ensuredZoneTrack.trackId;
    sectionIndex = getTrackNumberIndex(workingTracks, zoneKind, zoneTrackId);
  }

  const zoneTrackNumber = getClassicTrackNumber(
    workingTracks.find((track) => track.id === zoneTrackId)!,
    zoneKind,
  );
  const ensuredCompanionTrack = zoneTrackNumber !== null
    ? ensureTrackNumber({
      tracks: workingTracks,
      kind: companionKind,
      number: zoneTrackNumber,
      preferredTrackHeight,
    })
    : ensureTrackIndex({
      tracks: workingTracks,
      kind: companionKind,
      index: sectionIndex,
      preferredTrackHeight,
    });
  workingTracks = ensuredCompanionTrack.tracks;

  if (zone === 'video') {
    return {
      tracks: workingTracks,
      videoTrackId: zoneTrackId,
      audioTrackId: ensuredCompanionTrack.trackId,
    };
  }

  return {
    tracks: workingTracks,
    videoTrackId: ensuredCompanionTrack.trackId,
    audioTrackId: zoneTrackId,
  };
}
