import { memo, useCallback } from 'react';
import { Palette } from 'lucide-react';
import { cn } from '@/shared/ui/cn';
import { useLibraryPalette } from '../hooks/use-library-palette';
import { useSceneBrowserStore } from '../stores/scene-browser-store';
import { labToRgb } from './scene-palette-swatches';

/**
 * Color Mode picker — a weighted-k-means grid of the library's actual
 * dominant colors. Clicking a swatch pins it as a single-entry
 * reference palette, which the existing ranker turns into a similarity
 * search. No typing, no guessing which color words exist; users see
 * the colors their footage is actually made of.
 */

interface LibraryPaletteGridProps {
  /** Scene browser scope (null = whole library, string = mediaId). */
  scope: string | null;
  className?: string;
}

export const LibraryPaletteGrid = memo(function LibraryPaletteGrid({
  scope,
  className,
}: LibraryPaletteGridProps) {
  const clusters = useLibraryPalette(scope);
  const setReference = useSceneBrowserStore((s) => s.setReference);
  const setQuery = useSceneBrowserStore((s) => s.setQuery);
  const currentRef = useSceneBrowserStore((s) => s.reference);

  const handlePick = useCallback((cluster: { l: number; a: number; b: number; weight: number }) => {
    setQuery('');
    setReference({
      sceneId: `library-color-${Math.round(cluster.l)}-${Math.round(cluster.a)}-${Math.round(cluster.b)}`,
      label: 'Library color',
      palette: [{ l: cluster.l, a: cluster.a, b: cluster.b, weight: 1 }],
    });
  }, [setQuery, setReference]);

  if (clusters.length === 0) {
    return (
      <div className={cn(
        'flex items-center gap-2 rounded-md border border-dashed border-border/60 px-3 py-2 text-[12px] text-muted-foreground',
        className,
      )}>
        <Palette className="h-3.5 w-3.5" />
        <span>No palettes indexed yet — run AI captioning to populate.</span>
      </div>
    );
  }

  // Total weight across the whole grid, used to scale each swatch's
  // footprint so "the library is ~35% sky-blue" reads at a glance.
  const totalWeight = clusters.reduce((sum, c) => sum + c.weight, 0) || 1;

  return (
    <div className={cn('flex flex-wrap items-center gap-1.5', className)}>
      {clusters.map((cluster, i) => {
        const [r, g, b] = labToRgb(cluster.l, cluster.a, cluster.b);
        const share = cluster.weight / totalWeight;
        const width = Math.round(20 + share * 120);
        const isActive = currentRef?.palette.length === 1
          && currentRef.palette[0]!.l === cluster.l
          && currentRef.palette[0]!.a === cluster.a
          && currentRef.palette[0]!.b === cluster.b;
        return (
          <button
            key={i}
            type="button"
            onClick={() => handlePick(cluster)}
            className={cn(
              'group relative h-7 rounded-md border border-white/10 transition-all',
              'hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none',
              'focus-visible:ring-2 focus-visible:ring-primary',
              isActive && 'ring-2 ring-primary',
            )}
            style={{ width: `${width}px`, backgroundColor: `rgb(${r}, ${g}, ${b})` }}
            title={`Find scenes in this color (${Math.round(share * 100)}% of the library)`}
            aria-label={`Find scenes in this color (${Math.round(share * 100)}% of the library)`}
          />
        );
      })}
    </div>
  );
});
