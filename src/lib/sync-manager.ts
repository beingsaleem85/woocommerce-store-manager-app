/**
 * Sync Manager
 * Handles background synchronization of offline operations
 */

import { getPendingOperations, removeOperation, incrementRetry, PendingOperation } from './offline-queue';
import { WordPressAuthSession } from './wp-authed-request';
import { getApiBase } from './wp-utils';

const MAX_RETRIES = 3;

export interface SyncResult {
  success: boolean;
  synced: number;
  failed: number;
  errors: string[];
}

/**
 * Execute a single pending operation
 */
async function executeOperation(
  operation: PendingOperation,
  session: WordPressAuthSession
): Promise<boolean> {
  // Make sure we're syncing to the correct store
  if (operation.storeUrl !== session.storeUrl) {
    console.warn('⚠️ Operation store URL mismatch, skipping:', operation.id);
    return false;
  }

  const apiBase = getApiBase(session.storeUrl);
  const url = `${apiBase}${operation.endpoint}`;
  const authHeader = `Basic ${btoa(`${session.username}:${session.appPassword}`)}`;

  try {
    const response = await fetch(url, {
      method: operation.method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: authHeader,
      },
      body: JSON.stringify(operation.body),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || `Request failed: ${response.status}`);
    }

    return true;
  } catch (error) {
    console.error('❌ Sync failed for operation:', operation.id, error);
    return false;
  }
}

/**
 * Sync all pending operations
 */
export async function syncAllOperations(session: WordPressAuthSession): Promise<SyncResult> {
  const operations = await getPendingOperations();
  
  if (operations.length === 0) {
    return { success: true, synced: 0, failed: 0, errors: [] };
  }

  console.log(`🔄 Starting sync of ${operations.length} pending operations...`);
  
  let synced = 0;
  let failed = 0;
  const errors: string[] = [];

  // Dispatch sync started event
  window.dispatchEvent(new CustomEvent('sync-started', { detail: { total: operations.length } }));

  for (const operation of operations) {
    // Skip operations that have exceeded max retries
    if (operation.retries >= MAX_RETRIES) {
      console.warn('⚠️ Max retries exceeded, removing operation:', operation.id);
      await removeOperation(operation.id);
      failed++;
      errors.push(`${operation.description} - max retries exceeded`);
      continue;
    }

    const success = await executeOperation(operation, session);

    if (success) {
      await removeOperation(operation.id);
      synced++;
      
      // Dispatch progress event
      window.dispatchEvent(new CustomEvent('sync-progress', { 
        detail: { synced, total: operations.length, description: operation.description } 
      }));
    } else {
      await incrementRetry(operation.id);
      failed++;
      errors.push(`${operation.description} - sync failed`);
    }
  }

  const result: SyncResult = {
    success: failed === 0,
    synced,
    failed,
    errors
  };

  // Dispatch sync completed event
  window.dispatchEvent(new CustomEvent('sync-completed', { detail: result }));

  console.log(`✅ Sync completed: ${synced} synced, ${failed} failed`);
  
  return result;
}

/**
 * Register for background sync (if supported)
 */
export async function registerBackgroundSync(): Promise<boolean> {
  if ('serviceWorker' in navigator && 'sync' in window.ServiceWorkerRegistration.prototype) {
    try {
      const registration = await navigator.serviceWorker.ready;
      // @ts-ignore - sync is not in the types yet
      await registration.sync.register('wc-manager-sync');
      console.log('📡 Background sync registered');
      return true;
    } catch (error) {
      console.warn('⚠️ Background sync registration failed:', error);
      return false;
    }
  }
  return false;
}
