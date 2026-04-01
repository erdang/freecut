import type React from 'react';
import type { CropSettings } from '@/types/transform';
import { calculateMediaCropLayout } from '@/shared/utils/media-crop';

interface ContainedMediaLayoutProps {
  sourceWidth: number;
  sourceHeight: number;
  containerWidth: number;
  containerHeight: number;
  crop?: CropSettings;
  children: React.ReactNode;
}

function percent(value: number, total: number): string {
  if (!Number.isFinite(value) || !Number.isFinite(total) || total <= 0) {
    return '0%';
  }
  return `${(value / total) * 100}%`;
}

function buildEdgeMaskStyle(
  edge: 'left' | 'right' | 'top' | 'bottom',
  featherPixels: number,
  viewportWidth: number,
  viewportHeight: number,
): React.CSSProperties {
  const axisDimension = edge === 'left' || edge === 'right'
    ? viewportWidth
    : viewportHeight;
  if (!Number.isFinite(featherPixels) || featherPixels <= 0 || axisDimension <= 0) {
    return {};
  }

  const stop = Math.max(0, Math.min(100, (featherPixels / axisDimension) * 100));
  let gradient: string;
  switch (edge) {
    case 'left':
      gradient = `linear-gradient(90deg, transparent 0%, black ${stop}%, black 100%)`;
      break;
    case 'right':
      gradient = `linear-gradient(90deg, black 0%, black ${100 - stop}%, transparent 100%)`;
      break;
    case 'top':
      gradient = `linear-gradient(180deg, transparent 0%, black ${stop}%, black 100%)`;
      break;
    case 'bottom':
      gradient = `linear-gradient(180deg, black 0%, black ${100 - stop}%, transparent 100%)`;
      break;
  }

  return {
    position: 'relative',
    width: '100%',
    height: '100%',
    maskImage: gradient,
    WebkitMaskImage: gradient,
    maskRepeat: 'no-repeat',
    WebkitMaskRepeat: 'no-repeat',
    maskSize: '100% 100%',
    WebkitMaskSize: '100% 100%',
    transform: 'translateZ(0)',
    backfaceVisibility: 'hidden',
  };
}

/**
 * Explicit contain-fit wrapper for media content.
 * This makes media framing deterministic so crop preview and export use the same geometry.
 */
export function ContainedMediaLayout({
  sourceWidth,
  sourceHeight,
  containerWidth,
  containerHeight,
  crop,
  children,
}: ContainedMediaLayoutProps) {
  const layout = calculateMediaCropLayout(
    sourceWidth,
    sourceHeight,
    containerWidth,
    containerHeight,
    crop,
  );

  if (layout.mediaRect.width <= 0 || layout.mediaRect.height <= 0) {
    return <div style={{ position: 'relative', width: '100%', height: '100%' }} />;
  }

  const viewportOffsetX = layout.viewportRect.x - layout.mediaRect.x;
  const viewportOffsetY = layout.viewportRect.y - layout.mediaRect.y;
  const contentWidthPercent = layout.viewportRect.width > 0
    ? (layout.mediaRect.width / layout.viewportRect.width) * 100
    : 100;
  const contentHeightPercent = layout.viewportRect.height > 0
    ? (layout.mediaRect.height / layout.viewportRect.height) * 100
    : 100;
  let contentNode: React.ReactNode = (
    <div
      style={{
        position: 'absolute',
        left: percent(-viewportOffsetX, layout.viewportRect.width),
        top: percent(-viewportOffsetY, layout.viewportRect.height),
        width: `${contentWidthPercent}%`,
        height: `${contentHeightPercent}%`,
      }}
    >
      {children}
    </div>
  );

  const maskEdges: Array<'left' | 'right' | 'top' | 'bottom'> = ['left', 'right', 'top', 'bottom'];
  for (const edge of maskEdges) {
    const featherPixels = layout.featherPixels[edge];
    if (featherPixels <= 0) continue;

    contentNode = (
      <div
        style={buildEdgeMaskStyle(
          edge,
          featherPixels,
          layout.viewportRect.width,
          layout.viewportRect.height,
        )}
      >
        {contentNode}
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div
        style={{
          position: 'absolute',
          left: percent(layout.mediaRect.x, containerWidth),
          top: percent(layout.mediaRect.y, containerHeight),
          width: percent(layout.mediaRect.width, containerWidth),
          height: percent(layout.mediaRect.height, containerHeight),
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: percent(viewportOffsetX, layout.mediaRect.width),
            top: percent(viewportOffsetY, layout.mediaRect.height),
            width: percent(layout.viewportRect.width, layout.mediaRect.width),
            height: percent(layout.viewportRect.height, layout.mediaRect.height),
            overflow: 'hidden',
          }}
        >
          {contentNode}
        </div>
      </div>
    </div>
  );
}
