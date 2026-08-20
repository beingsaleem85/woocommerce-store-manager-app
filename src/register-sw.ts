/**
 * Service Worker Registration
 */

export async function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/',
      });

      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // New content is available, show update notification
              console.log('📦 New version available! Refresh to update.');
              window.dispatchEvent(new CustomEvent('sw-update-available'));
            }
          });
        }
      });

      console.log('✅ Service Worker registered successfully');
      return registration;
    } catch (error) {
      console.error('❌ Service Worker registration failed:', error);
      return null;
    }
  }
  return null;
}

export async function unregisterServiceWorker() {
  if ('serviceWorker' in navigator) {
    const registration = await navigator.serviceWorker.ready;
    await registration.unregister();
    console.log('Service Worker unregistered');
  }
}
