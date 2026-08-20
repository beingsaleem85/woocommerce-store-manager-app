/**
 * Sync Status Component
 * Shows detailed sync status in settings or header
 */

import { useState, useEffect } from 'react';
import { useOfflineSync } from '@/hooks/useOfflineSync';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { getPendingOperations, PendingOperation, clearAllOperations } from '@/lib/offline-queue';
import { Cloud, CloudOff, RefreshCw, Trash2, Clock, Check, X } from 'lucide-react';

export function SyncStatus() {
  const { isOnline } = useNetworkStatus();
  const { isSyncing, pendingCount, syncNow } = useOfflineSync();
  const [operations, setOperations] = useState<PendingOperation[]>([]);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    async function loadOperations() {
      const ops = await getPendingOperations();
      setOperations(ops);
    }
    loadOperations();

    const handleUpdate = () => loadOperations();
    window.addEventListener('offline-queue-updated', handleUpdate);
    return () => window.removeEventListener('offline-queue-updated', handleUpdate);
  }, []);

  async function handleClearAll() {
    if (confirm('Are you sure you want to discard all pending changes? This cannot be undone.')) {
      await clearAllOperations();
    }
  }

  function formatTime(timestamp: number) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  return (
    <div data-ev-id="ev_fbceabade1" className="rounded-xl bg-card border border-border overflow-hidden">
      {/* Header */}
      <button data-ev-id="ev_8be4ada895"
      onClick={() => setShowDetails(!showDetails)}
      className="w-full flex items-center justify-between p-4 hover:bg-muted/50 transition-colors">

        <div data-ev-id="ev_1af4850e7b" className="flex items-center gap-3">
          {isOnline ?
          <div data-ev-id="ev_f7d75b52dd" className="p-2 rounded-lg bg-green-500/10">
              <Cloud className="w-5 h-5 text-green-600" />
            </div> :

          <div data-ev-id="ev_14f7b03870" className="p-2 rounded-lg bg-orange-500/10">
              <CloudOff className="w-5 h-5 text-orange-600" />
            </div>
          }
          <div data-ev-id="ev_5452a02242" className="text-left">
            <p data-ev-id="ev_6f4b21db2a" className="font-medium text-foreground">
              {isOnline ? 'Online' : 'Offline'}
            </p>
            <p data-ev-id="ev_ccd9d31089" className="text-sm text-muted-foreground">
              {pendingCount === 0 ?
              'All changes synced' :
              `${pendingCount} pending changes`}
            </p>
          </div>
        </div>
        {isSyncing && <RefreshCw className="w-5 h-5 text-primary animate-spin" />}
      </button>

      {/* Details */}
      {showDetails && operations.length > 0 &&
      <div data-ev-id="ev_a6a207b5fd" className="border-t border-border">
          <div data-ev-id="ev_e70fba6470" className="p-3 bg-muted/30 flex items-center justify-between">
            <span data-ev-id="ev_da326a239f" className="text-sm font-medium text-muted-foreground">Pending Operations</span>
            <div data-ev-id="ev_290428f782" className="flex gap-2">
              <button data-ev-id="ev_17918c94b2"
            onClick={() => syncNow()}
            disabled={!isOnline || isSyncing}
            className="flex items-center gap-1 px-2 py-1 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed">

                <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} />
                Sync
              </button>
              <button data-ev-id="ev_820c12ee69"
            onClick={handleClearAll}
            className="flex items-center gap-1 px-2 py-1 text-xs bg-red-500/10 text-red-600 rounded hover:bg-red-500/20">

                <Trash2 className="w-3 h-3" />
                Clear
              </button>
            </div>
          </div>
          <div data-ev-id="ev_d7088cd908" className="divide-y divide-border max-h-48 overflow-y-auto">
            {operations.map((op) =>
          <div data-ev-id="ev_0098ade5c7" key={op.id} className="p-3 flex items-center justify-between">
                <div data-ev-id="ev_241c6ca083" className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  <div data-ev-id="ev_dca69448cc">
                    <p data-ev-id="ev_09f10c92d6" className="text-sm text-foreground">{op.description}</p>
                    <p data-ev-id="ev_427a4ce2da" className="text-xs text-muted-foreground">{formatTime(op.timestamp)}</p>
                  </div>
                </div>
                {op.retries > 0 &&
            <span data-ev-id="ev_19a80835b8" className="text-xs text-orange-600 bg-orange-500/10 px-2 py-0.5 rounded">
                    {op.retries} retries
                  </span>
            }
              </div>
          )}
          </div>
        </div>
      }
    </div>);

}
