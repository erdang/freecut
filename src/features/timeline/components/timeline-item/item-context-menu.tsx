import { memo, ReactNode, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import type { LazyContextMenuEventInit } from '../../utils/lazy-context-menu';
import {
  captureContextMenuEventInit,
  replayContextMenuEvent,
} from '../../utils/lazy-context-menu';
import { useSelectionStore } from '@/shared/state/selection';
import { PROPERTY_LABELS, type AnimatableProperty } from '@/types/keyframe';
import type { PropertyKeyframes } from '@/types/keyframe';
import type { MediaTranscriptModel } from '@/types/storage';
import {
  getMediaTranscriptionModelLabel,
  getMediaTranscriptionModelOptions,
} from '@/features/timeline/deps/media-transcription-service';
import {
  getSceneVerificationModelOptions,
  type VerificationModel,
} from '@/features/timeline/deps/analysis';
import { formatHotkeyBinding } from '@/config/hotkeys';
import { useResolvedHotkeys } from '@/features/timeline/deps/settings';

interface ItemContextMenuProps {
  children: ReactNode;
  trackLocked: boolean;
  isSelected: boolean;
  canJoinSelected: boolean;
  hasJoinableLeft: boolean;
  hasJoinableRight: boolean;
  /** Which edge was closer when context menu was triggered */
  closerEdge: 'left' | 'right' | null;
  /** Keyframed properties for the item (used to build clear submenu) */
  keyframedProperties?: PropertyKeyframes[];
  canLinkSelected?: boolean;
  canUnlinkSelected?: boolean;
  onJoinSelected: () => void;
  onJoinLeft: () => void;
  onJoinRight: () => void;
  onLinkSelected?: () => void;
  onUnlinkSelected?: () => void;
  onRippleDelete: () => void;
  onDelete: () => void;
  onClearAllKeyframes?: () => void;
  onClearPropertyKeyframes?: (property: AnimatableProperty) => void;
  onBentoLayout?: () => void;
  /** Whether this item is a video clip (enables freeze frame option) */
  isVideoItem?: boolean;
  /** Whether the playhead is within this item's bounds */
  playheadInBounds?: boolean;
  onFreezeFrame?: () => void;
  canGenerateCaptions?: boolean;
  canRegenerateCaptions?: boolean;
  isGeneratingCaptions?: boolean;
  defaultCaptionModel?: MediaTranscriptModel;
  onGenerateCaptions?: (model: MediaTranscriptModel) => void;
  onRegenerateCaptions?: (model: MediaTranscriptModel) => void;
  /** Whether this item is a composition item (enables enter/dissolve options) */
  isCompositionItem?: boolean;
  onEnterComposition?: () => void;
  onDissolveComposition?: () => void;
  /** Whether multiple items are selected (enables pre-comp creation) */
  canCreatePreComp?: boolean;
  onCreatePreComp?: () => void;
  /** Whether this item is a text item (enables generate audio option) */
  isTextItem?: boolean;
  onGenerateAudioFromText?: () => void;
  /** Whether scene detection is available for this item */
  canDetectScenes?: boolean;
  isDetectingScenes?: boolean;
  onDetectScenes?: (method: 'histogram' | 'optical-flow', verificationModel?: VerificationModel) => void;
}

/**
 * Context menu for timeline items
 * Provides delete, ripple delete, join, and keyframe clearing operations
 *
 * Uses lazy mounting: the heavy Radix ContextMenu tree (10+ provider components)
 * is only mounted after the user first right-clicks. Before that, children render
 * directly without the ContextMenu wrapper, eliminating thousands of unnecessary
 * re-renders during drag operations (119 items × ~10 Radix components each).
 */
export const ItemContextMenu = memo(function ItemContextMenu({
  children,
  trackLocked,
  isSelected,
  canJoinSelected,
  hasJoinableLeft,
  hasJoinableRight,
  closerEdge,
  keyframedProperties,
  canLinkSelected,
  canUnlinkSelected,
  onJoinSelected,
  onJoinLeft,
  onJoinRight,
  onLinkSelected,
  onUnlinkSelected,
  onRippleDelete,
  onDelete,
  onClearAllKeyframes,
  onClearPropertyKeyframes,
  onBentoLayout,
  isVideoItem,
  playheadInBounds,
  onFreezeFrame,
  canGenerateCaptions,
  canRegenerateCaptions,
  isGeneratingCaptions,
  defaultCaptionModel,
  onGenerateCaptions,
  onRegenerateCaptions,
  isCompositionItem,
  onEnterComposition,
  onDissolveComposition,
  canCreatePreComp,
  onCreatePreComp,
  isTextItem,
  onGenerateAudioFromText,
  canDetectScenes,
  isDetectingScenes,
  onDetectScenes,
}: ItemContextMenuProps) {
  // Lazy mount: defer the full Radix ContextMenu tree until first right-click.
  // This eliminates ~10 Radix provider components per item from the render tree
  // during normal operation (drag, playback, scrub), where context menus are never
  // needed. With 100+ items, this avoids millions of unnecessary re-renders.
  const [hasActivated, setHasActivated] = useState(false);
  const [pendingActivation, setPendingActivation] = useState<LazyContextMenuEventInit | null>(null);

  if (!hasActivated) {
    return (
      <ItemContextMenuTriggerOnly
        trackLocked={trackLocked}
        onActivate={(eventInit) => {
          setPendingActivation(eventInit);
          setHasActivated(true);
        }}
      >
        {children}
      </ItemContextMenuTriggerOnly>
    );
  }

  return (
    <ItemContextMenuFull
      trackLocked={trackLocked}
      isSelected={isSelected}
      canJoinSelected={canJoinSelected}
      hasJoinableLeft={hasJoinableLeft}
      hasJoinableRight={hasJoinableRight}
      closerEdge={closerEdge}
      keyframedProperties={keyframedProperties}
      canLinkSelected={canLinkSelected}
      canUnlinkSelected={canUnlinkSelected}
      onJoinSelected={onJoinSelected}
      onJoinLeft={onJoinLeft}
      onJoinRight={onJoinRight}
      onLinkSelected={onLinkSelected}
      onUnlinkSelected={onUnlinkSelected}
      onRippleDelete={onRippleDelete}
      onDelete={onDelete}
      onClearAllKeyframes={onClearAllKeyframes}
      onClearPropertyKeyframes={onClearPropertyKeyframes}
      onBentoLayout={onBentoLayout}
      isVideoItem={isVideoItem}
      playheadInBounds={playheadInBounds}
      onFreezeFrame={onFreezeFrame}
      canGenerateCaptions={canGenerateCaptions}
      canRegenerateCaptions={canRegenerateCaptions}
      isGeneratingCaptions={isGeneratingCaptions}
      defaultCaptionModel={defaultCaptionModel}
      onGenerateCaptions={onGenerateCaptions}
      onRegenerateCaptions={onRegenerateCaptions}
      isCompositionItem={isCompositionItem}
      onEnterComposition={onEnterComposition}
      onDissolveComposition={onDissolveComposition}
      canCreatePreComp={canCreatePreComp}
      onCreatePreComp={onCreatePreComp}
      isTextItem={isTextItem}
      onGenerateAudioFromText={onGenerateAudioFromText}
      canDetectScenes={canDetectScenes}
      isDetectingScenes={isDetectingScenes}
      onDetectScenes={onDetectScenes}
      pendingActivation={pendingActivation}
      onPendingActivationHandled={() => setPendingActivation(null)}
    >
      {children}
    </ItemContextMenuFull>
  );
});

/**
 * Lightweight placeholder: just renders children with a contextmenu listener.
 * No Radix providers, no Popper, no Menu — zero overhead.
 */
const ItemContextMenuTriggerOnly = memo(function ItemContextMenuTriggerOnly({
  children,
  trackLocked,
  onActivate,
}: {
  children: ReactNode;
  trackLocked: boolean;
  onActivate: (eventInit: LazyContextMenuEventInit) => void;
}) {
  return (
    <span
      data-item-context-anchor
      style={{ display: 'contents' }}
      onContextMenu={(e) => {
        if (trackLocked) return;
        e.stopPropagation();
        e.preventDefault();
        onActivate(captureContextMenuEventInit(e.nativeEvent));
      }}
    >
      {children}
    </span>
  );
});

/**
 * Full Radix ContextMenu tree — only mounted after first right-click activation.
 */
const ItemContextMenuFull = memo(function ItemContextMenuFull({
  children,
  trackLocked,
  isSelected,
  canJoinSelected,
  hasJoinableLeft,
  hasJoinableRight,
  closerEdge,
  keyframedProperties,
  canLinkSelected,
  canUnlinkSelected,
  onJoinSelected,
  onJoinLeft,
  onJoinRight,
  onLinkSelected,
  onUnlinkSelected,
  onRippleDelete,
  onDelete,
  onClearAllKeyframes,
  onClearPropertyKeyframes,
  onBentoLayout,
  isVideoItem,
  playheadInBounds,
  onFreezeFrame,
  canGenerateCaptions,
  canRegenerateCaptions,
  isGeneratingCaptions,
  defaultCaptionModel,
  onGenerateCaptions,
  onRegenerateCaptions,
  isCompositionItem,
  onEnterComposition,
  onDissolveComposition,
  canCreatePreComp,
  onCreatePreComp,
  isTextItem,
  onGenerateAudioFromText,
  canDetectScenes,
  isDetectingScenes,
  onDetectScenes,
  pendingActivation,
  onPendingActivationHandled,
}: Omit<ItemContextMenuProps, 'children'> & {
  children: ReactNode;
  pendingActivation?: LazyContextMenuEventInit | null;
  onPendingActivationHandled?: () => void;
}) {
  const triggerRef = useRef<HTMLSpanElement | null>(null);
  const hotkeys = useResolvedHotkeys();
  const selectedCount = useSelectionStore((s) => s.selectedItemIds.length);
  // Filter to only properties that actually have keyframes
  const propertiesWithKeyframes = useMemo(() => {
    if (!keyframedProperties) return [];
    return keyframedProperties.filter(p => p.keyframes.length > 0);
  }, [keyframedProperties]);
  const transcriptionModelOptions = useMemo(
    () => getMediaTranscriptionModelOptions(),
    [],
  );
  const explicitCaptionModelOptions = useMemo(
    () => transcriptionModelOptions.filter((option) => option.value !== defaultCaptionModel),
    [defaultCaptionModel, transcriptionModelOptions],
  );
  const sceneVerificationModelOptions = useMemo(
    () => getSceneVerificationModelOptions(),
    [],
  );

  const hasKeyframes = propertiesWithKeyframes.length > 0;

  useLayoutEffect(() => {
    if (!pendingActivation || !triggerRef.current) {
      return;
    }

    replayContextMenuEvent(triggerRef.current, pendingActivation);
    onPendingActivationHandled?.();
  }, [onPendingActivationHandled, pendingActivation]);

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild disabled={trackLocked}>
        <span ref={triggerRef} data-item-context-anchor style={{ display: 'contents' }}>
          {children}
        </span>
      </ContextMenuTrigger>
      <ContextMenuContent>
        {/* Join options - show based on which edge is closer */}
        {(() => {
          // Determine which join option to show based on closer edge
          const showJoinLeft = hasJoinableLeft && (closerEdge === 'left' || !hasJoinableRight);
          const showJoinRight = hasJoinableRight && (closerEdge === 'right' || !hasJoinableLeft);
          const hasJoinOption = showJoinLeft || showJoinRight || canJoinSelected;

          if (!hasJoinOption) return null;

          return (
            <>
              {showJoinLeft && (
                <ContextMenuItem onClick={onJoinLeft}>
                  与前一个片段拼接
                  <ContextMenuShortcut>J</ContextMenuShortcut>
                </ContextMenuItem>
              )}
              {showJoinRight && (
                <ContextMenuItem onClick={onJoinRight}>
                  与后一个片段拼接
                  <ContextMenuShortcut>J</ContextMenuShortcut>
                </ContextMenuItem>
              )}
              {canJoinSelected && (
                <ContextMenuItem onClick={onJoinSelected}>
                  拼接所选片段
                  <ContextMenuShortcut>J</ContextMenuShortcut>
                </ContextMenuItem>
              )}
              <ContextMenuSeparator />
            </>
          );
        })()}

        {(canLinkSelected || canUnlinkSelected) && (
          <>
            {canLinkSelected && onLinkSelected && (
              <ContextMenuItem onClick={onLinkSelected}>
                链接片段
                <ContextMenuShortcut>{formatHotkeyBinding(hotkeys.LINK_AUDIO_VIDEO)}</ContextMenuShortcut>
              </ContextMenuItem>
            )}
            {canUnlinkSelected && onUnlinkSelected && (
              <ContextMenuItem onClick={onUnlinkSelected}>
                取消链接片段
                <ContextMenuShortcut>{formatHotkeyBinding(hotkeys.UNLINK_AUDIO_VIDEO)}</ContextMenuShortcut>
              </ContextMenuItem>
            )}
            <ContextMenuSeparator />
          </>
        )}

        {/* Clear Keyframes submenu - only show if item has keyframes */}
        {hasKeyframes && (
          <>
            <ContextMenuSub>
              <ContextMenuSubTrigger>清除关键帧</ContextMenuSubTrigger>
              <ContextMenuSubContent className="w-48">
                <ContextMenuItem onClick={onClearAllKeyframes}>
                  清除全部
                  <ContextMenuShortcut>{formatHotkeyBinding(hotkeys.CLEAR_KEYFRAMES)}</ContextMenuShortcut>
                </ContextMenuItem>
                <ContextMenuSeparator />
                {propertiesWithKeyframes.map(({ property }) => (
                  <ContextMenuItem
                    key={property}
                    onClick={() => onClearPropertyKeyframes?.(property)}
                  >
                    {PROPERTY_LABELS[property]}
                  </ContextMenuItem>
                ))}
              </ContextMenuSubContent>
            </ContextMenuSub>
            <ContextMenuSeparator />
          </>
        )}

        {/* Bento Layout - only show when 2+ items selected */}
        {selectedCount >= 2 && onBentoLayout && (
          <>
            <ContextMenuItem onClick={onBentoLayout}>
              拼贴布局...
            </ContextMenuItem>
            <ContextMenuSeparator />
          </>
        )}

        {/* Freeze Frame - only show for video items when playhead is within bounds */}
        {isVideoItem && playheadInBounds && onFreezeFrame && (
          <>
            <ContextMenuItem onClick={onFreezeFrame}>
              插入冻结帧
              <ContextMenuShortcut>Shift+F</ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuSeparator />
          </>
        )}

        {canDetectScenes && onDetectScenes && (
          <>
            {isDetectingScenes ? (
              <ContextMenuItem disabled>
                正在检测场景...
              </ContextMenuItem>
            ) : (
              <ContextMenuSub>
                <ContextMenuSubTrigger>场景检测并切分</ContextMenuSubTrigger>
                <ContextMenuSubContent className="w-48">
                  <ContextMenuItem onClick={() => onDetectScenes('histogram')}>
                    快速（直方图）
                  </ContextMenuItem>
                  {sceneVerificationModelOptions.map((option) => (
                    <ContextMenuItem
                      key={option.value}
                      onClick={() => onDetectScenes('optical-flow', option.value)}
                    >
                      {`AI（${option.label}）`}
                    </ContextMenuItem>
                  ))}
                </ContextMenuSubContent>
              </ContextMenuSub>
            )}
            <ContextMenuSeparator />
          </>
        )}

        {/* Generate Audio from Text - only show for text items */}
        {isTextItem && onGenerateAudioFromText && (
          <>
            <ContextMenuItem onClick={onGenerateAudioFromText}>
              从文本生成音频
            </ContextMenuItem>
            <ContextMenuSeparator />
          </>
        )}

        {canGenerateCaptions && onGenerateCaptions && (
          <>
            {isGeneratingCaptions ? (
              <ContextMenuItem disabled>
                正在更新字幕...
              </ContextMenuItem>
            ) : (
              <>
                <ContextMenuSub>
                  <ContextMenuSubTrigger>为该片段生成字幕</ContextMenuSubTrigger>
                  <ContextMenuSubContent className="w-48">
                    {defaultCaptionModel && (
                      <>
                        <ContextMenuItem onClick={() => onGenerateCaptions(defaultCaptionModel)}>
                          {`默认（${getMediaTranscriptionModelLabel(defaultCaptionModel)}）`}
                        </ContextMenuItem>
                        <ContextMenuSeparator />
                      </>
                    )}
                    {explicitCaptionModelOptions.map((option) => (
                      <ContextMenuItem
                        key={option.value}
                        onClick={() => onGenerateCaptions(option.value)}
                      >
                        {option.label}
                      </ContextMenuItem>
                    ))}
                  </ContextMenuSubContent>
                </ContextMenuSub>

                {canRegenerateCaptions && onRegenerateCaptions && (
                  <ContextMenuSub>
                    <ContextMenuSubTrigger>重新为该片段生成字幕</ContextMenuSubTrigger>
                    <ContextMenuSubContent className="w-48">
                      {defaultCaptionModel && (
                        <>
                          <ContextMenuItem onClick={() => onRegenerateCaptions(defaultCaptionModel)}>
                            {`默认（${getMediaTranscriptionModelLabel(defaultCaptionModel)}）`}
                          </ContextMenuItem>
                          <ContextMenuSeparator />
                        </>
                      )}
                      {explicitCaptionModelOptions.map((option) => (
                        <ContextMenuItem
                          key={option.value}
                          onClick={() => onRegenerateCaptions(option.value)}
                        >
                          {option.label}
                        </ContextMenuItem>
                      ))}
                    </ContextMenuSubContent>
                  </ContextMenuSub>
                )}
              </>
            )}
            <ContextMenuSeparator />
          </>
        )}

        {/* Composition operations */}
        {isCompositionItem && onEnterComposition && (
          <ContextMenuItem onClick={onEnterComposition}>
            打开复合片段
          </ContextMenuItem>
        )}
        {isCompositionItem && onDissolveComposition && (
          <ContextMenuItem onClick={onDissolveComposition}>
            解散复合片段
          </ContextMenuItem>
        )}
        {canCreatePreComp && onCreatePreComp && (
          <ContextMenuItem onClick={onCreatePreComp}>
            创建复合片段
          </ContextMenuItem>
        )}
        {((isCompositionItem && (onEnterComposition || onDissolveComposition)) || (canCreatePreComp && onCreatePreComp)) && (
          <ContextMenuSeparator />
        )}

        <ContextMenuItem
          onClick={onRippleDelete}
          disabled={!isSelected}
          className="text-destructive focus:text-destructive"
        >
          波纹删除
          <ContextMenuShortcut>Ctrl+Del</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem
          onClick={onDelete}
          disabled={!isSelected}
          className="text-destructive focus:text-destructive"
        >
          删除
          <ContextMenuShortcut>Del</ContextMenuShortcut>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
});
