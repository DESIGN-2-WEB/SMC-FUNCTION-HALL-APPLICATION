/**
 * Photos are shrunk in the browser before upload, so a phone picture of several MB becomes a
 * small JPEG: a larger one to show the customer and a small one for lists.
 */
function shrink(img, maxSide, quality) {
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff'; // transparent PNGs get a white background in the JPEG
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', quality);
}

/** Read a picked image file and return { photo, thumb } as JPEG image data. */
export function makePhoto(file) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\//.test(file.type)) return reject(new Error('Pick a photo (JPG, PNG or WebP)'));
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        let photo = shrink(img, 1000, 0.75);
        if (photo.length > 580000) photo = shrink(img, 800, 0.6); // very detailed pictures
        resolve({ photo, thumb: shrink(img, 240, 0.7) });
      } catch (e) {
        reject(e);
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That photo could not be opened')); };
    img.src = url;
  });
}
