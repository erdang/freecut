import { blobUrlManager } from '@/infrastructure/browser/blob-url-manager';
import { getMedia, updateMedia } from '@/infrastructure/storage';
import { opfsService } from '@/features/composition-runtime/deps/media-library';
import { createLogger } from '@/shared/logging/logger';
import type { MediaMetadata } from '@/types/storage';
import {
  readWorkspaceBlob,
  removeWorkspaceCacheEntry,
} from '@/infrastructure/storage/workspace-fs/cache-mirror';
import { previewAudioPath } from '@/infrastructure/storage/workspace-fs/paths';
import { requireWorkspaceRoot } from '@/infrastructure/storage/workspace-fs/root';
import { writeBlob } from '@/infrastructure/storage/workspace-fs/fs-primitives';
import { audioBufferToWavBlob } from './audio-buffer-wav';

const log = createLogger('PreviewAudioConform');

const PREVIEW_AUDIO_CONFORM_DIR = 'preview-audio';
const PREVIEW_AUDIO_CONFORM_MIME_TYPE = 'audio/wav';

const pendingPreviewAudioConformLoads = new Map<string, Promise<string | null>>();
const pendingPreviewAudioConformPersists = new Map<string, Promise<void>>();

function buildPreviewAudioConformPath(mediaId: string): string {
  const shard1 = mediaId.slice(0, 2) || '00';
  const shard2 = mediaId.slice(2, 4) || '00';
  return `${PREVIEW_AUDIO_CONFORM_DIR}/${shard1}/${shard2}/${mediaId}.wav`;
}

export function getPreviewAudioConformCacheKey(mediaId: string): string {
  return `preview-audio:${mediaId}`;
}

export function getCachedPreviewAudioConformUrl(mediaId: string): string | null {
  return blobUrlManager.get(getPreviewAudioConformCacheKey(mediaId));
}

export async function resolvePreviewAudioConformUrl(mediaId: string): Promise<string | null> {
  const cacheKey = getPreviewAudioConformCacheKey(mediaId);
  const cached = blobUrlManager.get(cacheKey);
  if (cached) {
    return cached;
  }

  const pending = pendingPreviewAudioConformLoads.get(mediaId);
  if (pending) {
    return pending;
  }

  const promise = (async () => {
    try {
      const media = await getMedia(mediaId);
      if (!media?.previewAudioOpfsPath) {
        return null;
      }
      const persistedPath = media.previewAudioOpfsPath;
      const mimeType = media.previewAudioMimeType || PREVIEW_AUDIO_CONFORM_MIME_TYPE;

      const workspaceBlob = await readWorkspaceBlob(previewAudioPath(persistedPath));
      if (workspaceBlob) {
        return blobUrlManager.acquire(
          cacheKey,
          new Blob([await workspaceBlob.arrayBuffer()], { type: mimeType }),
        );
      }

      // Legacy fallback: older sessions wrote only to OPFS. If found there,
      // hydrate the workspace copy so subsequent reads stay workspace-first.
      try {
        const bytes = await opfsService.getFile(persistedPath);
        await writeBlob(
          requireWorkspaceRoot(),
          previewAudioPath(persistedPath),
          new Uint8Array(bytes),
        );
        return blobUrlManager.acquire(
          cacheKey,
          new Blob([bytes], { type: mimeType }),
        );
      } catch (err) {
        log.warn('Failed to resolve preview audio conform asset from legacy OPFS', {
          mediaId,
          path: persistedPath,
          err,
        });
        return null;
      }
    } catch (err) {
      log.warn('Failed to resolve preview audio conform asset', { mediaId, err });
      return null;
    } finally {
      pendingPreviewAudioConformLoads.delete(mediaId);
    }
  })();

  pendingPreviewAudioConformLoads.set(mediaId, promise);
  return promise;
}

export async function persistPreviewAudioConform(
  mediaId: string,
  buffer: AudioBuffer,
): Promise<void> {
  const pending = pendingPreviewAudioConformPersists.get(mediaId);
  if (pending) {
    return pending;
  }

  const promise = (async () => {
    const media = await getMedia(mediaId);
    if (!media) {
      return;
    }

    const cacheKey = getPreviewAudioConformCacheKey(mediaId);
    let wavBlob: Blob | null = null;

    if (!blobUrlManager.get(cacheKey)) {
      wavBlob = audioBufferToWavBlob(buffer);
      blobUrlManager.acquire(cacheKey, wavBlob);
    }

    const nextBlob = wavBlob ?? audioBufferToWavBlob(buffer);
    const persistedPath = media.previewAudioOpfsPath ?? buildPreviewAudioConformPath(mediaId);
    const bytes = await nextBlob.arrayBuffer();
    await writeBlob(
      requireWorkspaceRoot(),
      previewAudioPath(persistedPath),
      new Uint8Array(bytes),
    );

    await updateMedia(mediaId, {
      previewAudioOpfsPath: persistedPath,
      previewAudioMimeType: PREVIEW_AUDIO_CONFORM_MIME_TYPE,
      previewAudioConformedAt: Date.now(),
    });
  })()
    .catch((err) => {
      log.warn('Failed to persist preview audio conform asset', { mediaId, err });
    })
    .finally(() => {
      pendingPreviewAudioConformPersists.delete(mediaId);
    });

  pendingPreviewAudioConformPersists.set(mediaId, promise);
  return promise;
}

export async function deletePreviewAudioConform(
  mediaOrId: MediaMetadata | string,
  options?: { clearMetadata?: boolean },
): Promise<void> {
  const mediaId = typeof mediaOrId === 'string' ? mediaOrId : mediaOrId.id;
  const media = typeof mediaOrId === 'string' ? await getMedia(mediaOrId) : mediaOrId;

  pendingPreviewAudioConformLoads.delete(mediaId);
  pendingPreviewAudioConformPersists.delete(mediaId);
  blobUrlManager.invalidate(getPreviewAudioConformCacheKey(mediaId));

  if (!media) {
    return;
  }

  if (media.previewAudioOpfsPath) {
    const persistedPath = media.previewAudioOpfsPath;
    try {
      await opfsService.deleteFile(persistedPath);
    } catch (err) {
      log.debug('Legacy OPFS preview audio conform asset was already absent or unreadable', {
        mediaId,
        path: persistedPath,
        err,
      });
    }
    void removeWorkspaceCacheEntry(previewAudioPath(persistedPath));
  }

  if (options?.clearMetadata) {
    try {
      await updateMedia(mediaId, {
        previewAudioOpfsPath: undefined,
        previewAudioMimeType: undefined,
        previewAudioConformedAt: undefined,
      });
    } catch (err) {
      log.warn('Failed to clear preview audio conform metadata', { mediaId, err });
    }
  }
}
