import React, { useCallback } from 'react';
import { useGizmoStore } from '@/features/composition-runtime/deps/stores';
import type { TextItem } from '@/types/timeline';
import { loadFont, FONT_WEIGHT_MAP } from '../utils/fonts';
import { useCompositionSpace } from '../contexts/composition-space-context';
import { getTextItemSpans } from '@/shared/utils/text-item-spans';

/**
 * Text content with live property preview support.
 * Reads preview values from gizmo store for real-time updates during slider/picker drag.
 */
export const TextContent: React.FC<{ item: TextItem }> = ({ item }) => {
  const compositionSpace = useCompositionSpace();
  const scaleX = compositionSpace?.scaleX ?? 1;
  const scaleY = compositionSpace?.scaleY ?? 1;
  const scale = compositionSpace?.scale ?? 1;

  // Read preview values from unified preview system
  const itemPreview = useGizmoStore(
    useCallback((s) => s.preview?.[item.id], [item.id])
  );
  const preview = itemPreview?.properties;

  // Use preview values if available, otherwise use item's stored values
  const lineHeight = preview?.lineHeight ?? item.lineHeight ?? 1.2;
  const color = preview?.color ?? item.color;
  const backgroundColor = preview?.backgroundColor ?? item.backgroundColor;
  const backgroundRadius = preview?.backgroundRadius ?? item.backgroundRadius ?? 0;
  const textPadding = Math.max(0, preview?.textPadding ?? item.textPadding ?? 16);
  const hasTextShadowPreview = preview !== undefined && Object.prototype.hasOwnProperty.call(preview, 'textShadow');
  const hasStrokePreview = preview !== undefined && Object.prototype.hasOwnProperty.call(preview, 'stroke');
  const textShadow = hasTextShadowPreview
    ? preview.textShadow
    : item.textShadow;
  const stroke = hasStrokePreview
    ? preview.stroke
    : item.stroke;

  // Load the Google Font and get the CSS fontFamily value
  // loadFont() blocks rendering until the font is ready (works for both preview and server render)
  const fontName = item.fontFamily ?? 'Inter';
  loadFont(fontName);

  // Get font weight from shared map
  const fontWeight = FONT_WEIGHT_MAP[item.fontWeight ?? 'normal'] ?? 400;

  // Map text align to flexbox justify-content (horizontal)
  const textAlignMap: Record<string, string> = {
    left: 'flex-start',
    center: 'center',
    right: 'flex-end',
  };
  const justifyContent = textAlignMap[item.textAlign ?? 'center'] ?? 'center';

  // Map vertical align to flexbox align-items
  const verticalAlignMap: Record<string, string> = {
    top: 'flex-start',
    middle: 'center',
    bottom: 'flex-end',
  };
  const alignItems = verticalAlignMap[item.verticalAlign ?? 'middle'] ?? 'center';

  const cssTextShadow = textShadow
    ? `${textShadow.offsetX * scaleX}px ${textShadow.offsetY * scaleY}px ${textShadow.blur * scale}px ${textShadow.color}`
    : undefined;

  const strokeWidth = stroke?.width ? `${stroke.width * scale * 2}px` : undefined;
  const spans = getTextItemSpans(item);

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems,
        justifyContent,
        padding: `${textPadding * scale}px`,
        backgroundColor,
        borderRadius: `${backgroundRadius * scale}px`,
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          textAlign: item.textAlign ?? 'center',
          textShadow: cssTextShadow,
          WebkitTextStrokeWidth: strokeWidth,
          WebkitTextStrokeColor: stroke?.color,
          display: 'flex',
          flexDirection: 'column',
          gap: 0,
          width: '100%',
        }}
      >
        {spans.map((span, index) => {
          const spanFontName = span.fontFamily ?? fontName;
          const spanFontFamily = loadFont(spanFontName);
          const spanFontWeight = FONT_WEIGHT_MAP[span.fontWeight ?? item.fontWeight ?? 'normal'] ?? fontWeight;
          const spanFontSize = (span.fontSize ?? preview?.fontSize ?? item.fontSize ?? 60) * scale;
          const spanLetterSpacing = (span.letterSpacing ?? preview?.letterSpacing ?? item.letterSpacing ?? 0) * scaleX;
          const spanColor = span.color ?? color;
          const spanFontStyle = span.fontStyle ?? item.fontStyle ?? 'normal';
          const spanUnderline = span.underline ?? item.underline ?? false;

          return (
            <div
              key={`${index}:${span.text}`}
              style={{
                fontSize: spanFontSize,
                fontFamily: spanFontFamily,
                fontWeight: spanFontWeight,
                fontStyle: spanFontStyle,
                textDecoration: spanUnderline ? 'underline' : 'none',
                color: spanColor,
                lineHeight,
                letterSpacing: spanLetterSpacing,
                display: 'block',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                width: '100%',
              }}
            >
              {span.text}
            </div>
          );
        })}
      </div>
    </div>
  );
};
