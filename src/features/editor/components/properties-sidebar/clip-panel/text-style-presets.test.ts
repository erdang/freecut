import { describe, expect, it } from 'vitest';
import type { CanvasSettings } from '@/types/transform';
import {
  TEXT_STYLE_PRESETS,
  buildTextStylePresetUpdates,
} from './text-style-presets';

const canvas: CanvasSettings = {
  width: 1920,
  height: 1080,
  fps: 30,
};

describe('text style presets', () => {
  it('exposes the expected preset list', () => {
    expect(TEXT_STYLE_PRESETS.map((preset) => preset.id)).toEqual([
      'clean-title',
      'lower-third',
      'cinematic',
      'quote',
      'neon',
    ]);
  });

  it('builds a lower third preset with boxed styling', () => {
    expect(buildTextStylePresetUpdates('lower-third', canvas)).toMatchObject({
      fontFamily: 'Inter',
      fontWeight: 'semibold',
      textAlign: 'left',
      backgroundColor: '#111827',
      backgroundRadius: 20,
      textPadding: 24,
      stroke: undefined,
    });
  });

  it('builds a cinematic preset with display typography', () => {
    expect(buildTextStylePresetUpdates('cinematic', canvas)).toMatchObject({
      fontFamily: 'Bebas Neue',
      fontWeight: 'normal',
      letterSpacing: 4,
      lineHeight: 0.92,
      backgroundColor: undefined,
      stroke: {
        width: 1,
        color: '#2b2112',
      },
    });
  });

  it('clamps title sizes from the canvas height', () => {
    expect(buildTextStylePresetUpdates('clean-title', canvas).fontSize).toBe(92);
    expect(buildTextStylePresetUpdates('quote', {
      width: 1280,
      height: 480,
      fps: 30,
    }).fontSize).toBe(46);
  });
});
