import type { TextItem } from '@/types/timeline';
import type { CanvasSettings } from '@/types/transform';

export type TextStylePresetId =
  | 'clean-title'
  | 'lower-third'
  | 'cinematic'
  | 'quote'
  | 'neon';

export interface TextStylePreset {
  id: TextStylePresetId;
  label: string;
}

export const TEXT_STYLE_PRESETS: readonly TextStylePreset[] = [
  { id: 'clean-title', label: 'Clean' },
  { id: 'lower-third', label: 'Lower Third' },
  { id: 'cinematic', label: 'Cinematic' },
  { id: 'quote', label: 'Quote' },
  { id: 'neon', label: 'Neon' },
];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function sizeFromCanvas(
  canvas: CanvasSettings,
  multiplier: number,
  min: number,
  max: number,
): number {
  return clamp(Math.round(canvas.height * multiplier), min, max);
}

export function buildTextStylePresetUpdates(
  presetId: TextStylePresetId,
  canvas: CanvasSettings,
): Partial<TextItem> {
  switch (presetId) {
    case 'clean-title':
      return {
        fontFamily: 'Inter Tight',
        fontWeight: 'bold',
        fontStyle: 'normal',
        underline: false,
        fontSize: sizeFromCanvas(canvas, 0.085, 56, 132),
        color: '#ffffff',
        backgroundColor: undefined,
        backgroundRadius: 0,
        textAlign: 'center',
        verticalAlign: 'middle',
        lineHeight: 0.95,
        letterSpacing: -1,
        textPadding: 16,
        textShadow: {
          offsetX: 0,
          offsetY: 6,
          blur: 18,
          color: '#111827',
        },
        stroke: undefined,
      };
    case 'lower-third':
      return {
        fontFamily: 'Inter',
        fontWeight: 'semibold',
        fontStyle: 'normal',
        underline: false,
        fontSize: sizeFromCanvas(canvas, 0.05, 36, 72),
        color: '#f9fafb',
        backgroundColor: '#111827',
        backgroundRadius: 20,
        textAlign: 'left',
        verticalAlign: 'middle',
        lineHeight: 1.05,
        letterSpacing: 0,
        textPadding: 24,
        textShadow: {
          offsetX: 0,
          offsetY: 4,
          blur: 14,
          color: '#030712',
        },
        stroke: undefined,
      };
    case 'cinematic':
      return {
        fontFamily: 'Bebas Neue',
        fontWeight: 'normal',
        fontStyle: 'normal',
        underline: false,
        fontSize: sizeFromCanvas(canvas, 0.11, 72, 164),
        color: '#f8e6b8',
        backgroundColor: undefined,
        backgroundRadius: 0,
        textAlign: 'center',
        verticalAlign: 'middle',
        lineHeight: 0.92,
        letterSpacing: 4,
        textPadding: 16,
        textShadow: {
          offsetX: 0,
          offsetY: 8,
          blur: 22,
          color: '#111827',
        },
        stroke: {
          width: 1,
          color: '#2b2112',
        },
      };
    case 'quote':
      return {
        fontFamily: 'Playfair Display',
        fontWeight: 'semibold',
        fontStyle: 'italic',
        underline: false,
        fontSize: sizeFromCanvas(canvas, 0.07, 46, 104),
        color: '#f8fafc',
        backgroundColor: '#1f2937',
        backgroundRadius: 28,
        textAlign: 'center',
        verticalAlign: 'middle',
        lineHeight: 1.08,
        letterSpacing: 0,
        textPadding: 30,
        textShadow: {
          offsetX: 0,
          offsetY: 8,
          blur: 24,
          color: '#020617',
        },
        stroke: undefined,
      };
    case 'neon':
      return {
        fontFamily: 'Orbitron',
        fontWeight: 'semibold',
        fontStyle: 'normal',
        underline: false,
        fontSize: sizeFromCanvas(canvas, 0.08, 52, 120),
        color: '#67e8f9',
        backgroundColor: '#082f49',
        backgroundRadius: 18,
        textAlign: 'center',
        verticalAlign: 'middle',
        lineHeight: 1,
        letterSpacing: 1,
        textPadding: 20,
        textShadow: {
          offsetX: 0,
          offsetY: 0,
          blur: 22,
          color: '#22d3ee',
        },
        stroke: {
          width: 1,
          color: '#22d3ee',
        },
      };
  }
}
