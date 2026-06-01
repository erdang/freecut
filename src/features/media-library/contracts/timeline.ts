/**
 * Media-library contract consumed by timeline feature adapters.
 */

export { useMediaLibraryStore } from '../stores/media-library-store'
export { importMediaLibraryService } from '../services/media-library-service-loader'
export { mediaProcessorService } from '../services/media-processor-service'
export { mediaTranscriptionService } from '../services/media-transcription-service'
export {
  getMediaTranscriptionModelLabel,
  getMediaTranscriptionModelOptions,
} from '../transcription/registry'
export { TranscribeDialog, type TranscribeDialogValues } from '../components/transcribe-dialog'
export {
  SubtitleGenerateDialog,
  type SubtitleGenerateDialogValues,
} from '../components/subtitle-generate-dialog'
export { useEmbeddedSubtitlePickerStore } from '../stores/embedded-subtitle-picker-store'
export { subtitleSidecarService } from '../services/subtitle-sidecar-service'
export { thirdPartySubtitleGenerateService } from '../services/third-party-subtitle-generate-service'
export { opfsService } from '../services/opfs-service'
export {
  resolveMediaUrl,
  resolveProxyUrl,
  resolveMediaUrls,
  cleanupBlobUrls,
} from '../utils/media-resolver'
export {
  getMediaDragData,
  setMediaDragData,
  clearMediaDragData,
  type CompositionDragData,
  type TimelineTemplateDragData,
} from '../utils/drag-data-cache'
export {
  extractValidMediaFileEntriesFromDataTransfer,
  supportsFileSystemDragDrop,
} from '../utils/file-drop'
export {
  buildCaptionTrackAbove,
  buildSubtitleSegmentForClip,
  findCompatibleCaptionTrackForRanges,
} from '../utils/caption-items'
export type { OrphanedClipInfo } from '../types'
export type { ExtractedMediaFileEntry } from '../utils/file-drop'
export { getMediaType, getMimeType } from '../utils/validation'
