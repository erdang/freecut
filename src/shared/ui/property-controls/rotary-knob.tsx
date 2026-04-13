import { useCallback, useRef, useState } from 'react';
import { cn } from '@/shared/ui/cn';

type MixedValue = number | 'mixed';

interface RotaryKnobProps {
  value: MixedValue;
  onChange: (value: number) => void;
  onLiveChange?: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  size?: number;
  className?: string;
}

const ARC_START_DEG = 135;
const ARC_SWEEP_DEG = 270;

function polarXY(cx: number, cy: number, r: number, deg: number) {
  const rad = (deg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arcPath(cx: number, cy: number, r: number, from: number, to: number) {
  const a = polarXY(cx, cy, r, from);
  const b = polarXY(cx, cy, r, to);
  return `M ${a.x} ${a.y} A ${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${b.x} ${b.y}`;
}

export function RotaryKnob({
  value,
  onChange,
  onLiveChange,
  min,
  max,
  step = 1,
  size = 28,
  className,
}: RotaryKnobProps) {
  const elRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef({ onChange, onLiveChange, min, max, step });
  stateRef.current = { onChange, onLiveChange, min, max, step };

  const [draftValue, setDraftValue] = useState<number | null>(null);

  const isMixed = value === 'mixed';
  const num = isMixed ? (min + max) / 2 : value;
  const displayNum = draftValue ?? num;
  const norm = Math.max(0, Math.min(1, (displayNum - min) / (max - min)));

  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 3;
  const deg = ARC_START_DEG + norm * ARC_SWEEP_DEG;
  const tip = polarXY(cx, cy, r, deg);

  const onDown = useCallback(
    (e: React.PointerEvent) => {
      if (isMixed) return;
      e.preventDefault();
      const el = elRef.current;
      if (!el) return;
      el.setPointerCapture(e.pointerId);

      const startY = e.clientY;
      const startValue = num;
      setDraftValue(num);

      const compute = (clientY: number) => {
        const s = stateRef.current;
        const dy = startY - clientY;
        const raw = startValue + (dy * (s.max - s.min)) / 120;
        const snapped = Math.round(raw / s.step) * s.step;
        return Math.max(s.min, Math.min(s.max, snapped));
      };

      const handleMove = (me: PointerEvent) => {
        const v = compute(me.clientY);
        setDraftValue(v);
        const s = stateRef.current;
        (s.onLiveChange ?? s.onChange)(v);
      };

      const handleUp = (ue: PointerEvent) => {
        const v = compute(ue.clientY);
        setDraftValue(null);
        stateRef.current.onChange(v);
        el.removeEventListener('pointermove', handleMove);
        el.removeEventListener('pointerup', handleUp);
        el.removeEventListener('pointercancel', handleUp);
      };

      el.addEventListener('pointermove', handleMove);
      el.addEventListener('pointerup', handleUp);
      el.addEventListener('pointercancel', handleUp);
    },
    [isMixed, num],
  );

  return (
    <div
      ref={elRef}
      className={cn('shrink-0 touch-none cursor-ns-resize select-none', isMixed && 'opacity-40', className)}
      onPointerDown={onDown}
    >
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
        <path
          d={arcPath(cx, cy, r, ARC_START_DEG, ARC_START_DEG + ARC_SWEEP_DEG)}
          fill="none"
          stroke="#2e2e31"
          strokeWidth={2.5}
          strokeLinecap="round"
        />
        {norm > 0.005 && (
          <path
            d={arcPath(cx, cy, r, ARC_START_DEG, deg)}
            fill="none"
            stroke="#ff7b63"
            strokeWidth={2.5}
            strokeLinecap="round"
          />
        )}
        <circle cx={tip.x} cy={tip.y} r={2} fill="white" />
      </svg>
    </div>
  );
}
