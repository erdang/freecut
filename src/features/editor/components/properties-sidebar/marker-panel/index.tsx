import { useMemo, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { MapPin, Trash2 } from 'lucide-react'
import { useTimelineStore } from '@/features/editor/deps/timeline-store'
import { useSelectionStore } from '@/shared/state/selection'
import { PropertySection, PropertyRow, NumberInput, ColorPicker } from '../components'

const DEFAULT_MARKER_COLOR = 'oklch(0.65 0.20 250)'

const MARKER_PRESET_COLORS = [
  'oklch(0.65 0.20 250)',
  'oklch(0.65 0.20 30)',
  'oklch(0.70 0.20 140)',
  'oklch(0.70 0.18 85)',
  'oklch(0.60 0.20 310)',
  'oklch(0.70 0.15 180)',
]

export function MarkerPanel() {
  const selectedMarkerId = useSelectionStore((s) => s.selectedMarkerId)
  const clearSelection = useSelectionStore((s) => s.clearSelection)
  const markers = useTimelineStore((s) => s.markers)
  const updateMarker = useTimelineStore((s) => s.updateMarker)
  const removeMarker = useTimelineStore((s) => s.removeMarker)
  const fps = useTimelineStore((s) => s.fps)

  const selectedMarker = useMemo(
    () => markers.find((m) => m.id === selectedMarkerId),
    [markers, selectedMarkerId],
  )

  const handleFrameChange = useCallback(
    (frame: number) => {
      if (selectedMarkerId) {
        updateMarker(selectedMarkerId, { frame: Math.max(0, Math.round(frame)) })
      }
    },
    [selectedMarkerId, updateMarker],
  )

  const handleLabelChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (selectedMarkerId) {
        updateMarker(selectedMarkerId, { label: e.target.value || undefined })
      }
    },
    [selectedMarkerId, updateMarker],
  )

  const handleColorChange = useCallback(
    (color: string) => {
      if (selectedMarkerId) {
        updateMarker(selectedMarkerId, { color })
      }
    },
    [selectedMarkerId, updateMarker],
  )

  const handleDelete = useCallback(() => {
    if (selectedMarkerId) {
      removeMarker(selectedMarkerId)
      clearSelection()
    }
  }, [selectedMarkerId, removeMarker, clearSelection])

  const handleResetColor = useCallback(() => {
    if (selectedMarkerId && selectedMarker?.color !== DEFAULT_MARKER_COLOR) {
      updateMarker(selectedMarkerId, { color: DEFAULT_MARKER_COLOR })
    }
  }, [selectedMarkerId, selectedMarker?.color, updateMarker])

  const formatTimecode = useCallback(
    (frame: number): string => {
      const totalSeconds = frame / fps
      const minutes = Math.floor(totalSeconds / 60)
      const seconds = Math.floor(totalSeconds % 60)
      const remainingFrames = frame % fps
      return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(remainingFrames).padStart(2, '0')}`
    },
    [fps],
  )

  if (!selectedMarker) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <MapPin className="w-8 h-8 text-muted-foreground/50 mb-2" />
        <p className="text-xs text-muted-foreground">未找到标记</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <PropertySection title="标记" icon={MapPin} defaultOpen={true}>
        <PropertyRow label="帧">
          <NumberInput
            value={selectedMarker.frame}
            onChange={handleFrameChange}
            min={0}
            step={1}
            unit="fr"
            className="flex-1 min-w-0"
          />
        </PropertyRow>

        <PropertyRow label="时间">
          <span className="text-xs font-mono tabular-nums text-muted-foreground">
            {formatTimecode(selectedMarker.frame)}
          </span>
        </PropertyRow>

        <PropertyRow label="标签">
          <Input
            value={selectedMarker.label || ''}
            onChange={handleLabelChange}
            placeholder="输入标签..."
            className="h-7 text-xs flex-1 min-w-0"
          />
        </PropertyRow>

        <ColorPicker
          label="颜色"
          color={selectedMarker.color}
          onChange={handleColorChange}
          onReset={handleResetColor}
          defaultColor={DEFAULT_MARKER_COLOR}
          presets={MARKER_PRESET_COLORS}
        />

        <div className="pt-2">
          <Button
            variant="destructive"
            size="sm"
            className="w-full h-7 text-xs"
            onClick={handleDelete}
          >
            <Trash2 className="w-3 h-3 mr-1.5" />
            删除标记
          </Button>
        </div>
      </PropertySection>
    </div>
  )
}
