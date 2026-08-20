/**
 * Offline Queue System
 * Stores pending operations in IndexedDB and syncs when online
 */

import { get, set, del, keys, createStore } from 'idb-keyval';

// Create a dedicated store for offline operations
const offlineStore = createStore('wc-manager-offline', 'pending-operations');

export interface PendingOperation {
  id: string;
  type: 'UPDATE_PRODUCT' | 'CREATE_PRODUCT' | 'UPDATE_ORDER' | 'DELETE_PRODUCT';
  endpoint: string;
  method: 'POST' | 'PUT' | 'DELETE';
  body: Record<string, unknown>;
  timestamp: number;
  retries: number;
  storeUrl: string;
  description: string; // Human-readable description for UI
}

/**
 * Generate a unique ID for operations
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Add an operation to the offline queue
 */
export async function queueOperation(operation: Omit<PendingOperation, 'id' | 'timestamp' | 'retries'>): Promise<string> {
  const id = generateId();
  const pendingOp: PendingOperation = {
    ...operation,
    id,
    timestamp: Date.now(),
    retries: 0
  };
  
  await set(id, pendingOp, offlineStore);
  console.log('📥 Operation queued:', pendingOp.description);
  
  // Dispatch event for UI updates
  window.dispatchEvent(new CustomEvent('offline-queue-updated'));
  
  return id;
}

/**
 * Get all pending operations
 */
export async function getPendingOperations(): Promise<PendingOperation[]> {
  const allKeys = await keys(offlineStore);
  const operations: PendingOperation[] = [];
  
  for (const key of allKeys) {
    const op = await get<PendingOperation>(key, offlineStore);
    if (op) operations.push(op);
  }
  
  // Sort by timestamp (oldest first)
  return operations.sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * Get count of pending operations
 */
export async function getPendingCount(): Promise<number> {
  const allKeys = await keys(offlineStore);
  return allKeys.length;
}

/**
 * Remove an operation from the queue (after successful sync)
 */
export async function removeOperation(id: string): Promise<void> {
  await del(id, offlineStore);
  console.log('✅ Operation synced and removed:', id);
  window.dispatchEvent(new CustomEvent('offline-queue-updated'));
}

/**
 * Update retry count for failed operation
 */
export async function incrementRetry(id: string): Promise<void> {
  const op = await get<PendingOperation>(id, offlineStore);
  if (op) {
    op.retries += 1;
    await set(id, op, offlineStore);
  }
}

/**
 * Clear all pending operations (use with caution)
 */
export async function clearAllOperations(): Promise<void> {
  const allKeys = await keys(offlineStore);
  for (const key of allKeys) {
    await del(key, offlineStore);
  }
  window.dispatchEvent(new CustomEvent('offline-queue-updated'));
}

/**
 * Check if there are any pending operations
 */
export async function hasPendingOperations(): Promise<boolean> {
  const count = await getPendingCount();
  return count > 0;
}
