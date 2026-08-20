/**
 * Image Resize Utility
 * Resizes images to specified dimensions before upload
 */

export interface ResizeOptions {
  maxWidth: number;
  maxHeight: number;
  quality?: number; // 0-1, default 0.85
  format?: 'image/jpeg' | 'image/png' | 'image/webp';
}

// Default product image size
export const PRODUCT_IMAGE_SIZE: ResizeOptions = {
  maxWidth: 600,
  maxHeight: 600,
  quality: 0.85,
  format: 'image/jpeg',
};

/**
 * Resize an image file to specified dimensions
 * Maintains aspect ratio and centers the image
 */
export function resizeImage(
  file: File,
  options: ResizeOptions = PRODUCT_IMAGE_SIZE
): Promise<File> {
  return new Promise((resolve, reject) => {
    const { maxWidth, maxHeight, quality = 0.85, format = 'image/jpeg' } = options;

    // Create image element
    const img = new window.Image();
    img.onload = () => {
      try {
        // Calculate new dimensions maintaining aspect ratio
        let { width, height } = img;
        
        // Scale down if larger than max dimensions
        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        // Create canvas
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        // Draw image
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Could not get canvas context'));
          return;
        }

        // Use better image smoothing
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        // Fill with white background (for transparent PNGs converted to JPEG)
        if (format === 'image/jpeg') {
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, width, height);
        }

        // Draw the image
        ctx.drawImage(img, 0, 0, width, height);

        // Convert to blob
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Could not create image blob'));
              return;
            }

            // Create new file with original name but new extension if format changed
            const extension = format === 'image/jpeg' ? '.jpg' : format === 'image/png' ? '.png' : '.webp';
            const baseName = file.name.replace(/\.[^.]+$/, '');
            const newFileName = `${baseName}${extension}`;

            const resizedFile = new File([blob], newFileName, {
              type: format,
              lastModified: Date.now(),
            });

            resolve(resizedFile);
          },
          format,
          quality
        );
      } catch (err) {
        reject(err);
      }
    };

    img.onerror = () => {
      reject(new Error('Failed to load image'));
    };

    // Load image from file
    img.src = URL.createObjectURL(file);
  });
}

/**
 * Resize multiple images
 */
export async function resizeImages(
  files: File[],
  options: ResizeOptions = PRODUCT_IMAGE_SIZE,
  onProgress?: (completed: number, total: number) => void
): Promise<File[]> {
  const results: File[] = [];
  
  for (let i = 0; i < files.length; i++) {
    const resized = await resizeImage(files[i], options);
    results.push(resized);
    onProgress?.(i + 1, files.length);
  }
  
  return results;
}
