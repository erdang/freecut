import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  Type,
  Bold,
  Italic,
  Underline,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignStartHorizontal,
  AlignCenterHorizontal,
  AlignEndHorizontal,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { TextItem, TimelineItem } from '@/types/timeline';
import type { CanvasSettings } from '@/types/transform';
import { useTimelineStore } from '@/features/editor/deps/timeline-store';
import { useGizmoStore, type ItemPropertiesPreview } from '@/features/editor/deps/preview';
import {
  resolveTransform,
  getSourceDimensions,
} from '@/features/editor/deps/composition-runtime';
import { resolveAnimatedTransform } from '@/features/editor/deps/keyframes';
import {
  PropertySection,
  PropertyRow,
  NumberInput,
  ColorPicker,
} from '../components';
import { FontPicker } from './font-picker';
import { FONT_CATALOG, FONT_WEIGHT_MAP } from '@/shared/typography/fonts';
import {
  TEXT_ANIMATION_PRESETS,
  buildTextAnimationKeyframes,
  getTextAnimationFrameRange,
  type TextAnimationPhase,
  type TextAnimationPresetOptionId,
} from './text-animation-presets';

const FONT_WEIGHT_OPTIONS = [
  { value: 'normal', label: '常规' },
  { value: 'medium', label: '中等' },
  { value: 'semibold', label: '半粗' },
  { value: 'bold', label: '粗体' },
] as const;

const FONT_WEIGHT_VALUES = FONT_WEIGHT_MAP as Record<NonNullable<TextItem['fontWeight']>, number>;
const EMPTY_TEXT_SHADOW: NonNullable<TextItem['textShadow']> = {
  offsetX: 0,
  offsetY: 0,
  blur: 0,
  color: '#000000',
};
const EMPTY_TEXT_STROKE: NonNullable<TextItem['stroke']> = {
  width: 0,
  color: '#111827',
};

const TEXT_EFFECT_PRESETS = [
  {
    id: 'none',
    label: '无',
    getUpdates: (): Pick<TextItem, 'textShadow' | 'stroke'> => ({
      textShadow: undefined,
      stroke: undefined,
    }),
  },
  {
    id: 'shadow',
    label: '阴影',
    getUpdates: (): Pick<TextItem, 'textShadow' | 'stroke'> => ({
      textShadow: {
        offsetX: 4,
        offsetY: 6,
        blur: 12,
        color: '#000000',
      },
      stroke: undefined,
    }),
  },
  {
    id: 'outline',
    label: '描边',
    getUpdates: (): Pick<TextItem, 'textShadow' | 'stroke'> => ({
      textShadow: undefined,
      stroke: {
        width: 3,
        color: '#111827',
      },
    }),
  },
  {
    id: 'glow',
    label: '发光',
    getUpdates: (color: string): Pick<TextItem, 'textShadow' | 'stroke'> => ({
      textShadow: {
        offsetX: 0,
        offsetY: 0,
        blur: 18,
        color,
      },
      stroke: {
        width: 1,
        color,
      },
    }),
  },
] as const;

interface TextSectionProps {
  items: TimelineItem[];
  canvas: CanvasSettings;
  showContentSection?: boolean;
  showEffectSection?: boolean;
  showAnimationSection?: boolean;
}

function normalizeTextShadow(
  shadow: NonNullable<TextItem['textShadow']>,
): TextItem['textShadow'] {
  if (shadow.offsetX === 0 && shadow.offsetY === 0 && shadow.blur === 0) {
    return undefined;
  }

  return shadow;
}

function normalizeTextStroke(
  stroke: NonNullable<TextItem['stroke']>,
): TextItem['stroke'] {
  if (stroke.width <= 0) {
    return undefined;
  }

  return stroke;
}

/**
 * Text section - properties for text items (font, color, alignment, etc.)
 */
