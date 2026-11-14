export interface OptimizedImage {
  dataUrl: string;
  width: number;
  height: number;
  sizeKb: number;
}

/** Resize and compress uploads before storing them in the local demo workspace. */
export function optimizeImageUpload(file: File, maxEdge = 1440): Promise<OptimizedImage> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('Please select an image file.'));
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
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        resolve({
          dataUrl,
          width,
          height,
          sizeKb: Math.max(1, Math.round((dataUrl.length * 3) / 4 / 1024)),
        });
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
