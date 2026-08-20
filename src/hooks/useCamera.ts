/**
 * Camera Hook for Capacitor
 * Provides camera access for product photos
 */

import { useState, useCallback } from 'react';

// Capacitor imports (will be available when running in native app)
let Camera: typeof import('@capacitor/camera').Camera | null = null;
let CameraResultType: typeof import('@capacitor/camera').CameraResultType | null = null;
let CameraSource: typeof import('@capacitor/camera').CameraSource | null = null;

// Dynamic import for Capacitor camera
try {
  const cameraModule = require('@capacitor/camera');
  Camera = cameraModule.Camera;
  CameraResultType = cameraModule.CameraResultType;
  CameraSource = cameraModule.CameraSource;
} catch (e) {
  console.log('Camera module not available (web mode)');
}

export interface CameraState {
  isAvailable: boolean;
  isCapturing: boolean;
  takePhoto: () => Promise<string | null>;
  pickFromGallery: () => Promise<string | null>;
}

export function useCamera(): CameraState {
  const [isCapturing, setIsCapturing] = useState(false);
  
  const isAvailable = Camera !== null;

  const takePhoto = useCallback(async (): Promise<string | null> => {
    if (!Camera || !CameraResultType || !CameraSource) {
      // Fallback to file input for web
      return new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.capture = 'environment';
        input.onchange = (e) => {
          const file = (e.target as HTMLInputElement).files?.[0];
          if (file) {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.readAsDataURL(file);
          } else {
            resolve(null);
          }
        };
        input.click();
      });
    }

    setIsCapturing(true);
    try {
      const photo = await Camera.getPhoto({
        quality: 80,
        allowEditing: false,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Camera,
        width: 1200,
        height: 1200,
        correctOrientation: true
      });
      return photo.dataUrl || null;
    } catch (error) {
      console.error('Camera error:', error);
      return null;
    } finally {
      setIsCapturing(false);
    }
  }, []);

  const pickFromGallery = useCallback(async (): Promise<string | null> => {
    if (!Camera || !CameraResultType || !CameraSource) {
      // Fallback to file input for web
      return new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = (e) => {
          const file = (e.target as HTMLInputElement).files?.[0];
          if (file) {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.readAsDataURL(file);
          } else {
            resolve(null);
          }
        };
        input.click();
      });
    }

    setIsCapturing(true);
    try {
      const photo = await Camera.getPhoto({
        quality: 80,
        allowEditing: false,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Photos,
        width: 1200,
        height: 1200
      });
      return photo.dataUrl || null;
    } catch (error) {
      console.error('Gallery error:', error);
      return null;
    } finally {
      setIsCapturing(false);
    }
  }, []);

  return {
    isAvailable,
    isCapturing,
    takePhoto,
    pickFromGallery
  };
}
