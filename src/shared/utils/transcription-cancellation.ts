import { LOCAL_INFERENCE_UNLOADED_MESSAGE } from '@/shared/state/local-inference';

export const TRANSCRIPTION_CANCELLED_MESSAGE = 'Transcription cancelled';

export function isTranscriptionCancellationError(error: unknown): boolean {
  return error instanceof Error && (
    error.message === TRANSCRIPTION_CANCELLED_MESSAGE
    || error.message === LOCAL_INFERENCE_UNLOADED_MESSAGE
  );
}
