/**
 * Cache purge utilities for WordPress caching plugins
 * Supports multiple caching plugins with graceful fallback
 * 
 * Supported plugins:
 * - LiteSpeed Cache
 * - WP Rocket
 * - SG Optimizer (SiteGround)
 * - Breeze (Cloudways)
 * - WP Fastest Cache
 * - Hummingbird
 * - WooCommerce Transients (always works)
 */

import { WordPressAuthSession } from './wp-authed-request';
import { getApiBase } from './wp-utils';

interface PurgeResult {
  plugin: string;
  success: boolean;
  message?: string;
}

/**
 * Attempt to purge LiteSpeed Cache
 */
async function purgeLiteSpeed(
  apiBase: string,
  authHeader: string
): Promise<PurgeResult> {
  const plugin = 'LiteSpeed Cache';
  
  try {
    // Try primary endpoint
    const response = await fetch(`${apiBase}/litespeed/v1/purge/all`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authHeader,
      },
    });

    if (response.ok) {
      return { plugin, success: true };
    }

    // Try alternative endpoint
    const altResponse = await fetch(`${apiBase}/litespeed/v1/purge`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authHeader,
      },
      body: JSON.stringify({ type: 'all' }),
    });

    if (altResponse.ok) {
      return { plugin, success: true };
    }

    return { plugin, success: false, message: 'Endpoints not available' };
  } catch (error) {
    return { plugin, success: false, message: 'Plugin not installed' };
  }
}

/**
 * Attempt to purge WP Rocket Cache
 */
async function purgeWPRocket(
  apiBase: string,
  authHeader: string
): Promise<PurgeResult> {
  const plugin = 'WP Rocket';
  
  try {
    // WP Rocket REST API endpoint
    const response = await fetch(`${apiBase}/wp-rocket/v1/cache/clear`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authHeader,
      },
    });

    if (response.ok) {
      return { plugin, success: true };
    }

    // Try POST method (some versions)
    const altResponse = await fetch(`${apiBase}/wp-rocket/v1/cache/clear`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authHeader,
      },
    });

    if (altResponse.ok) {
      return { plugin, success: true };
    }

    return { plugin, success: false, message: 'Endpoints not available' };
  } catch (error) {
    return { plugin, success: false, message: 'Plugin not installed' };
  }
}

/**
 * Attempt to purge SG Optimizer Cache (SiteGround)
 */
async function purgeSGOptimizer(
  apiBase: string,
  authHeader: string
): Promise<PurgeResult> {
  const plugin = 'SG Optimizer';
  
  try {
    const response = await fetch(`${apiBase}/developer-tools/v1/cache`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authHeader,
      },
    });

    if (response.ok) {
      return { plugin, success: true };
    }

    return { plugin, success: false, message: 'Endpoint not available' };
  } catch (error) {
    return { plugin, success: false, message: 'Plugin not installed' };
  }
}

/**
 * Attempt to purge Breeze Cache (Cloudways)
 */
async function purgeBreeze(
  apiBase: string,
  authHeader: string
): Promise<PurgeResult> {
  const plugin = 'Breeze';
  
  try {
    const response = await fetch(`${apiBase}/breeze/v1/purge/all`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authHeader,
      },
    });

    if (response.ok) {
      return { plugin, success: true };
    }

    return { plugin, success: false, message: 'Endpoint not available' };
  } catch (error) {
    return { plugin, success: false, message: 'Plugin not installed' };
  }
}

/**
 * Attempt to purge WP Fastest Cache
 */
async function purgeWPFastestCache(
  apiBase: string,
  authHeader: string
): Promise<PurgeResult> {
  const plugin = 'WP Fastest Cache';
  
  try {
    const response = await fetch(`${apiBase}/wpfc/v1/delete_cache`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authHeader,
      },
    });

    if (response.ok) {
      return { plugin, success: true };
    }

    return { plugin, success: false, message: 'Endpoint not available (Premium required)' };
  } catch (error) {
    return { plugin, success: false, message: 'Plugin not installed' };
  }
}

/**
 * Attempt to purge Hummingbird Cache
 */
async function purgeHummingbird(
  apiBase: string,
  authHeader: string
): Promise<PurgeResult> {
  const plugin = 'Hummingbird';
  
  try {
    const response = await fetch(`${apiBase}/wphb/v1/clear_cache`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authHeader,
      },
    });

    if (response.ok) {
      return { plugin, success: true };
    }

    return { plugin, success: false, message: 'Endpoint not available' };
  } catch (error) {
    return { plugin, success: false, message: 'Plugin not installed' };
  }
}

