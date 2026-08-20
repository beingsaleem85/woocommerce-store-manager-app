/**
 * Offline Indicator Component
 * Shows network status and pending sync count
 */

import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { useOfflineSync } from '@/hooks/useOfflineSync';
import { Wifi, WifiOff, CloudOff, RefreshCw, Check, AlertCircle } from 'lucide-react';

export function OfflineIndicator() {
  const { isOnline, wasOffline } = useNetworkStatus();
  const { isSyncing, pendingCount, lastSyncResult, syncNow } = useOfflineSync();

  // Don't show anything if online with no pending operations
  if (isOnline && pendingCount === 0 && !isSyncing && !wasOffline) {
    return null;
  }

  return (
    <div data-ev-id="ev_120f5c7e12" className="fixed top-0 left-0 right-0 z-50 safe-area-top">
      {/* Offline Banner */}
      {!isOnline &&
      <div data-ev-id="ev_b6ac7c64ad" className="bg-orange-500 text-white px-4 py-2 flex items-center justify-center gap-2 text-sm font-medium">
          <WifiOff className="w-4 h-4" />
          <span data-ev-id="ev_fbf81ae964">You're offline. Changes will sync when connected.</span>
        </div>
      }

      {/* Syncing Banner */}
      {isOnline && isSyncing &&
      <div data-ev-id="ev_0b7471ab15" className="bg-blue-500 text-white px-4 py-2 flex items-center justify-center gap-2 text-sm font-medium">
          <RefreshCw className="w-4 h-4 animate-spin" />
          <span data-ev-id="ev_c8e16db582">Syncing {pendingCount} pending changes...</span>
        </div>
      }

      {/* Back Online Banner */}
      {wasOffline && isOnline && !isSyncing && pendingCount === 0 &&
      <div data-ev-id="ev_3a1c7ae7cc" className="bg-green-500 text-white px-4 py-2 flex items-center justify-center gap-2 text-sm font-medium animate-pulse">
          <Check className="w-4 h-4" />
          <span data-ev-id="ev_ad7e582ef8">Back online! All changes synced.</span>
        </div>
      }

      {/* Pending Operations Banner (when online but has pending) */}
      {isOnline && !isSyncing && pendingCount > 0 &&
      <div data-ev-id="ev_e662565c57" className="bg-yellow-500 text-white px-4 py-2 flex items-center justify-between text-sm font-medium">
          <div data-ev-id="ev_5da8b2b5c8" className="flex items-center gap-2">
            <CloudOff className="w-4 h-4" />
            <span data-ev-id="ev_adbeeecd78">{pendingCount} pending changes</span>
          </div>
          <button data-ev-id="ev_393bf71398"
        onClick={() => syncNow()}
        className="flex items-center gap-1 px-2 py-1 bg-white/20 rounded hover:bg-white/30 transition-colors">

            <RefreshCw className="w-3 h-3" />
            Sync Now
          </button>
        </div>
      }

      {/* Sync Error Banner */}
      {lastSyncResult && !lastSyncResult.success && !isSyncing &&
      <div data-ev-id="ev_ebe8b2a186" className="bg-red-500 text-white px-4 py-2 flex items-center justify-center gap-2 text-sm font-medium">
          <AlertCircle className="w-4 h-4" />
          <span data-ev-id="ev_da7fa828e7">{lastSyncResult.failed} changes failed to sync</span>
        </div>
      }
    </div>);

}
