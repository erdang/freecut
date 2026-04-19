import { useEffect, useRef } from 'react';
import { Palette, Search, Sparkles, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/shared/ui/cn';
import { useSettingsStore, type CaptionSearchMode } from '../deps/settings';
import { useSceneBrowserStore } from '../stores/scene-browser-store';
import { LibraryPaletteGrid } from './library-palette-grid';

export function SceneSearchInput() {
  const query = useSceneBrowserStore((s) => s.query);
  const setQuery = useSceneBrowserStore((s) => s.setQuery);
  const focusNonce = useSceneBrowserStore((s) => s.focusNonce);
  const reference = useSceneBrowserStore((s) => s.reference);
  const setReference = useSceneBrowserStore((s) => s.setReference);
  const colorMode = useSceneBrowserStore((s) => s.colorMode);
  const setColorMode = useSceneBrowserStore((s) => s.setColorMode);
  const scope = useSceneBrowserStore((s) => s.scope);
  const captionSearchMode = useSettingsStore((s) => s.captionSearchMode);
  const setSetting = useSettingsStore((s) => s.setSetting);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (focusNonce > 0) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [focusNonce]);

  const toggleMode = () => {
    const next: CaptionSearchMode = captionSearchMode === 'semantic' ? 'keyword' : 'semantic';
    setSetting('captionSearchMode', next);
  };

  const semanticActive = captionSearchMode === 'semantic';

  const modeButton = (
    <>
      <button
        type="button"
        onClick={() => setColorMode(!colorMode)}
        className={cn(
          'flex h-8 items-center gap-1 rounded-md border px-2 text-[11px] transition-colors',
          colorMode
            ? 'border-primary/60 bg-primary/10 text-primary'
            : 'border-border bg-secondary text-muted-foreground hover:text-foreground',
        )}
        title={colorMode ? 'Exit color mode' : 'Search by color'}
        aria-pressed={colorMode}
      >
        <Palette className="h-3 w-3" />
        Color
      </button>
      {!colorMode && (
        <button
          type="button"
          onClick={toggleMode}
          className={cn(
            'flex h-8 items-center gap-1 rounded-md border px-2 text-[11px] transition-colors',
            semanticActive
              ? 'border-primary/60 bg-primary/10 text-primary'
              : 'border-border bg-secondary text-muted-foreground hover:text-foreground',
          )}
          title={
            semanticActive
              ? 'Semantic search (by meaning) — click to switch to keyword'
              : 'Keyword search — click to switch to semantic'
          }
          aria-pressed={semanticActive}
        >
          <Sparkles className="h-3 w-3" />
          {semanticActive ? 'Semantic' : 'Keyword'}
        </button>
      )}
    </>
  );

  if (colorMode) {
    return (
      <div className="flex flex-1 min-w-0 items-center gap-1.5">
        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto rounded-md border border-border bg-secondary/40 px-2 py-1">
          {reference ? (
            <button
              type="button"
              onClick={() => setReference(null)}
              className="flex h-6 max-w-[220px] items-center gap-1 rounded-md border border-primary/60 bg-primary/10 px-2 text-[11px] text-primary transition-colors hover:bg-primary/20"
              title="Clear reference and pick another color"
            >
              <Palette className="h-3 w-3 shrink-0" />
              <span className="truncate">{reference.label}</span>
              <X className="h-3 w-3 shrink-0" />
            </button>
          ) : (
            <LibraryPaletteGrid scope={scope} />
          )}
        </div>
        {modeButton}
      </div>
    );
  }

  return (
    <div className="relative flex flex-1 min-w-0 items-center gap-1.5">
      <div className="relative flex-1 min-w-0">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={
            reference
              ? 'Finding scenes with a similar palette…'
              : semanticActive
                ? 'Search by meaning — "sunset over water", "people laughing"…'
                : 'Search scenes by what you see…'
          }
          disabled={!!reference}
          className="h-8 pl-8 pr-7 text-[12px] disabled:opacity-60"
          spellCheck={false}
          autoComplete="off"
        />
        {query.length > 0 && !reference && (
          <button
            type="button"
            onClick={() => setQuery('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
            aria-label="Clear search"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>
      {reference && (
        <button
          type="button"
          onClick={() => setReference(null)}
          className="flex h-8 max-w-[220px] items-center gap-1 rounded-md border border-primary/60 bg-primary/10 px-2 text-[11px] text-primary transition-colors hover:bg-primary/20"
          title={`Similar palette to ${reference.label} — click to clear`}
        >
          <Palette className="h-3 w-3 shrink-0" />
          <span className="truncate">{reference.label}</span>
          <X className="h-3 w-3 shrink-0" />
        </button>
      )}
      {modeButton}
    </div>
  );
}