/**
 * Purge WooCommerce transients (always works if WooCommerce is active)
 */
async function purgeWooCommerceTransientsInternal(
  apiBase: string,
  authHeader: string
): Promise<PurgeResult> {
  const plugin = 'WooCommerce Transients';
  
  try {
    const response = await fetch(`${apiBase}/wc/v3/system_status/tools/clear_transients`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authHeader,
      },
      body: JSON.stringify({ confirm: true }),
    });

    if (response.ok) {
      return { plugin, success: true };
    }

    return { plugin, success: false, message: 'Failed to clear' };
  } catch (error) {
    return { plugin, success: false, message: 'WooCommerce API error' };
  }
}

/**
 * Try to purge cache using all supported caching plugins
 * Returns results for each plugin attempted
 */
export async function purgeCacheAllPlugins(
  session: WordPressAuthSession
): Promise<PurgeResult[]> {
  const apiBase = getApiBase(session.storeUrl);
  const authHeader = `Basic ${btoa(`${session.username}:${session.appPassword}`)}`;

  console.log('🔄 Attempting to purge cache (trying all plugins)...');

  // Run all purge attempts in parallel
  const results = await Promise.all([
    purgeLiteSpeed(apiBase, authHeader),
    purgeWPRocket(apiBase, authHeader),
    purgeSGOptimizer(apiBase, authHeader),
    purgeBreeze(apiBase, authHeader),
    purgeWPFastestCache(apiBase, authHeader),
    purgeHummingbird(apiBase, authHeader),
    purgeWooCommerceTransientsInternal(apiBase, authHeader),
  ]);

  // Log results
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  if (successful.length > 0) {
    console.log('✅ Cache purged successfully:', successful.map(r => r.plugin).join(', '));
  }
  
  if (failed.length > 0 && successful.length === 0) {
    console.warn('⚠️ No cache plugins responded. This is normal if no supported caching plugin is installed.');
  }

  return results;
}

/**
 * Attempt to purge LiteSpeed Cache (legacy function for compatibility)
 */
export async function purgeLiteSpeedCache(
  session: WordPressAuthSession,
  productId?: number
): Promise<boolean> {
  const apiBase = getApiBase(session.storeUrl);
  const authHeader = `Basic ${btoa(`${session.username}:${session.appPassword}`)}`;

  const result = await purgeLiteSpeed(apiBase, authHeader);
  
  if (result.success) {
    console.log('✅ LiteSpeed Cache purged successfully');
  } else {
    console.warn('⚠️ LiteSpeed Cache purge failed:', result.message);
  }
  
  return result.success;
}

/**
 * Try to purge WooCommerce transients via REST API (legacy function for compatibility)
 */
export async function purgeWooCommerceTransients(
  session: WordPressAuthSession
): Promise<boolean> {
  const apiBase = getApiBase(session.storeUrl);
  const authHeader = `Basic ${btoa(`${session.username}:${session.appPassword}`)}`;

  const result = await purgeWooCommerceTransientsInternal(apiBase, authHeader);
  
  if (result.success) {
    console.log('✅ WooCommerce transients cleared');
  } else {
    console.warn('⚠️ Could not clear WooCommerce transients:', result.message);
  }
  
  return result.success;
}

/**
 * Purge all caches after a product update
 * Tries all supported caching plugins
 */
export async function purgeProductCache(
  session: WordPressAuthSession,
  productId: number
): Promise<void> {
  console.log('🔄 Purging all caches for product', productId);

  const results = await purgeCacheAllPlugins(session);
  
  const successfulPlugins = results.filter(r => r.success).map(r => r.plugin);
  
  if (successfulPlugins.length > 0) {
    console.log(`✅ Product ${productId} cache cleared via:`, successfulPlugins.join(', '));
  } else {
    console.warn(`⚠️ No cache cleared for product ${productId}. Consider installing a supported caching plugin.`);
  }
}

/**
 * Purge all caches (general purpose)
 * Alias for purgeCacheAllPlugins with simplified return
 */
export async function purgeAllCaches(
  session: WordPressAuthSession
): Promise<boolean> {
  const results = await purgeCacheAllPlugins(session);
  return results.some(r => r.success);
}
