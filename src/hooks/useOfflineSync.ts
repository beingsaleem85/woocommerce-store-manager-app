/**
 * Offline Sync Hook
 * Manages automatic sync when coming back online
 */

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNetworkStatus } from './useNetworkStatus';
import { syncAllOperations, SyncResult } from '@/lib/sync-manager';
import { getPendingCount, hasPendingOperations } from '@/lib/offline-queue';

export interface SyncState {
  isSyncing: boolean;
  pendingCount: number;
  lastSyncResult: SyncResult | null;
  syncNow: () => Promise<SyncResult | null>;
}

export function useOfflineSync(): SyncState {
  const { session } = useAuth();
  const { isOnline, wasOffline } = useNetworkStatus();
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [lastSyncResult, setLastSyncResult] = useState<SyncResult | null>(null);

  // Update pending count
  const updatePendingCount = useCallback(async () => {
    const count = await getPendingCount();
    setPendingCount(count);
  }, []);

  // Sync function
  const syncNow = useCallback(async (): Promise<SyncResult | null> => {
    if (!session || !isOnline || isSyncing) return null;

    const hasPending = await hasPendingOperations();
    if (!hasPending) return null;

    setIsSyncing(true);
    try {
      const result = await syncAllOperations(session);
      setLastSyncResult(result);
      await updatePendingCount();
      return result;
    } finally {
      setIsSyncing(false);
    }
  }, [session, isOnline, isSyncing, updatePendingCount]);

  // Auto-sync when coming back online
  useEffect(() => {
    if (wasOffline && isOnline && session) {
      console.log('🔄 Auto-syncing after coming back online...');
      syncNow();
    }
  }, [wasOffline, isOnline, session, syncNow]);

  // Listen for queue updates
  useEffect(() => {
    const handleQueueUpdate = () => {
      updatePendingCount();
    };

    window.addEventListener('offline-queue-updated', handleQueueUpdate);
    
    // Initial count
    updatePendingCount();

    return () => {
      window.removeEventListener('offline-queue-updated', handleQueueUpdate);
    };
  }, [updatePendingCount]);

  // Listen for network online event and trigger sync
  useEffect(() => {
    const handleNetworkOnline = () => {
      if (session) {
        setTimeout(() => syncNow(), 1000); // Small delay to ensure connection is stable
      }
    };

    window.addEventListener('network-online', handleNetworkOnline);
    return () => window.removeEventListener('network-online', handleNetworkOnline);
  }, [session, syncNow]);

  return {
    isSyncing,
    pendingCount,
    lastSyncResult,
    syncNow
  };
}
