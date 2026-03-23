import type { TimelineItem } from '@/types/timeline';

function isMediaPair(left: TimelineItem, right: TimelineItem): boolean {
  return (left.type === 'video' && right.type === 'audio')
    || (left.type === 'audio' && right.type === 'video');
}

function isLegacyLinkedPair(anchor: TimelineItem, candidate: TimelineItem): boolean {
  if (!isMediaPair(anchor, candidate)) return false;
  if (!anchor.originId || anchor.originId !== candidate.originId) return false;
  if (!anchor.mediaId || anchor.mediaId !== candidate.mediaId) return false;
  return anchor.from === candidate.from && anchor.durationInFrames === candidate.durationInFrames;
}

export function getLinkedItems(items: TimelineItem[], itemId: string): TimelineItem[] {
  const anchor = items.find((item) => item.id === itemId);
  if (!anchor) return [];

  if (anchor.linkedGroupId) {
    return items.filter((item) => item.linkedGroupId === anchor.linkedGroupId);
  }

  const legacyLinkedItems = items.filter((item) => item.id === itemId || isLegacyLinkedPair(anchor, item));
  return legacyLinkedItems.length > 1 ? legacyLinkedItems : [anchor];
}

export function getLinkedItemIds(items: TimelineItem[], itemId: string): string[] {
  return getLinkedItems(items, itemId).map((item) => item.id);
}

export function hasLinkedItems(items: TimelineItem[], itemId: string): boolean {
  return getLinkedItemIds(items, itemId).length > 1;
}

export function canLinkItems(items: TimelineItem[]): boolean {
  if (items.length !== 2) return false;

  const [left, right] = items;
  if (!left || !right) return false;
  if (!isMediaPair(left, right)) return false;
  if (!left.mediaId || left.mediaId !== right.mediaId) return false;
  if (left.from !== right.from) return false;
  if (left.durationInFrames !== right.durationInFrames) return false;

  if ((left.sourceStart ?? null) !== (right.sourceStart ?? null)) return false;
  if ((left.sourceEnd ?? null) !== (right.sourceEnd ?? null)) return false;

  return true;
}

export function expandSelectionWithLinkedItems(items: TimelineItem[], itemIds: string[]): string[] {
  const expandedIds = new Set<string>();
  for (const itemId of itemIds) {
    for (const linkedId of getLinkedItemIds(items, itemId)) {
      expandedIds.add(linkedId);
    }
  }
  return Array.from(expandedIds);
}
