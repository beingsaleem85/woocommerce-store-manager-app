/**
 * Shared WordPress API utilities
 */

export class WordPressError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string
  ) {
    super(message);
    this.name = 'WordPressError';
  }
}

/**
 * Get the API base URL from a store URL
 */
export function getApiBase(storeUrl: string): string {
  // Remove trailing slash if present
  const cleanUrl = storeUrl.replace(/\/$/, '');
  return `${cleanUrl}/wp-json`;
}
