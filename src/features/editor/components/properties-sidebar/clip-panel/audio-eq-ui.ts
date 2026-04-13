import type { ResolvedAudioEqSettings } from '@/types/audio';
import type { TimelineItem } from '@/types/timeline';
import type { AudioEqPatch } from './audio-eq-curve-editor';

export function buildTimelineEqPatchFromResolvedSettings(settings: ResolvedAudioEqSettings): Partial<TimelineItem> {
  return {
    audioEqLowCutEnabled: settings.lowCutEnabled,
    audioEqLowCutFrequencyHz: settings.lowCutFrequencyHz,
    audioEqLowCutSlopeDbPerOct: settings.lowCutSlopeDbPerOct,
    audioEqLowGainDb: settings.lowGainDb,
    audioEqLowFrequencyHz: settings.lowFrequencyHz,
    audioEqLowMidGainDb: settings.lowMidGainDb,
    audioEqLowMidFrequencyHz: settings.lowMidFrequencyHz,
    audioEqLowMidQ: settings.lowMidQ,
    audioEqMidGainDb: settings.midGainDb,
    audioEqHighMidGainDb: settings.highMidGainDb,
    audioEqHighMidFrequencyHz: settings.highMidFrequencyHz,
    audioEqHighMidQ: settings.highMidQ,
    audioEqHighGainDb: settings.highGainDb,
    audioEqHighFrequencyHz: settings.highFrequencyHz,
    audioEqHighCutEnabled: settings.highCutEnabled,
    audioEqHighCutFrequencyHz: settings.highCutFrequencyHz,
    audioEqHighCutSlopeDbPerOct: settings.highCutSlopeDbPerOct,
  };
}

export function normalizeUiEqPatch(patch: AudioEqPatch): AudioEqPatch {
  return {
    audioEqMidGainDb: 0,
    ...patch,
  };
}

export function toTimelineEqPatch(patch: AudioEqPatch): Partial<TimelineItem> {
  return normalizeUiEqPatch(patch) as Partial<TimelineItem>;
}
