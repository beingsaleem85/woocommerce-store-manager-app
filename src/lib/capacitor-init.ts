/**
 * Capacitor Initialization
 * Handles native app initialization for Android/iOS
 */

import { Capacitor } from '@capacitor/core';
import { SplashScreen } from '@capacitor/splash-screen';
import { App } from '@capacitor/app';

/**
 * Initialize Capacitor plugins and native app features
 * Call this once at app startup
 */
export async function initializeCapacitor(): Promise<void> {
  // Only run on native platforms
  if (!Capacitor.isNativePlatform()) {
    console.log('📱 Running in browser mode');
    return;
  }

  console.log('📱 Initializing Capacitor for', Capacitor.getPlatform());

  try {
    // Hide splash screen after app is ready
    await SplashScreen.hide();
    console.log('✅ Splash screen hidden');
  } catch (error) {
    console.warn('⚠️ Could not hide splash screen:', error);
  }

  // Handle app state changes (background/foreground)
  App.addListener('appStateChange', ({ isActive }) => {
    console.log('📱 App state changed:', isActive ? 'active' : 'inactive');
    
    if (isActive) {
      // App came to foreground - could trigger data refresh here
      window.dispatchEvent(new CustomEvent('app-resumed'));
    } else {
      // App went to background
      window.dispatchEvent(new CustomEvent('app-paused'));
    }
  });

  // Handle back button on Android
  App.addListener('backButton', ({ canGoBack }) => {
    if (canGoBack) {
      window.history.back();
    } else {
      // At root - minimize app instead of closing
      App.minimizeApp();
    }
  });

  // Handle deep links
  App.addListener('appUrlOpen', (event) => {
    console.log('📱 Deep link opened:', event.url);
    // Handle deep links here if needed
    window.dispatchEvent(new CustomEvent('deep-link', { detail: event.url }));
  });

  console.log('✅ Capacitor initialization complete');
}

/**
 * Clean up Capacitor listeners
 * Call this on app unmount if needed
 */
export async function cleanupCapacitor(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  
  try {
    await App.removeAllListeners();
    console.log('🧹 Capacitor listeners cleaned up');
  } catch (error) {
    console.warn('⚠️ Could not clean up Capacitor listeners:', error);
  }
}

/**
 * Check if running as a native app
 */
export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

/**
 * Get the current platform
 */
export function getPlatform(): string {
  return Capacitor.getPlatform();
}
