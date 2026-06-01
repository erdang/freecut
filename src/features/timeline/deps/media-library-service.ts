export {
  importMediaLibraryService,
  opfsService,
  useEmbeddedSubtitlePickerStore,
} from './media-library-contract'

// Backward-compatible direct service export for legacy timeline callers.
export { mediaLibraryService } from '@/features/media-library/services/media-library-service'
