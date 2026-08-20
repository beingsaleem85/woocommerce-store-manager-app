/**
 * Authenticated WordPress REST API request helper
 * Uses Basic Auth with Application Password
 * Supports dynamic store URLs for multi-store management
 */

import { WordPressError, getApiBase } from './wp-utils';

export { WordPressError, getApiBase };

export interface WordPressAuthSession {
  storeUrl: string;
  appPassword: string;
  username: string;
}

export async function wpAuthedRequest<T>(
  path: string,
  session: WordPressAuthSession,
  init?: RequestInit
): Promise<T> {
  const apiBase = getApiBase(session.storeUrl);
  
  // Add cache-busting for GET requests
  const separator = path.includes('?') ? '&' : '?';
  const cacheBust = init?.method && init.method !== 'GET' ? '' : `${separator}_nocache=${Date.now()}`;
  const url = `${apiBase}${path}${cacheBust}`;
  
  const authHeader = `Basic ${btoa(`${session.username}:${session.appPassword}`)}`;
  const method = init?.method || 'GET';

  console.log(`🌐 API ${method}: ${path}`);

  try {
    const response = await fetch(url, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Authorization: authHeader,
        ...init?.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      console.error(`❌ API Error [${method} ${path}]:`, response.status, error);
      throw new WordPressError(
        error.message || `Request failed: ${response.status}`,
        response.status,
        error.code
      );
    }

    const data = await response.json();
    
    // Log response info for debugging
    if (Array.isArray(data)) {
      console.log(`✅ API ${method} ${path}: ${data.length} items`);
    } else if (data && typeof data === 'object') {
      console.log(`✅ API ${method} ${path}:`, data.id ? `ID ${data.id}` : 'OK');
    }
    
    return data;
  } catch (error) {
    // Handle network errors
    if (error instanceof WordPressError) {
      throw error;
    }
    console.error(`❌ Network Error [${method} ${path}]:`, error);
    throw new WordPressError(
      error instanceof Error ? error.message : 'Network request failed',
      0,
      'network_error'
    );
  }
}
