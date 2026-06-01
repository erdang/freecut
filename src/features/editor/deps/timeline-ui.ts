/**
 * Adapter exports for timeline UI dependencies.
 * Editor modules should import timeline feature UI components from here.
 */

export {
  importBentoLayoutDialog,
  importFillerRemovalDialog,
  importReverseConformDialog,
  importSilenceRemovalDialog,
  KeyframeGraphPanel,
  Timeline,
  useBentoLayoutDialogStore,
  useFillerRemovalDialogStore,
  useReverseConformDialogStore,
  useSilenceRemovalDialogStore,
} from './timeline-contract'

// Backward-compatible named dialog exports used by editor.tsx.
export { BentoLayoutDialog } from '@/features/timeline/components/bento-layout-dialog'
export { ReverseConformDialog } from '@/features/timeline/components/reverse-conform-dialog'
export { SilenceRemovalDialog } from '@/features/timeline/components/silence-removal-dialog'
export { FillerRemovalDialog } from '@/features/timeline/components/filler-removal-dialog'
