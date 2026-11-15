export interface OptimizedImage {
  blob: Blob;
  mimeType: string;
  dataUrl: string;
  width: number;
  height: number;
  sizeKb: number;
}

/** Resize and compress uploads client-side before sending binary bytes to Cloudflare R2. */
export function optimizeImageUpload(file: File, maxEdge = 1600): Promise<OptimizedImage> {
  return new Promise((resolve, reject) => {
    const isSvg =
      file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg');
    if (isSvg) {
      if (file.size > 512 * 1024) {
        reject(new Error('SVG logo must be 512 KB or smaller.'));
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = typeof reader.result === 'string' ? reader.result : '';
        resolve({
          blob: file,
          mimeType: 'image/svg+xml',
          dataUrl,
          width: 256,
          height: 256,
          sizeKb: Math.max(1, Math.round(file.size / 1024)),
        });
      };
      reader.onerror = () => reject(new Error('Failed to read SVG file.'));
      reader.readAsDataURL(file);
      return;
    }

    if (!file.type.startsWith('image/')) {
      reject(new Error('Please select a valid image file (PNG, JPG, JPEG, WebP, AVIF, or SVG).'));
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      reject(new Error('Image is too large. Choose a file under 15 MB.'));
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      try {
        const scale = Math.min(1, maxEdge / Math.max(image.naturalWidth, image.naturalHeight));
        const width = Math.max(1, Math.round(image.naturalWidth * scale));
        const height = Math.max(1, Math.round(image.naturalHeight * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Your browser could not process this image.');
        context.drawImage(image, 0, 0, width, height);

        const outputType =
          file.type === 'image/png' || file.type === 'image/webp' ? file.type : 'image/jpeg';
        const dataUrl = canvas.toDataURL(outputType, 0.85);

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Failed to encode image for upload.'));
              return;
            }
            if (blob.size > 5 * 1024 * 1024) {
              reject(new Error('Compressed image still exceeds 5 MB. Please choose a smaller photo.'));
              return;
            }
            resolve({
              blob,
              mimeType: blob.type || outputType,
              dataUrl,
              width,
              height,
              sizeKb: Math.max(1, Math.round(blob.size / 1024)),
            });
          },
          outputType,
          0.85
        );
      } catch (error) {
        reject(error instanceof Error ? error : new Error('Image processing failed.'));
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('The selected image could not be opened.'));
    };
    image.src = objectUrl;
  });
}
