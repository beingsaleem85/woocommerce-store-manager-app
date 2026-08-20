import { type ReactNode } from 'react';
import { AuthProvider } from '@/contexts/AuthContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { OfflineSyncProvider } from '@/providers/OfflineSyncProvider';

/**
 * ⚠️ App-wide providers. Add new providers here — they'll be available in all routes.
 * Providers MUST wrap <BrowserRouter> to be accessible everywhere.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <AuthProvider>
        <OfflineSyncProvider>
          {children}
        </OfflineSyncProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
