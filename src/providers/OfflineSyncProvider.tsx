/**
 * Offline Sync Provider
 * Provides offline sync context and background sync capabilities
 */

import { createContext, useContext, ReactNode, useEffect, useCallback, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { syncAllOperations, SyncResult, registerBackgroundSync } from '@/lib/sync-manager';
import { getPendingCount, hasPendingOperations } from '@/lib/offline-queue';

interface OfflineSyncContextType {
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  lastSyncResult: SyncResult | null;
  syncNow: () => Promise<void>;
}

const OfflineSyncContext = createContext<OfflineSyncContextType | null>(null);

export function useOfflineSyncContext() {
  const context = useContext(OfflineSyncContext);
  if (!context) {
    throw new Error('useOfflineSyncContext must be used within OfflineSyncProvider');
  }
  return context;
}

interface OfflineSyncProviderProps {
  children: ReactNode;
}

export function OfflineSyncProvider({ children }: OfflineSyncProviderProps) {
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
  const syncNow = useCallback(async () => {
    if (!session || !isOnline || isSyncing) return;

    const hasPending = await hasPendingOperations();
    if (!hasPending) return;

    setIsSyncing(true);
    try {
      const result = await syncAllOperations(session);
      setLastSyncResult(result);
      await updatePendingCount();
    } finally {
      setIsSyncing(false);
    }
  }, [session, isOnline, isSyncing, updatePendingCount]);

  // Auto-sync when coming back online
  useEffect(() => {
    if (wasOffline && isOnline && session) {
      console.log('🔄 Auto-syncing after coming back online...');
      // Small delay to ensure connection is stable
      const timer = setTimeout(() => syncNow(), 1500);
      return () => clearTimeout(timer);
    }
  }, [wasOffline, isOnline, session, syncNow]);

  // Listen for queue updates
  useEffect(() => {
    const handleQueueUpdate = () => updatePendingCount();
    window.addEventListener('offline-queue-updated', handleQueueUpdate);
    updatePendingCount();
    return () => window.removeEventListener('offline-queue-updated', handleQueueUpdate);
  }, [updatePendingCount]);

  // Register background sync on mount
  useEffect(() => {
    registerBackgroundSync();
  }, []);

  return (
    <OfflineSyncContext.Provider
      value={{
        isOnline,
        isSyncing,
        pendingCount,
        lastSyncResult,
        syncNow,
      }}
    >
      {children}
    </OfflineSyncContext.Provider>
  );
}
