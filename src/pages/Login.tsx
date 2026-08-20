import { useState, FormEvent, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { useAuth, SavedStore } from '@/contexts/AuthContext';
import { Loader2, Store, AlertCircle, Globe, ChevronRight, X, Plus, Fingerprint, ShieldCheck } from 'lucide-react';
import { NativeBiometric } from '@capgo/capacitor-native-biometric';

export default function Login() {
  const [storeUrl, setStoreUrl] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showNewStore, setShowNewStore] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [storeCredentialsSaved, setStoreCredentialsSaved] = useState<Record<string, boolean>>({});
  const [pendingBiometricSetup, setPendingBiometricSetup] = useState<{
    storeUrl: string;
    username: string;
    password: string;
  } | null>(null);
  const [isSavingBiometric, setIsSavingBiometric] = useState(false);

  const { login, savedStores, removeSavedStore } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/dashboard';

  // Check biometric availability once on mount
  useEffect(() => {
    async function checkBiometric() {
      try {
        const result = await NativeBiometric.isAvailable();
        setBiometricAvailable(result.isAvailable);
      } catch (e) {
        console.log('Biometric not available', e);
      }
    }
    checkBiometric();
  }, []);

  // Check which stores have saved credentials whenever savedStores changes
  useEffect(() => {
    async function checkSavedCredentials() {
      if (savedStores.length === 0) return;
      try {
        const savedStatus: Record<string, boolean> = {};
        for (const store of savedStores) {
          try {
            const hasCreds = await NativeBiometric.isCredentialsSaved({ server: store.url });
            savedStatus[store.url] = hasCreds.isSaved;
          } catch (e) {
            savedStatus[store.url] = false;
          }
        }
        setStoreCredentialsSaved(savedStatus);
      } catch (e) {
        console.log('Credential check failed', e);
      }
    }
    checkSavedCredentials();
  }, [savedStores]);

  // Refresh credential status for a specific store (called after enabling biometrics)
  async function refreshCredentialStatus(storeUrl: string) {
    try {
      const hasCreds = await NativeBiometric.isCredentialsSaved({ server: storeUrl });
      setStoreCredentialsSaved(prev => ({ ...prev, [storeUrl]: hasCreds.isSaved }));
    } catch (e) {
      // ignore
    }
  }

  async function handleBiometricLogin(storeUrl: string) {
    try {
      setIsSubmitting(true);
      setError('');
      // Step 1: Show system biometric prompt to verify identity
      await NativeBiometric.verifyIdentity({
        reason: 'Verify your identity to login',
        title: 'Biometric Login',
        subtitle: 'Use your biometric to sign in',
        negativeButtonText: 'Cancel',
      });
      // Step 2: Identity verified — retrieve saved credentials
      const credentials = await NativeBiometric.getCredentials({ server: storeUrl });
      if (credentials && credentials.username && credentials.password) {
        await login(storeUrl, credentials.username, credentials.password);
        navigate(from, { replace: true });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.toLowerCase().includes('cancel')) {
        setError('Biometric authentication failed. Please enter your password manually.');
      }
      const store = savedStores.find(s => s.url === storeUrl);
      if (store) {
        setStoreUrl(store.url);
        setUsername(store.username);
        setShowNewStore(true);
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleEnableBiometric() {
    if (!pendingBiometricSetup) return;
    setIsSavingBiometric(true);
    try {
      // Step 1: Verify identity via system biometric prompt
      await NativeBiometric.verifyIdentity({
        reason: 'Verify your identity to enable biometric login',
        title: 'Enable Biometric Login',
        subtitle: 'Biometric verification required',
        negativeButtonText: 'Cancel',
      });
      // Step 2: Verified — now save credentials securely
      await NativeBiometric.setCredentials({
        username: pendingBiometricSetup.username,
        password: pendingBiometricSetup.password,
        server: pendingBiometricSetup.storeUrl,
      });
      // Step 3: Refresh credential status then navigate to app
      await refreshCredentialStatus(pendingBiometricSetup.storeUrl);
      setPendingBiometricSetup(null);
      navigate(from, { replace: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // If user cancelled, just stay on screen silently
      if (!msg.toLowerCase().includes('cancel')) {
        console.error('Failed to save biometric credentials', e);
      }
      // Stay on biometric prompt screen so user can retry or skip
    } finally {
      setIsSavingBiometric(false);
    }
  }

  function handleSkipBiometric() {
    setPendingBiometricSetup(null);
    navigate(from, { replace: true });
  }

  function handleSelectStore(store: SavedStore) {
    setStoreUrl(store.url);
    setUsername(store.username);
    setPassword('');
    setShowNewStore(true);
    setError('');
  }

  function handleNewStore() {
    setStoreUrl('');
    setUsername('');
    setPassword('');
    setShowNewStore(true);
    setError('');
  }

  function normalizeUrl(url: string): string {
    let normalized = url.trim();
    if (!normalized) return '';
    if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
      normalized = `https://${normalized}`;
    }
    normalized = normalized.replace(/\/$/, '');
    return normalized;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

    const normalizedUrl = normalizeUrl(storeUrl);
    if (!normalizedUrl) {
      setError('Please enter your store URL');
      return;
    }

    setIsSubmitting(true);

    try {
      await login(normalizedUrl, username, password);

      // After successful login, check if biometric available and creds not already saved
      if (biometricAvailable) {
        let alreadySaved = false;
        try {
          const check = await NativeBiometric.isCredentialsSaved({ server: normalizedUrl });
          alreadySaved = check.isSaved;
        } catch (_) {}

        if (!alreadySaved) {
          setPendingBiometricSetup({ storeUrl: normalizedUrl, username, password });
          return;
        }
      }

      navigate(from, { replace: true });
    } catch (err) {
      if (err instanceof Error) {
        if (err.message.includes('Failed to fetch') || err.message.includes('NetworkError')) {
          setError('Could not connect to the store. Make sure the URL is correct and the Sticklight Connector plugin is installed.');
        } else {
          setError(err.message);
        }
      } else {
        setError('Login failed. Please check your credentials.');
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  const showStoresList = savedStores.length > 0 && !showNewStore;

  // ── Biometric Enable Prompt Screen ──────────────────────────────────────────
  if (pendingBiometricSetup) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-sm flex flex-col items-center text-center gap-6">

          {/* Icon */}
          <div className="relative">
            <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center">
              <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center">
                <Fingerprint className="w-10 h-10 text-primary" />
              </div>
            </div>
            <div className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-green-500 flex items-center justify-center border-2 border-background">
              <ShieldCheck className="w-4 h-4 text-white" />
            </div>
          </div>

          {/* Text */}
          <div className="flex flex-col gap-2">
            <h2 className="text-2xl font-bold text-foreground">Enable Biometric Login?</h2>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Use your fingerprint or face ID to login faster next time — no need to enter your password again.
            </p>
          </div>

          {/* Buttons */}
          <div className="w-full flex flex-col gap-3 mt-2">
            <button
              onClick={handleEnableBiometric}
              disabled={isSavingBiometric}
              className="w-full py-3.5 px-4 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 disabled:opacity-60 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              {isSavingBiometric ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Enabling...
                </>
              ) : (
                <>
                  <Fingerprint className="w-5 h-5" />
                  Enable Biometric Login
                </>
              )}
            </button>

            <button
              onClick={handleSkipBiometric}
              disabled={isSavingBiometric}
              className="w-full py-3.5 px-4 rounded-xl border border-border text-muted-foreground font-medium hover:bg-muted hover:text-foreground disabled:opacity-60 transition-colors"
            >
              Maybe Later
            </button>
          </div>

          <p className="text-xs text-muted-foreground">
            Your credentials are stored securely on this device only.
          </p>
        </div>
      </div>
    );
  }

  // ── Main Login UI ────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary mb-4">
            <Store className="w-8 h-8 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">WooCommerce Manager</h1>
          <p className="text-muted-foreground mt-1">
            {showStoresList ? 'Select a store to continue' : 'Connect to your WooCommerce store'}
          </p>
        </div>

        {showStoresList ? (
          /* Saved Stores List */
          <div className="flex flex-col gap-3">
            {savedStores.map((store) => (
              <div key={store.url} className="relative group">
                <button
                  onClick={() => handleSelectStore(store)}
                  className="w-full flex items-center gap-3 p-4 rounded-xl border border-border bg-card hover:border-primary/50 transition-colors text-left"
                >
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Globe className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground truncate">{store.name}</p>
                    <p className="text-sm text-muted-foreground truncate">{store.url.replace(/^https?:\/\//, '')}</p>
                  </div>

                  {storeCredentialsSaved[store.url] ? (
                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        handleBiometricLogin(store.url);
                      }}
                      className="p-2 mr-1 rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                      title="Login with Biometrics"
                    >
                      <Fingerprint className="w-5 h-5" />
                    </div>
                  ) : null}
                  <ChevronRight className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeSavedStore(store.url);
                    if (biometricAvailable) {
                      NativeBiometric.deleteCredentials({ server: store.url }).catch(() => {});
                    }
                  }}
                  className="absolute top-2 right-2 p-1.5 rounded-lg bg-background/80 opacity-0 group-hover:opacity-100 hover:bg-muted transition-all"
                  title="Remove store"
                >
                  <X className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>
            ))}

            <button
              onClick={handleNewStore}
              className="flex items-center justify-center gap-2 p-4 rounded-xl border border-dashed border-border hover:border-primary/50 hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground"
            >
              <Plus className="w-5 h-5" />
              <span className="font-medium">Connect New Store</span>
            </button>
          </div>
        ) : (
          /* Login Form */
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {error && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-600">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <p className="text-sm">{error}</p>
              </div>
            )}

            <div>
              <label htmlFor="storeUrl" className="block text-sm font-medium text-foreground mb-1.5">
                Store URL
              </label>
              <div className="relative">
                <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <input
                  id="storeUrl"
                  type="text"
                  value={storeUrl}
                  onChange={(e) => setStoreUrl(e.target.value)}
                  required
                  autoComplete="url"
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-shadow"
                  placeholder="yourstore.com"
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1.5">
                Enter your WooCommerce store URL
              </p>
            </div>

            <div>
              <label htmlFor="username" className="block text-sm font-medium text-foreground mb-1.5">
                Username or email
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoComplete="username"
                className="w-full px-4 py-3 rounded-xl border border-border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-shadow"
                placeholder="Enter your username"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-foreground mb-1.5">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="w-full px-4 py-3 rounded-xl border border-border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-shadow"
                placeholder="Enter your password"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3 px-4 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2 mt-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Connecting...
                </>
              ) : (
                'Connect Store'
              )}
            </button>

            {savedStores.length > 0 && (
              <button
                type="button"
                onClick={() => setShowNewStore(false)}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                ← Back to saved stores
              </button>
            )}
          </form>
        )}

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground mt-8">
          Requires the Sticklight Connector plugin installed on your WordPress site
        </p>
      </div>
    </div>
  );
}
