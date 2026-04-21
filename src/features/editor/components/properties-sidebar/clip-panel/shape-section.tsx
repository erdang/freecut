import { useCallback, useMemo } from 'react';
import { Shapes, RotateCcw, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, MousePointer2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { ShapeItem, ShapeType, TimelineItem } from '@/types/timeline';
import { useTimelineStore } from '@/features/editor/deps/timeline-store';
import { useGizmoStore, useMaskEditorStore } from '@/features/editor/deps/preview';
import {
  PropertySection,
  PropertyRow,
  NumberInput,
  SliderInput,
  ColorPicker,
} from '../components';

// Shape type options
const SHAPE_TYPE_OPTIONS: { value: ShapeType; label: string }[] = [
  { value: 'rectangle', label: '矩形' },
  { value: 'circle', label: '圆形' },
  { value: 'triangle', label: '三角形' },
  { value: 'ellipse', label: '椭圆' },
  { value: 'star', label: '星形' },
  { value: 'polygon', label: '多边形' },
  { value: 'heart', label: '爱心' },
];

// Triangle direction options
const DIRECTION_OPTIONS: { value: 'up' | 'down' | 'left' | 'right'; label: string; icon: typeof ChevronUp }[] = [
  { value: 'up', label: '上', icon: ChevronUp },
  { value: 'down', label: '下', icon: ChevronDown },
  { value: 'left', label: '左', icon: ChevronLeft },
  { value: 'right', label: '右', icon: ChevronRight },
];

interface ShapeSectionProps {
  items: TimelineItem[];
}

/**
 * Shape section - properties for shape items (shapeType, colors, stroke, etc.)
 */
export function ShapeSection({ items }: ShapeSectionProps) {
  const updateItem = useTimelineStore((s) => s.updateItem);
  const { isEditing, editingItemId, penMode, startEditing, stopEditing } = useMaskEditorStore();

  // Gizmo store for live property preview
  const setPropertiesPreviewNew = useGizmoStore((s) => s.setPropertiesPreviewNew);
  const clearPreview = useGizmoStore((s) => s.clearPreview);

  // Filter to only shape items
  const shapeItems = useMemo(
    () => items.filter((item): item is ShapeItem => item.type === 'shape'),
    [items]
  );

  // Memoize item IDs for stable callback dependencies
  const itemIds = useMemo(() => shapeItems.map((item) => item.id), [shapeItems]);

  // Get shared values across selected shape items
  const sharedValues = useMemo(() => {
    if (shapeItems.length === 0) return null;

    const first = shapeItems[0]!;
    return {
      shapeType: shapeItems.every(i => i.shapeType === first.shapeType) ? first.shapeType : undefined,
      fillColor: shapeItems.every(i => i.fillColor === first.fillColor) ? first.fillColor : undefined,
      strokeColor: shapeItems.every(i => (i.strokeColor ?? '') === (first.strokeColor ?? '')) ? (first.strokeColor ?? '') : undefined,
      strokeWidth: shapeItems.every(i => (i.strokeWidth ?? 0) === (first.strokeWidth ?? 0)) ? (first.strokeWidth ?? 0) : 'mixed' as const,
      cornerRadius: shapeItems.every(i => (i.cornerRadius ?? 0) === (first.cornerRadius ?? 0)) ? (first.cornerRadius ?? 0) : 'mixed' as const,
      direction: shapeItems.every(i => (i.direction ?? 'up') === (first.direction ?? 'up')) ? (first.direction ?? 'up') : undefined,
      points: shapeItems.every(i => (i.points ?? 5) === (first.points ?? 5)) ? (first.points ?? 5) : 'mixed' as const,
      innerRadius: shapeItems.every(i => (i.innerRadius ?? 0.5) === (first.innerRadius ?? 0.5)) ? (first.innerRadius ?? 0.5) : 'mixed' as const,
      // Mask properties
      isMask: shapeItems.every(i => (i.isMask ?? false) === (first.isMask ?? false)) ? (first.isMask ?? false) : 'mixed' as const,
      maskType: shapeItems.every(i => (i.maskType ?? 'clip') === (first.maskType ?? 'clip')) ? (first.maskType ?? 'clip') : undefined,
      maskFeather: shapeItems.every(i => (i.maskFeather ?? 10) === (first.maskFeather ?? 10)) ? (first.maskFeather ?? 10) : 'mixed' as const,
      maskInvert: shapeItems.every(i => (i.maskInvert ?? false) === (first.maskInvert ?? false)) ? (first.maskInvert ?? false) : 'mixed' as const,
    };
  }, [shapeItems]);

  // Check which controls should be shown based on shape type
  const showCornerRadius = sharedValues?.shapeType && ['rectangle', 'triangle', 'star', 'polygon'].includes(sharedValues.shapeType);
  const showDirection = sharedValues?.shapeType === 'triangle';
  const showPoints = sharedValues?.shapeType && ['star', 'polygon'].includes(sharedValues.shapeType);
  const showInnerRadius = sharedValues?.shapeType === 'star';
  const singlePathShape = shapeItems.length === 1 && shapeItems[0]?.shapeType === 'path' ? shapeItems[0] : null;
  const isEditingPathShape = !!singlePathShape && isEditing && !penMode && editingItemId === singlePathShape.id;

  // Update all selected shape items
  const updateShapeItems = useCallback(
    (updates: Partial<ShapeItem>) => {
      shapeItems.forEach((item) => {
        updateItem(item.id, updates);
      });
    },
    [shapeItems, updateItem]
  );

  // Shape type change - also update label to match shape type
  const handleShapeTypeChange = useCallback(
    (value: string) => {
      const shapeOption = SHAPE_TYPE_OPTIONS.find(opt => opt.value === value);
      const label = shapeOption?.label ?? value;
      updateShapeItems({ shapeType: value as ShapeType, label });
    },
    [updateShapeItems]
  );

  // Fill color handlers with live preview
  const handleFillColorLiveChange = useCallback(
    (value: string) => {
      const previews: Record<string, { fillColor: string }> = {};
      itemIds.forEach((id) => {
        previews[id] = { fillColor: value };
      });
      setPropertiesPreviewNew(previews);
    },
    [itemIds, setPropertiesPreviewNew]
  );

  const handleFillColorChange = useCallback(
    (value: string) => {
      updateShapeItems({ fillColor: value });
      queueMicrotask(() => clearPreview());
    },
    [updateShapeItems, clearPreview]
  );

  // Stroke color handlers with live preview
  const handleStrokeColorLiveChange = useCallback(
    (value: string) => {
      const previews: Record<string, { strokeColor: string }> = {};
      itemIds.forEach((id) => {
        previews[id] = { strokeColor: value };
      });
      setPropertiesPreviewNew(previews);
    },
    [itemIds, setPropertiesPreviewNew]
  );

  const handleStrokeColorChange = useCallback(
    (value: string) => {
      updateShapeItems({ strokeColor: value || undefined });
      queueMicrotask(() => clearPreview());
    },
    [updateShapeItems, clearPreview]
  );

  // Stroke width handlers with live preview
  const handleStrokeWidthLiveChange = useCallback(
    (value: number) => {
      const previews: Record<string, { strokeWidth: number; strokeColor?: string }> = {};
      itemIds.forEach((id) => {
        // Include default stroke color in preview if not already set
        if (value > 0 && !sharedValues?.strokeColor) {
          previews[id] = { strokeWidth: value, strokeColor: '#1e40af' };
        } else {
          previews[id] = { strokeWidth: value };
        }
      });
      setPropertiesPreviewNew(previews);
    },
    [itemIds, setPropertiesPreviewNew, sharedValues?.strokeColor]
  );

  const handleStrokeWidthChange = useCallback(
    (value: number) => {
      // When increasing stroke width from 0, also set default stroke color if not set
      if (value > 0 && sharedValues?.strokeWidth === 0 && !sharedValues?.strokeColor) {
        updateShapeItems({ strokeWidth: value, strokeColor: '#1e40af' });
      } else {
        updateShapeItems({ strokeWidth: value });
      }
      queueMicrotask(() => clearPreview());
    },
    [updateShapeItems, clearPreview, sharedValues?.strokeWidth, sharedValues?.strokeColor]
  );

  // Corner radius handlers with live preview
  const handleCornerRadiusLiveChange = useCallback(
    (value: number) => {
      const previews: Record<string, { cornerRadius: number }> = {};
      itemIds.forEach((id) => {
        previews[id] = { cornerRadius: value };
      });
      setPropertiesPreviewNew(previews);
    },
    [itemIds, setPropertiesPreviewNew]
  );

  const handleCornerRadiusChange = useCallback(
    (value: number) => {
      updateShapeItems({ cornerRadius: value });
      queueMicrotask(() => clearPreview());
    },
    [updateShapeItems, clearPreview]
  );

  // Direction handler
  const handleDirectionChange = useCallback(
    (value: string) => {
      updateShapeItems({ direction: value as 'up' | 'down' | 'left' | 'right' });
    },
    [updateShapeItems]
  );

  // Points handlers with live preview
  const handlePointsLiveChange = useCallback(
    (value: number) => {
      const previews: Record<string, { points: number }> = {};
      itemIds.forEach((id) => {
        previews[id] = { points: value };
      });
      setPropertiesPreviewNew(previews);
    },
    [itemIds, setPropertiesPreviewNew]
  );

  const handlePointsChange = useCallback(
    (value: number) => {
      updateShapeItems({ points: value });
      queueMicrotask(() => clearPreview());
    },
    [updateShapeItems, clearPreview]
  );

  // Inner radius handlers with live preview
  const handleInnerRadiusLiveChange = useCallback(
    (value: number) => {
      const previews: Record<string, { innerRadius: number }> = {};
      itemIds.forEach((id) => {
        previews[id] = { innerRadius: value };
      });
      setPropertiesPreviewNew(previews);
    },
    [itemIds, setPropertiesPreviewNew]
  );

  const handleInnerRadiusChange = useCallback(
    (value: number) => {
      updateShapeItems({ innerRadius: value });
      queueMicrotask(() => clearPreview());
    },
    [updateShapeItems, clearPreview]
  );

  // Mask toggle handler
  const handleIsMaskChange = useCallback(
    (checked: boolean) => {
      updateShapeItems({
        isMask: checked,
        // Set defaults when enabling mask
        maskType: checked ? 'clip' : undefined,
        maskFeather: checked ? 0 : undefined,
        maskInvert: checked ? false : undefined,
      });
    },
    [updateShapeItems]
  );

  // Mask type handler
  const handleMaskTypeChange = useCallback(
    (value: string) => {
      const nextMaskType = value as 'clip' | 'alpha';
      updateShapeItems({
        maskType: nextMaskType,
        maskFeather: nextMaskType === 'alpha'
          ? (typeof sharedValues?.maskFeather === 'number' && sharedValues.maskFeather > 0
            ? sharedValues.maskFeather
            : 10)
          : 0,
      });
    },
    [sharedValues?.maskFeather, updateShapeItems]
  );

  // Mask feather handlers with live preview
  const handleMaskFeatherLiveChange = useCallback(
    (value: number) => {
      const previews: Record<string, { maskFeather: number }> = {};
      itemIds.forEach((id) => {
        previews[id] = { maskFeather: value };
      });
      setPropertiesPreviewNew(previews);
    },
    [itemIds, setPropertiesPreviewNew]
  );

  const handleMaskFeatherChange = useCallback(
    (value: number) => {
      updateShapeItems({ maskFeather: value });
      queueMicrotask(() => clearPreview());
    },
    [updateShapeItems, clearPreview]
  );

  const handleResetMaskFeather = useCallback(() => {
    updateShapeItems({ maskFeather: 10 });
  }, [updateShapeItems]);

  // Mask invert handler
  const handleMaskInvertChange = useCallback(
    (checked: boolean) => {
      updateShapeItems({ maskInvert: checked });
    },
    [updateShapeItems]
  );

  if (shapeItems.length === 0 || !sharedValues) {
    return null;
  }

  return (
    <PropertySection title="形状" icon={Shapes} defaultOpen={true}>
      {/* Shape Type */}
      <PropertyRow label="类型">
        <Select
          value={sharedValues.shapeType}
          onValueChange={handleShapeTypeChange}
        >
          <SelectTrigger className="h-7 text-xs flex-1 min-w-0">
            <SelectValue placeholder={sharedValues.shapeType === undefined ? '混合' : '选择形状'} />
          </SelectTrigger>
          <SelectContent>
            {SHAPE_TYPE_OPTIONS.map((shape) => (
              <SelectItem key={shape.value} value={shape.value} className="text-xs">
                {shape.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </PropertyRow>

      {singlePathShape && (
        <PropertyRow label="路径">
          <div className="flex items-center gap-2 w-full">
            <Button
              variant={isEditingPathShape ? 'default' : 'outline'}
              size="sm"
              className="h-7 text-xs gap-1.5"
              onClick={() => {
                if (isEditingPathShape) {
                  stopEditing();
                } else {
                  startEditing(singlePathShape.id);
                }
              }}
            >
              <MousePointer2 className="w-3.5 h-3.5" />
              {isEditingPathShape ? '完成' : '编辑路径'}
            </Button>
            <span className="text-[10px] text-muted-foreground">
              在预览区拖动锚点和控制柄。
            </span>
          </div>
        </PropertyRow>
      )}

      {/* Fill Color */}
      <ColorPicker
        label="填充"
        color={sharedValues.fillColor ?? '#3b82f6'}
        onChange={handleFillColorChange}
        onLiveChange={handleFillColorLiveChange}
        onReset={() => handleFillColorChange('#3b82f6')}
        defaultColor="#3b82f6"
      />

      {/* Stroke Width */}
      <PropertyRow label="描边宽">
        <NumberInput
          value={sharedValues.strokeWidth}
          onChange={handleStrokeWidthChange}
          onLiveChange={handleStrokeWidthLiveChange}
          min={0}
          max={50}
          step={1}
          unit="px"
          className="flex-1 min-w-0"
        />
      </PropertyRow>

      {/* Stroke Color - only show when stroke width > 0 */}
      {(sharedValues.strokeWidth === 'mixed' || sharedValues.strokeWidth > 0) && (
        <ColorPicker
          label="描边"
          color={sharedValues.strokeColor || '#1e40af'}
          onChange={handleStrokeColorChange}
          onLiveChange={handleStrokeColorLiveChange}
          onReset={() => handleStrokeColorChange('')}
          defaultColor=""
        />
      )}

      {/* Corner Radius - shown for rectangle, triangle, star, polygon */}
      {showCornerRadius && (
        <PropertyRow label="圆角">
          <NumberInput
            value={sharedValues.cornerRadius}
            onChange={handleCornerRadiusChange}
            onLiveChange={handleCornerRadiusLiveChange}
            min={0}
            max={100}
            step={1}
            unit="px"
            className="flex-1 min-w-0"
          />
        </PropertyRow>
      )}

      {/* Direction - shown for triangle only */}
      {showDirection && (
        <PropertyRow label="方向">
          <div className="flex gap-1">
            {DIRECTION_OPTIONS.map((dir) => (
              <Button
                key={dir.value}
                variant={sharedValues.direction === dir.value ? 'secondary' : 'ghost'}
                size="icon"
                className="h-7 w-7"
                onClick={() => handleDirectionChange(dir.value)}
                title={dir.label}
              >
                <dir.icon className="w-3.5 h-3.5" />
              </Button>
            ))}
          </div>
        </PropertyRow>
      )}

      {/* Points - shown for star and polygon */}
      {showPoints && (
        <PropertyRow label="点数">
          <NumberInput
            value={sharedValues.points}
            onChange={handlePointsChange}
            onLiveChange={handlePointsLiveChange}
            min={3}
            max={12}
            step={1}
            className="flex-1 min-w-0"
          />
        </PropertyRow>
      )}

      {/* Inner Radius - shown for star only */}
      {showInnerRadius && (
        <PropertyRow label="内半径">
          <NumberInput
            value={sharedValues.innerRadius}
            onChange={handleInnerRadiusChange}
            onLiveChange={handleInnerRadiusLiveChange}
            min={0.1}
            max={0.9}
            step={0.05}
            className="flex-1 min-w-0"
          />
        </PropertyRow>
      )}

      {/* Mask Section Divider */}
      <div className="border-t border-border my-3" />

      {/* Use as Mask Toggle */}
      <PropertyRow label="用作蒙版">
        <Button
          variant={sharedValues.isMask === true ? 'secondary' : 'ghost'}
          size="sm"
          className="h-7 text-xs flex-1 min-w-0"
          onClick={() => handleIsMaskChange(sharedValues.isMask !== true)}
          disabled={sharedValues.isMask === 'mixed'}
        >
          {sharedValues.isMask === 'mixed' ? '混合' : sharedValues.isMask ? '开启' : '关闭'}
        </Button>
      </PropertyRow>

      {/* Mask settings - only show when isMask is true */}
      {(sharedValues.isMask === true || sharedValues.isMask === 'mixed') && (
        <>
          {/* Mask Type */}
          <PropertyRow label="蒙版类型">
            <Select
              value={sharedValues.maskType}
              onValueChange={handleMaskTypeChange}
              disabled={sharedValues.isMask !== true}
            >
              <SelectTrigger className="h-7 text-xs flex-1 min-w-0">
                <SelectValue placeholder={sharedValues.maskType === undefined ? '混合' : '选择类型'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="clip" className="text-xs">裁剪（硬边）</SelectItem>
                <SelectItem value="alpha" className="text-xs">透明度（软边）</SelectItem>
              </SelectContent>
            </Select>
          </PropertyRow>

          {/* Feather - only show for alpha mask type */}
          {sharedValues.maskType === 'alpha' && (
            <PropertyRow label="羽化">
              <div className="flex items-center gap-1 w-full">
                <SliderInput
                  value={sharedValues.maskFeather}
                  onChange={handleMaskFeatherChange}
                  onLiveChange={handleMaskFeatherLiveChange}
                  min={0}
                  max={100}
                  step={1}
                  unit="px"
                  className="flex-1 min-w-0"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 flex-shrink-0"
                  onClick={handleResetMaskFeather}
                  title="重置为 10 像素"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </Button>
              </div>
            </PropertyRow>
          )}

          {/* Invert Mask */}
          <PropertyRow label="反转">
            <Button
              variant={sharedValues.maskInvert === true ? 'secondary' : 'ghost'}
              size="sm"
              className="h-7 text-xs flex-1 min-w-0"
              onClick={() => handleMaskInvertChange(sharedValues.maskInvert !== true)}
              disabled={sharedValues.isMask !== true || sharedValues.maskInvert === 'mixed'}
            >
              {sharedValues.maskInvert === 'mixed' ? '混合' : sharedValues.maskInvert ? '开启' : '关闭'}
            </Button>
          </PropertyRow>
        </>
      )}
    </PropertySection>
  );
}
