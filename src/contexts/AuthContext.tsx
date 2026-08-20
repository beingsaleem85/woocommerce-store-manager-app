import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { wpRequest } from '@/lib/wp-request';
import { wpAuthedRequest, WordPressAuthSession } from '@/lib/wp-authed-request';
import { WCUser, LoginResponse } from '@/types/woocommerce';

export interface SavedStore {
  url: string;
  name: string;
  username: string;
  lastUsed: number;
}

interface AuthContextType {
  user: WCUser | null;
  session: WordPressAuthSession | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  savedStores: SavedStore[];
  login: (storeUrl: string, username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  removeSavedStore: (url: string) => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    // Return a safe default instead of throwing during initialization
    return {
      user: null,
      session: null,
      isLoading: true,
      isAuthenticated: false,
      savedStores: [],
      login: async () => { throw new Error('AuthProvider not initialized'); },
      logout: async () => { throw new Error('AuthProvider not initialized'); },
      removeSavedStore: () => { throw new Error('AuthProvider not initialized'); },
    };
  }
  return context;
}

interface AuthProviderProps {
  children: ReactNode;
}

const SAVED_STORES_KEY = 'wc_saved_stores';
const SESSION_KEY = 'wp_session';

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<WCUser | null>(null);
  const [session, setSession] = useState<WordPressAuthSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [savedStores, setSavedStores] = useState<SavedStore[]>([]);

  // Load saved stores and restore session on mount
  useEffect(() => {
    // Load saved stores
    const storedStores = localStorage.getItem(SAVED_STORES_KEY);
    if (storedStores) {
      try {
        const parsed = JSON.parse(storedStores);
        setSavedStores(parsed);
      } catch {
        localStorage.removeItem(SAVED_STORES_KEY);
      }
    }

    // Restore session
    const stored = localStorage.getItem(SESSION_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        validateSession(parsed);
      } catch {
        localStorage.removeItem(SESSION_KEY);
        setIsLoading(false);
      }
    } else {
      setIsLoading(false);
    }
  }, []);

  async function validateSession(storedSession: { session: WordPressAuthSession; user: WCUser }) {
    try {
      const me = await wpAuthedRequest<{ user: WCUser }>(
        '/sticklight/v1/auth/me',
        storedSession.session
      );
      setUser(me.user);
      setSession(storedSession.session);
    } catch {
      localStorage.removeItem(SESSION_KEY);
      setUser(null);
      setSession(null);
    } finally {
      setIsLoading(false);
    }
  }

  function saveStore(storeUrl: string, username: string, storeName?: string) {
    const cleanUrl = storeUrl.replace(/\/$/, '');
    const existingIndex = savedStores.findIndex(s => s.url === cleanUrl);
    
    const newStore: SavedStore = {
      url: cleanUrl,
      name: storeName || new URL(cleanUrl).hostname,
      username,
      lastUsed: Date.now(),
    };

    let updated: SavedStore[];
    if (existingIndex >= 0) {
      updated = [...savedStores];
      updated[existingIndex] = newStore;
    } else {
      updated = [newStore, ...savedStores].slice(0, 10); // Keep max 10 stores
    }

    // Sort by last used
    updated.sort((a, b) => b.lastUsed - a.lastUsed);
    
    setSavedStores(updated);
    localStorage.setItem(SAVED_STORES_KEY, JSON.stringify(updated));
  }

  function removeSavedStore(url: string) {
    const updated = savedStores.filter(s => s.url !== url);
    setSavedStores(updated);
    localStorage.setItem(SAVED_STORES_KEY, JSON.stringify(updated));
  }

  async function login(storeUrl: string, username: string, password: string) {
    const cleanUrl = storeUrl.replace(/\/$/, '');
    
    const response = await wpRequest<LoginResponse>(cleanUrl, '/sticklight/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });

    const newSession: WordPressAuthSession = {
      storeUrl: cleanUrl,
      username: response.user.username,
      appPassword: response.app_password,
    };

    setUser(response.user);
    setSession(newSession);
    localStorage.setItem(SESSION_KEY, JSON.stringify({ session: newSession, user: response.user }));

    // Save this store for quick access
    saveStore(cleanUrl, response.user.username, response.user.display_name ? `${response.user.display_name}'s Store` : undefined);
  }

  async function logout() {
    try {
      if (session) {
        await wpAuthedRequest('/sticklight/v1/auth/logout', session, {
          method: 'POST',
        });
      }
    } finally {
      setUser(null);
      setSession(null);
      localStorage.removeItem(SESSION_KEY);
    }
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        isLoading,
        isAuthenticated: !!user && !!session,
        savedStores,
        login,
        logout,
        removeSavedStore,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
