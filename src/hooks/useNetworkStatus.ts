/**
 * Network Status Hook
 * Detects online/offline status and connection quality
 */

import { useState, useEffect, useCallback } from 'react';

export interface NetworkStatus {
  isOnline: boolean;
  wasOffline: boolean; // True if was offline and just came back
  connectionType: string | null;
}

export function useNetworkStatus(): NetworkStatus {
  const [isOnline, setIsOnline] = useState(() => 
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [wasOffline, setWasOffline] = useState(false);
  const [connectionType, setConnectionType] = useState<string | null>(null);

  const updateConnectionType = useCallback(() => {
    // @ts-ignore - Network Information API
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (connection) {
      setConnectionType(connection.effectiveType || connection.type || null);
    }
  }, []);

  useEffect(() => {
    const handleOnline = () => {
      console.log('🌐 Network: Back online');
      setWasOffline(true);
      setIsOnline(true);
      updateConnectionType();
      
      // Dispatch custom event for sync manager
      window.dispatchEvent(new CustomEvent('network-online'));
      
      // Reset wasOffline after a short delay
      setTimeout(() => setWasOffline(false), 5000);
    };

    const handleOffline = () => {
      console.log('📴 Network: Went offline');
      setIsOnline(false);
      
      // Dispatch custom event
      window.dispatchEvent(new CustomEvent('network-offline'));
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    // Listen for connection changes
    // @ts-ignore
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (connection) {
      connection.addEventListener('change', updateConnectionType);
      updateConnectionType();
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (connection) {
        connection.removeEventListener('change', updateConnectionType);
      }
    };
  }, [updateConnectionType]);

  return { isOnline, wasOffline, connectionType };
}
