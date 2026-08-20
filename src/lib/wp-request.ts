/**
 * Public WordPress REST API request helper
 * For unauthenticated requests to public endpoints
 * Supports dynamic store URLs for multi-store management
 */

import { WordPressError, getApiBase } from './wp-utils';

export { WordPressError };

/**
 * Make a public (unauthenticated) request to a WordPress REST API
 * @param storeUrl - The base URL of the WordPress store (e.g., https://example.com)
 * @param path - The API path (e.g., /sticklight/v1/auth/login)
 * @param init - Fetch init options
 */
export async function wpRequest<T>(
  storeUrl: string,
  path: string,
  init?: RequestInit
): Promise<T> {
  const apiBase = getApiBase(storeUrl);
  const url = `${apiBase}${path}`;

  const response = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new WordPressError(
      error.message || `Request failed: ${response.status}`,
      response.status,
      error.code
    );
  }

  return response.json();
}
