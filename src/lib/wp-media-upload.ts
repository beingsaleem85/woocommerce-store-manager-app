/**
 * WordPress Media Upload Helper
 * Uploads files to WordPress media library
 */

import { WordPressAuthSession } from '@/lib/wp-authed-request';
import { getApiBase } from '@/lib/wp-utils';

export interface WPMediaItem {
  id: number;
  src: string;
  alt: string;
}

/**
 * Upload a file to WordPress media library
 */
export async function uploadToWordPress(
  file: File,
  session: WordPressAuthSession
): Promise<WPMediaItem> {
  const apiBase = getApiBase(session.storeUrl);
  const url = `${apiBase}/wp/v2/media`;
  const authHeader = `Basic ${btoa(`${session.username}:${session.appPassword}`)}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: authHeader,
      'Content-Disposition': `attachment; filename="${encodeURIComponent(file.name)}"`,
      'Content-Type': file.type,
    },
    body: file,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || `Upload failed: ${response.status}`);
  }

  const media = await response.json();
  return {
    id: media.id,
    src: media.source_url,
    alt: media.alt_text || file.name,
  };
}

/**
 * Upload multiple files to WordPress media library
 */
export async function uploadMultipleToWordPress(
  files: File[],
  session: WordPressAuthSession,
  onProgress?: (uploaded: number, total: number) => void
): Promise<WPMediaItem[]> {
  const results: WPMediaItem[] = [];

  for (let i = 0; i < files.length; i++) {
    const media = await uploadToWordPress(files[i], session);
    results.push(media);
    onProgress?.(i + 1, files.length);
  }

  return results;
}