export function TextSection({
  items,
  canvas,
  showContentSection = true,
  showEffectSection = true,
  showAnimationSection = true,
}: TextSectionProps) {
  const updateItem = useTimelineStore((s) => s.updateItem);
  const addKeyframes = useTimelineStore((s) => s.addKeyframes);

  // Gizmo store for live property preview
  const setPropertiesPreviewNew = useGizmoStore((s) => s.setPropertiesPreviewNew);
  const clearPreview = useGizmoStore((s) => s.clearPreview);

  // Filter to only text items
  const textItems = useMemo(
    () => items.filter((item): item is TextItem => item.type === 'text'),
    [items]
  );

  // Memoize item IDs for stable callback dependencies
  const itemIds = useMemo(() => textItems.map((item) => item.id), [textItems]);
  const baseShadow = useMemo(
    () => ({ ...EMPTY_TEXT_SHADOW, ...(textItems[0]?.textShadow ?? {}) }),
    [textItems]
  );
  const baseStroke = useMemo(
    () => ({ ...EMPTY_TEXT_STROKE, ...(textItems[0]?.stroke ?? {}) }),
    [textItems]
  );

  // Get shared values across selected text items
  const sharedValues = useMemo(() => {
    if (textItems.length === 0) return null;

    const first = textItems[0]!;
    return {
      text: textItems.every(i => i.text === first.text) ? first.text : undefined,
      fontSize: textItems.every(i => (i.fontSize ?? 60) === (first.fontSize ?? 60)) ? (first.fontSize ?? 60) : 'mixed' as const,
      fontFamily: textItems.every(i => (i.fontFamily ?? 'Inter') === (first.fontFamily ?? 'Inter')) ? (first.fontFamily ?? 'Inter') : undefined,
      fontWeight: textItems.every(i => (i.fontWeight ?? 'normal') === (first.fontWeight ?? 'normal')) ? (first.fontWeight ?? 'normal') : undefined,
      fontStyle: textItems.every(i => (i.fontStyle ?? 'normal') === (first.fontStyle ?? 'normal')) ? (first.fontStyle ?? 'normal') : undefined,
      underline: textItems.every(i => (i.underline ?? false) === (first.underline ?? false)) ? (first.underline ?? false) : undefined,
      color: textItems.every(i => i.color === first.color) ? first.color : undefined,
      textAlign: textItems.every(i => (i.textAlign ?? 'center') === (first.textAlign ?? 'center')) ? (first.textAlign ?? 'center') : undefined,
      verticalAlign: textItems.every(i => (i.verticalAlign ?? 'middle') === (first.verticalAlign ?? 'middle')) ? (first.verticalAlign ?? 'middle') : undefined,
      letterSpacing: textItems.every(i => (i.letterSpacing ?? 0) === (first.letterSpacing ?? 0)) ? (first.letterSpacing ?? 0) : 'mixed' as const,
      lineHeight: textItems.every(i => (i.lineHeight ?? 1.2) === (first.lineHeight ?? 1.2)) ? (first.lineHeight ?? 1.2) : 'mixed' as const,
      shadowColor: textItems.every(i => (i.textShadow?.color ?? '') === (first.textShadow?.color ?? '')) ? (first.textShadow?.color ?? '') : undefined,
      shadowOffsetX: textItems.every(i => (i.textShadow?.offsetX ?? 0) === (first.textShadow?.offsetX ?? 0)) ? (first.textShadow?.offsetX ?? 0) : 'mixed' as const,
      shadowOffsetY: textItems.every(i => (i.textShadow?.offsetY ?? 0) === (first.textShadow?.offsetY ?? 0)) ? (first.textShadow?.offsetY ?? 0) : 'mixed' as const,
      shadowBlur: textItems.every(i => (i.textShadow?.blur ?? 0) === (first.textShadow?.blur ?? 0)) ? (first.textShadow?.blur ?? 0) : 'mixed' as const,
      strokeColor: textItems.every(i => (i.stroke?.color ?? '') === (first.stroke?.color ?? '')) ? (first.stroke?.color ?? '') : undefined,
      strokeWidth: textItems.every(i => (i.stroke?.width ?? 0) === (first.stroke?.width ?? 0)) ? (first.stroke?.width ?? 0) : 'mixed' as const,
    };
  }, [textItems]);

  const supportedFontWeightOptions = useMemo(() => {
    const selectedFontFamily = sharedValues?.fontFamily;
    if (!selectedFontFamily) {
      return FONT_WEIGHT_OPTIONS;
    }

    const selectedFont = FONT_CATALOG.find(
      (font) => font.family === selectedFontFamily || font.value === selectedFontFamily
    );
    if (!selectedFont) {
      return FONT_WEIGHT_OPTIONS;
    }

    const options = FONT_WEIGHT_OPTIONS.filter((weight) =>
      selectedFont.weights.includes(FONT_WEIGHT_VALUES[weight.value])
    );

    return options.length > 0 ? options : FONT_WEIGHT_OPTIONS;
  }, [sharedValues?.fontFamily]);

  const previousFontFamilyRef = useRef<string | undefined>(sharedValues?.fontFamily);
  const sharedFontWeightRef = useRef<TextItem['fontWeight'] | undefined>(sharedValues?.fontWeight);
  sharedFontWeightRef.current = sharedValues?.fontWeight;

  // Update all selected text items
  const updateTextItems = useCallback(
    (updates: Partial<TextItem>) => {
      textItems.forEach((item) => {
        updateItem(item.id, updates);
      });
    },
    [textItems, updateItem]
  );

  const setTextPropertiesPreview = useCallback(
    (properties: ItemPropertiesPreview) => {
      const previews: Record<string, ItemPropertiesPreview> = {};
      itemIds.forEach((id) => {
        previews[id] = properties;
      });
      setPropertiesPreviewNew(previews);
    },
    [itemIds, setPropertiesPreviewNew]
  );

  const finalizePreviewChange = useCallback(() => {
    queueMicrotask(() => clearPreview());
  }, [clearPreview]);

  // Handlers
  const handleTextChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newText = e.target.value;
      textItems.forEach((item) => {
        updateItem(item.id, { text: newText, label: newText.split('\n')[0] || 'Text' });
      });
    },
    [textItems, updateItem]
  );

  // Live preview for fontSize (during drag)
  const handleFontSizeLiveChange = useCallback(
    (value: number) => {
      setTextPropertiesPreview({ fontSize: value });
    },
    [setTextPropertiesPreview]
  );

  // Commit fontSize (on mouse up)
  const handleFontSizeChange = useCallback(
    (value: number) => {
      updateTextItems({ fontSize: value });
      finalizePreviewChange();
    },
    [finalizePreviewChange, updateTextItems]
  );

  const handleFontFamilyChange = useCallback(
    (value: string) => {
      updateTextItems({ fontFamily: value });
    },
    [updateTextItems]
  );

  const handleFontWeightChange = useCallback(
    (value: string) => {
      if (!supportedFontWeightOptions.some((weight) => weight.value === value)) {
        return;
      }
      updateTextItems({ fontWeight: value as TextItem['fontWeight'] });
    },
    [supportedFontWeightOptions, updateTextItems]
  );

  const handleBoldToggle = useCallback(() => {
    if (!supportedFontWeightOptions.some((weight) => weight.value === 'bold')) {
      return;
    }
    const nextWeight: TextItem['fontWeight'] = sharedValues?.fontWeight === 'bold' ? 'normal' : 'bold';
    updateTextItems({ fontWeight: nextWeight });
  }, [sharedValues?.fontWeight, supportedFontWeightOptions, updateTextItems]);

  const handleItalicToggle = useCallback(() => {
    const nextStyle: TextItem['fontStyle'] = sharedValues?.fontStyle === 'italic' ? 'normal' : 'italic';
    updateTextItems({ fontStyle: nextStyle });
  }, [sharedValues?.fontStyle, updateTextItems]);

  const handleUnderlineToggle = useCallback(() => {
    updateTextItems({ underline: !(sharedValues?.underline ?? false) });
  }, [sharedValues?.underline, updateTextItems]);

  useEffect(() => {
    const currentFontFamily = sharedValues?.fontFamily;
    if (previousFontFamilyRef.current === currentFontFamily) {
      return;
    }

    previousFontFamilyRef.current = currentFontFamily;

    const currentWeight = sharedFontWeightRef.current;
    if (!currentWeight) {
      return;
    }

    if (supportedFontWeightOptions.some((weight) => weight.value === currentWeight)) {
      return;
    }

    const fallbackWeight = supportedFontWeightOptions[0]?.value;
    if (!fallbackWeight) {
      return;
    }

    updateTextItems({ fontWeight: fallbackWeight });
  }, [sharedValues?.fontFamily, supportedFontWeightOptions, updateTextItems]);

  // Live preview for color (during picker drag)
  const handleColorLiveChange = useCallback(
    (value: string) => {
      setTextPropertiesPreview({ color: value });
    },
    [setTextPropertiesPreview]
  );

  // Commit color (on picker close)
  const handleColorChange = useCallback(
    (value: string) => {
      updateTextItems({ color: value });
      finalizePreviewChange();
    },
    [finalizePreviewChange, updateTextItems]
  );

  const handleTextAlignChange = useCallback(
    (value: string) => {
      updateTextItems({ textAlign: value as TextItem['textAlign'] });
    },
    [updateTextItems]
  );

  const handleVerticalAlignChange = useCallback(
    (value: string) => {
      updateTextItems({ verticalAlign: value as TextItem['verticalAlign'] });
    },
    [updateTextItems]
  );

  // Live preview for letterSpacing (during drag)
  const handleLetterSpacingLiveChange = useCallback(
    (value: number) => {
      setTextPropertiesPreview({ letterSpacing: value });
    },
    [setTextPropertiesPreview]
  );

  // Commit letterSpacing (on mouse up)
  const handleLetterSpacingChange = useCallback(
    (value: number) => {
      updateTextItems({ letterSpacing: value });
      finalizePreviewChange();
    },
    [finalizePreviewChange, updateTextItems]
  );

  // Live preview for lineHeight (during drag)
  const handleLineHeightLiveChange = useCallback(
    (value: number) => {
      setTextPropertiesPreview({ lineHeight: value });
    },
    [setTextPropertiesPreview]
  );

  // Commit lineHeight (on mouse up)
  const handleLineHeightChange = useCallback(
    (value: number) => {
      updateTextItems({ lineHeight: value });
      finalizePreviewChange();
    },
    [finalizePreviewChange, updateTextItems]
  );

  const handleShadowColorLiveChange = useCallback(
    (value: string) => {
      setTextPropertiesPreview({
        textShadow: normalizeTextShadow({
          ...baseShadow,
          color: value,
        }),
      });
    },
    [baseShadow, setTextPropertiesPreview]
  );

  const handleShadowColorChange = useCallback(
    (value: string) => {
      updateTextItems({
        textShadow: normalizeTextShadow({
          ...baseShadow,
          color: value,
        }),
      });
      finalizePreviewChange();
    },
    [baseShadow, finalizePreviewChange, updateTextItems]
  );

  const handleShadowOffsetXLiveChange = useCallback(
    (value: number) => {
      setTextPropertiesPreview({
        textShadow: normalizeTextShadow({
          ...baseShadow,
          offsetX: value,
        }),
      });
    },
    [baseShadow, setTextPropertiesPreview]
  );

  const handleShadowOffsetXChange = useCallback(
    (value: number) => {
      updateTextItems({
        textShadow: normalizeTextShadow({
          ...baseShadow,
          offsetX: value,
        }),
      });
      finalizePreviewChange();
    },
    [baseShadow, finalizePreviewChange, updateTextItems]
  );

  const handleShadowOffsetYLiveChange = useCallback(
    (value: number) => {
      setTextPropertiesPreview({
        textShadow: normalizeTextShadow({
          ...baseShadow,
          offsetY: value,
        }),
      });
    },
    [baseShadow, setTextPropertiesPreview]
  );

  const handleShadowOffsetYChange = useCallback(
    (value: number) => {
      updateTextItems({
        textShadow: normalizeTextShadow({
          ...baseShadow,
          offsetY: value,
        }),
      });
      finalizePreviewChange();
    },
    [baseShadow, finalizePreviewChange, updateTextItems]
  );

  const handleShadowBlurLiveChange = useCallback(
    (value: number) => {
      setTextPropertiesPreview({
        textShadow: normalizeTextShadow({
          ...baseShadow,
          blur: value,
        }),
      });
    },
    [baseShadow, setTextPropertiesPreview]
  );

  const handleShadowBlurChange = useCallback(
    (value: number) => {
      updateTextItems({
        textShadow: normalizeTextShadow({
          ...baseShadow,
          blur: value,
        }),
      });
      finalizePreviewChange();
    },
    [baseShadow, finalizePreviewChange, updateTextItems]
  );

  const handleStrokeWidthLiveChange = useCallback(
    (value: number) => {
      setTextPropertiesPreview({
        stroke: normalizeTextStroke({
          ...baseStroke,
          width: value,
        }),
      });
    },
    [baseStroke, setTextPropertiesPreview]
  );

  const handleStrokeWidthChange = useCallback(
    (value: number) => {
      updateTextItems({
        stroke: normalizeTextStroke({
          ...baseStroke,
          width: value,
        }),
      });
      finalizePreviewChange();
    },
    [baseStroke, finalizePreviewChange, updateTextItems]
  );

  const handleStrokeColorLiveChange = useCallback(
    (value: string) => {
      setTextPropertiesPreview({
        stroke: normalizeTextStroke({
          ...baseStroke,
          color: value,
        }),
      });
    },
    [baseStroke, setTextPropertiesPreview]
  );

  const handleStrokeColorChange = useCallback(
    (value: string) => {
      updateTextItems({
        stroke: normalizeTextStroke({
          ...baseStroke,
          color: value,
        }),
      });
      finalizePreviewChange();
    },
    [baseStroke, finalizePreviewChange, updateTextItems]
  );

  const handleApplyTextEffectPreset = useCallback(
    (presetId: (typeof TEXT_EFFECT_PRESETS)[number]['id']) => {
      const preset = TEXT_EFFECT_PRESETS.find((entry) => entry.id === presetId);
      if (!preset) {
        return;
      }

      const effectColor = sharedValues?.color ?? textItems[0]?.color ?? '#ffffff';
      updateTextItems(preset.getUpdates(effectColor));
      finalizePreviewChange();
    },
    [finalizePreviewChange, sharedValues?.color, textItems, updateTextItems]
  );

  const handleApplyTextAnimationPreset = useCallback(
    (phase: TextAnimationPhase, presetId: TextAnimationPresetOptionId) => {
      const keyframes = useTimelineStore.getState().keyframes;
      const payloads = textItems.flatMap((item) => {
        const baseResolved = resolveTransform(item, canvas, getSourceDimensions(item));
        const itemKeyframes = keyframes.find((entry) => entry.itemId === item.id);
        const frameRange = getTextAnimationFrameRange(
          item.durationInFrames,
          canvas.fps,
          phase,
        );
        if (!frameRange) {
          return [];
        }
        const anchorTransform = resolveAnimatedTransform(
          baseResolved,
          itemKeyframes,
          phase === 'intro' ? frameRange.endFrame : frameRange.startFrame,
        );

        return buildTextAnimationKeyframes({
          item,
          presetId,
          phase,
          fps: canvas.fps,
          anchorTransform,
          itemKeyframes,
        });
      });

      if (payloads.length === 0) {
        return;
      }

      addKeyframes(payloads);
    },
    [addKeyframes, canvas, textItems]
  );

  if (textItems.length === 0 || !sharedValues) {
    return null;
  }

  const fontPreviewText = sharedValues.text ?? textItems[0]?.text ?? '';
  const isBoldActive = sharedValues.fontWeight === 'bold';
  const canUseBold = supportedFontWeightOptions.some((weight) => weight.value === 'bold');
  const isItalicActive = sharedValues.fontStyle === 'italic';
  const isUnderlineActive = sharedValues.underline === true;
  const shadowOffsetX = sharedValues.shadowOffsetX;
  const shadowOffsetY = sharedValues.shadowOffsetY;
  const shadowBlur = sharedValues.shadowBlur;
  const strokeWidth = sharedValues.strokeWidth;

  return (
    <>
      {showContentSection && (
        <PropertySection title="文本" icon={Type} defaultOpen={true}>
          {/* Text Content */}
          <PropertyRow label="内容">
            <Textarea
              value={sharedValues.text ?? ''}
              onChange={handleTextChange}
              placeholder={sharedValues.text === undefined ? '混合' : '输入文本...'}
              className="min-h-[60px] text-xs flex-1 min-w-0"
              rows={3}
            />
          </PropertyRow>

          {/* Font Family */}
          <PropertyRow label="字体" className="items-start">
            <FontPicker
              value={sharedValues.fontFamily}
              placeholder={sharedValues.fontFamily === undefined ? '混合' : '选择字体'}
              previewText={fontPreviewText}
              onValueChange={handleFontFamilyChange}
            />
          </PropertyRow>

          {/* Font Size */}
          <PropertyRow label="大小">
            <NumberInput
              value={sharedValues.fontSize}
              onChange={handleFontSizeChange}
              onLiveChange={handleFontSizeLiveChange}
              min={8}
              max={500}
              step={1}
              unit="px"
              className="flex-1 min-w-0"
            />
          </PropertyRow>

          {/* Font Weight */}
          <PropertyRow label="字重">
            <Select
              value={sharedValues.fontWeight}
              onValueChange={handleFontWeightChange}
            >
              <SelectTrigger className="h-7 text-xs flex-1 min-w-0">
                <SelectValue placeholder={sharedValues.fontWeight === undefined ? '混合' : '选择字重'} />
              </SelectTrigger>
              <SelectContent>
                {supportedFontWeightOptions.map((weight) => (
                  <SelectItem key={weight.value} value={weight.value} className="text-xs">
                    {weight.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </PropertyRow>

          {/* Font Style */}
          <PropertyRow label="样式">
            <div className="flex gap-1">
              <Button
                variant={isBoldActive ? 'secondary' : 'ghost'}
                size="icon"
                className="h-7 w-7"
                onClick={handleBoldToggle}
                title={canUseBold ? '加粗' : '当前字体不支持加粗'}
                aria-label="加粗"
                aria-pressed={isBoldActive}
                disabled={!canUseBold}
              >
                <Bold className="w-3.5 h-3.5" />
              </Button>
              <Button
                variant={isItalicActive ? 'secondary' : 'ghost'}
                size="icon"
                className="h-7 w-7"
                onClick={handleItalicToggle}
                title="斜体"
                aria-label="斜体"
                aria-pressed={isItalicActive}
              >
                <Italic className="w-3.5 h-3.5" />
              </Button>
              <Button
                variant={isUnderlineActive ? 'secondary' : 'ghost'}
                size="icon"
                className="h-7 w-7"
                onClick={handleUnderlineToggle}
                title="下划线"
                aria-label="下划线"
                aria-pressed={isUnderlineActive}
              >
                <Underline className="w-3.5 h-3.5" />
              </Button>
            </div>
          </PropertyRow>

          {/* Text Align */}
          <PropertyRow label="对齐">
            <div className="flex gap-1">
              <Button
                variant={sharedValues.textAlign === 'left' ? 'secondary' : 'ghost'}
                size="icon"
                className="h-7 w-7"
                onClick={() => handleTextAlignChange('left')}
                title="左对齐"
              >
                <AlignLeft className="w-3.5 h-3.5" />
              </Button>
              <Button
                variant={sharedValues.textAlign === 'center' ? 'secondary' : 'ghost'}
                size="icon"
                className="h-7 w-7"
                onClick={() => handleTextAlignChange('center')}
                title="居中对齐"
              >
                <AlignCenter className="w-3.5 h-3.5" />
              </Button>
              <Button
                variant={sharedValues.textAlign === 'right' ? 'secondary' : 'ghost'}
                size="icon"
                className="h-7 w-7"
                onClick={() => handleTextAlignChange('right')}
                title="右对齐"
              >
                <AlignRight className="w-3.5 h-3.5" />
              </Button>
              <div className="w-px h-5 bg-border mx-1" />
              <Button
                variant={sharedValues.verticalAlign === 'top' ? 'secondary' : 'ghost'}
                size="icon"
                className="h-7 w-7"
                onClick={() => handleVerticalAlignChange('top')}
                title="顶部对齐"
              >
                <AlignStartHorizontal className="w-3.5 h-3.5" />
              </Button>
              <Button
                variant={sharedValues.verticalAlign === 'middle' ? 'secondary' : 'ghost'}
                size="icon"
                className="h-7 w-7"
                onClick={() => handleVerticalAlignChange('middle')}
                title="垂直居中"
              >
                <AlignCenterHorizontal className="w-3.5 h-3.5" />
              </Button>
              <Button
                variant={sharedValues.verticalAlign === 'bottom' ? 'secondary' : 'ghost'}
                size="icon"
                className="h-7 w-7"
                onClick={() => handleVerticalAlignChange('bottom')}
                title="底部对齐"
              >
                <AlignEndHorizontal className="w-3.5 h-3.5" />
              </Button>
            </div>
          </PropertyRow>

          {/* Text Color */}
          <ColorPicker
            label="颜色"
            color={sharedValues.color ?? '#ffffff'}
            onChange={handleColorChange}
            onLiveChange={handleColorLiveChange}
            onReset={() => handleColorChange('#ffffff')}
            defaultColor="#ffffff"
          />

          {/* Letter Spacing */}
          <PropertyRow label="字距">
            <NumberInput
              value={sharedValues.letterSpacing}
              onChange={handleLetterSpacingChange}
              onLiveChange={handleLetterSpacingLiveChange}
              min={-20}
              max={100}
              step={1}
              unit="px"
              className="flex-1 min-w-0"
            />
          </PropertyRow>

          {/* Line Height */}
          <PropertyRow label="行高">
            <NumberInput
              value={sharedValues.lineHeight}
              onChange={handleLineHeightChange}
              onLiveChange={handleLineHeightLiveChange}
              min={0.5}
              max={3}
              step={0.1}
              unit="x"
              className="flex-1 min-w-0"
            />
          </PropertyRow>
        </PropertySection>
      )}

      {showEffectSection && (
        <PropertySection title="效果" icon={Sparkles} defaultOpen={true}>
          <PropertyRow label="预设" className="items-start">
            <div className="grid w-full grid-cols-2 gap-1.5">
              {TEXT_EFFECT_PRESETS.map((preset) => (
                <Button
                  key={preset.id}
                  variant="outline"
                  size="sm"
                  className="h-7 text-[11px]"
                  onClick={() => handleApplyTextEffectPreset(preset.id)}
                >
                  {preset.label}
                </Button>
              ))}
            </div>
          </PropertyRow>

          <ColorPicker
            label="阴影颜色"
            color={sharedValues.shadowColor || '#000000'}
            onChange={handleShadowColorChange}
            onLiveChange={handleShadowColorLiveChange}
            onReset={() => handleShadowColorChange('#000000')}
            defaultColor="#000000"
          />

          <PropertyRow label="阴影水平">
            <NumberInput
              value={shadowOffsetX}
              onChange={handleShadowOffsetXChange}
              onLiveChange={handleShadowOffsetXLiveChange}
              min={-100}
              max={100}
              step={1}
              unit="px"
              className="flex-1 min-w-0"
            />
          </PropertyRow>

          <PropertyRow label="阴影垂直">
            <NumberInput
              value={shadowOffsetY}
              onChange={handleShadowOffsetYChange}
              onLiveChange={handleShadowOffsetYLiveChange}
              min={-100}
              max={100}
              step={1}
              unit="px"
              className="flex-1 min-w-0"
            />
          </PropertyRow>

          <PropertyRow label="阴影模糊">
            <NumberInput
              value={shadowBlur}
              onChange={handleShadowBlurChange}
              onLiveChange={handleShadowBlurLiveChange}
              min={0}
              max={80}
              step={1}
              unit="px"
              className="flex-1 min-w-0"
            />
          </PropertyRow>

          <PropertyRow label="描边宽">
            <NumberInput
              value={strokeWidth}
              onChange={handleStrokeWidthChange}
              onLiveChange={handleStrokeWidthLiveChange}
              min={0}
              max={24}
              step={1}
              unit="px"
              className="flex-1 min-w-0"
            />
          </PropertyRow>

          {(strokeWidth === 'mixed' || strokeWidth > 0) && (
            <ColorPicker
              label="描边颜色"
              color={sharedValues.strokeColor || '#111827'}
              onChange={handleStrokeColorChange}
              onLiveChange={handleStrokeColorLiveChange}
              onReset={() => handleStrokeColorChange('#111827')}
              defaultColor="#111827"
            />
          )}
        </PropertySection>
      )}

      {showAnimationSection && (
        <PropertySection title="动画" icon={Sparkles} defaultOpen={true}>
          <PropertyRow label="入场" className="items-start">
            <div className="grid w-full grid-cols-4 gap-1.5">
              {TEXT_ANIMATION_PRESETS.map((preset) => (
                <Button
                  key={preset.id}
                  variant="outline"
                  size="sm"
                  className="h-7 text-[11px]"
                  onClick={() => handleApplyTextAnimationPreset('intro', preset.id)}
                >
                  {preset.label}
                </Button>
              ))}
            </div>
          </PropertyRow>
          <PropertyRow label="出场" className="items-start">
            <div className="grid w-full grid-cols-4 gap-1.5">
              {TEXT_ANIMATION_PRESETS.map((preset) => (
                <Button
                  key={`outro-${preset.id}`}
                  variant="outline"
                  size="sm"
                  className="h-7 text-[11px]"
                  onClick={() => handleApplyTextAnimationPreset('outro', preset.id)}
                >
                  {preset.label}
                </Button>
              ))}
            </div>
          </PropertyRow>
          <div className="px-1 pt-1 text-[11px] text-muted-foreground">
            在每个所选片段的开头或结尾应用短促的缓出文本动画。
          </div>
        </PropertySection>
      )}
    </>
  );
}
